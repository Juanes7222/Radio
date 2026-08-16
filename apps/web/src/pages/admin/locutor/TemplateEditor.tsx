import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Wand2, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui-custom/ConfirmDialog';
import { useAdminApi } from '@/hooks/useAdminApi';
import { toast } from 'sonner';
import type { LocutorTemplate, LocutorTemplateInput } from '@radio/types';

const EMPTY_TEMPLATE: LocutorTemplateInput = {
  type: 'hourly',
  name: '',
  textTemplate: '',
  voice: 'ef_dora',
  speed: 0.95,
  active: true,
};

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'hourly', label: 'Hora en punto' },
  { value: 'custom', label: 'Personalizado' },
];

const VOICE_OPTIONS: { value: string; label: string }[] = [
  { value: 'ef_dora', label: 'Dora (Femenina - ES)' },
  { value: 'em_alex', label: 'Alex (Masculino - ES)' },
];

const VOICE_LABELS: Record<string, string> = Object.fromEntries(
  VOICE_OPTIONS.map((option) => [option.value, option.label])
);

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  TYPE_OPTIONS.map((option) => [option.value, option.label])
);

export default function TemplateEditor() {
  const { getLocutorTemplates, saveLocutorTemplate, deleteLocutorTemplate, generateLocutorAudio } = useAdminApi();

  const [templates, setTemplates] = useState<LocutorTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<LocutorTemplate | LocutorTemplateInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LocutorTemplate | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      toast.success(id ? 'Plantilla actualizada' : 'Plantilla creada');
    } catch {
      setError('Error al guardar la plantilla.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setPendingDelete(null);
    setDeletingId(id);
    try {
      await deleteLocutorTemplate(id);
      await loadTemplates();
      toast.success('Plantilla eliminada');
    } catch {
      setError('Error al eliminar la plantilla.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleGenerate = async (id: string) => {
    setGeneratingId(id);
    try {
      await generateLocutorAudio(id);
      toast.success('Generación iniciada. Revisa el banco de audios.');
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
    <Card className="border-slate-700 bg-slate-800/60">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Plantillas de Anuncios</CardTitle>
          <Button size="sm" className="gap-1.5" onClick={() => setEditingTemplate({ ...EMPTY_TEMPLATE })}>
            <Plus className="w-4 h-4" />
            Nueva plantilla
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        {editingTemplate && (
          <form onSubmit={handleSave} className="mb-6 p-4 rounded-lg bg-slate-900 border border-slate-700 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">Nombre</label>
                <Input
                  type="text"
                  required
                  value={editingTemplate.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder="Ej: Anuncio de la hora"
                  className="bg-slate-800 border-slate-600"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">Tipo</label>
                <Select value={editingTemplate.type} onValueChange={(v) => setField('type', v)}>
                  <SelectTrigger className="w-full bg-slate-800 border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">Voz</label>
                <Select value={editingTemplate.voice} onValueChange={(v) => setField('voice', v)}>
                  <SelectTrigger className="w-full bg-slate-800 border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400">
                  Velocidad: <span className="text-slate-200">{editingTemplate.speed.toFixed(2)}</span>
                </label>
                <Slider
                  value={[editingTemplate.speed]}
                  onValueChange={([v]) => setField('speed', v)}
                  min={0.6}
                  max={1.3}
                  step={0.05}
                  className="mt-3"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400">Plantilla de texto</label>
              <Textarea
                required
                rows={3}
                value={editingTemplate.textTemplate}
                onChange={(e) => setField('textTemplate', e.target.value)}
                className="bg-slate-800 border-slate-600"
              />
              <p className="text-xs text-slate-500">
                Variables: {'{{hour}}'}, {'{{period}}'}, {'{{station_name}}'}, {'{{day}}'}, {'{{date}}'}, {'{{time_text}}'}, {'{{period_greeting}}'}
              </p>
              <p className="text-xs text-slate-500">
                Ej: "Muy buenas {'{{period_greeting}}'}. {'{{time_text}}'}. Esto es {'{{station_name}}'}."
              </p>
            </div>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={editingTemplate.active}
                  onChange={(e) => setField('active', e.target.checked)}
                  className="w-4 h-4 accent-indigo-500"
                />
                Activa (usada por el job automático)
              </label>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditingTemplate(null)}>
                  <X className="w-3.5 h-3.5 mr-1" />
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
            </div>
          </form>
        )}

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 rounded-lg animate-pulse bg-slate-700" />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No hay plantillas creadas.</p>
        ) : (
          <ul className="divide-y divide-slate-700">
            {templates.map((t) => (
              <li key={t.id} className="py-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-white">
                      {t.name}
                    </p>
                    <Badge variant="outline" className="text-xs text-slate-300 border-slate-600">
                      {TYPE_LABELS[t.type] ?? t.type}
                    </Badge>
                    {!t.active && (
                      <Badge variant="secondary" className="text-xs">Inactiva</Badge>
                    )}
                  </div>
                  <p className="text-sm text-slate-400 italic mt-1 truncate max-w-xl" title={t.textTemplate}>
                    {t.textTemplate}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {VOICE_LABELS[t.voice] ?? t.voice} · velocidad {t.speed.toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleGenerate(t.id)}
                    disabled={generatingId === t.id}
                    className="gap-1.5 text-indigo-400 hover:text-indigo-300 text-xs"
                  >
                    <Wand2 className={`w-3.5 h-3.5 ${generatingId === t.id ? 'animate-pulse' : ''}`} />
                    {generatingId === t.id ? 'Generando...' : 'Generar test'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 text-slate-300 hover:text-white"
                    onClick={() => setEditingTemplate(t)}
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setPendingDelete(t)}
                    disabled={deletingId === t.id}
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete ? `¿Eliminar la plantilla "${pendingDelete.name}"?` : 'Eliminar plantilla'}
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        loading={deletingId !== null}
        onConfirm={() => pendingDelete && void handleDelete(pendingDelete.id)}
      />
    </Card>
  );
}
