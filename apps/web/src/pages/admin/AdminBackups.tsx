import { useCallback, useEffect, useState } from "react";
import { DatabaseBackup, Play, RefreshCw, ScrollText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui-custom/ConfirmDialog";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import type { BackupBundle, BackupOverview } from "@radio/types";
import { toast } from "sonner";

function formatBytes(bytes: number | null): string {
  if (bytes === null || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function scopeBadge(scope: BackupBundle["scope"]) {
  return scope === "weekly" ? (
    <Badge className="border-info/25 bg-info/10 text-info">Semanal</Badge>
  ) : (
    <Badge variant="outline" className="border-border bg-sunken text-faint">
      Diario
    </Badge>
  );
}

export default function AdminBackups() {
  const { isSuperAdmin } = useAdminAuth();
  const { getBackups, getBackupLog, runBackup } = useAdminApi();
  const [overview, setOverview] = useState<BackupOverview | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [confirmRun, setConfirmRun] = useState(false);

  const load = useCallback(() => {
    getBackups().then(
      (res) => {
        setOverview(res);
        setLoadError(null);
        setLoading(false);
      },
      () => {
        setLoadError("No se pudieron cargar los respaldos.");
        setLoading(false);
      }
    );
    getBackupLog(200).then(
      (res) => setLogLines(res.lines),
      () => setLogLines([])
    );
  }, [getBackups, getBackupLog]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!overview?.run.running) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [overview?.run.running, load]);

  const handleConfirmRun = useCallback(() => {
    setStarting(true);
    runBackup().then(
      () => {
        toast.success("Respaldo iniciado en segundo plano");
        setConfirmRun(false);
        load();
      },
      (err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        toast.error(
          status === 409
            ? "Ya hay un respaldo en ejecución"
            : status === 503
              ? "El script de respaldo no está disponible en este servidor"
              : "No se pudo iniciar el respaldo"
        );
      }
    ).finally(() => setStarting(false));
  }, [runBackup, load]);

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardContent className="grid place-items-center gap-2 px-6 py-16 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">Sin acceso</p>
          <p className="text-sm text-muted-foreground">
            Solo el superadmin puede ver los respaldos.
          </p>
        </CardContent>
      </Card>
    );
  }

  const running = overview?.run.running ?? false;
  const status = overview?.status ?? null;

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="relative p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-faint">
                Sistema · solo superadmin
              </p>
              <h1 className="mt-1.5 flex items-center gap-3 text-2xl font-semibold tracking-tight">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
                  <DatabaseBackup className="h-5 w-5" />
                </span>
                Respaldos
              </h1>
              <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
                Copias automáticas diarias de la base de datos a Cloudflare R2.
                El respaldo manual corre en segundo plano y no se solapa con
                una ejecución en curso.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={load}
                className="gap-1.5 rounded-full border-border bg-card"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Recargar
              </Button>
              <Button
                size="sm"
                onClick={() => setConfirmRun(true)}
                disabled={running || starting}
                className="gap-1.5 rounded-full"
              >
                <Play className="h-3.5 w-3.5" />
                {running ? "Respaldando…" : "Crear respaldo"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
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
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
              {running ? (
                <Badge className="border-warning/25 bg-warning/10 text-warning">En ejecución</Badge>
              ) : status?.status === "OK" ? (
                <Badge className="border-success/25 bg-success/10 text-success">Último: éxito</Badge>
              ) : status?.status === "FAILED" ? (
                <Badge className="border-destructive/25 bg-destructive/10 text-destructive">Último: error</Badge>
              ) : (
                <Badge variant="outline" className="border-border bg-sunken text-faint">
                  Sin respaldos aún
                </Badge>
              )}
              <span className="font-mono text-[11px] text-faint">
                Archivo: {status?.archive ?? "—"}
              </span>
              <span className="font-mono text-[11px] text-faint">
                Fecha: {status ? formatDateTime(status.time) : "—"}
              </span>
              <span className="font-mono text-[11px] text-faint">
                Tamaño: {formatBytes(status?.bytes ?? null)}
              </span>
              {overview?.run.triggeredBy && (
                <span className="font-mono text-[11px] text-faint">
                  Por: {overview.run.triggeredBy}
                </span>
              )}
            </CardContent>
          </Card>
          {status?.error && (
            <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
              {status.error}
            </p>
          )}
          {overview?.run.lastError && (
            <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
              {overview.run.lastError}
            </p>
          )}

          <Card>
            <CardContent className="p-4">
              <p className="mb-3 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-faint">
                Bundles retenidos ({overview?.backups.length ?? 0})
              </p>
              {(overview?.backups.length ?? 0) === 0 ? (
                <p className="py-8 text-center text-sm text-faint">
                  Todavía no hay respaldos. Crea el primero con el botón superior.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {overview?.backups.map((bundle) => (
                    <li key={`${bundle.scope}-${bundle.name}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">{bundle.name}</span>
                      {scopeBadge(bundle.scope)}
                      <span className="font-mono text-[11px] text-faint">{formatBytes(bundle.size)}</span>
                      <span className="font-mono text-[11px] text-faint">{formatDateTime(bundle.mtime)}</span>
                      {!bundle.hasSha256 && (
                        <Badge variant="outline" className="border-warning/25 text-warning">sin sha256</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-faint">
                  <ScrollText className="h-3.5 w-3.5" />
                  Log del respaldo
                </p>
                <Button variant="ghost" size="sm" onClick={load} className="gap-1.5 rounded-full">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Actualizar
                </Button>
              </div>
              {logLines.length === 0 ? (
                <p className="py-6 text-center text-sm text-faint">Sin líneas de log todavía.</p>
              ) : (
                <pre className="max-h-96 overflow-auto rounded-xl bg-sunken p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {logLines.join("\n")}
                </pre>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={confirmRun}
        onOpenChange={(open) => !open && setConfirmRun(false)}
        title="¿Crear respaldo ahora?"
        description="Se ejecuta scripts/radio-backup.sh en segundo plano: snapshot de la base de datos, subida a R2 y poda de bundles viejos."
        confirmLabel="Respaldar"
        onConfirm={handleConfirmRun}
      />
    </div>
  );
}
