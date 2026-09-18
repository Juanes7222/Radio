import { sendEmail } from "../../infrastructure/email/email.service";
import { sendPushToTokens } from "../../infrastructure/firebase/notification.service";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { startAutoDj } from "../azuracast/panel.service";
import { runAllHealthChecks, worstStatus } from "./health.checks";
import type {
  HealthAction,
  HealthAlertRecord,
  HealthCheckKey,
  HealthCheckResult,
  HealthOverview,
  HealthStatus,
} from "./health.types";

const MAX_RECENT_ACTIONS = 20;
const RETRY_BACKOFF_MS = 5 * 60 * 1000;
const MAX_ALERT_ATTEMPTS = 3;

/**
 * Panel page where the operator can act on each check. Alerts link straight
 * to the affected area so a notification never dead-ends in the health center.
 * Workers are only visible in the YouTube page, where the node list lives.
 */
const PANEL_PATH_BY_CHECK: Record<HealthCheckKey, string> = {
  azuracast: "/admin/streaming",
  autodj: "/admin/streaming",
  workers: "/admin/youtube",
  youtube_jobs: "/admin/youtube",
  disk: "/admin/backups",
  backup: "/admin/backups",
  listener_sampling: "/admin/dashboard",
};

interface WatchdogState {
  status: HealthStatus;
  checkedAt: string | null;
  checks: Map<HealthCheckKey, HealthCheckResult>;
  alerts: Map<string, HealthAlertRecord>;
  actions: HealthAction[];
  cycleRunning: boolean;
  retryTimers: Map<string, NodeJS.Timeout>;
}

const state: WatchdogState = {
  status: "ok",
  checkedAt: null,
  checks: new Map(),
  alerts: new Map(),
  actions: [],
  cycleRunning: false,
  retryTimers: new Map(),
};

function recordAction(key: string, label: string, ok: boolean, detail: string | null): void {
  state.actions.unshift({
    key,
    label,
    at: new Date().toISOString(),
    ok,
    detail,
  });
  if (state.actions.length > MAX_RECENT_ACTIONS) {
    state.actions.length = MAX_RECENT_ACTIONS;
  }
}

function buildAlertKey(checkKey: HealthCheckKey, code: string): string {
  return `${checkKey}:${code}`;
}

function severityRank(status: HealthStatus): number {
  if (status === "critical") return 2;
  if (status === "degraded") return 1;
  return 0;
}

async function notifyAdmins(alert: HealthAlertRecord): Promise<boolean> {
  const title = `Salud del sistema: alerta ${alert.checkKey}`;
  const alertUrl = `${config.publicUrl}${alert.panelPath}`;
  const html = `
    <p>El vigilante de salud detectó un problema que requiere decisión humana.</p>
    <p><strong>Área:</strong> ${alert.checkKey}<br/>
    <strong>Detalle:</strong> ${alert.message}<br/>
    <strong>Desde:</strong> ${alert.since}</p>
    <p><a href="${alertUrl}">Abrir el área afectada en el panel</a></p>
  `;

  let sent = false;
  if (config.health.emailEnabled) {
    for (const recipient of config.notifications.email.recipients) {
      const ok = await sendEmail(recipient, title, html);
      sent = sent || ok;
    }
  }

  if (config.health.pushEnabled && config.health.pushTokens.length > 0) {
    const result = await sendPushToTokens(config.health.pushTokens, {
      title: "Alerta de salud",
      body: alert.message.slice(0, 180),        data: { type: "health_alert", check: alert.checkKey, url: alertUrl },
    });
    sent = sent || result.sent > 0;
  }

  return sent;
}

/**
 * Alerts are deduplicated by (check, code) and only notify when they open.
 * Recovery clears the record; repeated failures re-notify after backoff up
 * to MAX_ALERT_ATTEMPTS so silence never hides an unresolved problem.
 */
