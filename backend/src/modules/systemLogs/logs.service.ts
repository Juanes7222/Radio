import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { logsConfig } from "../../config/logs.config";
import { logger } from "../../shared/logger/logger";

const execFileAsync = promisify(execFile);

// ── Types ───────────────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";
export type SourceId = "server" | "azuracast" | "nginx" | "postgres" | "worker" | "locutor";

export interface LogRow {
  id: string;
  ts: string;
  level: LogLevel;
  source: SourceId;
  msg: string;
  meta?: Record<string, unknown>;
}

export interface HistogramPoint {
  ts: string;
  count: number;
  errors: number;
}

export interface LogSourceMeta {
  id: SourceId;
  label: string;
  shortLabel: string;
  description: string;
  health: "ok" | "warn" | "error";
  lastAt: string | null;
  lastLevel: LogLevel | null;
  counts: Record<LogLevel, number>;
  total: number;
}

interface GetLogsParams {
  source?: string;
  level?: string;
  search?: string;
  limit?: number;
  cursor?: string;
  order?: string;
}

interface TailParams {
  source?: string;
  since?: string;
  limit?: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

const SOURCE_DEFS: Record<SourceId, { label: string; shortLabel: string; description: string }> = {
  server: {
    label: "Servidor · PM2 out+err",
    shortLabel: "Servidor",
    description: "Backend Express + jobs (PM2)",
  },
  azuracast: {
    label: "AzuraCast · Docker",
    shortLabel: "AzuraCast",
    description: `Contenedor ${logsConfig.azuracastContainer}`,
  },
  nginx: {
    label: "Nginx · access+error",
    shortLabel: "Nginx",
    description: "Borde / reverse proxy",
  },
  postgres: {
    label: "Postgres · Docker",
    shortLabel: "Postgres",
    description: `Contenedor ${logsConfig.postgresContainer}`,
  },
  worker: {
    label: "Worker · Transcode",
    shortLabel: "Worker",
    description: "YouTube transcodifica y sube",
  },
  locutor: {
    label: "Locutor · TTS/Kokoro",
    shortLabel: "Locutor",
    description: "Generación de voz y emisión",
  },
};

const ALL_SOURCE_IDS: SourceId[] = ["server", "azuracast", "nginx", "postgres", "worker", "locutor"];
const VALID_LEVELS: LogLevel[] = ["debug", "info", "warn", "error", "fatal"];
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 160;
const TAIL_BYTES = 512 * 1024; // 512KB window is enough for ~2000 lines
const TAIL_LINES_HARD = 2000;

// ── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeContainerName(name: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) throw new Error(`Invalid container name: ${name}`);
  return name;
}

function toLogLevel(raw: string | undefined): LogLevel {
  const v = (raw ?? "").toLowerCase();
  if (v === "debug") return "debug";
  if (v === "info" || v === "notice" || v === "log") return "info";
  if (v === "warn" || v === "warning") return "warn";
  if (v === "error" || v === "err") return "error";
  if (v === "fatal" || v === "crit" || v === "critical" || v === "emerg" || v === "alert" || v === "panic") return "fatal";
  return "info";
}

function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

function makeId(source: SourceId, ts: string, msg: string, idx: number): string {
  return `${source}-${ts}-${hashString(msg).slice(0, 6)}-${idx}`;
}

