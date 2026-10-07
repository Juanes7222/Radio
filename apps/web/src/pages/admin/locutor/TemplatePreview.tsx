import { useCallback, useEffect, useState } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdminApi } from '@/hooks/useAdminApi';
import type { LocutorTemplatePreviewSample } from '@radio/types';

/**
 * Live preview of what a template will actually say.
 *
 * The complaint that motivated this was that announcements sounded unnatural
 * and nobody could tell why until an audio was generated and played on air.
 * Rendering the sentence for several times of day, without spending a TTS
 * call, makes the wording reviewable before it reaches a listener.
 */

const SUGGESTIONS: { label: string; template: string }[] = [
  {
    label: 'Natural, con minutos',
    template: 'En este momento, {{time_text}}. Esto es {{station_name}}.',
  },
  {
    label: 'Corta y cálida',
    template: 'Te acompañamos en {{station_name}}. {{time_text}}.',
  },
  {
    label: 'Solo la hora, sin repetir la marca',
    template: 'Estás en {{station_name}}. {{time_text}}.',
  },
];

interface TemplatePreviewProps {
  /** Raw template text, edited live in the form. */
  template: string;
  /** Template id when editing an existing row, so custom types are covered. */
  templateId?: string | null;
}

export default function TemplatePreview({ template, templateId }: TemplatePreviewProps) {
  const { previewLocutorTemplate } = useAdminApi();

  const [samples, setSamples] = useState<LocutorTemplatePreviewSample[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runPreview = useCallback(async () => {
    const text = template.trim();
    if (text.length === 0) return;

    setLoading(true);
    const result = await previewLocutorTemplate({
      textTemplate: text,
      templateId: templateId ?? undefined,
    }).then(
      (data) => ({ ok: true as const, data }),
      (): { ok: false; data: null } => ({ ok: false, data: null })
    );

    if (result.ok) {
      setSamples(result.data.samples);
      setError(null);
    } else {
      setError('No se pudo previsualizar la plantilla.');
    }
    setLoading(false);
  }, [previewLocutorTemplate, template, templateId]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await runPreview();
      if (!cancelled) return;
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [runPreview]);

  return (
    <div className="rounded-md border border-border p-3 space-y-3 bg-sunken/40">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5" />
          Así se va a oír
        </p>
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
      </div>

      {SUGGESTIONS.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((suggestion) => (
            <Button
              key={suggestion.label}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent('locutor:set-template', { detail: suggestion.template })
                );
              }}
            >
              {suggestion.label}
            </Button>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {samples.length > 0 && !loading && (
        <ul className="space-y-1.5">
          {samples.map((sample) => (
            <li key={sample.label} className="text-xs flex flex-col sm:flex-row gap-1 sm:gap-2">
              <span className="font-mono text-faint shrink-0 sm:w-32">{sample.label}</span>
              <span className="text-foreground">{sample.text}</span>
            </li>
          ))}
        </ul>
      )}

      {samples.length === 0 && !loading && !error && (
        <p className="text-xs text-faint">Escribe el texto de la plantilla para ver la previsualización.</p>
      )}
    </div>
  );
}
