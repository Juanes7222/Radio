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
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "::", "0.0.0.0"]);

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

  if (path === "origin" && isPrivateOrLoopback(new URL(value).hostname)) {
    throw new Error(`${variableName} must be the public IP of the VPS, not a loopback or private address`);
  }

  return {
    baseUrl: path === "edge" ? value : (process.env.K6_BASE_URL ?? ""),
    originUrl: path === "origin" ? value : (process.env.K6_ORIGIN_URL ?? ""),
    path,
  };
}

/**
 * @param {string} hostname
 * @returns {boolean}
 */
function isPrivateOrLoopback(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (LOOPBACK_HOSTS.has(host)) {
    return true;
  }
  const octets = host.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
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
