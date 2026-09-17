import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  HeartPulse,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminApi } from "@/hooks/useAdminApi";
import type { HealthCheckResult, HealthOverview, HealthStatus } from "@radio/types";
import { toast } from "sonner";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

const STATUS_STYLES: Record<HealthStatus, { badge: string; label: string }> = {
  ok: { badge: "border-success/25 bg-success/10 text-success", label: "OK" },
  degraded: { badge: "border-warning/25 bg-warning/10 text-warning", label: "Degradado" },
  critical: { badge: "border-tally/25 bg-tally/10 text-tally", label: "Crítico" },
};

function StatusBadge({ status }: { status: HealthStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <Badge variant="outline" className={style.badge}>
      {style.label}
    </Badge>
  );
}

function statusIcon(status: HealthStatus) {
  if (status === "ok") return <CheckCircle2 className="size-4 text-success" />;
  if (status === "degraded") return <AlertTriangle className="size-4 text-warning" />;
  return <AlertTriangle className="size-4 text-tally" />;
}

function CheckCard({ check }: { check: HealthCheckResult }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 px-4 py-3">
        <div className="mt-0.5">{statusIcon(check.status)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-foreground">{check.label}</p>
            <StatusBadge status={check.status} />
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">{check.detail}</p>
          {check.issues.length > 0 && (
            <ul className="mt-2 space-y-1">
              {check.issues.map((issue) => (
                <li key={issue.code} className="font-mono text-[11px] text-faint">
                  {issue.code} · {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminHealth() {
  const { getHealthOverview, runHealthCycle } = useAdminApi();
  const [overview, setOverview] = useState<HealthOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(() => {
    getHealthOverview().then(
      (res) => {
        setOverview(res);
        setLoadError(null);
        setLoading(false);
      },
      () => {
        setLoadError("No se pudo cargar el estado de salud.");
        setLoading(false);
      }
    );
  }, [getHealthOverview]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while any check is degraded or critical so recovery is visible.
  const aggregate = overview?.status ?? "ok";
  useEffect(() => {
    if (aggregate === "ok") return;
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [aggregate, load]);

  const handleRun = useCallback(() => {
    setRunning(true);
    runHealthCycle().then(
      (res) => {
        setOverview(res);
        toast.success("Ciclo de salud ejecutado");
      },
      () => toast.error("No se pudo ejecutar el ciclo de salud"),
    ).finally(() => setRunning(false));
  }, [runHealthCycle]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (loadError || !overview) {
    return (
      <Card>
        <CardContent className="grid place-items-center gap-2 px-6 py-16 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">Error</p>
          <p className="text-sm text-muted-foreground">{loadError ?? "Sin datos"}</p>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-2 size-4" /> Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="relative flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="grid size-12 place-items-center rounded-xl border border-border bg-sunken">
              <HeartPulse className="size-6 text-primary" />
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
                Centro de salud
              </p>
              <div className="mt-1 flex items-center gap-2">
                <h1 className="text-xl font-semibold text-foreground">
                  Estado {STATUS_STYLES[overview.status].label.toLowerCase()}
                </h1>
                <StatusBadge status={overview.status} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Última revisión: {formatDateTime(overview.checkedAt)}
                {" · "}
                {overview.openAlerts.length} alerta(s) abierta(s)
              </p>
            </div>
          </div>
          <Button size="sm" onClick={handleRun} disabled={running}>
            {running ? (
              <RefreshCw className="mr-2 size-4 animate-spin" />
            ) : (
              <Activity className="mr-2 size-4" />
            )}
            Revisar ahora
          </Button>
        </div>
      </div>

      {overview.openAlerts.length > 0 && (
        <Card className="border-tally/30">
          <CardContent className="px-4 py-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-tally">
              Alertas abiertas
            </p>
            <ul className="mt-2 space-y-1.5">
              {overview.openAlerts.map((alert) => (
                <li key={alert.key} className="text-sm text-foreground">
                  <span className="font-medium">{alert.checkKey}</span>{" "}
                  <span className="text-muted-foreground">{alert.message}</span>{" "}
                  <span className="font-mono text-[11px] text-faint">
                    desde {formatDateTime(alert.since)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {overview.checks.map((check) => (
          <CheckCard key={check.key} check={check} />
        ))}
      </div>

      <Card>
        <CardContent className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Wrench className="size-4 text-faint" />
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
              Acciones automáticas recientes
            </p>
          </div>
          {overview.recentActions.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              El vigilante no ha necesitado intervenir.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {overview.recentActions.map((action) => (
                <li key={`${action.key}-${action.at}`} className="flex items-center gap-2 text-sm">
                  {action.ok ? (
                    <CheckCircle2 className="size-3.5 shrink-0 text-success" />
                  ) : (
                    <AlertTriangle className="size-3.5 shrink-0 text-warning" />
                  )}
                  <span className="font-medium">{action.label}</span>
                  {action.detail && (
                    <span className="truncate text-muted-foreground">{action.detail}</span>
                  )}
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-faint">
                    {formatDateTime(action.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
