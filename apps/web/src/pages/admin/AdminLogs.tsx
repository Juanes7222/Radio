import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Server,
  Radio,
  Globe,
  Database,
  Cpu,
  Mic2,
  Search,
  Download,
  Pause,
  Play,
  X,
  Copy,
  Check,
  Layers,
  Activity,
  Terminal,
  Trash2,
  ArrowUpDown,
  Filter,
  Eye,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { API_BASE_URL } from "@/config";

/* ── Types ─────────────────────────────────────────────────────── */

type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";
type SourceId = "server" | "azuracast" | "nginx" | "postgres" | "worker" | "locutor" | "all";

interface LogSourceMeta {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  health: string;
  lastAt: string | null;
  lastLevel: string | null;
  counts: Record<string, number>;
  total: number;
}

interface LogRow {
  id: string;
  ts: string;
  level: LogLevel;
  source: SourceId;
  msg: string;
  meta?: Record<string, unknown>;
}

interface HistogramPoint {
  ts: string;
  count: number;
  errors: number;
}

/* ── Config ────────────────────────────────────────────────────── */

const SOURCE_ICONS: Record<string, LucideIcon> = {
  server: Server,
  azuracast: Radio,
  nginx: Globe,
  postgres: Database,
  worker: Cpu,
  locutor: Mic2,
  all: Layers,
};

const SOURCE_HEX: Record<string, string> = {
  server: "#f59e0b",
  azuracast: "#0ea5e9",
  nginx: "#10b981",
  postgres: "#6366f1",
  worker: "#a78bfa",
  locutor: "#f43f5e",
};

const LEVEL_CFG: Record<LogLevel, { label: string; cls: string; dot: string }> = {
  debug: { label: "DEBUG", cls: "border-border bg-sunken text-faint", dot: "bg-faint" },
  info: { label: "INFO", cls: "border-info/20 bg-info/10 text-info", dot: "bg-info" },
  warn: { label: "WARN", cls: "border-amber-500/20 bg-amber-500/10 text-amber-300", dot: "bg-amber-500" },
  error: { label: "ERROR", cls: "border-tally/25 bg-tally/10 text-tally", dot: "bg-tally" },
  fatal: { label: "FATAL", cls: "border-tally/30 bg-tally/15 text-white ring-1 ring-tally/20", dot: "bg-tally" },
};

const LEVEL_ORDER: (LogLevel | "all")[] = ["all", "debug", "info", "warn", "error", "fatal"];

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
  } catch {
    return iso;
  }
}
function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "ahora";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

function levelDot(level: string | null): string {
  if (level === "error" || level === "fatal") return "bg-tally animate-tally";
  if (level === "warn") return "bg-amber-500";
  if (level === "info") return "bg-info";
  return "bg-faint";
}

/* ── Main ─────────────────────────────────────────────────────── */

