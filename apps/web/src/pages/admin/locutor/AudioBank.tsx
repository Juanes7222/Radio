import { useState, useEffect } from 'react';

interface AudioItem {
  id: number;
  filename: string;
  text_rendered: string;
  voice: string;
  status: string;
}

export default function AudioBank() {
  const [audios, setAudios] = useState<AudioItem[]>([]);

  useEffect(() => {
    fetch('/admin-api/locutor/audios')
      .then(res => res.json())
      .then(setAudios)
      .catch(console.error);
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar audio?')) return;
    await fetch(`/admin-api/locutor/audios/${id}`, { method: 'DELETE' });
    setAudios(a => a.filter(audio => audio.id !== id));
  };

  return (
    <div className="bg-slate-900 border border-slate-700 p-6 rounded-lg shadow-sm">
      <h2 className="text-xl font-semibold mb-4 text-white">Banco de Audios</h2>
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
            {audios.map(audio => (
              <tr key={audio.id}>
                <td className="px-4 py-3 text-sm text-slate-300">{audio.filename}</td>
                <td className="px-4 py-3 text-sm text-slate-400 max-w-xs truncate" title={audio.text_rendered}>
                  {audio.text_rendered}
                </td>
                <td className="px-4 py-3 text-sm text-slate-400">{audio.voice}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    audio.status === 'ready' ? 'bg-green-500/10 text-green-500' : 
                    audio.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-red-500/10 text-red-500'
                  }`}>
                    {audio.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm space-x-2">
                  <button onClick={() => handleDelete(audio.id)} className="text-red-500 hover:text-red-400">
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {audios.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-slate-400">
                  No hay audios generados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}