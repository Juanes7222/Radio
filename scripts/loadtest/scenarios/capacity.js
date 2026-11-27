// @ts-check

import { check, sleep } from "k6";
import { tagWithCurrentStageIndex } from "https://jslib.k6.io/k6-utils/1.3.0/index.js";
import { loadConfig } from "../config.js";
import { requestWithTags } from "../lib/http.js";
import { DEFAULT_THRESHOLDS, buildEndpointThresholds } from "../lib/thresholds.js";
import { summarize } from "../lib/summary.js";
import { PUBLIC_ENDPOINTS } from "../lib/endpoints.js";
import { buildStages, stageKindFor, GRACEFUL_RAMP_DOWN } from "../lib/stages.js";

const config = loadConfig();
const baseUrl = (config.path === "origin" ? config.originUrl : config.baseUrl).replace(/\/$/, "");
const vusMax = Number(process.env.K6_VUS_MAX ?? 800);
const instances = Number(process.env.K6_INSTANCES ?? 1);

export const options = {
  scenarios: {
    capacity: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: buildStages(stageKindFor(vusMax), instances),
      gracefulRampDown: GRACEFUL_RAMP_DOWN,
    },
  },
  discardResponseBodies: true,
  thresholds: {
    ...DEFAULT_THRESHOLDS,
    ...buildEndpointThresholds(PUBLIC_ENDPOINTS),
    http_req_duration: ["p(95)<2000"],
    http_req_failed: ["rate<0.05"],
  },
};

export default function () {
  tagWithCurrentStageIndex();
  const endpoint = PUBLIC_ENDPOINTS[__ITER % PUBLIC_ENDPOINTS.length];
  const response = requestWithTags(`${baseUrl}${endpoint.path}`, {}, {
    path: config.path,
    endpoint: endpoint.name,
    surface: "public",
  });
  check(response, {
    "public read is credible": (result) =>
      result.status === endpoint.expectedStatus ||
      (config.path === "edge" && result.status === 429),
  });
  sleep(0.5);
}

/**
 * @param {{ metrics?: Record<string, { values?: Record<string, number> }> }} data
 */
export function handleSummary(data) {
  return { stdout: summarize(data) };
}
