import { useState, useEffect } from 'react';
import { useAdminApi } from '@/hooks/useAdminApi';
import type { LocutorStatus } from '@radio/types';

const STATUS_LABELS: Record<string, string> = {
  success: 'Exitoso',
  partial: 'Parcial',
  running: 'En ejecución',
  error: 'Error',
};

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
      <div className="bg-slate-900 border border-slate-700 p-6 rounded-lg shadow-sm">
        <h2 className="text-xl font-semibold mb-4 text-white">Estado del Sistema TTS</h2>
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!status) {
    return <div className="text-sm text-slate-400">Cargando estado del sistema...</div>;
  }

  return (
    <div className="bg-slate-900 border border-slate-700 p-6 rounded-lg shadow-sm">
      <h2 className="text-xl font-semibold mb-4 text-white">Estado del Sistema TTS</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="p-4 bg-slate-800 rounded-md">
          <p className="text-sm text-slate-400">Motor Kokoro</p>
          <p className={`text-lg font-medium ${status.kokoro.healthy ? 'text-green-500' : 'text-red-500'}`}>
            {status.kokoro.healthy ? 'En línea' : 'Inactivo'}
          </p>
        </div>
        <div className="p-4 bg-slate-800 rounded-md">
          <p className="text-sm text-slate-400">Audios en Banco</p>
          <p className="text-lg font-medium text-white">
            {status.bank.ready} listos, {status.bank.pending} pendientes
            {status.bank.error > 0 && <span className="text-red-400">, {status.bank.error} con error</span>}
          </p>
        </div>
        <div className="p-4 bg-slate-800 rounded-md">
          <p className="text-sm text-slate-400">Último Job Nocturno</p>
          <p className="text-lg font-medium text-white">
            {status.last_job ? new Date(status.last_job.startedAt).toLocaleString() : 'Nunca'}
          </p>
          {status.last_job && (
            <p className={`text-sm ${status.last_job.status === 'success' ? 'text-green-500' : 'text-red-500'}`}>
              {STATUS_LABELS[status.last_job.status] ?? status.last_job.status}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
