import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Server, Film, ExternalLink } from 'lucide-react';
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
  ASSIGNED: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  RETRYING: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  ERROR: 'bg-red-500/10 text-red-500 border-red-500/20',
  ABANDONED: 'bg-red-500/10 text-red-500 border-red-500/20',
  DONE: 'bg-green-500/10 text-green-500 border-green-500/20',
};

const WORKER_STATUS_COLORS: Record<string, string> = {
  ONLINE: 'bg-green-500/10 text-green-500 border-green-500/20',
  OFFLINE: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

function statusBadge(value: string, colors: Record<string, string>) {
  return (
    <Badge variant="outline" className={`text-xs border ${colors[value] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
      {value}
    </Badge>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2.5">
      <span className="text-xs shrink-0 text-slate-400 pt-0.5">{label}</span>
      <div className="text-xs text-right text-slate-200 min-w-0">{value}</div>
    </div>
  );
}

function JobDetailDialog({ job, onClose }: { job: WorkerJob | null; onClose: () => void }) {
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
              <p className="text-sm font-medium text-slate-200 break-words">{job.video.title}</p>
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
            <div className="rounded-lg border border-slate-700 bg-slate-900 divide-y divide-slate-700/60">
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
                <p className="text-xs font-medium text-slate-400 mb-1">Último error</p>
                <p className="text-xs text-red-300 break-words whitespace-pre-wrap bg-slate-900 border border-slate-700 rounded-lg p-3">
                  {job.lastError}
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AdminYouTube() {
  const { getWorkers, getWorkerJobs } = useAdminApi();

  const [workers, setWorkers] = useState<WorkerNodeInfo[]>([]);
  const [jobs, setJobs] = useState<WorkerJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedJob, setSelectedJob] = useState<WorkerJob | null>(null);

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

  const availableStatuses = Array.from(new Set(jobs.map((job) => job.status)));
  const visibleJobs = statusFilter === 'all' ? jobs : jobs.filter((job) => job.status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">YouTube y workers</h1>
          <p className="text-sm text-slate-400 mt-1">
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
          <p className="text-sm text-slate-400">{error}</p>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-2 gap-2">
            <RefreshCw className="w-3 h-3" />
            Reintentar
          </Button>
        </div>
      )}

      <Card className="border-slate-700 bg-slate-800/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="w-4 h-4 text-blue-500" />
            Workers conectados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && workers.length === 0 ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-12 rounded-lg animate-pulse bg-slate-700" />
              ))}
            </div>
          ) : workers.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No hay workers registrados.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Jobs activos</TableHead>
                  <TableHead>Máx. concurrentes</TableHead>
                  <TableHead>Último visto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workers.map((worker) => (
                  <TableRow key={worker.workerId}>
                    <TableCell className="text-slate-300">{worker.name}</TableCell>
                    <TableCell>{statusBadge(worker.status, WORKER_STATUS_COLORS)}</TableCell>
                    <TableCell className="text-slate-400">{worker.currentJobs}</TableCell>
                    <TableCell className="text-slate-400">{worker.maxConcurrentJobs}</TableCell>
                    <TableCell className="text-slate-400">{timeAgoShort(worker.lastSeenAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-700 bg-slate-800/60">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Film className="w-4 h-4 text-red-500" />
              Jobs de procesamiento
            </CardTitle>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44 bg-slate-900 border-slate-600">
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
                <div key={i} className="h-12 rounded-lg animate-pulse bg-slate-700" />
              ))}
            </div>
          ) : visibleJobs.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No hay jobs en este estado.</p>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleJobs.map((job) => (
                  <TableRow key={job.id} className="cursor-pointer" onClick={() => setSelectedJob(job)}>
                    <TableCell>
                      <a
                        href={`https://www.youtube.com/watch?v=${job.video.videoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2 text-sm text-slate-300 hover:text-white max-w-72 truncate"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0 text-slate-500" />
                        <span className="truncate" title={job.video.title}>
                          {job.video.title}
                        </span>
                      </a>
                    </TableCell>
                    <TableCell>{statusBadge(job.status, JOB_STATUS_COLORS)}</TableCell>
                    <TableCell className="text-slate-400">{job.attempts}</TableCell>
                    <TableCell className="text-slate-400">{formatDateTime(job.deadlineAt)}</TableCell>
                    <TableCell className="text-slate-400">{formatDateTime(job.nextRetryAt)}</TableCell>
                    <TableCell className="text-red-400/80 max-w-56 truncate" title={job.lastError ?? undefined}>
                      {job.lastError ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <JobDetailDialog job={selectedJob} onClose={() => setSelectedJob(null)} />
    </div>
  );
}
