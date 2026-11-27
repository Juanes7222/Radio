import { readFileSync, writeFileSync } from "node:fs";

const MINUTE_MS = 60_000;

/**
 * @param {string[] | string} input
 * @returns {Array<{ metric: string, time: number, value: number, tags: Record<string, string> }>}
 */
export function parseK6Points(input) {
  const lines = typeof input === "string" ? input.split(/\r?\n/) : input;
  /** @type {Array<{ metric: string, time: number, value: number, tags: Record<string, string> }>} */
  const points = [];
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type !== "Point" || !event.data) {
      continue;
    }
    points.push({
      metric: String(event.metric),
      time: Number(event.data.time),
      value: Number(event.data.value),
      tags: event.data.tags ?? {},
    });
  }
  return points;
}

/**
 * @param {string} text
 * @returns {Array<Record<string, number>>}
 */
export function parseMetricsCsv(text) {
  const [header, ...lines] = text.split(/\r?\n/).filter((line) => line.trim());
  if (!header) {
    return [];
  }
  const columns = header.split(",");
  return lines.map((line) => {
    const values = line.split(",");
    /** @type {Record<string, number>} */
    const row = {};
    columns.forEach((column, index) => {
      row[column] = Number(values[index]);
    });
    return row;
  });
}

/**
 * @param {number[]} values
 * @param {number} percentile
 * @returns {number}
 */
function percentile(values, percentileFraction) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(percentileFraction * sorted.length) - 1);
  return sorted[index];
}

/**
 * @param {number[]} values
 * @returns {number}
 */
function average(values) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * @typedef {object} CorrelatedRow
 * @property {number} minute
 * @property {string} stage
 * @property {number} p95Ms
 * @property {number} errorRate
 * @property {number} rps
 * @property {number} cpuPct
 * @property {number} memAvailablePct
 * @property {number} restarts
 * @property {number} droppedIterations
 */

/**
 * Cuts both sources to the k6 window and aggregates them by minute.
 *
 * @param {Array<{ metric: string, time: number, value: number, tags: Record<string, string> }>} points
 * @param {Array<Record<string, number>>} samples
 * @returns {CorrelatedRow[]}
 */
export function correlate(points, samples) {
  if (points.length === 0) {
    return [];
  }
  const times = points.map((point) => point.time);
  const from = Math.min(...times);
  const to = Math.max(...times);
  const windowSamples = samples.filter((sample) => {
    const timestamp = sample.ts * 1000;
    return timestamp >= from && timestamp <= to;
  });

  /** @type {Map<number, { durations: number[], failures: number[], requests: number, throttled: number, dropped: number, stage: string }>} */
  const buckets = new Map();
  for (const point of points) {
    const key = Math.floor(point.time / MINUTE_MS) * MINUTE_MS;
    if (!buckets.has(key)) {
      buckets.set(key, { durations: [], failures: [], requests: 0, throttled: 0, dropped: 0, stage: "0" });
    }
    const bucket = buckets.get(key);
    if (point.tags.stage !== undefined) {
      bucket.stage = point.tags.stage;
    }
    if (point.metric === "http_req_duration") {
      bucket.durations.push(point.value);
      bucket.requests += 1;
    } else if (point.metric === "http_req_failed") {
      bucket.failures.push(point.value);
    } else if (point.metric === "throttled_requests") {
      bucket.throttled += point.value;
    } else if (point.metric === "dropped_iterations") {
      bucket.dropped += point.value;
    }
  }

  /** @type {CorrelatedRow[]} */
  const rows = [];
  for (const [key, bucket] of [...buckets.entries()].sort((left, right) => left[0] - right[0])) {
    const second = key / 1000;
    const matching = windowSamples.filter((sample) => Math.floor(sample.ts / 60) * 60 === second);
    rows.push({
      minute: key,
      stage: bucket.stage,
      p95Ms: percentile(bucket.durations, 0.95),
      errorRate: average(bucket.failures),
      rps: bucket.requests / 60,
      cpuPct: average(matching.map((sample) => sample.cpu_pct)),
      memAvailablePct: average(matching.map((sample) => sample.mem_available_kb / sample.mem_total_kb)),
      restarts: matching.length === 0 ? 0 : Math.max(...matching.map((sample) => sample.restarts)),
      droppedIterations: bucket.dropped,
    });
  }
  return rows;
}

