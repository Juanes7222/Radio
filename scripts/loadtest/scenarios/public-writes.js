// @ts-check

import { check, sleep } from "k6";
import { loadConfig } from "../config.js";
import { postWithTags } from "../lib/http.js";
import { DEFAULT_THRESHOLDS } from "../lib/thresholds.js";
import { summarize } from "../lib/summary.js";
import { buildWritePayload, invalidPrayerPayload } from "../lib/writes.js";

const config = loadConfig();

/** @param {string} name */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for public-writes`);
  }
  return value;
}

const marker = requireEnv("K6_MARKER");
const categoria = requireEnv("K6_FEEDBACK_CATEGORY");
const baseUrl = (config.path === "origin" ? config.originUrl : config.baseUrl).replace(/\/$/, "");
const jsonHeaders = { headers: { "Content-Type": "application/json" } };

export const options = {
  vus: Number(process.env.K6_VUS ?? 5),
  duration: process.env.K6_DURATION ?? "1m",
  thresholds: DEFAULT_THRESHOLDS,
};

/** @param {unknown} payload */
function postPrayer(payload) {
  return postWithTags(`${baseUrl}/api/prayer`, JSON.stringify(payload), jsonHeaders, {
    path: config.path,
    endpoint: "prayer",
  });
}

export default function () {
  if (__VU === 1 && __ITER === 0) {
    const invalid = postPrayer(invalidPrayerPayload(marker));
    check(invalid, {
      "prayer without request is rejected": (result) => result.status === 400,
      "validator names the missing field": (result) =>
        (result.body ?? "").includes("La peticion es obligatoria"),
    });
  }

  const payloads = buildWritePayload(marker, categoria);
  const prayer = postPrayer(payloads.prayer);
  check(prayer, { "prayer created": (result) => result.status === 201 });

  const feedback = postWithTags(
    `${baseUrl}/api/feedback`,
    JSON.stringify(payloads.feedback),
    jsonHeaders,
    { path: config.path, endpoint: "feedback" }
  );
  check(feedback, { "feedback created": (result) => result.status === 201 });

  sleep(1);
}

/**
 * @param {{ metrics?: Record<string, { values?: Record<string, number> }> }} data
 */
export function handleSummary(data) {
  return { stdout: summarize(data) };
}