export default function AdminLogs() {
  const { getLogSources, getLogs, getLogsTail } = useAdminApi();
  const { token } = useAdminAuth();
  const shouldReduceMotion = useReducedMotion();

  const [sources, setSources] = useState<LogSourceMeta[]>([]);
  const [activeSource, setActiveSource] = useState<SourceId>("all");
  const [level, setLevel] = useState<LogLevel | "all">("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [order, setOrder] = useState<"desc" | "asc">("desc");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [hist, setHist] = useState<HistogramPoint[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [live, setLive] = useState(true);
  const [selected, setSelected] = useState<LogRow | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(live && order === "desc");
  followRef.current = live && order === "desc";

  const activeMeta = useMemo(() => sources.find((s) => s.id === activeSource) ?? null, [sources, activeSource]);

  const loadSources = useCallback(async () => {
    try {
      const res = await getLogSources();
      setSources(res.sources as LogSourceMeta[]);
    } catch {
      // silent
    }
  }, [getLogSources]);

  const loadLogs = useCallback(
    async (opts: { cursor?: string; append?: boolean } = {}) => {
      const isMore = Boolean(opts.cursor);
      if (isMore) setLoadingMore(true);
      else setLoading(true);
      try {
        const res = await getLogs({
          source: activeSource,
          level,
          search: search || undefined,
          limit: 160,
          cursor: opts.cursor,
          order,
        });
        setRows((prev) => (opts.append ? [...prev, ...(res.rows as LogRow[])] : (res.rows as LogRow[])));
        setHist(res.histogram as HistogramPoint[]);
        setNextCursor(res.nextCursor);
        if (!opts.append && followRef.current) {
          requestAnimationFrame(() => {
            if (viewportRef.current) viewportRef.current.scrollTop = 0;
          });
        }
      } catch {
        toast.error("No se pudieron cargar los logs");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    }, [getLogs, activeSource, level, search, order]);

  // initial + when filters change
  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  // polling for sources health every 15s
  useEffect(() => {
    const id = setInterval(() => void loadSources(), 15_000);
    return () => clearInterval(id);
  }, [loadSources]);

  // LIVE: SSE streaming para source concreto, polling fallback para "all"
  useEffect(() => {
    if (!live || order !== "desc") return;

    // "all" no tiene SSE (fan-out complejo) -> polling
    if (activeSource === "all") {
      let alive = true;
      const tick = async () => {
        if (!alive) return;
        try {
          const since = rows[0]?.ts ?? new Date(Date.now() - 30_000).toISOString();
          const res = await getLogsTail({ source: activeSource, since, limit: 80 });
          const incoming = (res.rows as LogRow[]).filter((r) => {
            if (level !== "all" && r.level !== level) return false;
            if (search && !r.msg.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
          });
          if (incoming.length > 0 && alive) {
            setRows((prev) => {
              const ids = new Set(prev.map((p) => p.id));
              const uniq = incoming.filter((r) => !ids.has(r.id));
              if (uniq.length === 0) return prev;
              return [...uniq.reverse(), ...prev].slice(0, 600);
            });
            if (followRef.current && viewportRef.current && viewportRef.current.scrollTop < 40) viewportRef.current.scrollTop = 0;
          }
        } catch {}
      };
      const id = setInterval(tick, 2800);
      return () => { alive = false; clearInterval(id); };
    }

    // SSE para source concreto: fetch + ReadableStream (permite Authorization header)
    if (!token) return;
    const controller = new AbortController();
    let alive = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const startSSE = async () => {
      if (!alive || controller.signal.aborted) return;
      try {
        const since = rows[0]?.ts ?? new Date(Date.now() - 5 * 60_000).toISOString();
        const url = `${API_BASE_URL}/admin-api/logs/stream?source=${encodeURIComponent(activeSource)}&since=${encodeURIComponent(since)}&tail=60`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (alive) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";
          for (const part of parts) {
            const lines = part.split("\n").filter((l) => l.startsWith("data:"));
            for (const l of lines) {
              try {
                const payload = JSON.parse(l.slice(5).trim()) as { ts: string; level: LogLevel; source: string; msg: string };
                if (level !== "all" && payload.level !== level) continue;
                if (search && !payload.msg.toLowerCase().includes(search.toLowerCase())) continue;
                const entry: LogRow = {
                  id: `${payload.source}-${payload.ts}-${Math.random().toString(36).slice(2, 6)}`,
                  ts: payload.ts,
                  level: payload.level,
                  source: payload.source as SourceId,
                  msg: payload.msg,
                };
                setRows((prev) => {
                  if (prev.some((p) => p.ts === entry.ts && p.msg === entry.msg)) return prev;
                  return [entry, ...prev].slice(0, 600);
                });
                if (followRef.current && viewportRef.current && viewportRef.current.scrollTop < 40) viewportRef.current.scrollTop = 0;
              } catch {}
            }
          }
        }
      } catch (err) {
        if (!alive || controller.signal.aborted) return;
        // reconexión con backoff si SSE falla (Docker no disponible) -> polling fallback 3s
        const isAbort = err instanceof DOMException && err.name === "AbortError";
        if (!isAbort) {
          retryTimer = setTimeout(() => { void startSSE(); }, 3000);
        }
      }
    };
    void startSSE();
    return () => {
      alive = false;
      if (retryTimer) clearTimeout(retryTimer);
      controller.abort();
    };
  }, [live, order, activeSource, level, search, rows, getLogsTail, token]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  const handleDownload = () => {
    const lines = rows.map((r) => `${r.ts} [${r.level.toUpperCase().padEnd(5)}] ${r.source} — ${r.msg}`).join("\n");
    const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs-${activeSource}-${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1400);
    });
  };

  const maxHist = Math.max(1, ...hist.map((h) => h.count));

  return (
    <div className="space-y-5">
      {/* ── Header: consola de emisión ────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-[50px]" />
        <div aria-hidden className="pointer-events-none absolute -left-16 -bottom-20 h-48 w-48 rounded-full bg-info/10 blur-[40px]" />
        {/*hairline VU accent */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        {/* decorative VU bars faint behind title */}
        <div aria-hidden className="pointer-events-none absolute right-6 top-4 hidden select-none gap-px lg:flex">
          {Array.from({ length: 18 }).map((_, i) => (
            <span key={i} className="w-px rounded-full bg-primary/15" style={{ height: `${8 + ((i * 11) % 18)}px`, opacity: 0.6 - i * 0.02 }} />
          ))}
        </div>
        <div className="relative p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-faint">
                Sala de máquinas · 6 servicios · Bogotá UTC-5
              </p>
              <h1 className="mt-1.5 flex items-center gap-3 text-2xl font-semibold tracking-tight">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
                  <Terminal className="h-5 w-5" />
                </span>
                Bitácora de emisión
              </h1>
              <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
                La cinta no miente. Cada servicio deja huella: Nginx en el borde, AzuraCast en el aire, Postgres en disco. Filtra por severidad, sigue el vivo o congela un instante para inspeccionar.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${live ? "border-amber-500/25 bg-amber-500/10 text-amber-300" : "border-border bg-sunken text-faint"}`}>
                <span className={`h-2 w-2 rounded-full ${live ? "bg-amber-500 animate-tally" : "bg-faint"}`} aria-hidden />
                {live ? "SIGUIENDO" : "PAUSADO"}
              </span>
              <Badge variant="outline" className="rounded-full border-border bg-sunken font-mono text-xs tabular-nums">
                {rows.length} líneas
              </Badge>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-mono text-faint">
              <Activity className="h-3.5 w-3.5" />
              AzuraCast {sources.find((s) => s.id === "azuracast")?.health === "warn" ? "· buffer warn" : "· estable"}
            </span>
            <span className="text-border">·</span>
            <span className="font-mono text-faint">{new Date().toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}</span>
            <span className="ml-auto hidden items-center gap-1.5 font-mono text-[11px] text-faint sm:flex">
              <Eye className="h-3 w-3" /> usa <kbd className="rounded border border-border bg-sunken px-1 py-0.5">/</kbd> para buscar · <kbd className="rounded border border-border bg-sunken px-1 py-0.5">L</kbd> vivo
            </span>
          </div>
        </div>
      </div>

      {/* ── Layout: patchbay + deck ─────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Patchbay */}
        <Card className="overflow-hidden self-start lg:sticky lg:top-[68px]">
          <CardHeader className="border-b border-border bg-sunken/40 py-3">
            <CardTitle className="flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-[0.14em] text-faint">
              <Layers className="h-3.5 w-3.5" />
              Fuentes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <div className="space-y-1">
              {/* All */}
              <button
                onClick={() => setActiveSource("all")}
                className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeSource === "all" ? "border-primary/30 bg-primary/10" : "border-transparent bg-sunken/60 hover:bg-accent"}`}
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-foreground text-background">
                  <Layers className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-semibold leading-none ${activeSource === "all" ? "text-primary" : ""}`}>Todas</span>
                  <span className="block truncate font-mono text-[11px] text-faint">Agregado · 6 servicios</span>
                </span>
                <span className="font-mono text-xs tabular-nums text-faint">{sources.reduce((a, s) => a + s.total, 0)}</span>
              </button>

              {sources.map((s) => {
                const Icon = SOURCE_ICONS[s.id] ?? Server;
                const isActive = activeSource === s.id;
                const errors = (s.counts.error ?? 0) + (s.counts.fatal ?? 0);
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveSource(s.id as SourceId)}
                    className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isActive ? "border-primary/30 bg-primary/10" : "border-transparent bg-card hover:bg-accent"}`}
                  >
                    <span className="relative grid h-7 w-7 place-items-center rounded-lg border border-border bg-sunken">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                      <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${levelDot(s.lastLevel)}`} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm font-medium leading-none ${isActive ? "text-primary" : "text-foreground"}`}>{s.shortLabel}</span>
                      <span className="block truncate font-mono text-[11px] text-faint">{s.label.split("·")[0].trim()}</span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      {errors > 0 ? (
                        <span className="rounded-full bg-tally/15 px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none text-tally ring-1 ring-tally/15">{errors}</span>
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-success/70" aria-hidden />
                      )}
                      <span className="font-mono text-[11px] tabular-nums text-faint">{timeAgo(s.lastAt)}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 rounded-xl border border-border bg-sunken p-3">
              <p className="font-mono text-[11px] uppercase tracking-widest text-faint">Leyenda</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-info/20 bg-info/10 px-2 py-0.5 text-xs text-info"><span className="h-1.5 w-1.5 rounded-full bg-info" />info</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />warn</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-tally/20 bg-tally/10 px-2 py-0.5 text-xs text-tally"><span className="h-1.5 w-1.5 rounded-full bg-tally" />error</span>
              </div>
              <p className="mt-2 font-mono text-[11px] leading-relaxed text-faint">Tally rojo solo para error/fatal. Ámbar es señal, no adorno.</p>
            </div>
          </CardContent>
        </Card>

        {/* Deck */}
        <div className="space-y-3">
          {/* Transport + filters */}
          <Card className="overflow-hidden">
            <CardContent className="space-y-3 p-3 sm:p-4">
              {/* Row 1: search + transport */}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <form onSubmit={handleSearch} className="relative flex flex-1 items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                    <Input
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder="Filtrar por mensaje, reqId, mount… (/ para foco)"
                      className="h-9 border-border bg-sunken pl-9 pr-9 font-mono text-sm placeholder:text-faint focus-visible:ring-primary/20"
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setSearchInput("");
                          setSearch("");
                        }
                      }}
                    />
                    {searchInput && (
                      <button type="button" onClick={() => { setSearchInput(""); setSearch(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-foreground" aria-label="Limpiar búsqueda">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <Button type="submit" size="sm" className="h-9 rounded-full">
                    <Filter className="h-3.5 w-3.5" /> Buscar
                  </Button>
                </form>

                <div className="flex items-center gap-1.5">
                  <Button variant={live ? "default" : "outline"} size="sm" onClick={() => setLive((v) => !v)} className={`rounded-full gap-1.5 ${live ? "bg-primary text-primary-foreground" : "border-border bg-card"}`} title="Seguir vivo (L)">
                    {live ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    {live ? "Siguiendo" : "Pausado"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setOrder((o) => (o === "desc" ? "asc" : "desc"))} className="rounded-full border-border bg-card gap-1.5" title="Invertir orden">
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    {order === "desc" ? "Recientes" : "Antiguos"}
                  </Button>
                  <Button variant="outline" size="icon" onClick={handleDownload} className="h-9 w-9 rounded-full border-border bg-card" title="Descargar .log" aria-label="Descargar">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Row 2: level chips + active source pill + clear */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {LEVEL_ORDER.map((lvl) => {
                    const active = level === lvl;
                    return (
                      <button
                        key={lvl}
                        onClick={() => setLevel(lvl as LogLevel | "all")}
                        className={`rounded-full border px-2.5 py-1 font-mono text-xs font-medium transition-colors active:scale-[0.97] ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                      >
                        {lvl === "all" ? "Todos" : lvl.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
                <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-sunken px-2.5 py-1 font-mono text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: SOURCE_HEX[activeSource] ?? "hsl(var(--primary))" }} aria-hidden />
                  {activeMeta ? activeMeta.label : activeSource === "all" ? "Todas las fuentes" : activeSource}
                </span>
                {(search || level !== "all") && (
                  <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setSearchInput(""); setLevel("all"); }} className="h-7 gap-1 rounded-full text-xs text-muted-foreground">
                    <Trash2 className="h-3.5 w-3.5" /> Limpiar filtros
                  </Button>
                )}
                <span className="ml-auto font-mono text-xs text-faint hidden sm:inline">{activeMeta ? `${activeMeta.total} eventos · último ${timeAgo(activeMeta.lastAt)}` : ""}</span>
              </div>

              {/* Histogram: VU strip 60m */}
              <div className="rounded-xl border border-border bg-sunken p-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-faint">Densidad 60 min · barras = volumen, rojo = error</span>
                  <span className="font-mono text-[11px] tabular-nums text-faint">{hist.filter((h) => h.errors > 0).length} min con error</span>
                </div>
                <div className="flex h-10 items-end gap-px overflow-hidden rounded-lg bg-card/40 p-1">
                  {hist.map((h, i) => {
                    const pct = Math.max(4, Math.round((h.count / maxHist) * 100));
                    const errPct = h.errors > 0 ? Math.max(2, Math.round((h.errors / Math.max(1, maxHist)) * 100)) : 0;
                    const tsLabel = new Date(h.ts).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <div key={h.ts} className="group relative flex flex-1 flex-col justify-end gap-px" style={{ minWidth: 0 }}>
                        <div
                          className="w-full rounded-sm bg-border transition-colors group-hover:bg-primary/30"
                          style={{ height: `${pct}%`, opacity: h.count === 0 ? 0.15 : 0.9 }}
                          title={`${tsLabel} · ${h.count} líneas · ${h.errors} errores`}
                        />
                        {errPct > 0 && (
                          <div className="absolute inset-x-0 bottom-0 rounded-sm bg-tally/80" style={{ height: `${Math.max(3, errPct * 0.6)}%` }} aria-hidden />
                        )}
                        {/* subtle tick every 10m */}
                        {i % 10 === 0 && <span className="absolute -bottom-px left-0 h-px w-full bg-border/50" aria-hidden />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tape viewport */}
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border bg-sunken/50 py-3">
              <CardTitle className="flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-[0.14em] text-faint">
                <Terminal className="h-3.5 w-3.5" />
                Cinta · {activeSource === "all" ? "todas" : activeMeta?.shortLabel ?? activeSource} · {rows.length} líneas
                {live && order === "desc" && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] normal-case tracking-normal text-primary ring-1 ring-primary/15"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> vivo</span>}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => void loadLogs()} className="h-7 gap-1 rounded-full text-xs">
                Recargar
              </Button>
            </CardHeader>
            <div className="relative">
              {/* Playhead when live */}
              {live && order === "desc" && !shouldReduceMotion && (
                <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
              )}
              {/* Sprocket + scanline viewport */}
              <div
                ref={viewportRef}
                className="relative max-h-[540px] overflow-auto overscroll-contain bg-[hsl(225_26%_6.5%)] font-mono text-xs leading-5"
                style={{
                  scrollbarWidth: "thin",
                  scrollbarColor: "hsl(var(--border)) transparent",
                }}
              >
                {/* left sprocket rail */}
                <div
                  aria-hidden
                  className="pointer-events-none sticky left-0 top-0 z-[1] hidden h-full w-6 shrink-0 border-r border-white/5 bg-[radial-gradient(ellipse_8px_10px_at_50%_14px,_rgba(255,255,255,0.16)_0_40%,_transparent_41%),linear-gradient(to_bottom,transparent,transparent)] sm:block"
                  style={{
                    backgroundRepeat: "repeat-y",
                    backgroundSize: "100% 28px",
                    backgroundPosition: "0 6px",
                    float: "left",
                    height: "100%",
                    minHeight: "540px",
                  }}
                />
                {/* scanlines overlay */}
                <div aria-hidden className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(to_bottom,transparent_0_2px,rgba(255,255,255,0.02)_2px_3px)]" />

                <div className="relative">
                  {loading ? (
                    <div className="space-y-1 p-3">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className="h-5 animate-pulse rounded bg-white/[0.04]" style={{ opacity: 1 - i * 0.07 }} />
                      ))}
                    </div>
                  ) : rows.length === 0 ? (
                    <div className="grid place-items-center gap-2 px-6 py-16 text-center">
                      <Terminal className="h-8 w-8 text-faint/40" />
                      <p className="font-mono text-sm text-faint">Sin líneas para este filtro.</p>
                      <p className="max-w-sm font-mono text-xs leading-relaxed text-faint/70">Prueba con otra severidad, otra fuente o limpia la búsqueda. La cinta sigue girando aunque no haya coincidencias.</p>
                      <Button variant="outline" size="sm" onClick={() => { setSearch(""); setSearchInput(""); setLevel("all"); }} className="mt-1 rounded-full border-white/10 bg-white/[0.04] text-faint hover:bg-white/10 hover:text-foreground">
                        Limpiar filtros
                      </Button>
                    </div>
                  ) : (
                    <ul className="divide-y divide-white/[0.04]">
                      <AnimatePresence initial={false}>
                        {rows.map((row, idx) => {
                          const cfg = LEVEL_CFG[row.level] ?? LEVEL_CFG.info;
                          const isSelected = selected?.id === row.id;
                          // subtle stagger
                          return (
                            <motion.li
                              key={row.id}
                              layout={!shouldReduceMotion}
                              initial={shouldReduceMotion ? false : { opacity: 0, y: 2 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              transition={shouldReduceMotion ? { duration: 0.08 } : { duration: 0.18, delay: Math.min(idx * 0.004, 0.06) }}
                              className={`group flex gap-0 border-l-2 bg-transparent text-left transition-colors hover:bg-white/[0.04] focus-within:bg-white/[0.04] ${row.level === "error" || row.level === "fatal" ? "border-l-tally/60 hover:border-l-tally" : row.level === "warn" ? "border-l-amber-500/50" : "border-l-transparent"}`}
                            >
                              <button
                                onClick={() => setSelected((s) => (s?.id === row.id ? null : row))}
                                className="flex min-w-0 flex-1 items-start gap-2 px-2 py-1.5 text-left focus-visible:outline-none sm:gap-3 sm:px-3"
                              >
                                <span className="hidden shrink-0 tabular-nums text-[11px] text-white/35 sm:inline" style={{ minWidth: "92px" }}>
                                  {formatTime(row.ts)}
                                </span>
                                <span className="shrink-0 sm:hidden tabular-nums text-[11px] text-white/35" style={{ minWidth: "58px" }}>
                                  {new Date(row.ts).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                                <span className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0 text-[10px] font-medium leading-none tracking-wide ${cfg.cls}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} aria-hidden />
                                  {cfg.label}
                                </span>
                                <span className="hidden shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-0 font-mono text-[10px] leading-[18px] tracking-wide text-white/60 sm:inline-flex">
                                  {row.source.toUpperCase()}
                                </span>
                                <span className="min-w-0 flex-1 break-all text-left text-[12px] leading-5 text-white/85 group-hover:text-white">
                                  {row.msg}
                                  {row.meta && (
                                    <span className="ml-2 font-mono text-[11px] text-white/35">
                                      {row.meta.reqId ? `· ${String(row.meta.reqId).slice(0, 14)}` : ""}
                                      {row.meta.durMs ? ` · ${String(row.meta.durMs)}ms` : ""}
                                    </span>
                                  )}
                                </span>
                              </button>
                              <span className="hidden shrink-0 items-center gap-1 pr-2 pt-1.5 sm:flex">
                                <button
                                  onClick={() => handleCopy(`${row.ts} [${row.level}] ${row.source} ${row.msg}`, row.id)}
                                  className="grid h-6 w-6 place-items-center rounded-md border border-transparent bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  title="Copiar línea"
                                  aria-label="Copiar"
                                >
                                  {copied === row.id ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                                </button>
                              </span>
                              {isSelected && (
                                <span className="hidden w-px self-stretch bg-primary/40 sm:block" aria-hidden />
                              )}
                            </motion.li>
                          );
                        })}
                      </AnimatePresence>
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* footer actions */}
            <div className="flex flex-wrap items-center gap-2 border-t border-border bg-sunken/40 px-3 py-2.5">
              {nextCursor ? (
                <Button variant="outline" size="sm" onClick={() => void loadLogs({ cursor: nextCursor, append: true })} disabled={loadingMore} className="rounded-full border-border bg-card gap-1.5">
                  {loadingMore ? "Cargando…" : "Cargar más antiguos"}
                </Button>
              ) : (
                <span className="font-mono text-xs text-faint">Fin de la cinta capturada (18h).</span>
              )}
              <span className="ml-auto hidden font-mono text-xs text-faint sm:inline">
                {rows.length} líneas · {hist.reduce((a, b) => a + b.count, 0)} en la última hora
              </span>
              <Button variant="ghost" size="sm" onClick={handleDownload} className="gap-1.5 rounded-full text-xs">
                <Download className="h-3.5 w-3.5" /> Descargar .log
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Detail drawer */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-end bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ type: "spring", damping: 24, stiffness: 260 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            >
              <div className="border-b border-border bg-sunken/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-widest text-faint">Detalle de línea</p>
                    <p className="mt-1 break-all font-mono text-xs text-foreground">{selected.id}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${LEVEL_CFG[selected.level].cls}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${LEVEL_CFG[selected.level].dot}`} /> {LEVEL_CFG[selected.level].label}
                      </span>
                      <span className="rounded-full border border-border bg-sunken px-2 py-0.5 font-mono text-xs">{selected.source}</span>
                      <span className="font-mono text-xs text-faint">{new Date(selected.ts).toLocaleString("es-CO")}</span>
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSelected(null)} className="h-8 w-8 rounded-full" aria-label="Cerrar">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-3 p-4">
                <div className="rounded-xl border border-border bg-sunken p-3">
                  <p className="font-mono text-xs leading-relaxed text-foreground">{selected.msg}</p>
                </div>
                {selected.meta && (
                  <div>
                    <p className="mb-1.5 font-mono text-xs font-medium text-faint">Meta</p>
                    <pre className="max-h-40 overflow-auto rounded-xl border border-border bg-sunken p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                      {JSON.stringify(selected.meta, null, 2)}
                    </pre>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleCopy(JSON.stringify(selected, null, 2), "drawer")} className="gap-1.5 rounded-full">
                    {copied === "drawer" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied === "drawer" ? "Copiado" : "Copiar JSON"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setSelected(null)} className="rounded-full border-border bg-card">
                    Cerrar
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }`}</style>
    </div>
  );
}
