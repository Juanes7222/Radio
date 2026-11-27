// @ts-check

/**
 * @typedef {object} PublicEndpoint
 * @property {string} name
 * @property {string} path
 * @property {number} expectedStatus
 */

/** @type {Readonly<Record<string, number>>} */
export const CACHE_TTL_SECONDS = Object.freeze({
  "/api/nowplaying": 5,
  "/api/schedule": 60,
});

export const SEARCH_ENDPOINT = "/api/search?search=radio&per_page=10";

export const SEARCH_NOTE =
  "Search cost is measured in isolation; this number is not mixed with cheap public reads.";

/** @type {readonly PublicEndpoint[]} */
export const PUBLIC_ENDPOINTS = Object.freeze([
  { name: "nowplaying", path: "/api/nowplaying", expectedStatus: 200 },
  { name: "schedule", path: "/api/schedule?start=2026-11-01&end=2026-11-08", expectedStatus: 200 },
  { name: "reading", path: "/api/bible/reading/today", expectedStatus: 200 },
  { name: "translations", path: "/api/bible/translations", expectedStatus: 200 },
  { name: "books", path: "/api/bible/books?translation=RVR1960", expectedStatus: 200 },
  { name: "health", path: "/api/health/public", expectedStatus: 200 },
  { name: "liveness", path: "/health", expectedStatus: 200 },
  { name: "bible-search", path: "/api/bible/search?q=dios", expectedStatus: 200 },
]);

/**
 * Tags an endpoint consistently with the per-endpoint threshold keys.
 *
 * @param {PublicEndpoint} endpoint
 * @returns {{ endpoint: string, name: string }}
 */
export function endpointTags(endpoint) {
  return { endpoint: endpoint.path.split("?")[0], name: endpoint.name };
}

/**
 * Unique Host per VU: the backend cache key includes Host/X-Forwarded-Host.
 *
 * @param {number} vuId
 * @returns {string}
 */
export function hostForVu(vuId) {
  return `vu${vuId}.loadtest.local`;
}

/**
 * Unique client IP per VU for nginx rate-limit simulation. This header does
 * not take part in any backend cache key.
 *
 * @param {number} vuId
 * @returns {string}
 */
export function forwardedIpForVu(vuId) {
  const offset = Math.max(0, vuId - 1);
  return `198.51.${Math.floor(offset / 254)}.${(offset % 254) + 1}`;
}

/**
 * Labels one request inside a short burst. Only endpoints with a known TTL
 * get a cold/warm split; labelling the others would invent a difference.
 *
 * @param {string} endpointPath
 * @param {number} requestIndexInBurst
 * @returns {"cold" | "warm" | "none"}
 */
export function cacheTagFor(endpointPath, requestIndexInBurst) {
  const basePath = endpointPath.split("?")[0];
  if (!(basePath in CACHE_TTL_SECONDS)) {
    return "none";
  }
  return requestIndexInBurst === 0 ? "cold" : "warm";
}