function parseIsoOrNull(v: string | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ── File tail ───────────────────────────────────────────────────────────────

async function readTailLines(filePath: string, maxLines: number, maxBytes = TAIL_BYTES): Promise<string[]> {
  const normalized = path.resolve(filePath);
  try {
    const stat = await fs.promises.stat(normalized);
    if (!stat.isFile()) return [];
    const size = stat.size;
    if (size === 0) return [];

    const readSize = Math.min(size, maxBytes);
    const start = size - readSize;
    const handle = await fs.promises.open(normalized, "r");
    try {
      const buf = Buffer.alloc(readSize);
      await handle.read(buf, 0, readSize, start);
      const text = buf.toString("utf-8");
      // If we cut in middle of line, drop first incomplete line when we didn't read from start
      const lines = text.split(/\r?\n/);
      if (start > 0 && lines.length > 0) lines.shift();
      // Remove trailing empty
      const filtered = lines.filter((l) => l.trim().length > 0);
      if (filtered.length <= maxLines) return filtered;
      return filtered.slice(-maxLines);
    } finally {
      await handle.close();
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    logger.warn("LogsService", `readTailLines failed for ${normalized}`, { error: String(err) });
    return [];
  }
}

// ── PM2 file resolution ───────────────────────────────────────────────────
// ecosystem.config.cjs sets error_file/out_file to base paths like
// /var/log/pm2/radio-backend-out.log, but PM2 in cluster mode writes app
// output to instance files like radio-backend-out-0.log. The base paths only
// receive systemd-captured PM2 CLI output (tables, daemon messages) via
// StandardOutput=/StandardError= in radio-backend.service, so reading only
// the base path shows "[PM2] Script not found" spam instead of app logs.
async function expandPm2Candidates(basePath: string): Promise<string[]> {
  const normalized = path.resolve(basePath);
  const dir = path.dirname(normalized);
  const base = path.basename(normalized);
  const ext = path.extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  try {
    const names = await fs.promises.readdir(dir);
    const matches = names.filter(
      (n) => n === base || (n.startsWith(`${stem}-`) && n.endsWith(ext || ".log")),
    );
    // Instance files first (real app logs), base file last (PM2 CLI wrapper output).
    matches.sort((a, b) => {
      if (a === base) return 1;
      if (b === base) return -1;
      return a.localeCompare(b);
    });
    return matches.map((n) => path.join(dir, n));
  } catch {
    return [normalized];
  }
}

function isPm2CliNoise(raw: string): boolean {
  const line = raw.trim();
  if (!line) return true;
  // PM2 table framing never appears in app logs.
  if (/[┌┐└┘├┤┬┴┼─│]/.test(line)) return true;
  // PM2 daemon/CLI output (spawn, save, tables, Script not found, ...).
  // Real app logs are "YYYY-MM-DD HH:mm:ss: ..." or JSON, never "[PM2]...".
  if (/^\[PM2\]/i.test(line)) return true;
  return false;
}

// ── Docker logs ─────────────────────────────────────────────────────────────

async function readDockerLogs(container: string, tail: number, since?: string): Promise<string[]> {
  let safe: string;
  try {
    safe = sanitizeContainerName(container);
  } catch {
    return [];
  }
  const args = ["logs", "--timestamps"];
  if (since) {
    const d = new Date(since);
    if (!Number.isNaN(d.getTime())) {
      // docker --since accepts unix timestamp or RFC3339; use seconds since epoch
      args.push("--since", Math.floor(d.getTime() / 1000).toString());
    }
  }
  args.push("--tail", String(Math.min(tail, TAIL_LINES_HARD)));
  args.push(safe);

  try {
    const { stdout, stderr } = await execFileAsync("docker", args, { timeout: 4000, maxBuffer: 4 * 1024 * 1024 });
    // docker logs prints to stderr when not --stdout combined? Actually both; merge.
    const raw = `${stdout}\n${stderr}`.trim();
    if (!raw) return [];
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    return lines.slice(-tail);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // ENOENT means docker binary not available (local dev)
    if (msg.includes("ENOENT") || msg.includes("not found") || msg.includes("No such container")) {
      return [];
    }
    logger.warn("LogsService", `docker logs failed for ${safe}`, { error: msg.slice(0, 200) });
    return [];
  }
}

// ── Parsers ─────────────────────────────────────────────────────────────────

function parsePm2Line(raw: string): { ts: string; level: LogLevel; msg: string; meta?: Record<string, unknown>; context?: string } | null {
  if (isPm2CliNoise(raw)) return null;
  const line = raw.trim();
  if (!line) return null;

  // Strip PM2 date prefix: "2026-08-30 10:00:00: {...}" or "2026/08/30 10:00:00 [...]"
  let jsonPart = line;
  let prefixTs: string | null = null;

  // PM2 log_date_format "YYYY-MM-DD HH:mm:ss: "
  const pm2Prefix = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(?::\s+|\s+)(.*)$/);
  if (pm2Prefix) {
    prefixTs = pm2Prefix[1];
    jsonPart = pm2Prefix[2];
  }

  // Try JSON parse
  let obj: Record<string, unknown> | null = null;
  try {
    // Some lines are JSON, some are plain morgan: find first {
    const idx = jsonPart.indexOf("{");
    if (idx >= 0) {
      const candidate = jsonPart.slice(idx);
      obj = JSON.parse(candidate) as Record<string, unknown>;
    } else if (jsonPart.startsWith("{")) {
      obj = JSON.parse(jsonPart) as Record<string, unknown>;
    }
  } catch {
    obj = null;
  }

  if (obj) {
    const tsRaw = (obj.timestamp as string) ?? (obj.time as string) ?? (obj.ts as string) ?? prefixTs ?? undefined;
    let ts = parseIsoOrNull(tsRaw ?? undefined);
    if (!ts && prefixTs) {
      const d = new Date(prefixTs.replace(" ", "T") + "Z");
      // Assume bogota time is UTC-5; but store as UTC for simplicity using local parse
      ts = Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
      // Better: try parse as local without Z
      if (!Number.isNaN(new Date(prefixTs).getTime())) ts = new Date(prefixTs).toISOString();
    }
    if (!ts) ts = new Date().toISOString();
    const level = toLogLevel((obj.level as string) ?? undefined);
    const context = (obj.context as string) ?? undefined;
    const message = (obj.message as string) ?? (obj.msg as string) ?? jsonPart;
    const { timestamp: _t, time: _ti, ts: _ts, level: _l, context: _c, message: _m, msg: _msg, ...rest } = obj;
    const meta: Record<string, unknown> | undefined = Object.keys(rest).length > 0 ? rest : undefined;
    // Include context in meta for filtering
    const finalMeta = meta ?? (context ? { context } : undefined);
    if (context && finalMeta && !finalMeta.context) (finalMeta as Record<string, unknown>).context = context;
    return { ts, level, msg: `${context ? `[${context}] ` : ""}${String(message)}`, meta: finalMeta, context };
  }

  // Fallback: morgan / plain text. PM2 always prefixes app output with
  // "YYYY-MM-DD HH:mm:ss: " (log_date_format), so a line without prefix is
  // PM2 CLI leftovers. Assigning "now" here flooded the panel with dozens of
  // rows sharing the query timestamp, hiding real logs. Skip instead.
  let level: LogLevel = "info";
  const lower = line.toLowerCase();
  if (lower.includes(" error ") || lower.includes("[error]") || lower.startsWith("error")) level = "error";
  else if (lower.includes(" warn ")) level = "warn";
  else if (lower.includes(" debug ")) level = "debug";
  else if (lower.includes(" fatal ") || lower.includes(" crit ")) level = "fatal";

  if (!prefixTs) return null;
  let ts = new Date().toISOString();
  const d = new Date(prefixTs);
  if (!Number.isNaN(d.getTime())) ts = d.toISOString();
  return { ts, level, msg: line, meta: undefined };
}

function parseNginxAccessLine(raw: string): { ts: string; level: LogLevel; msg: string; meta: Record<string, unknown> } | null {
  const line = raw.trim();
  if (!line) return null;
  // Combined: 127.0.0.1 - - [30/Aug/2026:10:00:00 -0500] "GET /health HTTP/1.1" 200 15 "-" "curl/8.0"
  const re = /^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d{3}) (\d+|-) "([^"]*)" "([^"]*)"/;
  const m = line.match(re);
  if (!m) return null;
  const [, ip, timeLocal, request, statusStr, bytes, referer, ua] = m;
  const status = parseInt(statusStr, 10);
  let level: LogLevel = "info";
  if (status >= 500) level = "error";
  else if (status >= 400) level = "warn";

  // Parse timeLocal: 30/Aug/2026:10:00:00 -0500
  let ts = new Date().toISOString();
  try {
    // Convert to parsable: "30 Aug 2026 10:00:00 -0500"
    const normalized = timeLocal.replace(/^(\d{2})\/(\w{3})\/(\d{4}):/, "$1 $2 $3 ");
    const d = new Date(normalized);
    if (!Number.isNaN(d.getTime())) ts = d.toISOString();
  } catch {}

  const msg = `${request} → ${status} (${bytes}b) ${ip}`;
  return { ts, level, msg, meta: { ip, request, status, bytes, referer, ua, kind: "access" } };
}

function parseNginxErrorLine(raw: string): { ts: string; level: LogLevel; msg: string; meta: Record<string, unknown> } | null {
  const line = raw.trim();
  if (!line) return null;
  // 2026/08/30 10:00:00 [error] 123#0: *1 open() "/var/..." failed (2: No such file), client: 1.2.3.4, server: lavozverdad.com, request: "GET / HTTP/1.1", host: "lavozverdad.com"
  const re = /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)\] (.+)$/;
  const m = line.match(re);
  if (!m) return null;
  const [, dateStr, lvlStr, rest] = m;
  const level = toLogLevel(lvlStr);
  let ts = new Date().toISOString();
  try {
    const d = new Date(dateStr.replace(/\//g, "-"));
    if (!Number.isNaN(d.getTime())) ts = d.toISOString();
  } catch {}
  return { ts, level, msg: rest, meta: { kind: "error", nginxLevel: lvlStr } };
}

function parseDockerLine(raw: string, source: SourceId): { ts: string; level: LogLevel; msg: string } | null {
  const line = raw.trim();
  if (!line) return null;
  // Docker --timestamps prefix: "2026-08-30T15:00:00.123456789Z message"
  const m = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s+(.*)$/);
  if (m) {
    const [, tsRaw, msg] = m;
    const ts = parseIsoOrNull(tsRaw) ?? new Date().toISOString();
    const lower = msg.toLowerCase();
    let level: LogLevel = "info";
    if (lower.includes("error") || lower.includes("failed") || lower.includes("exception")) level = "error";
    else if (lower.includes("warn")) level = "warn";
    else if (lower.includes("debug")) level = "debug";
    else if (lower.includes("fatal") || lower.includes("crit")) level = "fatal";
    return { ts, level, msg };
  }
  // Fallback without timestamp
  const lower = line.toLowerCase();
  let level: LogLevel = "info";
  if (lower.includes("error")) level = "error";
  else if (lower.includes("warn")) level = "warn";
  return { ts: new Date().toISOString(), level, msg: line };
}

