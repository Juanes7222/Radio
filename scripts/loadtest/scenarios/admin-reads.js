// @ts-check

import { check, sleep } from "k6";
import { loadConfig } from "../config.js";
import { requestWithTags } from "../lib/http.js";
import { makeAdminHeaders } from "../lib/auth.js";
import { DEFAULT_THRESHOLDS } from "../lib/thresholds.js";
import { summarize } from "../lib/summary.js";

const config = loadConfig();
const baseUrl = (config.path === "origin" ? config.originUrl : config.baseUrl).replace(/\/$/, "");
const headers = makeAdminHeaders();

const ADMIN_ENDPOINTS = [
  { name: "playback-filters", path: "/admin-api/playback/filters" },
  { name: "feedback", path: "/admin-api/feedback" },
  { name: "health-watchdog", path: "/admin-api/health/watchdog" },
];

export const options = {
  vus: Number(process.env.K6_VUS ?? 10),
  duration: process.env.K6_DURATION ?? "2m",
  thresholds: DEFAULT_THRESHOLDS,
};

export default function () {
  for (const endpoint of ADMIN_ENDPOINTS) {
    const response = requestWithTags(`${baseUrl}${endpoint.path}`, { headers }, {
      path: config.path,
      endpoint: endpoint.name,
      surface: "admin",
    });
    check(response, {
      [`${endpoint.name} is authorized`]: (result) =>
        result.status === 200 || (config.path === "edge" && result.status === 429),
    });
  }
  sleep(2);
}

/**
 * @param {{ metrics?: Record<string, { values?: Record<string, number> }> }} data
 */
export function handleSummary(data) {
  return { stdout: summarize(data) };
}
