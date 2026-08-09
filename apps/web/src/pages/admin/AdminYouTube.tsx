import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Server, Film, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAdminApi } from '@/hooks/useAdminApi';
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

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function timeAgo(value: string | null): string {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

function statusBadge(value: string, colors: Record<string, string>) {
  return (
    <Badge variant="outline" className={`text-xs border ${colors[value] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
      {value}
    </Badge>
  );
}

export default function AdminYouTube() {
  const { getWorkers, getWorkerJobs } = useAdminApi();

  const [workers, setWorkers] = useState<WorkerNodeInfo[]>([]);
  const [jobs, setJobs] = useState<WorkerJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');

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
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-700">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Nombre</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Estado</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Jobs activos</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Máx. concurrentes</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Último visto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {workers.map((worker) => (
                    <tr key={worker.workerId}>
                      <td className="px-4 py-3 text-sm text-slate-300">{worker.name}</td>
                      <td className="px-4 py-3">{statusBadge(worker.status, WORKER_STATUS_COLORS)}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">{worker.currentJobs}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">{worker.maxConcurrentJobs}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">{timeAgo(worker.lastSeenAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-700">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Video</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Estado</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Intentos</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Deadline</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Siguiente reintento</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Último error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {visibleJobs.map((job) => (
                    <tr key={job.id}>
                      <td className="px-4 py-3">
                        <a
                          href={`https://www.youtube.com/watch?v=${job.video.videoId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-slate-300 hover:text-white max-w-72 truncate"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0 text-slate-500" />
                          <span className="truncate" title={job.video.title}>
                            {job.video.title}
                          </span>
                        </a>
                      </td>
                      <td className="px-4 py-3">{statusBadge(job.status, JOB_STATUS_COLORS)}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">{job.attempts}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">{formatDateTime(job.deadlineAt)}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">{formatDateTime(job.nextRetryAt)}</td>
                      <td className="px-4 py-3 text-sm text-red-400/80 max-w-56 truncate" title={job.lastError ?? undefined}>
                        {job.lastError ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
