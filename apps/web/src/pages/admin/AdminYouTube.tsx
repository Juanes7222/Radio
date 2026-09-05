import { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw,
  Server,
  Film,
  ExternalLink,
  RotateCcw,
  Upload,
  FileArchive,
  X,
  AlertCircle,
  PackageCheck,
  ShieldCheck,
  HardDrive,
  Zap,
  ChevronRight,
} from 'lucide-react';
import axios from 'axios';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { API_BASE_URL } from '@/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAdminApi } from '@/hooks/useAdminApi';
import { formatDateTime, formatDateTimeFull, timeAgoShort } from '@/lib/format';
import type { WorkerJob, WorkerNodeInfo } from '@radio/types';

const JOB_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  ASSIGNED: 'bg-info/10 text-info border-info/20',
  RETRYING: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  ERROR: 'bg-destructive/10 text-destructive border-destructive/20',
  ABANDONED: 'bg-destructive/10 text-destructive border-destructive/20',
  DONE: 'bg-success/10 text-success border-success/20',
};

const WORKER_STATUS_COLORS: Record<string, string> = {
  ONLINE: 'bg-success/10 text-success border-success/20',
  OFFLINE: 'bg-faint/10 text-faint border-faint/20',
};

function statusBadge(value: string, colors: Record<string, string>) {
  return (
    <Badge variant="outline" className={`text-xs border ${colors[value] ?? 'bg-faint/10 text-faint border-faint/20'}`}>
      {value}
    </Badge>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2.5">
      <span className="text-xs shrink-0 text-faint pt-0.5">{label}</span>
      <div className="text-xs text-right text-foreground min-w-0">{value}</div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function JobDetailDialog({
  job,
  onClose,
  onRetry,
  retrying,
}: {
  job: WorkerJob | null;
  onClose: () => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  const canRetry = job ? ['ERROR', 'ABANDONED', 'RETRYING'].includes(job.status) : false;
  return (
    <Dialog open={job !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Detalle del job</DialogTitle>
          <DialogDescription>Información completa del procesamiento del video.</DialogDescription>
        </DialogHeader>
        {job && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-foreground break-words">{job.video.title}</p>
              <a
                href={`https://www.youtube.com/watch?v=${job.video.videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                youtube.com/watch?v={job.video.videoId}
              </a>
            </div>
            <div className="rounded-lg border border-border bg-card divide-y divide-border/60">
              <DetailRow label="Estado" value={statusBadge(job.status, JOB_STATUS_COLORS)} />
              <DetailRow label="ID del job" value={<span className="font-mono break-all">{job.id}</span>} />
              <DetailRow label="Intentos" value={String(job.attempts)} />
              <DetailRow label="Creado" value={formatDateTimeFull(job.createdAt)} />
              {job.startedAt && <DetailRow label="Iniciado" value={formatDateTimeFull(job.startedAt)} />}
              {job.finishedAt && <DetailRow label="Finalizado" value={formatDateTimeFull(job.finishedAt)} />}
              {job.deadlineAt && <DetailRow label="Deadline" value={formatDateTime(job.deadlineAt)} />}
              {job.nextRetryAt && <DetailRow label="Siguiente reintento" value={formatDateTime(job.nextRetryAt)} />}
            </div>
            {job.lastError && (
              <div>
                <p className="text-xs font-medium text-faint mb-1">Último error</p>
                <p className="text-xs text-destructive break-words whitespace-pre-wrap bg-card border border-border rounded-lg p-3">
                  {job.lastError}
                </p>
              </div>
            )}
            {canRetry && (
              <Button onClick={onRetry} disabled={retrying} className="w-full gap-2">
                <RotateCcw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
                {retrying ? 'Reintentando...' : 'Reintento forzoso'}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AdminYouTube() {
  const { getWorkers, getWorkerJobs } = useAdminApi();
  const { token } = useAdminAuth();

  const [workers, setWorkers] = useState<WorkerNodeInfo[]>([]);
  const [jobs, setJobs] = useState<WorkerJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedJob, setSelectedJob] = useState<WorkerJob | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // ---- release deploy state ----
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [releaseFile, setReleaseFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);
  const [versionInput, setVersionInput] = useState('');
  const [mandatory, setMandatory] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const validateAndSetFile = useCallback((file: File) => {
    setDragError(null);
    setUploadError(null);
    setUploadSuccess(false);
    if (!file.name.endsWith('.zip')) {
      setDragError('Solo archivos .zip');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setDragError('Máximo 50 MB');
      return;
    }
    setReleaseFile(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) validateAndSetFile(file);
    },
    [validateAndSetFile]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) validateAndSetFile(file);
    },
    [validateAndSetFile]
  );

  const handleRemoveFile = useCallback(() => {
    setReleaseFile(null);
    setDragError(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleUpload = useCallback(async () => {
    if (!releaseFile || !token) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);
    try {
      const fd = new FormData();
      fd.append('file', releaseFile);
      if (versionInput.trim()) fd.append('version', versionInput.trim());
      fd.append('mandatory', mandatory ? 'true' : 'false');
      await axios.post(`${API_BASE_URL}/admin-api/worker-releases`, fd, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUploadSuccess(true);
      setReleaseFile(null);
      setVersionInput('');
      setMandatory(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setUploadSuccess(false), 4000);
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? (err.response?.data?.error as string) ?? err.message : String(err);
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  }, [releaseFile, token, versionInput, mandatory]);

  const load = useCallback(async () => {
    try {
      const result = await Promise.all([getWorkers(), getWorkerJobs()]).then(
        ([workersRes, jobsRes]) => ({ ok: true as const, workersRes, jobsRes }),
        (): { ok: false; workersRes: null; jobsRes: null } => ({ ok: false, workersRes: null, jobsRes: null })
      );
      if (result.ok) {
        setWorkers(result.workersRes);
        setJobs(result.jobsRes);
        setError(null);
      } else {
        setError('Error al cargar el estado de workers.');
      }
    } finally {
      setLoading(false);
    }
  }, [getWorkers, getWorkerJobs]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 30000);
    return () => clearInterval(interval);
  }, [load]);

  const handleRefresh = () => {
    setLoading(true);
    void load();
  };

  const handleRetry = useCallback(
    async (jobId: string) => {
      setRetryingId(jobId);
      try {
        await axios.post(`${API_BASE_URL}/admin-api/workers/jobs/${jobId}/retry`, {}, {
          headers: { Authorization: `Bearer ${token}` },
        });
        await load();
        setSelectedJob(null);
      } catch (err) {
        const msg =
          axios.isAxiosError(err) && err.response?.data?.error
            ? String(err.response.data.error)
            : 'Error al reintentar el job.';
        setError(msg);
      } finally {
        setRetryingId(null);
      }
    },
    [token, load]
  );

  const availableStatuses = Array.from(new Set(jobs.map((job) => job.status)));
  const visibleJobs = statusFilter === 'all' ? jobs : jobs.filter((job) => job.status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">YouTube y workers</h1>
          <p className="text-sm text-faint mt-1">
            Workers de procesamiento conectados y estado de los videos recibidos.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {error && (
        <div className="py-4 text-center">
          <p className="text-sm text-faint">{error}</p>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-2 gap-2">
            <RefreshCw className="w-3 h-3" />
            Reintentar
          </Button>
        </div>
      )}

      <Card className="border-border bg-muted/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="w-4 h-4 text-info" />
            Workers conectados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && workers.length === 0 ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-12 rounded-lg animate-pulse bg-muted" />
              ))}
            </div>
          ) : workers.length === 0 ? (
            <p className="py-6 text-center text-sm text-faint">No hay workers registrados.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Versión</TableHead>
                  <TableHead>Jobs activos</TableHead>
                  <TableHead>Máx. concurrentes</TableHead>
                  <TableHead>Último visto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workers.map((worker) => (
                  <TableRow key={worker.workerId}>
                    <TableCell className="text-muted-foreground">{worker.name}</TableCell>
                    <TableCell>{statusBadge(worker.status, WORKER_STATUS_COLORS)}</TableCell>
                    <TableCell className="font-mono text-xs text-faint">{worker.version ?? '—'}</TableCell>
                    <TableCell className="text-faint">{Array.isArray(worker.currentJobs) ? worker.currentJobs.length : worker.currentJobs}</TableCell>
                    <TableCell className="text-faint">{worker.maxConcurrentJobs}</TableCell>
                    <TableCell className="text-faint">{timeAgoShort(worker.lastSeenAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ---- Rediseño: Artefacto de flota — dropzone + controles técnicos ---- */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
        {/* header: blueprint eyebrow + status */}
        <div className="flex items-start justify-between gap-4 border-b border-border bg-sunken/60 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="font-mono text-[10px] leading-none tracking-[0.22em] text-faint">FLOTA · ARTEFACTO · DEPLOY</p>
            <h2 className="mt-1.5 flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <HardDrive className="h-3.5 w-3.5" />
              </span>
              Desplegar nueva versión
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-0.5 font-mono text-[10px] tracking-widest text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                CANAL SEGURO
              </span>
            </h2>
            <p className="mt-1 max-w-[52ch] text-xs leading-relaxed text-muted-foreground">
              El artefacto se verifica con <span className="font-mono text-foreground">sha256</span> en servidor y solo lo aplican workers en{' '}
              <span className="text-foreground">IDLE</span>. En <span className="text-foreground">BUSY</span> queda en cola hasta quedar libre.
            </p>
          </div>
          <div className="hidden shrink-0 items-center gap-3 sm:flex">
            <div className="text-right">
              <p className="font-mono text-[10px] tracking-widest text-faint">LÍMITE</p>
              <p className="font-mono text-xs font-medium text-foreground">50 MB · ZIP</p>
            </div>
            <div className="h-9 w-px bg-border" />
            <div className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              <span className="font-mono text-[11px] tracking-wide text-muted-foreground">sha256</span>
            </div>
          </div>
        </div>

        <div className="grid gap-0 lg:grid-cols-[1.35fr_0.85fr]">
          {/* dropzone */}
          <div className="relative p-5 sm:p-6">
            {/* ghost version watermark — riesgo estético: tipografía como artefacto */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.04] select-none"
            >
              <p className="absolute -right-6 top-1/2 -translate-y-1/2 rotate-[-2deg] font-mono text-[84px] font-bold leading-none tracking-[-0.06em] text-foreground">
                v— . — . —
              </p>
            </div>

            <div
              role="button"
              tabIndex={0}
              aria-label="Zona para soltar ZIP del worker"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={[
                'group relative flex min-h-[246px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 px-5 py-8 text-center transition-all duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                releaseFile
                  ? 'border-solid border-primary/40 bg-primary/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                  : dragActive
                    ? 'border-solid border-primary bg-primary/[0.08] scale-[1.005] shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]'
                    : 'border-dashed border-border bg-sunken hover:border-faint hover:bg-accent/40',
                dragError ? '!border-destructive !bg-destructive/5' : '',
              ].join(' ')}
            >
              {/* leader tape — hairline amber */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden rounded-t-xl">
                <div
                  className={[
                    'h-full w-full bg-primary transition-opacity',
                    dragActive || releaseFile ? 'opacity-100' : 'opacity-0 group-hover:opacity-60',
                  ].join(' ')}
                />
              </div>

              {/* perforations */}
              <div className="pointer-events-none absolute left-2 top-3 bottom-3 hidden w-2 flex-col justify-between opacity-20 sm:flex">
                {Array.from({ length: 10 }).map((_, i) => (
                  <span key={i} className="h-1.5 w-2 rounded-full bg-foreground/60" />
                ))}
              </div>
              <div className="pointer-events-none absolute right-2 top-3 bottom-3 hidden w-2 flex-col justify-between opacity-20 sm:flex">
                {Array.from({ length: 10 }).map((_, i) => (
                  <span key={i} className="h-1.5 w-2 rounded-full bg-foreground/60" />
                ))}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                className="sr-only"
                onChange={handleFileInputChange}
                tabIndex={-1}
              />

              {!releaseFile ? (
                <>
                  <div
                    className={[
                      'flex h-12 w-12 items-center justify-center rounded-xl border bg-background shadow-sm transition-colors',
                      dragActive ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground group-hover:border-primary/30 group-hover:text-foreground',
                    ].join(' ')}
                  >
                    <Upload className="h-5 w-5" />
                  </div>
                  <p className="mt-4 max-w-[28ch] text-sm font-medium leading-tight text-foreground">
                    Arrastra el <span className="text-primary">ZIP</span> del worker aquí
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">o haz clic para examinar — validación instantánea</p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
                      <FileArchive className="h-3 w-3" /> .zip únicamente
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
                      <Zap className="h-3 w-3 text-primary" /> sha256 automático
                    </span>
                  </div>
                  {dragError && (
                    <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {dragError}
                    </p>
                  )}
                  <p className="pointer-events-none mt-4 font-mono text-[10px] tracking-[0.18em] text-faint">
                    SOLTAR PARA CARGAR · {dragActive ? 'LISTO' : 'ESPERANDO ARTEFACTO'}
                  </p>
                </>
              ) : (
                <div className="w-full max-w-[360px]">
                  <div className="flex items-start gap-3 rounded-lg border border-border bg-background p-3 text-left shadow-sm">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <FileArchive className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs font-medium text-foreground" title={releaseFile.name}>
                        {releaseFile.name}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        {formatBytes(releaseFile.size)} · ZIP · listo para firmar
                      </p>
                      <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] tracking-wide text-success">
                        <PackageCheck className="h-3 w-3" /> artefacto válido
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFile();
                      }}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label="Quitar archivo"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-success" />
                    Se calculará <span className="font-mono text-foreground">sha256</span> en servidor al subir
                  </p>
                </div>
              )}
            </div>

            {/* inline feedback */}
            {uploadError && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs leading-relaxed text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 break-words">{uploadError}</span>
              </div>
            )}
            {uploadSuccess && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-xs font-medium text-success">
                <PackageCheck className="h-4 w-4" />
                Versión subida — workers en IDLE se actualizarán automáticamente.
              </div>
            )}
          </div>

          {/* controls — technical bench */}
          <div className="flex flex-col gap-5 border-t border-border bg-sunken/40 p-5 sm:p-6 lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] tracking-[0.2em] text-faint">MANIFIESTO</p>
              <span className="inline-flex items-center gap-1 font-mono text-[10px] tracking-widest text-muted-foreground">
                FIRMADO <ChevronRight className="h-3 w-3" />
              </span>
            </div>

            <label className="block space-y-1.5">
              <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                Versión
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground">semver</span>
              </span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-faint">v</span>
                <input
                  value={versionInput}
                  onChange={(e) => setVersionInput(e.target.value)}
                  pattern="\d+\.\d+\.\d+"
                  placeholder="auto: 1.0.1"
                  className="h-9 w-full rounded-md border border-input bg-background pl-6 pr-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <span className="block font-mono text-[11px] leading-none text-muted-foreground">
                Vacío = autoincrementa patch. Ej. <span className="text-foreground">1.2.4</span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors has-[input:checked]:border-primary/30 has-[input:checked]:bg-primary/[0.06]">
              <input
                type="checkbox"
                checked={mandatory}
                onChange={(e) => setMandatory(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input bg-background text-primary focus:ring-ring"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <Zap className="h-3 w-3 text-primary" />
                  Marcado como obligatoria
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  Fuerza actualización aunque el worker esté en versión reciente. Usa solo para parches críticos.
                </span>
              </span>
            </label>

            <div className="space-y-3">
              <Button
                type="button"
                onClick={handleUpload}
                disabled={!releaseFile || uploading}
                className="group relative w-full justify-between gap-2 overflow-hidden bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-2">
                  {uploading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 transition-transform group-enabled:group-hover:-translate-y-0.5" />
                  )}
                  {uploading ? 'Firmando artefacto…' : 'Desplegar en flota'}
                </span>
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary-foreground/15 font-mono text-[11px]">↵</span>
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-center font-mono text-[10px] tracking-[0.12em] text-faint">
                <HardDrive className="h-3 w-3" />
                BACKEND VERIFICA SHA256 · ROLLBACK AUTOMÁTICO
              </p>
            </div>

            <div className="rounded-lg border border-dashed border-border bg-background/60 p-3">
              <p className="font-mono text-[10px] tracking-[0.16em] text-faint">PROTOCOLO</p>
              <ul className="mt-2 space-y-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-primary">01</span> IDLE → descarga, verifica hash, swap atómico, reinicia.
                </li>
                <li className="flex gap-2">
                  <span className="text-primary">02</span> BUSY → guarda pendiente y aplica al quedar libre.
                </li>
                <li className="flex gap-2">
                  <span className="text-primary">03</span> Polling fallback cada 6 h si WS cae.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <Card className="border-border bg-muted/60">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Film className="w-4 h-4 text-destructive" />
              Jobs de procesamiento
            </CardTitle>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44 bg-card border-input">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                {availableStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading && jobs.length === 0 ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 rounded-lg animate-pulse bg-muted" />
              ))}
            </div>
          ) : visibleJobs.length === 0 ? (
            <p className="py-6 text-center text-sm text-faint">No hay jobs en este estado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Video</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Intentos</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead>Siguiente reintento</TableHead>
                  <TableHead>Último error</TableHead>
                  <TableHead className="w-10">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleJobs.map((job) => {
                  const canRetry = ['ERROR', 'ABANDONED', 'RETRYING'].includes(job.status);
                  const isRetrying = retryingId === job.id;
                  return (
                    <TableRow key={job.id} className="cursor-pointer" onClick={() => setSelectedJob(job)}>
                      <TableCell>
                        <a
                          href={`https://www.youtube.com/watch?v=${job.video.videoId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground max-w-72 truncate"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0 text-faint" />
                          <span className="truncate" title={job.video.title}>
                            {job.video.title}
                          </span>
                        </a>
                      </TableCell>
                      <TableCell>{statusBadge(job.status, JOB_STATUS_COLORS)}</TableCell>
                      <TableCell className="text-faint">{job.attempts}</TableCell>
                      <TableCell className="text-faint">{formatDateTime(job.deadlineAt)}</TableCell>
                      <TableCell className="text-faint">{formatDateTime(job.nextRetryAt)}</TableCell>
                      <TableCell className="text-destructive/80 max-w-56 truncate" title={job.lastError ?? undefined}>
                        {job.lastError ?? '—'}
                      </TableCell>
                      <TableCell>
                        {canRetry && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isRetrying}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleRetry(job.id);
                            }}
                            className="h-7 w-7 p-0"
                            title="Reintento forzoso"
                          >
                            <RotateCcw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <JobDetailDialog
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
        onRetry={() => selectedJob && void handleRetry(selectedJob.id)}
        retrying={selectedJob ? retryingId === selectedJob.id : false}
      />
    </div>
  );
}
