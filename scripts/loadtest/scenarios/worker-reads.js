// @ts-check

import { check, sleep } from "k6";
import { loadConfig } from "../config.js";
import { requestWithTags } from "../lib/http.js";
import { makePanelHeaders, makeWorkerHeaders } from "../lib/auth.js";
import { DEFAULT_THRESHOLDS } from "../lib/thresholds.js";
import { summarize } from "../lib/summary.js";

const config = loadConfig();
const baseUrl = (config.path === "origin" ? config.originUrl : config.baseUrl).replace(/\/$/, "");

const PROTOCOL_CALLS = [
  {
    name: "worker-update",
    path: "/workers/updates/latest",
    headers: makeWorkerHeaders(),
  },
  {
    name: "panel-status",
    path: "/panel-api/status",
    headers: makePanelHeaders(),
  },
];

export const options = {
  vus: Number(process.env.K6_VUS ?? 1),
  duration: process.env.K6_DURATION ?? "2m",
  thresholds: DEFAULT_THRESHOLDS,
};

export default function () {
  for (const call of PROTOCOL_CALLS) {
    const response = requestWithTags(`${baseUrl}${call.path}`, { headers: call.headers }, {
      path: config.path,
      endpoint: call.name,
      surface: "worker",
    });
    check(response, {
      [`${call.name} answers`]: (result) =>
        result.status === 200 || result.status === 204 || (config.path === "edge" && result.status === 429),
    });
  }
  // The edge zone general allows 30 requests per minute; keep below 0.5 r/s.
  sleep(config.path === "edge" ? 4 : 2);
}

/**
 * @param {{ metrics?: Record<string, { values?: Record<string, number> }> }} data
 */
export function handleSummary(data) {
  return { stdout: summarize(data) };
}
