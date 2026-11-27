import axios from 'axios';
import type { MaintenanceStatus } from '@radio/types';

const MAINTENANCE_TIMEOUT_MS = 4000;

/**
 * The answer a client can act on. `unknown` is not an error to show: a station
 * whose status cannot be read keeps serving the app, because a failed check
 * must not become a second outage.
 */
export type MaintenanceCheck =
  | { state: 'disabled' }
  | { state: 'enabled'; status: MaintenanceStatus }
  | { state: 'unknown' };

/** Narrows the public response without trusting the transport. */
export function isMaintenanceStatus(data: unknown): data is MaintenanceStatus {
  if (!data || typeof data !== 'object') return false;

  const candidate = data as Record<string, unknown>;
  return (
    typeof candidate.enabled === 'boolean' &&
    typeof candidate.title === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.footerNote === 'string'
  );
}

/**
 * Reads `/api/maintenance` once. Never throws: callers render `unknown` as the
 * normal app, and only an explicit `enabled` takes the screen.
 */
export async function fetchMaintenanceStatus(
  apiBaseUrl: string,
  timeoutMs = MAINTENANCE_TIMEOUT_MS,
): Promise<MaintenanceCheck> {
  try {
    const response = await axios.get<unknown>(`${apiBaseUrl}/api/maintenance`, {
      timeout: timeoutMs,
      headers: { Accept: 'application/json' },
    });

    if (!isMaintenanceStatus(response.data)) return { state: 'unknown' };

    return response.data.enabled
      ? { state: 'enabled', status: response.data }
      : { state: 'disabled' };
  } catch {
    return { state: 'unknown' };
  }
}
