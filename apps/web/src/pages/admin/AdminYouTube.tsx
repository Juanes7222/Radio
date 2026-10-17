import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Server, Film, ExternalLink, RotateCcw } from 'lucide-react';
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
import ChannelList from './youtube/ChannelList';
import WorkerDeployCard from './youtube/WorkerDeployCard';

const JOB_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-warning/10 text-warning border-warning/20',
  ASSIGNED: 'bg-info/10 text-info border-info/20',
  RETRYING: 'bg-warning/10 text-warning border-warning/20',
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
            Canales que la estación sigue, los videos que entraron y quién los procesa.
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

      <ChannelList onChanged={() => { void load(); }} />

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

      <WorkerDeployCard />

      <JobDetailDialog
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
        onRetry={() => selectedJob && void handleRetry(selectedJob.id)}
        retrying={selectedJob ? retryingId === selectedJob.id : false}
      />
    </div>
  );
}