function inferVirtualSource(context: string | undefined, msg: string): SourceId | null {
  const hay = `${context ?? ""} ${msg}`.toLowerCase();
  if (hay.includes("worker") || hay.includes("transcode") || hay.includes("job") || hay.includes("bull") || hay.includes("processingjob")) {
    // worker signals but also locutor contains worker? prioritize locutor if both
    if (hay.includes("locutor") || hay.includes("kokoro") || hay.includes("tts") || hay.includes("locutor")) return "locutor";
    return "worker";
  }
  if (hay.includes("locutor") || hay.includes("kokoro") || hay.includes("tts") || hay.includes("azuracast") && hay.includes("locutor")) return "locutor";
  // locutor keywords
  if (hay.includes("locutor") || hay.includes("kokoro") || hay.includes("bed") || hay.includes("announcement") || hay.includes("playbackazura")) {
    // playbackAzuracast is locutor-related; but could overlap with server. Keep locutor for those contexts
    if (hay.includes("playbackazura") || hay.includes("locutor") || hay.includes("kokoro")) return "locutor";
  }
  return null;
}

// ── Core loaders per source ──────────────────────────────────────────────────

async function loadRawServerEntries(tail: number): Promise<LogRow[]> {
  const outFiles = await expandPm2Candidates(logsConfig.pm2OutFile);
  const errFiles = await expandPm2Candidates(logsConfig.pm2ErrorFile);
  const perFile = Math.max(50, Math.ceil(tail / Math.max(1, outFiles.length + errFiles.length)));
  const outNested = await Promise.all(outFiles.map((f) => readTailLines(f, perFile)));
  const errNested = await Promise.all(errFiles.map((f) => readTailLines(f, perFile)));
  const all = [...outNested.flat(), ...errNested.flat()];
  const rows: LogRow[] = [];
  all.forEach((raw, idx) => {
    const parsed = parsePm2Line(raw);
    if (!parsed) return;
    const source: SourceId = "server";
    rows.push({
      id: makeId(source, parsed.ts, parsed.msg, idx),
      ts: parsed.ts,
      level: parsed.level,
      source,
      msg: parsed.msg,
      meta: parsed.meta,
    });
  });
  rows.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  return rows;
}

