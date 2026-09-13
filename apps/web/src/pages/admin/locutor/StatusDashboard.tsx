import { useState, useEffect } from 'react';
import { Cpu, AudioLines, CalendarClock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAdminApi } from '@/hooks/useAdminApi';
import type { LocutorStatus } from '@radio/types';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  success: { label: 'Exitoso', color: 'bg-success/10 text-success border-success/20' },
  partial: { label: 'Parcial', color: 'bg-warning/10 text-warning border-warning/20' },
  running: { label: 'En ejecución', color: 'bg-info/10 text-info border-info/20' },
  error: { label: 'Error', color: 'bg-destructive/10 text-destructive border-destructive/20' },
};

interface StatusCardProps {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}

function StatusCard({ title, icon: Icon, children }: StatusCardProps) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <p className="flex items-center gap-2 text-xs font-medium text-faint">
          <Icon className="w-4 h-4" />
          {title}
        </p>
        <div className="mt-2 text-sm text-foreground">{children}</div>
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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estado del Sistema TTS</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return <div className="text-sm text-muted-foreground">Cargando estado del sistema...</div>;
  }

  const lastJobConfig = status.last_job ? STATUS_LABELS[status.last_job.status] : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Estado del Sistema TTS</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatusCard title="Motor Kokoro" icon={Cpu}>
            <Badge
              variant="outline"
              className={`text-xs border ${status.kokoro.healthy
                ? 'bg-success/10 text-success border-success/20'
                : 'bg-destructive/10 text-destructive border-destructive/20'}`}
            >
              {status.kokoro.healthy ? 'En línea' : 'Inactivo'}
            </Badge>
          </StatusCard>

          <StatusCard title="Audios en banco" icon={AudioLines}>
            <span>
              {status.bank.ready} listos, {status.bank.pending} pendientes
            </span>
            {status.bank.error > 0 && (
              <span className="text-destructive">, {status.bank.error} con error</span>
            )}
          </StatusCard>

          <StatusCard title="Último job nocturno" icon={CalendarClock}>
            <p>
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