/**
 * @param {CorrelatedRow[]} rows
 * @param {number} baselineRestarts
 * @returns {{ minute: number, reason: string } | null}
 */
export function findSaturation(rows, baselineRestarts) {
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const previous = rows[index - 1];
    if (row.droppedIterations > 0) {
      return { minute: row.minute, reason: "generator saturated (dropped iterations)" };
    }
    if (row.p95Ms > 2000) {
      return { minute: row.minute, reason: "p95 > 2000 ms" };
    }
    if (row.errorRate > 0.05) {
      return { minute: row.minute, reason: "errors > 5%" };
    }
    if (row.cpuPct > 85 && previous && previous.cpuPct > 85) {
      return { minute: row.minute, reason: "CPU > 85% for 2 minutes" };
    }
    if (row.memAvailablePct > 0 && row.memAvailablePct < 0.1) {
      return { minute: row.minute, reason: "available memory < 10%" };
    }
    if (previous && Number(row.stage) > Number(previous.stage) && row.rps <= previous.rps) {
      return { minute: row.minute, reason: "RPS stopped growing" };
    }
    if (row.restarts > baselineRestarts) {
      return { minute: row.minute, reason: "restarts above baseline" };
    }
  }
  return null;
}

/**
 * @param {CorrelatedRow[]} rows
 * @param {number} rttMedianMs
 * @param {{ minute: number, reason: string } | null} saturation
 * @returns {string}
 */
export function renderReport(rows, rttMedianMs, saturation) {
  const peakRps = rows.reduce((peak, row) => Math.max(peak, row.rps), 0);
  const lines = [
    "# Correlación de carga y VPS",
    "",
    `RTT mediano medido desde la PC: ${rttMedianMs} ms. El camino edge incluye ese RTT; origin incluye solo el trayecto al puerto directo, sin nginx.`,
    "",
    `RPS pico: ${peakRps.toFixed(2)}.`,
    saturation
      ? `Primer escalón saturado: minuto ${saturation.minute} (${saturation.reason}).`
      : "No se detectó saturación con los criterios configurados.",
    "",
    "| minute | stage | p95 (ms) | errors | rps | CPU % | mem available % | restarts |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of rows) {
    lines.push(
      `| ${new Date(row.minute).toISOString()} | ${row.stage} | ${row.p95Ms.toFixed(1)} | ${(row.errorRate * 100).toFixed(2)}% | ${row.rps.toFixed(2)} | ${row.cpuPct.toFixed(1)} | ${(row.memAvailablePct * 100).toFixed(1)}% | ${row.restarts} |`
    );
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const args = process.argv.slice(2);
  const reportPath = args.pop();
  const csvPath = args.pop();
  const jsonPaths = args;
  if (!reportPath || !csvPath || jsonPaths.length === 0) {
    console.error("usage: correlate.mjs <k6.json> [k6-2.json ...] <metrics.csv> <report.md>");
    process.exit(2);
  }

  const points = jsonPaths.flatMap((path) => parseK6Points(readFileSync(path, "utf8")));
  const samples = parseMetricsCsv(readFileSync(csvPath, "utf8"));
  const rows = correlate(points, samples);
  const baseline = Number(process.env.K6_BASELINE_RESTARTS ?? 0);
  const rttMedian = Number(process.env.K6_RTT_MEDIAN_MS ?? 0);
  const report = renderReport(rows, rttMedian, findSaturation(rows, baseline));
  writeFileSync(reportPath, report, "utf8");
  console.log(`Wrote ${reportPath} (${rows.length} minutes, ${points.length} k6 points)`);
}

if (process.argv[1] && process.argv[1].endsWith("correlate.mjs")) {
  main();
}
