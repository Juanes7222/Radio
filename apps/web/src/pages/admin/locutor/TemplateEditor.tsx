import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Pencil, Plus, Trash2, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui-custom/ConfirmDialog';
import TemplatePreview from './TemplatePreview';
import { useAdminApi } from '@/hooks/useAdminApi';
import { describeRequestError } from '@/lib/apiErrors';
import { toast } from 'sonner';
import type { LocutorTemplate, LocutorTemplateInput } from '@radio/types';
import { EmptyNote, Section } from './Section';

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

/**
 * The template stores a provider-neutral voice label. ElevenLabs maps it
 * through `ELEVENLABS_VOICE_IDS` and falls back to its configured default
 * voice, so this list only decides what the station sounds like when the
 * engine is Kokoro.
 */
const VOICE_HINT =
  'Voz del motor de reserva (Kokoro). Con ElevenLabs configurado, la voz sale de ELEVENLABS_VOICE_IDS.';

const VOICE_LABELS: Record<string, string> = Object.fromEntries(
  VOICE_OPTIONS.map((option) => [option.value, option.label])
);

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  TYPE_OPTIONS.map((option) => [option.value, option.label])
);

const TEMPLATE_VARIABLES = [
  'time_text',
  'time_sentence',
  'time_bare',
  'hour_text',
  'minutes_text',
  'period',
  'station_name',
  'day',
  'date',
  'period_greeting',
] as const;

