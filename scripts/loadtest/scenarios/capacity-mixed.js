// @ts-check

import { check, sleep } from "k6";
import { tagWithCurrentStageIndex } from "https://jslib.k6.io/k6-utils/1.3.0/index.js";
import { loadConfig } from "../config.js";
import { requestWithTags } from "../lib/http.js";
import { makeAdminHeaders, makeWorkerHeaders } from "../lib/auth.js";
import { DEFAULT_THRESHOLDS, buildEndpointThresholds } from "../lib/thresholds.js";
import { summarize } from "../lib/summary.js";
import { PUBLIC_ENDPOINTS } from "../lib/endpoints.js";
import { buildStages, stageKindFor, GRACEFUL_RAMP_DOWN } from "../lib/stages.js";

const config = loadConfig();
const baseUrl = (config.path === "origin" ? config.originUrl : config.baseUrl).replace(/\/$/, "");
const vusMax = Number(process.env.K6_VUS_MAX ?? 800);
const instances = Number(process.env.K6_INSTANCES ?? 1);

const ADMIN_ENDPOINTS = [
  { name: "playback-filters", path: "/admin-api/playback/filters" },
  { name: "feedback", path: "/admin-api/feedback" },
];
const WORKER_ENDPOINT = { name: "worker-update", path: "/workers/updates/latest" };

export const options = {
  scenarios: {
    capacityMixed: {
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

/**
 * 80% public reads, 15% panel reads, 5% worker protocol reads. No writes:
 * INSERTs belong to the guarded write profile, not to the capacity curve.
 */
function callForIteration() {
  const bucket = __ITER % 20;
  if (bucket < 16) {
    const endpoint = PUBLIC_ENDPOINTS[bucket % PUBLIC_ENDPOINTS.length];
    return {
      url: `${baseUrl}${endpoint.path}`,
      tags: { path: config.path, endpoint: endpoint.name, surface: "public" },
      expectedStatus: endpoint.expectedStatus,
      headers: {},
    };
  }
  if (bucket < 19) {
    const endpoint = ADMIN_ENDPOINTS[bucket - 16];
    return {
      url: `${baseUrl}${endpoint.path}`,
      tags: { path: config.path, endpoint: endpoint.name, surface: "admin" },
      expectedStatus: 200,
      headers: makeAdminHeaders(),
    };
  }
  return {
    url: `${baseUrl}${WORKER_ENDPOINT.path}`,
    tags: { path: config.path, endpoint: WORKER_ENDPOINT.name, surface: "worker" },
    expectedStatus: 200,
    headers: makeWorkerHeaders(),
  };
}

export default function () {
  tagWithCurrentStageIndex();
  const call = callForIteration();
  const response = requestWithTags(call.url, { headers: call.headers }, call.tags);
  check(response, {
    "mixed read is credible": (result) =>
      result.status === call.expectedStatus || (config.path === "edge" && result.status === 429),
  });
  sleep(0.5);
}

/**
 * @param {{ metrics?: Record<string, { values?: Record<string, number> }> }} data
 */
export function handleSummary(data) {
  return { stdout: summarize(data) };
}