async function loadServerEntries(tail: number): Promise<LogRow[]> {
  const all = await loadRawServerEntries(tail);
  // Server is exclusive: exclude virtual worker/locutor entries so "all" doesn't double-count
  return all.filter((r) => {
    const meta = r.meta as Record<string, unknown> | undefined;
    const ctx = (meta?.context as string) ?? "";
    return inferVirtualSource(ctx, r.msg) === null;
  });
}

async function loadNginxEntries(tail: number): Promise<LogRow[]> {
  const accessLines = await readTailLines(logsConfig.nginxAccessLog, tail);
  const errorLines = await readTailLines(logsConfig.nginxErrorLog, tail);
  const rows: LogRow[] = [];
  let idx = 0;
  for (const raw of accessLines) {
    const p = parseNginxAccessLine(raw);
    if (!p) {
      // fallback as info
      rows.push({ id: makeId("nginx", new Date().toISOString(), raw, idx++), ts: new Date().toISOString(), level: "info", source: "nginx", msg: raw });
      continue;
    }
    rows.push({ id: makeId("nginx", p.ts, p.msg, idx++), ts: p.ts, level: p.level, source: "nginx", msg: p.msg, meta: p.meta });
  }
  for (const raw of errorLines) {
    const p = parseNginxErrorLine(raw);
    if (!p) {
      rows.push({ id: makeId("nginx", new Date().toISOString(), raw, idx++), ts: new Date().toISOString(), level: "info", source: "nginx", msg: raw });
      continue;
    }
    rows.push({ id: makeId("nginx", p.ts, p.msg, idx++), ts: p.ts, level: p.level, source: "nginx", msg: p.msg, meta: p.meta });
  }
  rows.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  return rows;
}

