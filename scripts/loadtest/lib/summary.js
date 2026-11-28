// @ts-check

/**
 * @typedef {object} SummaryData
 * @property {Record<string, { values?: Record<string, number> }>} [metrics]
 */

/**
 * Prints the compact JSON summary used by the orchestrator and the reports.
 *
 * @param {SummaryData} data
 * @returns {string}
 */
export function summarize(data) {
  const metrics = data.metrics ?? {};
  /** @param {string} name @param {string} field */
  const metricValue = (name, field) => metrics[name]?.values?.[field] ?? 0;
  const summary = {
    path: process.env.K6_PATH ?? "edge",
    vus: Number(process.env.K6_VUS ?? 0),
    http_reqs: metricValue("http_reqs", "count"),
    "http_req_duration.p95": metricValue("http_req_duration", "p(95)"),
    http_req_failed: metricValue("http_req_failed", "rate"),
    throttledRequests: metricValue("throttled_requests", "count"),
    checks: metricValue("checks", "rate"),
  };
  const json = JSON.stringify(summary);
  console.log(json);
  return json;
}
