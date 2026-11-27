// @ts-check

/** @param {string} name */
function requireSecret(name) {
  const value = process.env[name] ?? "";
  if (value.trim().length === 0) {
    throw new Error(`${name} is required for this profile`);
  }
  return value;
}

/** @returns {Record<string, string>} */
export function makeAdminHeaders() {
  return { Authorization: `Bearer ${requireSecret("K6_ADMIN_TOKEN")}` };
}

/** @returns {Record<string, string>} */
export function makeWorkerHeaders() {
  return { "x-worker-secret": requireSecret("K6_WORKER_SECRET") };
}

/** @returns {Record<string, string>} */
export function makePanelHeaders() {
  return { "x-panel-secret": requireSecret("K6_PANEL_SECRET") };
}