async function loadDockerSource(source: SourceId, container: string, tail: number, since?: string): Promise<LogRow[]> {
  const lines = await readDockerLogs(container, tail, since);
  const rows: LogRow[] = [];
  lines.forEach((raw, idx) => {
    const p = parseDockerLine(raw, source);
    if (!p) return;
    rows.push({ id: makeId(source, p.ts, p.msg, idx), ts: p.ts, level: p.level, source, msg: p.msg });
  });
  rows.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  return rows;
}

async function loadPostgresEntries(tail: number, since?: string): Promise<LogRow[]> {
  if (logsConfig.postgresLogFile) {
    const lines = await readTailLines(logsConfig.postgresLogFile, tail);
    const rows: LogRow[] = lines
      .map((raw, idx) => {
        const p = parseDockerLine(raw, "postgres");
        if (!p) return null;
        return { id: makeId("postgres", p.ts, p.msg, idx), ts: p.ts, level: p.level, source: "postgres" as SourceId, msg: p.msg } as LogRow;
      })
      .filter(Boolean) as LogRow[];
    if (rows.length > 0) return rows;
  }
  return loadDockerSource("postgres", logsConfig.postgresContainer, tail, since);
}

function filterByLevel(rows: LogRow[], level?: string): LogRow[] {
  if (!level || level === "all") return rows;
  if (!VALID_LEVELS.includes(level as LogLevel)) return rows;
  return rows.filter((r) => r.level === level);
}

function filterBySearch(rows: LogRow[], search?: string): LogRow[] {
  if (!search) return rows;
  const q = search.toLowerCase();
  return rows.filter((r) => r.msg.toLowerCase().includes(q) || JSON.stringify(r.meta ?? {}).toLowerCase().includes(q));
}

function buildHistogram(rows: LogRow[]): HistogramPoint[] {
  const now = Date.now();
  const buckets: HistogramPoint[] = [];
  for (let i = 59; i >= 0; i--) {
    const bucketStart = new Date(now - i * 60_000);
    bucketStart.setSeconds(0, 0);
    buckets.push({ ts: bucketStart.toISOString(), count: 0, errors: 0 });
  }
  // Map bucket ts minute start
  const bucketMap = new Map<string, HistogramPoint>();
  for (const b of buckets) bucketMap.set(new Date(b.ts).toISOString().slice(0, 16), b);

  for (const r of rows) {
    const d = new Date(r.ts);
    if (Number.isNaN(d.getTime())) continue;
    if (d.getTime() < now - 60 * 60_000) continue;
    d.setSeconds(0, 0);
    const key = d.toISOString().slice(0, 16);
    const b = bucketMap.get(key);
    if (!b) continue;
    b.count += 1;
    if (r.level === "error" || r.level === "fatal") b.errors += 1;
  }
  return buckets;
}

