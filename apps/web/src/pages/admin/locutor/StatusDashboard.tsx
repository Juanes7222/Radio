import { useState, useEffect } from 'react';

interface TtsStatus {
  kokoro: { healthy: boolean };
  bank: { ready: number; pending: number };
  last_job: { started_at: string; status: string } | null;
}

export default function StatusDashboard() {
  const [status, setStatus] = useState<TtsStatus | null>(null);

  useEffect(() => {
    const loadStatus = () => {
      fetch('/admin-api/locutor/status')
        .then(res => res.json())
        .then(setStatus)
        .catch(console.error);
    };

    loadStatus();
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!status) return <div className="text-sm text-slate-400">Cargando estado del sistema...</div>;

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
          </p>
        </div>
        <div className="p-4 bg-slate-800 rounded-md">
          <p className="text-sm text-slate-400">Último Job Nocturno</p>
          <p className="text-lg font-medium text-white">
            {status.last_job ? new Date(status.last_job.started_at).toLocaleString() : 'Nunca'}
          </p>
          <p className={`text-sm ${status.last_job?.status === 'success' ? 'text-green-500' : 'text-red-500'}`}>
             {status.last_job?.status || 'N/A'}
          </p>
        </div>
      </div>
    </div>
  );
}