export default function TemplateEditor() {
  const { getLocutorTemplates, saveLocutorTemplate, deleteLocutorTemplate, generateLocutorAudio } =
    useAdminApi();

  const [templates, setTemplates] = useState<LocutorTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<LocutorTemplate | LocutorTemplateInput | null>(
    null
  );
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
        setError('No se pudieron cargar las plantillas.');
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
    } catch (err) {
      setError(describeRequestError(err));
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
    } catch (err) {
      setError(describeRequestError(err));
    } finally {
      setDeletingId(null);
    }
  };

  const handleGenerate = async (id: string) => {
    setGeneratingId(id);
    try {
      await generateLocutorAudio(id);
      toast.success('Generación iniciada. Revisa el banco de audios.');
    } catch (err) {
      setError(describeRequestError(err));
    } finally {
      setGeneratingId(null);
    }
  };

  const setField = <K extends keyof LocutorTemplateInput>(key: K, value: LocutorTemplateInput[K]) => {
    setEditingTemplate((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  // The preview offers ready-made sentences; clicking one fills the form.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === 'string') setField('textTemplate', detail);
    };
    window.addEventListener('locutor:set-template', handler);
    return () => window.removeEventListener('locutor:set-template', handler);
  }, []);

  return (
    <Section
      title="Plantillas de anuncios"
      description="El texto que se sintetiza. Las variables se reemplazan por la hora y por el nombre de la estación en cada locución."
      actions={
        <Button size="sm" className="gap-1.5" onClick={() => setEditingTemplate({ ...EMPTY_TEMPLATE })}>
          <Plus className="size-4" />
          Nueva plantilla
        </Button>
      }
    >
      <div className="space-y-3">
        {error && (
          <p className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            {error}
          </p>
        )}

      {editingTemplate && (
        <form onSubmit={handleSave} className="space-y-4 rounded-xl border border-primary/25 bg-sunken/40 p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Nombre</label>
              <Input
                type="text"
                required
                value={editingTemplate.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="Ej: Anuncio de la hora"
                className="border-border bg-card"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Tipo</label>
              <Select value={editingTemplate.type} onValueChange={(v) => setField('type', v)}>
                <SelectTrigger className="w-full border-border bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Voz</label>
              <Select value={editingTemplate.voice} onValueChange={(v) => setField('voice', v)}>
                <SelectTrigger className="w-full border-border bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VOICE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs leading-snug text-faint">{VOICE_HINT}</p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">
                Velocidad{' '}
                <span className="font-mono tabular-nums text-primary">
                  {editingTemplate.speed.toFixed(2)}
                </span>
              </label>
              <Slider
                value={[editingTemplate.speed]}
                onValueChange={([v]) => setField('speed', v)}
                min={0.7}
                max={1.2}
                step={0.05}
                className="mt-3"
              />
              <p className="text-xs leading-snug text-faint">
                Rango admitido por los dos motores. 1.00 es el ritmo natural.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Plantilla de texto</label>
            <Textarea
              required
              rows={3}
              value={editingTemplate.textTemplate}
              onChange={(e) => setField('textTemplate', e.target.value)}
              className="border-border bg-card"
            />
            {/* Variables as mono chips that insert at the cursor: nobody
                retypes {{time_sentence}} from memory, and the two hints that
                explained the hard ones move into the chip titles. */}
            <div className="flex flex-wrap items-center gap-1.5">
              {TEMPLATE_VARIABLES.map((variable) => (
                <button
                  key={variable}
                  type="button"
                  onClick={() =>
                    setField('textTemplate', `${editingTemplate.textTemplate}{{${variable}}}`)
                  }
                  title={
                    variable === 'time_text'
                      ? 'Hora y minuto: "son las nueve y cuarenta y dos de la noche".'
                      : variable === 'time_sentence'
                        ? 'Lo mismo con inicial en mayúscula, para cuando la frase abre el aviso.'
                        : undefined
                  }
                  className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {`{{${variable}}}`}
                </button>
              ))}
              <span className="text-xs text-faint">clic para insertar</span>
            </div>
            <TemplatePreview
              template={editingTemplate.textTemplate}
              templateId={'id' in editingTemplate ? editingTemplate.id : null}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={editingTemplate.active}
                onCheckedChange={(checked) => setField('active', checked === true)}
                aria-label="Usada por el job automático"
              />
              Activa, usada por el job automático
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditingTemplate(null)}>
                <X className="mr-1 size-3.5" />
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
            <div key={i} className="h-20 animate-pulse rounded-xl bg-sunken" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyNote
          action={
            <Button size="sm" className="gap-1.5" onClick={() => setEditingTemplate({ ...EMPTY_TEMPLATE })}>
              <Plus className="size-4" />
              Nueva plantilla
            </Button>
          }
        >
          No hay plantillas creadas. Una plantilla es el texto que el locutor dice al llegar a la hora.
        </EmptyNote>
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {/* The left edge carries the state the job cares about, so an
                      inactive template is findable without reading the badge. */}
                  <span
                    aria-hidden
                    className={`h-4 w-0.5 shrink-0 rounded-full ${t.active ? 'bg-primary' : 'bg-border'}`}
                  />
                  <p className={`text-sm font-semibold ${t.active ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {t.name}
                  </p>
                  <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {TYPE_LABELS[t.type] ?? t.type}
                  </span>
                  {!t.active && (
                    <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      Inactiva
                    </span>
                  )}
                </div>

                <p className="mt-2 border-l-2 border-border pl-3 text-sm leading-relaxed text-foreground/90">
                  {t.textTemplate}
                </p>

                <p className="mt-2 font-mono text-[11px] text-faint">
                  {VOICE_LABELS[t.voice] ?? t.voice} · velocidad {t.speed.toFixed(2)}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleGenerate(t.id)}
                  disabled={generatingId === t.id}
                  className="gap-1.5 text-xs"
                >
                  <Wand2 className={`size-3.5 ${generatingId === t.id ? 'animate-pulse' : ''}`} />
                  {generatingId === t.id ? 'Generando...' : 'Generar test'}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setEditingTemplate(t)}
                  title="Editar"
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setPendingDelete(t)}
                  disabled={deletingId === t.id}
                  title="Eliminar"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
        )}

        <ConfirmDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => !open && setPendingDelete(null)}
          title={pendingDelete ? `¿Eliminar la plantilla "${pendingDelete.name}"?` : 'Eliminar plantilla'}
          description="Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          loading={deletingId !== null}
          onConfirm={() => pendingDelete && void handleDelete(pendingDelete.id)}
        />
      </div>
    </Section>
  );
}