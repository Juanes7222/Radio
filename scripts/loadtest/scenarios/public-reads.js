// @ts-check

import { check, sleep } from "k6";
import { loadConfig } from "../config.js";
import { requestWithTags } from "../lib/http.js";
import { DEFAULT_THRESHOLDS } from "../lib/thresholds.js";
import { summarize } from "../lib/summary.js";
import {
  PUBLIC_ENDPOINTS,
  CACHE_TTL_SECONDS,
  cacheTagFor,
  hostForVu,
  forwardedIpForVu,
} from "../lib/endpoints.js";

const config = loadConfig();
const baseUrl = (config.path === "origin" ? config.originUrl : config.baseUrl).replace(/\/$/, "");

export const options = {
  vus: Number(process.env.K6_VUS ?? 20),
  duration: process.env.K6_DURATION ?? "2m",
  thresholds: DEFAULT_THRESHOLDS,
};

/**
 * @returns {Record<string, string>}
 */
function perVuHeaders() {
  /** @type {Record<string, string>} */
  const headers = {};
  if (config.path === "origin") {
    const host = hostForVu(__VU);
    headers.Host = host;
    headers["X-Forwarded-Host"] = host;
    // Simulates distinct clients; nginx overwrites this header at the edge and
    // no backend cache key uses X-Forwarded-For.
    headers["X-Forwarded-For"] = forwardedIpForVu(__VU);
  }
  return headers;
}

/**
 * @param {import("../lib/endpoints.js").PublicEndpoint} endpoint
 * @param {Record<string, string>} headers
 * @param {string} cacheTag
 */
function readEndpoint(endpoint, headers, cacheTag) {
  const response = requestWithTags(`${baseUrl}${endpoint.path}`, { headers }, {
    path: config.path,
    endpoint: endpoint.name,
    cache: cacheTag,
  });
  check(response, {
    [`${endpoint.name} status is credible`]: (result) =>
      result.status === endpoint.expectedStatus ||
      (config.path === "edge" && result.status === 429),
  });
}

export default function () {
  const headers = perVuHeaders();
  for (const endpoint of PUBLIC_ENDPOINTS) {
    const basePath = endpoint.path.split("?")[0];
    const hasTtl = basePath in CACHE_TTL_SECONDS;
    const requestsInBurst = hasTtl ? 2 : 1;
    for (let index = 0; index < requestsInBurst; index++) {
      readEndpoint(endpoint, headers, cacheTagFor(endpoint.path, index));
    }
  }
  sleep(0.5);
}

/**
 * @param {{ metrics?: Record<string, { values?: Record<string, number> }> }} data
 */
export function handleSummary(data) {
  return { stdout: summarize(data) };
}
