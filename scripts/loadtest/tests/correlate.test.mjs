import assert from "node:assert/strict";
import { describe, it } from "node:test";

const {
  parseK6Points,
  parseMetricsCsv,
  correlate,
  findSaturation,
  renderReport,
} = await import("../monitor/correlate.mjs");

const MINUTE = 60_000;
const START = 1_764_000_000_000;

function point(metric, offsetMs, value, tags = {}) {
  return JSON.stringify({
    type: "Point",
    metric,
    data: { time: START + offsetMs, value, tags },
  });
}

function csvRow(ts, cpu, available, total, restarts) {
  return `${ts},${cpu},1024,${available},${total},0,0,${restarts}`;
}

describe("parseK6Points", () => {
  it("ignores non-Point events and keeps metric samples", () => {
    const points = parseK6Points([
      '{"type":"Metric","metric":"http_reqs"}',
      point("http_req_duration", 1_000, 100),
      point("http_req_failed", 1_100, 0),
      point("throttled_requests", 1_200, 1),
    ]);

    assert.equal(points.length, 3);
    assert.deepEqual(points.map((sample) => sample.metric), [
      "http_req_duration",
      "http_req_failed",
      "throttled_requests",
    ]);
  });
});

describe(" correlate", () => {
  it("cuts the CSV to the k6 window and aggregates both halves by minute", () => {
    const points = parseK6Points([
      point("http_req_duration", 1_000, 100, { stage: "0" }),
      point("http_req_duration", 2_000, 300, { stage: "0" }),
      point("http_req_failed", 2_100, 1, { stage: "0" }),
      point("http_req_duration", MINUTE + 1_000, 500, { stage: "1" }),
    ]);
    const csv = parseMetricsCsv(
      [
        "ts,cpu_pct,rss_kb,mem_available_kb,mem_total_kb,net_rx_bytes,net_tx_bytes,restarts",
        csvRow(Math.floor((START - MINUTE) / 1000), 99, 10, 100, 7),
        csvRow(Math.floor((START + 1_000) / 1000), 40, 50, 100, 0),
        csvRow(Math.floor((START + MINUTE + 1_000) / 1000), 60, 20, 100, 1),
        csvRow(Math.floor((START + 3 * MINUTE) / 1000), 99, 1, 100, 9),
      ].join("\n")
    );

    const rows = correlate(points, csv);

    assert.equal(rows.length, 2);
    assert.equal(rows[0].p95Ms, 300);
    assert.equal(rows[0].rps, 2 / 60);
    assert.equal(rows[0].errorRate, 1);
    assert.equal(rows[0].cpuPct, 40);
    assert.equal(rows[0].memAvailablePct, 0.5);
    assert.equal(rows[0].restarts, 0);
    assert.equal(rows[1].p95Ms, 500);
    assert.equal(rows[1].restarts, 1);
  });
});

describe("findSaturation", () => {
  it("flags the first minute whose p95 crosses the threshold", () => {
    const rows = [
      { minute: 0, p95Ms: 100, errorRate: 0, cpuPct: 30, memAvailablePct: 50, rps: 10, restarts: 0, stage: "0" },
      { minute: 1, p95Ms: 2_500, errorRate: 0, cpuPct: 30, memAvailablePct: 50, rps: 10, restarts: 0, stage: "1" },
    ];

    assert.deepEqual(findSaturation(rows, 0), { minute: 1, reason: "p95 > 2000 ms" });
  });

  it("requires two consecutive minutes of high CPU", () => {
    const rows = [
      { minute: 0, p95Ms: 100, errorRate: 0, cpuPct: 90, memAvailablePct: 50, rps: 10, restarts: 0, stage: "0" },
      { minute: 1, p95Ms: 100, errorRate: 0, cpuPct: 88, memAvailablePct: 50, rps: 10, restarts: 0, stage: "1" },
    ];

    assert.deepEqual(findSaturation(rows, 0), { minute: 1, reason: "CPU > 85% for 2 minutes" });
  });

  it("reports restarts above the baseline as an event", () => {
    const rows = [
      { minute: 0, p95Ms: 100, errorRate: 0, cpuPct: 30, memAvailablePct: 50, rps: 10, restarts: 2, stage: "0" },
    ];

    assert.deepEqual(findSaturation(rows, 1), { minute: 0, reason: "restarts above baseline" });
  });
});

describe("renderReport", () => {
  it("includes the RTT note and a table with both halves", () => {
    const rows = [
      { minute: 0, p95Ms: 100, errorRate: 0, cpuPct: 30, memAvailablePct: 50, rps: 10, restarts: 0, stage: "0" },
    ];
    const report = renderReport(rows, 42, { minute: 0, reason: "p95 > 2000 ms" });

    assert.match(report, /RTT/);
    assert.match(report, /\| p95 \(ms\) \| errors \| rps \|/);
    assert.match(report, /\| CPU % \| mem available % \| restarts \|/);
    assert.match(report, /42 ms/);
    assert.match(report, /p95 > 2000 ms/);
  });
});
