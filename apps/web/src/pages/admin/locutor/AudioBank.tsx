import { useState, useEffect, useCallback } from 'react';
import { useAdminApi } from '@/hooks/useAdminApi';
import type { LocutorAudio } from '@radio/types';

const STATUS_LABELS: Record<string, string> = {
  ready: 'Listo',
  pending: 'Pendiente',
  error: 'Error',
  expired: 'Expirado',
};

export default function AudioBank() {
  const { getLocutorAudios, deleteLocutorAudio } = useAdminApi();
  const [audios, setAudios] = useState<LocutorAudio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAudios = useCallback(async () => {
    try {
      const result = await getLocutorAudios().then(
        (data) => ({ ok: true as const, data }),
        (): { ok: false; data: null } => ({ ok: false, data: null })
      );
      if (result.ok) {
        setAudios(result.data);
        setError(null);
      } else {
        setError('Error al cargar los audios.');
      }
    } finally {
      setLoading(false);
    }
  }, [getLocutorAudios]);

  useEffect(() => {
    void loadAudios();
  }, [loadAudios]);

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar audio?')) return;
    try {
      await deleteLocutorAudio(id);
      setAudios((prev) => prev.filter((audio) => audio.id !== id));
    } catch {
      setError('Error al eliminar el audio.');
    }
  };

  const statusBadge = (status: string) => {
    const color =
      status === 'ready'
        ? 'bg-green-500/10 text-green-500'
        : status === 'pending'
          ? 'bg-yellow-500/10 text-yellow-500'
          : 'bg-red-500/10 text-red-500';
    return (
      <span className={`px-2 py-1 text-xs rounded-full ${color}`}>
        {STATUS_LABELS[status] ?? status}
      </span>
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-700 p-6 rounded-lg shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-white">Banco de Audios</h2>
        <button
          onClick={() => void loadAudios()}
          className="text-sm text-slate-400 hover:text-white"
        >
          Actualizar
        </button>
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-700">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Archivo</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Texto Generado</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Voz</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Estado</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={5} className="px-4 py-3">
                    <div className="h-6 rounded animate-pulse bg-slate-800" />
                  </td>
                </tr>
              ))
            ) : audios.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-slate-400">
                  No hay audios generados
                </td>
              </tr>
            ) : (
              audios.map((audio) => (
                <tr key={audio.id}>
                  <td className="px-4 py-3 text-sm text-slate-300">{audio.filename}</td>
                  <td className="px-4 py-3 text-sm text-slate-400 max-w-xs truncate" title={audio.textRendered}>
                    {audio.textRendered}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">{audio.voice}</td>
                  <td className="px-4 py-3 text-sm">{statusBadge(audio.status)}</td>
                  <td className="px-4 py-3 text-sm">
                    <button onClick={() => handleDelete(audio.id)} className="text-red-500 hover:text-red-400">
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
