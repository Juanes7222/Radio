import { useState, useEffect, useCallback } from 'react';
import { useAdminApi } from '@/hooks/useAdminApi';
import type { LocutorTemplate, LocutorTemplateInput } from '@radio/types';

const EMPTY_TEMPLATE: LocutorTemplateInput = {
  type: 'hourly',
  name: '',
  textTemplate: '',
  voice: 'ef_dora',
  speed: 0.95,
  active: true,
};

const TYPE_LABELS: Record<string, string> = {
  hourly: 'Hora en punto',
  custom: 'Personalizado',
};

const VOICE_LABELS: Record<string, string> = {
  ef_dora: 'Dora (Femenina - ES)',
  em_alex: 'Alex (Masculino - ES)',
};

export default function TemplateEditor() {
  const { getLocutorTemplates, saveLocutorTemplate, deleteLocutorTemplate, generateLocutorAudio } = useAdminApi();

  const [templates, setTemplates] = useState<LocutorTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<LocutorTemplate | LocutorTemplateInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    try {
      const result = await getLocutorTemplates().then(
        (data) => ({ ok: true as const, data }),
        (): { ok: false; data: null } => ({ ok: false, data: null })
      );
      if (result.ok) {
        setTemplates(result.data);
        setError(null);
      } else {
        setError('Error al cargar las plantillas.');
      }
    } finally {
      setLoading(false);
    }
  }, [getLocutorTemplates]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate) return;
    setSaving(true);
    setError(null);
    try {
      const id = 'id' in editingTemplate ? editingTemplate.id : undefined;
      await saveLocutorTemplate(editingTemplate, id);
      setEditingTemplate(null);
      await loadTemplates();
    } catch {
      setError('Error al guardar la plantilla.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta plantilla?')) return;
    try {
      await deleteLocutorTemplate(id);
      await loadTemplates();
    } catch {
      setError('Error al eliminar la plantilla.');
    }
  };

  const handleGenerate = async (id: string) => {
    setGeneratingId(id);
    try {
      await generateLocutorAudio(id);
      alert('Generación iniciada. Revisa el banco de audios.');
    } catch {
      setError('Error al iniciar la generación.');
    } finally {
      setGeneratingId(null);
    }
  };

  const setField = <K extends keyof LocutorTemplateInput>(key: K, value: LocutorTemplateInput[K]) => {
    setEditingTemplate((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  return (
    <div className="bg-slate-900 border border-slate-700 p-6 rounded-lg shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-white">Plantillas de Anuncios</h2>
        <button
          onClick={() => setEditingTemplate({ ...EMPTY_TEMPLATE })}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm"
        >
          + Nueva Plantilla
        </button>
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {editingTemplate && (
        <form onSubmit={handleSave} className="mb-8 p-4 bg-slate-800 rounded-md">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
            <div>
              <label className="block text-sm text-slate-300">Nombre</label>
              <input
                type="text"
                required
                value={editingTemplate.name}
                onChange={(e) => setField('name', e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300">Tipo</label>
              <select
                value={editingTemplate.type}
                onChange={(e) => setField('type', e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white shadow-sm"
              >
                <option value="hourly">Hora en punto</option>
                <option value="custom">Personalizado</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-300">Voz</label>
              <select
                value={editingTemplate.voice}
                onChange={(e) => setField('voice', e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white shadow-sm"
              >
                <option value="ef_dora">Dora (Femenina - ES)</option>
                <option value="em_alex">Alex (Masculino - ES)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-300">Velocidad ({editingTemplate.speed.toFixed(2)})</label>
              <input
                type="range"
                min="0.6"
                max="1.3"
                step="0.05"
                value={editingTemplate.speed}
                onChange={(e) => setField('speed', Number(e.target.value))}
                className="mt-4 w-full"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm text-slate-300">Plantilla de Texto</label>
            <textarea
              required
              rows={3}
              value={editingTemplate.textTemplate}
              onChange={(e) => setField('textTemplate', e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white shadow-sm"
            />
            <p className="text-xs text-slate-400 mt-1">
              Variables: {'{{hour}}'}, {'{{period}}'}, {'{{station_name}}'}, {'{{day}}'}, {'{{date}}'}, {'{{time_text}}'}
            </p>
            <p className="text-xs text-slate-400">
              Ej: "Muy buenas {'{{period_greeting}}'}. {'{{time_text}}'}. Esto es {'{{station_name}}'}."
            </p>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={editingTemplate.active}
                onChange={(e) => setField('active', e.target.checked)}
                className="rounded border-slate-600"
              />
              Activa (usada por el job automático)
            </label>
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                className="px-4 py-2 border border-slate-600 rounded-md text-sm text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg animate-pulse bg-slate-800" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">No hay plantillas creadas.</p>
      ) : (
        <ul className="divide-y divide-slate-700">
          {templates.map((t) => (
            <li key={t.id} className="py-4 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">
                  {t.name}{' '}
                  <span className="text-xs text-slate-400">[{TYPE_LABELS[t.type] ?? t.type}]</span>
                  {!t.active && <span className="text-xs text-slate-500 ml-2">(inactiva)</span>}
                </p>
                <p className="text-sm text-slate-400 italic mt-1 truncate">{t.textTemplate}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {VOICE_LABELS[t.voice] ?? t.voice} · velocidad {t.speed.toFixed(2)}
                </p>
              </div>
              <div className="flex space-x-3 shrink-0">
                <button
                  onClick={() => handleGenerate(t.id)}
                  disabled={generatingId === t.id}
                  className="text-indigo-400 hover:text-indigo-300 text-sm disabled:opacity-50"
                >
                  {generatingId === t.id ? 'Generando...' : 'Generar Test'}
                </button>
                <button onClick={() => setEditingTemplate(t)} className="text-blue-400 hover:text-blue-300 text-sm">
                  Editar
                </button>
                <button onClick={() => handleDelete(t.id)} className="text-red-400 hover:text-red-300 text-sm">
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
