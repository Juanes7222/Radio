// @ts-check

/** @type {Record<string, string[]>} */
export const DEFAULT_THRESHOLDS = {
  http_req_duration: ["p(95) < 1500"],
  http_req_failed: ["rate < 0.01"],
  "http_req_failed{throttled:no}": ["rate < 0.01"],
  checks: ["rate > 0.99"],
};

/**
 * k6 has no wildcard thresholds, so each measured endpoint needs its own key.
 *
 * @param {ReadonlyArray<{ name: string, path: string }>} endpoints
 * @returns {Record<string, string[]>}
 */
export function buildEndpointThresholds(endpoints) {
  /** @type {Record<string, string[]>} */
  const thresholds = {};
  for (const endpoint of endpoints) {
    const basePath = endpoint.path.split("?")[0];
    thresholds[`http_req_duration{endpoint:${basePath}}`] = ["p(95)<2000"];
  }
  return thresholds;
}
