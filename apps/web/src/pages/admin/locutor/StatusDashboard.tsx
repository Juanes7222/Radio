import { useState, useEffect } from 'react';
import { Cpu, AudioLines, CalendarClock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAdminApi } from '@/hooks/useAdminApi';
import type { LocutorStatus } from '@radio/types';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  success: { label: 'Exitoso', color: 'bg-green-500/10 text-green-500 border-green-500/20' },
  partial: { label: 'Parcial', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
  running: { label: 'En ejecución', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  error: { label: 'Error', color: 'bg-red-500/10 text-red-500 border-red-500/20' },
};

interface StatusCardProps {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}

function StatusCard({ title, icon: Icon, children }: StatusCardProps) {
  return (
    <Card className="border-slate-700 bg-slate-800/60">
      <CardContent className="pt-5 pb-5">
        <p className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <Icon className="w-4 h-4" />
          {title}
        </p>
        <div className="mt-2 text-sm text-slate-200">{children}</div>
      </CardContent>
    </Card>
  );
}

export default function StatusDashboard() {
  const { getLocutorStatus } = useAdminApi();
  const [status, setStatus] = useState<LocutorStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadStatus = async () => {
      try {
        const data = await getLocutorStatus();
        if (!cancelled) {
          setStatus(data);
          setError(null);
        }
      } catch {
        if (!cancelled) setError('Error al obtener el estado del sistema.');
      }
    };

    void loadStatus();
    const interval = setInterval(loadStatus, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [getLocutorStatus]);

  if (error) {
    return (
      <Card className="border-slate-700 bg-slate-800/60">
        <CardHeader>
          <CardTitle className="text-base">Estado del Sistema TTS</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-400">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return <div className="text-sm text-slate-400">Cargando estado del sistema...</div>;
  }

  const lastJobConfig = status.last_job ? STATUS_LABELS[status.last_job.status] : null;

  return (
    <Card className="border-slate-700 bg-slate-800/60">
      <CardHeader>
        <CardTitle className="text-base">Estado del Sistema TTS</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatusCard title="Motor Kokoro" icon={Cpu}>
            <Badge
              variant="outline"
              className={`text-xs border ${status.kokoro.healthy
                ? 'bg-green-500/10 text-green-500 border-green-500/20'
                : 'bg-red-500/10 text-red-500 border-red-500/20'}`}
            >
              {status.kokoro.healthy ? 'En línea' : 'Inactivo'}
            </Badge>
          </StatusCard>

          <StatusCard title="Audios en banco" icon={AudioLines}>
            <span className="text-slate-200">
              {status.bank.ready} listos, {status.bank.pending} pendientes
            </span>
            {status.bank.error > 0 && (
              <span className="text-red-400">, {status.bank.error} con error</span>
            )}
          </StatusCard>

          <StatusCard title="Último job nocturno" icon={CalendarClock}>
            <p className="text-slate-200">
              {status.last_job ? new Date(status.last_job.startedAt).toLocaleString() : 'Nunca'}
            </p>
            {status.last_job && lastJobConfig && (
              <Badge variant="outline" className={`mt-1 text-xs border ${lastJobConfig.color}`}>
                {lastJobConfig.label}
              </Badge>
            )}
          </StatusCard>
        </div>
      </CardContent>
    </Card>
  );
}