function computeSourceMeta(rows: LogRow[], source: SourceId): LogSourceMeta {
  const def = SOURCE_DEFS[source];
  if (rows.length === 0) {
    return {
      id: source,
      label: def.label,
      shortLabel: def.shortLabel,
      description: def.description,
      health: "ok",
      lastAt: null,
      lastLevel: null,
      counts: { debug: 0, info: 0, warn: 0, error: 0, fatal: 0 },
      total: 0,
    };
  }
  const counts: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0, fatal: 0 };
  let last: LogRow | null = null;
  for (const r of rows) {
    counts[r.level] = (counts[r.level] ?? 0) + 1;
    if (!last || new Date(r.ts).getTime() > new Date(last.ts).getTime()) last = r;
  }
  const total = rows.length;
  const errors = counts.error + counts.fatal;
  let health: "ok" | "warn" | "error" = "ok";
  if (last && (last.level === "error" || last.level === "fatal") && Date.now() - new Date(last.ts).getTime() < 5 * 60_000) {
    health = "error";
  } else if (errors > 0 && errors / Math.max(1, total) > 0.05) {
    health = "warn";
  } else if (counts.warn > 0 && counts.warn / Math.max(1, total) > 0.2) {
    health = "warn";
  }

  return {
    id: source,
    label: def.label,
    shortLabel: def.shortLabel,
    description: def.description,
    health,
    lastAt: last?.ts ?? null,
    lastLevel: last?.level ?? null,
    counts,
    total,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

async function loadEntriesForSource(source: SourceId, opts: { tail: number; since?: string }): Promise<LogRow[]> {
  switch (source) {
    case "server":
      return loadServerEntries(opts.tail);
    case "worker": {
      const all = await loadRawServerEntries(opts.tail);
      return all.filter((r) => {
        const meta = r.meta as Record<string, unknown> | undefined;
        const ctx = (meta?.context as string) ?? "";
        return inferVirtualSource(ctx, r.msg) === "worker";
      }).map((r) => ({ ...r, source: "worker" as SourceId, id: r.id.replace(/^server-/, "worker-") }));
    }
    case "locutor": {
      const all = await loadRawServerEntries(opts.tail);
      return all.filter((r) => {
        const meta = r.meta as Record<string, unknown> | undefined;
        const ctx = (meta?.context as string) ?? "";
        const v = inferVirtualSource(ctx, r.msg);
        if (v === "locutor") return true;
        const hay = `${ctx} ${r.msg}`.toLowerCase();
        return hay.includes("locutor") || hay.includes("kokoro") || hay.includes("tts") || hay.includes("announcement") || (hay.includes("playback") && hay.includes("azura"));
      }).map((r) => ({ ...r, source: "locutor" as SourceId, id: r.id.replace(/^server-/, "locutor-") }));
    }
    case "nginx":
      return loadNginxEntries(opts.tail);
    case "azuracast":
      return loadDockerSource("azuracast", logsConfig.azuracastContainer, opts.tail, opts.since);
    case "postgres":
      return loadPostgresEntries(opts.tail, opts.since);
    default:
      return [];
  }
}

export async function getLogSources(): Promise<{ sources: LogSourceMeta[] }> {
  const tail = 800;
  const entriesPerSource = await Promise.all(
    ALL_SOURCE_IDS.map(async (id) => {
      const rows = await loadEntriesForSource(id, { tail });
      return { id, rows };
    })
  );

  const sources = entriesPerSource.map(({ id, rows }) => computeSourceMeta(rows, id));
  return { sources };
}

function encodeCursor(row: LogRow): string {
  return Buffer.from(`${row.ts}::${row.id}`).toString("base64");
}

function decodeCursor(cursor: string): { ts: string; id: string | null } | null {
  // Try base64 with :: separator (new format)
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    if (decoded.includes("::")) {
      const idx = decoded.indexOf("::");
      const ts = decoded.slice(0, idx);
      const id = decoded.slice(idx + 2);
      if (!Number.isNaN(new Date(ts).getTime())) return { ts, id };
    }
  } catch {}
  // Fallback: raw ISO string (legacy)
  const t = new Date(cursor).getTime();
  if (!Number.isNaN(t)) return { ts: cursor, id: null };
  return null;
}

