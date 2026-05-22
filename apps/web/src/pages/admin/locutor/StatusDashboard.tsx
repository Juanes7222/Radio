import { useState, useEffect } from 'react';

export default function StatusDashboard() {
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    fetch('/admin-api/locutor/status')
      .then(res => res.json())
      .then(setStatus)
      .catch(console.error);
      
    const interval = setInterval(() => {
      fetch('/admin-api/locutor/status')
        .then(res => res.json())
        .then(setStatus)
        .catch(console.error);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  if (!status) return <div>Cargando estado del sistema...</div>;

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Estado del Sistema TTS</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-md">
          <p className="text-sm text-gray-500 dark:text-gray-400">Motor Kokoro</p>
          <p className={`text-lg font-medium ${status.kokoro.healthy ? 'text-green-600' : 'text-red-600'}`}>
            {status.kokoro.healthy ? 'En línea' : 'Inactivo'}
          </p>
        </div>
        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-md">
          <p className="text-sm text-gray-500 dark:text-gray-400">Audios en Banco</p>
          <p className="text-lg font-medium text-gray-900 dark:text-white">
            {status.bank.ready} listos, {status.bank.pending} pendientes
          </p>
        </div>
        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-md">
          <p className="text-sm text-gray-500 dark:text-gray-400">Último Job Nocturno</p>
          <p className="text-lg font-medium text-gray-900 dark:text-white">
            {status.last_job ? new Date(status.last_job.started_at).toLocaleString() : 'Nunca'}
          </p>
          <p className={`text-sm ${status.last_job?.status === 'success' ? 'text-green-600' : 'text-red-500'}`}>
             {status.last_job?.status || 'N/A'}
          </p>
        </div>
      </div>
    </div>
  );
}