async function syncAlerts(results: HealthCheckResult[]): Promise<void> {
  const now = new Date().toISOString();
  const openKeys = new Set<string>();

  for (const result of results) {
    for (const issue of result.issues) {
      const key = buildAlertKey(result.key, issue.code);
      openKeys.add(key);
      const existing = state.alerts.get(key);

      if (existing && existing.resolved) {
        state.alerts.delete(key);
      }

      const alert: HealthAlertRecord = existing ?? {
        key,
        checkKey: result.key,
        message: issue.message,
        panelPath: PANEL_PATH_BY_CHECK[result.key],
        since: issue.since ?? now,
        resolved: false,
        resolvedAt: null,
        notifiedAt: null,
        lastAttemptAt: null,
        attempts: 0,
      };
      alert.message = issue.message;

      const shouldNotify =
        alert.notifiedAt === null ||
        (alert.attempts < MAX_ALERT_ATTEMPTS &&
          alert.lastAttemptAt !== null &&
          Date.now() - new Date(alert.lastAttemptAt).getTime() > RETRY_BACKOFF_MS);

      if (shouldNotify) {
        const sent = await notifyAdmins(alert);
        alert.attempts += 1;
        alert.lastAttemptAt = now;
        if (sent) {
          alert.notifiedAt = now;
          logger.warn("Health", "Admin notified about alert", {
            alert: key,
            attempts: alert.attempts,
          });
        } else {
          logger.warn("Health", "Alert notification failed, may retry", {
            alert: key,
            attempts: alert.attempts,
          });
        }
      }

      state.alerts.set(key, alert);
    }
  }

  for (const [key, alert] of state.alerts) {
    if (!openKeys.has(key) && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = now;
      logger.info("Health", "Alert recovered", { alert: key });
      state.alerts.delete(key);
    }
  }
}

async function attemptAutoDjRestart(reason: string): Promise<void> {
  try {
    logger.warn("Health", "Attempting AutoDJ restart", { reason });
    await startAutoDj();
    recordAction("autodj_restart", "Reinicio de AutoDJ", true, reason);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordAction("autodj_restart", "Reinicio de AutoDJ", false, message);
    logger.error("Health", "AutoDJ restart failed", { error: message });
  }
}

function scheduleRemediationRetry(key: string, run: () => void): void {
  const existing = state.retryTimers.get(key);
  if (existing) return;
  const timer = setTimeout(() => {
    state.retryTimers.delete(key);
    run();
  }, RETRY_BACKOFF_MS);
  state.retryTimers.set(key, timer);
}

function planRemediation(results: HealthCheckResult[]): void {
  const autodj = results.find((result) => result.key === "autodj");
  if (
    autodj &&
    (autodj.status === "critical" || autodj.status === "degraded") &&
    autodj.issues.some(
      (issue) =>
        issue.code === "autodj_not_playing" || issue.code === "autodj_silence"
    )
  ) {
    scheduleRemediationRetry("autodj_restart", () => {
      void attemptAutoDjRestart(autodj.detail);
    });
  }
}

/**
 * One watchdog cycle: run all checks, sync alerts, attempt known-remedy
 * self-healing, and update the aggregate status. Never throws.
 */
export async function runHealthCycle(): Promise<HealthOverview> {
  if (state.cycleRunning) {
    return getHealthOverview();
  }
  state.cycleRunning = true;
  try {
    const { results, status } = await runAllHealthChecks();
    for (const result of results) {
      state.checks.set(result.key, result);
    }
    state.status = status;
    state.checkedAt = new Date().toISOString();
    await syncAlerts(results);
    planRemediation(results);
  } catch (err) {
    logger.error("Health", "Health cycle failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    state.status = worstStatus([state.status, "degraded"]);
  } finally {
    state.cycleRunning = false;
  }
  return getHealthOverview();
}

export function getHealthOverview(): HealthOverview {
  return {
    status: state.status,
    checkedAt: state.checkedAt,
    checks: Array.from(state.checks.values()),
    recentActions: state.actions.slice(0, MAX_RECENT_ACTIONS),
    openAlerts: Array.from(state.alerts.values()).filter(
      (alert) => !alert.resolved
    ),
  };
}

export function getHealthStatusSnapshot(): { status: HealthStatus; checkedAt: string | null } {
  return { status: state.status, checkedAt: state.checkedAt };
}
