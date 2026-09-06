import { useCallback, useEffect, useState } from "react";
import { Cog, Play, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui-custom/ConfirmDialog";
import { useAdminApi } from "@/hooks/useAdminApi";
import { toast } from "sonner";

interface SystemJobState {
  status: string;
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  triggeredBy: string | null;
}

interface SystemJob {
  key: string;
  label: string;
  description: string;
  schedule: string;
  requiresConfirm: boolean;
  state: SystemJobState;
}

function statusBadge(job: SystemJob) {
  if (job.state.running) {
    return <Badge className="border-warning/25 bg-warning/10 text-warning">En ejecución</Badge>;
  }
  if (job.state.status === "success") {
    return <Badge className="border-success/25 bg-success/10 text-success">Última: éxito</Badge>;
  }
  if (job.state.status === "error") {
    return <Badge className="border-tally/25 bg-tally/10 text-tally">Última: error</Badge>;
  }
  return (
    <Badge variant="outline" className="border-border bg-sunken text-faint">
      Sin ejecuciones manuales
    </Badge>
  );
}

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

export default function AdminJobs() {
  const { getSystemJobs, runSystemJob } = useAdminApi();
  const [jobs, setJobs] = useState<SystemJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<SystemJob | null>(null);

  const load = useCallback(() => {
    getSystemJobs().then(
      (res) => {
        setJobs(res.jobs as SystemJob[]);
        setLoadError(null);
        setLoading(false);
      },
      () => {
        setLoadError("No se pudieron cargar los jobs del sistema.");
        setLoading(false);
      }
    );
  }, [getSystemJobs]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!jobs.some((job) => job.state.running)) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [jobs, load]);

  const handleRun = useCallback(
    (job: SystemJob) => {
      if (job.requiresConfirm) {
        setPendingConfirm(job);
        return;
      }
      setRunningKey(job.key);
      runSystemJob(job.key).then(
        () => {
          toast.success(`"${job.label}" iniciado en segundo plano`);
          load();
        },
        (err: unknown) => {
          const status = (err as { response?: { status?: number } })?.response?.status;
          toast.error(
            status === 409
              ? "El job ya está en ejecución"
              : "No se pudo iniciar el job"
          );
        }
      ).finally(() => setRunningKey(null));
    },
    [runSystemJob, load]
  );

  const handleConfirmRun = useCallback(() => {
    const job = pendingConfirm;
    if (!job) return;
    setRunningKey(job.key);
    runSystemJob(job.key).then(
      () => {
        toast.success(`"${job.label}" iniciado en segundo plano`);
        setPendingConfirm(null);
        load();
      },
      (err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        toast.error(
          status === 409 ? "El job ya está en ejecución" : "No se pudo iniciar el job"
        );
      }
    ).finally(() => setRunningKey(null));
  }, [pendingConfirm, runSystemJob, load]);

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="relative p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-faint">
                Sistema · ejecución manual
              </p>
              <h1 className="mt-1.5 flex items-center gap-3 text-2xl font-semibold tracking-tight">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
                  <Cog className="h-5 w-5" />
                </span>
                Jobs del sistema
              </h1>
              <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
                Ejecuta bajo demanda los mismos trabajos del programador: limpieza,
                actualizaciones y generación del locutor. Corren en segundo plano y
                no se solapan con una ejecución en curso.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              className="gap-1.5 rounded-full border-border bg-card"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Recargar
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : loadError ? (
        <Card>
          <CardContent className="grid place-items-center gap-2 px-6 py-16 text-center">
            <p className="text-sm text-muted-foreground">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => { setLoading(true); load(); }} className="rounded-full">
              Reintentar
            </Button>
          </CardContent>
        </Card>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="grid place-items-center gap-2 px-6 py-16 text-center">
            <Cog className="h-8 w-8 text-faint/40" />
            <p className="text-sm text-faint">No hay jobs registrados.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {jobs.map((job) => {
            const busy = job.state.running || runningKey === job.key;
            return (
              <Card key={job.key} className="overflow-hidden">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{job.label}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-faint">
                        Programado: {job.schedule}
                      </p>
                    </div>
                    {statusBadge(job)}
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {job.description}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-faint">
                    <span>Inicio: {formatDateTime(job.state.startedAt)}</span>
                    <span>Fin: {formatDateTime(job.state.finishedAt)}</span>
                    {job.state.triggeredBy && <span>Por: {job.state.triggeredBy}</span>}
                  </div>
                  {job.state.lastError && (
                    <p className="rounded-xl border border-tally/20 bg-tally/10 px-3 py-2 font-mono text-xs text-tally">
                      {job.state.lastError}
                    </p>
                  )}
                  <Button
                    size="sm"
                    onClick={() => handleRun(job)}
                    disabled={busy}
                    className="gap-1.5 rounded-full"
                  >
                    <Play className="h-3.5 w-3.5" />
                    {busy ? "En ejecución…" : "Ejecutar ahora"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => !open && setPendingConfirm(null)}
        title={pendingConfirm ? `¿Ejecutar "${pendingConfirm.label}"?` : "Ejecutar job"}
        description={pendingConfirm?.description}
        confirmLabel="Ejecutar"
        onConfirm={handleConfirmRun}
      />
    </div>
  );
}
