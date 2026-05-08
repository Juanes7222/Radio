import { useState, useEffect } from 'react';

export default function AudioBank() {
  const [audios, setAudios] = useState<any[]>([]);

  useEffect(() => {
    fetch('/admin-api/locutor/audios')
      .then(res => res.json())
      .then(setAudios)
      .catch(console.error);
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar audio?')) return;
    await fetch(\`/admin-api/locutor/audios/\${id}\`, { method: 'DELETE' });
    setAudios(a => a.filter(audio => audio.id !== id));
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Banco de Audios</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Archivo</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Texto Generado</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Voz</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {audios.map(audio => (
              <tr key={audio.id}>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-300">{audio.filename}</td>
                <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate" title={audio.text_rendered}>
                  {audio.text_rendered}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{audio.voice}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={\`px-2 py-1 text-xs rounded-full \${
                    audio.status === 'ready' ? 'bg-green-100 text-green-800' : 
                    audio.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                  }\`}>
                    {audio.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm space-x-2">
                  <button onClick={() => handleDelete(audio.id)} className="text-red-600 hover:text-red-900">
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {audios.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-gray-500">
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