export async function getLogs(params: GetLogsParams): Promise<{ rows: LogRow[]; nextCursor: string | null; histogram: HistogramPoint[] }> {
  const source = (params.source ?? "all") as SourceId | "all";
  const level = params.level ?? "all";
  const search = params.search?.trim() ?? undefined;
  const order = params.order === "asc" ? "asc" : "desc";
  const limit = Math.min(Math.max(parseInt(String(params.limit ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const cursor = params.cursor ?? undefined;

  let allRows: LogRow[] = [];
  if (source === "all") {
    const perSource = await Promise.all(ALL_SOURCE_IDS.map((id) => loadEntriesForSource(id, { tail: TAIL_LINES_HARD })));
    allRows = perSource.flat();
  } else if (ALL_SOURCE_IDS.includes(source as SourceId)) {
    allRows = await loadEntriesForSource(source as SourceId, { tail: TAIL_LINES_HARD });
  } else {
    allRows = [];
  }

  allRows.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  const histogram = buildHistogram(allRows);

  let filtered = filterByLevel(allRows, level);
  filtered = filterBySearch(filtered, search);

  filtered.sort((a, b) => {
    const diff = new Date(a.ts).getTime() - new Date(b.ts).getTime();
    if (diff !== 0) return order === "desc" ? -diff : diff;
    // tie-breaker by id for stable sort
    return order === "desc" ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id);
  });

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      if (decoded.id) {
        const idx = filtered.findIndex((r) => r.id === decoded.id);
        if (idx >= 0) {
          filtered = filtered.slice(idx + 1);
        } else {
          // id not found (level/search changed), fallback to time-based
          const cursorTime = new Date(decoded.ts).getTime();
          filtered = filtered.filter((r) => {
            const t = new Date(r.ts).getTime();
            return order === "desc" ? t < cursorTime || (t === cursorTime && r.id < decoded.id!) : t > cursorTime || (t === cursorTime && r.id > decoded.id!);
          });
        }
      } else {
        const cursorTime = new Date(decoded.ts).getTime();
        filtered = filtered.filter((r) => {
          const t = new Date(r.ts).getTime();
          return order === "desc" ? t < cursorTime : t > cursorTime;
        });
      }
    }
  }

  const page = filtered.slice(0, limit);
  const nextCursor = page.length === limit && page.length > 0 ? encodeCursor(page[page.length - 1]) : null;

  return { rows: page, nextCursor, histogram };
}

export async function getLogsTail(params: TailParams): Promise<{ rows: LogRow[] }> {
  const source = (params.source ?? "all") as SourceId | "all";
  const since = params.since ? parseIsoOrNull(params.since) ?? new Date(Date.now() - 30_000).toISOString() : new Date(Date.now() - 30_000).toISOString();
  const limit = Math.min(Math.max(parseInt(String(params.limit ?? 80), 10) || 80, 1), MAX_LIMIT);

  let allRows: LogRow[] = [];
  if (source === "all") {
    const perSource = await Promise.all(ALL_SOURCE_IDS.map((id) => loadEntriesForSource(id, { tail: 400, since })));
    allRows = perSource.flat();
  } else if (ALL_SOURCE_IDS.includes(source as SourceId)) {
    allRows = await loadEntriesForSource(source as SourceId, { tail: 400, since });
  }

  const sinceTime = new Date(since).getTime();
  const filtered = allRows.filter((r) => new Date(r.ts).getTime() > sinceTime);
  filtered.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  const tail = filtered.slice(-limit);
  // Return newest first to match front polling expectation (it does reverse)
  tail.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  return { rows: tail };
}

export async function streamLogsForSource(
  source: SourceId,
  since: string,
  tail: number,
  onRow: (row: LogRow) => void,
  isAlive: () => boolean
): Promise<void> {
  // Initial tail
  let lastTs = since;
  const initial = await loadEntriesForSource(source, { tail, since });
  const sorted = [...initial].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  for (const r of sorted.slice(-tail)) {
    if (!isAlive()) return;
    if (new Date(r.ts).getTime() > new Date(lastTs).getTime()) {
      onRow(r);
      lastTs = r.ts;
    } else if (sorted.length <= 5) {
      // still emit recent even if not strictly newer (clock skew)
      onRow(r);
    }
  }
  // Poll loop is handled by caller (routes) to keep it simple; this helper just does one fetch
}
