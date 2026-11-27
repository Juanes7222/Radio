// @ts-check

/** @type {Record<string, string[]>} */
export const DEFAULT_THRESHOLDS = {
  http_req_duration: ["p(95) < 1500"],
  http_req_failed: ["rate < 0.01"],
  "http_req_failed{throttled:no}": ["rate < 0.01"],
  checks: ["rate > 0.99"],
};
