// @ts-check

/**
 * @typedef {"edge" | "origin"} LoadPath
 *
 * @typedef {object} LoadConfig
 * @property {string} baseUrl
 * @property {string} originUrl
 * @property {LoadPath} path
 */

const VALID_PATHS = /** @type {const} */ (["edge", "origin"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Reads one path's URL and refuses to run when that path is not configured.
 * Only the selected URL is validated: an origin run must not depend on the
 * edge domain being reachable from the operator's machine.
 *
 * `origin` reaches the backend on the public IP of the VPS and needs a
 * temporary firewall rule that allows the operator's IP on the real port.
 * A tunnel or a loopback URL would add a hop or measure the wrong machine.
 *
 * @returns {LoadConfig}
 */
export function loadConfig() {
  const rawPath = process.env.K6_PATH ?? "edge";
  if (!VALID_PATHS.includes(/** @type {any} */ (rawPath))) {
    throw new Error("K6_PATH must be 'edge' or 'origin'");
  }
  const path = /** @type {LoadPath} */ (rawPath);

  const variableName = path === "edge" ? "K6_BASE_URL" : "K6_ORIGIN_URL";
  const value = process.env[variableName] ?? "";
  assertUsableUrl(value, variableName);

  if (path === "origin" && LOOPBACK_HOSTS.has(new URL(value).hostname.toLowerCase())) {
    throw new Error(`${variableName} must be the public IP of the VPS, not a loopback address`);
  }

  return {
    baseUrl: path === "edge" ? value : (process.env.K6_BASE_URL ?? ""),
    originUrl: path === "origin" ? value : (process.env.K6_ORIGIN_URL ?? ""),
    path,
  };
}

/**
 * @param {string} value
 * @param {string} variableName
 */
function assertUsableUrl(value, variableName) {
  if (value.length === 0) {
    throw new Error(`${variableName} is required for the selected path`);
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${variableName} must be an absolute http(s) URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${variableName} must start with http:// or https://`);
  }
}
