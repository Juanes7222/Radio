// @ts-check

import { check, sleep } from "k6";
import { Trend } from "k6/metrics";
import { loadConfig } from "../config.js";
import { requestWithTags } from "../lib/http.js";
import { DEFAULT_THRESHOLDS } from "../lib/thresholds.js";
import { summarize } from "../lib/summary.js";
import { SEARCH_ENDPOINT, SEARCH_NOTE } from "../lib/endpoints.js";

const config = loadConfig();
const baseUrl = (config.path === "origin" ? config.originUrl : config.baseUrl).replace(/\/$/, "");
const searchCold = new Trend("search_cold_duration", true);
const searchHot = new Trend("search_hot_duration", true);

export const options = {
  scenarios: {
    warmup: {
      executor: "per-vu-iterations",
      vus: 1,
      iterations: 1,
      maxDuration: "30s",
      exec: "warmup",
    },
    measured: {
      executor: "constant-vus",
      vus: 20,
      duration: process.env.K6_DURATION ?? "1m",
      startTime: "30s",
      exec: "measured",
    },
  },
  thresholds: {
    ...DEFAULT_THRESHOLDS,
    search_hot_duration: ["p(95) < 800"],
  },
};

/**
 * @returns {Record<string, string>}
 */
function searchHeaders() {
  return config.path === "origin" ? { Host: "search.loadtest.local" } : {};
}

/**
 * @param {string} cacheTag
 */
function requestSearch(cacheTag) {
  return requestWithTags(
    `${baseUrl}${SEARCH_ENDPOINT}`,
    { headers: searchHeaders(), timeout: "25s" },
    { path: config.path, endpoint: "search", cache: cacheTag }
  );
}

export function warmup() {
  const response = requestSearch("cold");
  searchCold.add(response.timings.duration);
  check(response, { "cold search status is 200": (result) => result.status === 200 });
}

export function measured() {
  const response = requestSearch("hot");
  searchHot.add(response.timings.duration);
  check(response, { "hot search status is credible": (result) => result.status === 200 });
  sleep(1);
}

/**
 * @param {{ metrics?: Record<string, { values?: Record<string, number> }> }} data
 */
export function handleSummary(data) {
  /** @param {string} name @param {string} field */
  const metricValue = (name, field) => data.metrics?.[name]?.values?.[field] ?? 0;
  const summary = JSON.parse(summarize(data));
  return {
    stdout: JSON.stringify({
      ...summary,
      searchColdMsAvg: metricValue("search_cold_duration", "avg"),
      searchHotMsP95: metricValue("search_hot_duration", "p(95)"),
      note: SEARCH_NOTE,
    }),
  };
}
