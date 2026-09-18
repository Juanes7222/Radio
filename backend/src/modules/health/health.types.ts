/**
 * Shared types for the health watchdog module. Kept backend-local because
 * the admin panel consumes a serialized projection of these shapes
 * (see @radio/types Health* and health.routes.ts).
 */

export type HealthStatus = "ok" | "degraded" | "critical";

/** Every domain the watchdog can observe. */
export type HealthCheckKey =
  | "azuracast"
  | "autodj"
  | "workers"
  | "youtube_jobs"
  | "disk"
  | "backup"
  | "listener_sampling";

export interface HealthCheckIssue {
  code: string;
  message: string;
  since: string | null;
}

export interface HealthCheckResult {
  key: HealthCheckKey;
  label: string;
  status: HealthStatus;
  /** Short human summary, already formatted for the panel. */
  detail: string;
  issues: HealthCheckIssue[];
  checkedAt: string;
}

/** Actions the watchdog can take without human intervention. */
export interface HealthAction {
  key: string;
  label: string;
  at: string;
  ok: boolean;
  detail: string | null;
}

export interface HealthAlertRecord {
  key: string;
  checkKey: HealthCheckKey;
  message: string;
  /** Panel route where an operator can act on this specific problem. */
  panelPath: string;
  since: string;
  /** False while the alert is still open; cleared when the check recovers. */
  resolved: boolean;
  resolvedAt: string | null;
  notifiedAt: string | null;
  lastAttemptAt: string | null;
  attempts: number;
}

export interface HealthOverview {
  status: HealthStatus;
  checkedAt: string | null;
  checks: HealthCheckResult[];
  recentActions: HealthAction[];
  openAlerts: HealthAlertRecord[];
}
