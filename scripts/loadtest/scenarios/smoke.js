// @ts-check

import { check } from "k6";
import { loadConfig } from "../config.js";
import { requestWithTags } from "../lib/http.js";
import { DEFAULT_THRESHOLDS } from "../lib/thresholds.js";
import { summarize } from "../lib/summary.js";

const config = loadConfig();
const baseUrl = (config.path === "origin" ? config.originUrl : config.baseUrl).replace(/\/$/, "");

export const options = {
  vus: Number(process.env.K6_VUS ?? 1),
  duration: process.env.K6_DURATION ?? "30s",
  thresholds: DEFAULT_THRESHOLDS,
};

export default function () {
  const response = requestWithTags(`${baseUrl}/health`, {}, {
    path: config.path,
    endpoint: "/health",
  });
  check(response, {
    "health status is 200": (result) => result.status === 200,
    "health body reports status or ok": (result) => {
      try {
        const body = /** @type {Record<string, unknown>} */ (JSON.parse(result.body ?? ""));
        return "status" in body || "ok" in body;
      } catch {
        return false;
      }
    },
  });
}

/**
 * @param {{ metrics?: Record<string, { values?: Record<string, number> }> }} data
 */
export function handleSummary(data) {
  return { stdout: summarize(data) };
}
