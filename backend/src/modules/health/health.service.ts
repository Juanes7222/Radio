import { sendEmail } from "../../infrastructure/email/email.service";
import { sendPushToTokens } from "../../infrastructure/firebase/notification.service";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { describeError } from "../../shared/utils/errors";
import { startAutoDj, getPanelStatus } from "../azuracast/panel.service";
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

  const recipients = config.health.emailEnabled ? config.notifications.email.recipients : [];
  const pushTokens =
    config.health.pushEnabled && config.health.pushTokens.length > 0
      ? config.health.pushTokens
      : [];

  // Without a channel the alert is never delivered, and without this log the
  // only symptom is an endless "notification failed" warning loop.
  if (recipients.length === 0 && pushTokens.length === 0) {
    logger.error("Health", "No alert channel configured, alert not delivered", {
      alert: alert.key,
      emailEnabled: config.health.emailEnabled,
      emailRecipients: config.notifications.email.recipients.length,
      pushEnabled: config.health.pushEnabled,
      pushTokens: config.health.pushTokens.length,
    });
    return false;
  }

  let sent = false;
  for (const recipient of recipients) {
    const ok = await sendEmail(recipient, title, html);
    sent = sent || ok;
  }

  if (pushTokens.length > 0) {
    const result = await sendPushToTokens(pushTokens, {
      title: "Alerta de salud",
      body: alert.message.slice(0, 180),
      data: { type: "health_alert", check: alert.checkKey, url: alertUrl },
    });
    sent = sent || result.sent > 0;
  }

  return sent;
}

/**
 * Alerts are deduplicated by (check, code) and only notify when they open.
 * Recovery clears the record; while the problem stays open the alert is
 * delivered at most MAX_ALERT_ATTEMPTS times, RETRY_BACKOFF_MS apart, so a
 * dead channel cannot turn the watchdog into an endless warning loop.
 */
async function syncAlerts(results: HealthCheckResult[]): Promise<void> {
  const now = new Date().toISOString();
  const openKeys = new Set<string>();

  for (const result of results) {
    for (const issue of result.issues) {
      const key = buildAlertKey(result.key, issue.code);
      openKeys.add(key);
      const existing = state.alerts.get(key);

      if (existing?.resolved) {
        state.alerts.delete(key);
      }

      // A resolved record must never be reused as the open alert: it would be
      // stored back as resolved and silence the notifications of a live issue.
      const openAlert = existing && !existing.resolved ? existing : undefined;
      const alert: HealthAlertRecord = openAlert ?? {
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

      const attemptsLeft = alert.attempts < MAX_ALERT_ATTEMPTS;
      const backoffElapsed =
        alert.lastAttemptAt !== null &&
        Date.now() - new Date(alert.lastAttemptAt).getTime() > RETRY_BACKOFF_MS;
      const shouldNotify = attemptsLeft && (alert.attempts === 0 || backoffElapsed);

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
          if (alert.attempts >= MAX_ALERT_ATTEMPTS) {
            logger.error("Health", "Alert notification attempts exhausted, alert stays open", {
              alert: key,
              attempts: alert.attempts,
            });
          }
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
    // Re-check right before acting: the alert may have opened while AutoDJ
    // was down, but a live streamer could have connected in the meantime.
    // Starting AutoDJ now would kick them off air.
    const panel = await getPanelStatus();
    if (panel.isLive) {
      recordAction(
        "autodj_restart",
        "Reinicio de AutoDJ",
        true,
        "Cancelado: hay una transmisión en vivo en curso"
      );
      logger.info("Health", "AutoDJ restart skipped, live stream active");
      return;
    }

    logger.warn("Health", "Attempting AutoDJ restart", { reason });
    await startAutoDj();
    recordAction("autodj_restart", "Reinicio de AutoDJ", true, reason);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordAction("autodj_restart", "Reinicio de AutoDJ", false, message);
    logger.error("Health", "AutoDJ restart failed", describeError(err));
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
    logger.error("Health", "Health cycle failed", describeError(err));
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
