import { AlertCircle, RefreshCw, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { SettingSource, StationSettingValue, StationSettingsSection } from '@radio/types';
import { draftFromValue, type SettingDraft, type SettingDrafts } from './shared';

const SOURCE_LABELS: Record<SettingSource, string> = {
  panel: 'Del panel',
  env: 'Del entorno',
  default: 'Valor por defecto',
};

/**
 * Stated before the operator saves, because it is the one failure the catalog
 * cannot fix: the value is in the cache but its consumer captured what it had
 * when the process started, so nothing moves until a restart.
 */
const RESTART_NOTICE =
  'Este valor se lee al arrancar el servicio: el cambio surte efecto cuando se reinicie.';

/**
 * One catalog entry rendered as the input its declared type calls for. There is
 * no field list here: the response is what decides how many inputs exist and
 * what each one is.
 */
function SettingField({
  item,
  draft,
  onDraftChange,
}: {
  item: StationSettingValue;
  draft: SettingDraft;
  onDraftChange: (key: string, draft: SettingDraft) => void;
}) {
  const inputId = `setting-${item.key}`;
  const descriptionId = `${inputId}-description`;
  const noticeId = `${inputId}-restart`;
  // The restart clause belongs to the field's description too: a screen reader
  // that reads the label should hear why the value will not move.
  const describedBy = item.requiresRestart ? `${descriptionId} ${noticeId}` : descriptionId;

  return (
    <div>
      {item.type === 'boolean' ? (
        <div className='flex items-start gap-3'>
          <Checkbox
            id={inputId}
            checked={draft === true}
            onCheckedChange={(checked) => onDraftChange(item.key, checked === true)}
            aria-describedby={describedBy}
            className='mt-0.5'
          />
          <div className='min-w-0 flex-1'>
            <label htmlFor={inputId} className='cursor-pointer text-sm font-medium text-foreground'>
              {item.label}
            </label>
            <p id={descriptionId} className='mt-1 text-xs leading-relaxed text-muted-foreground'>
              {item.description}
            </p>
          </div>
        </div>
      ) : (
        <>
          <label
            htmlFor={inputId}
            className='mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-faint'
          >
            {item.label}
          </label>
          <Input
            id={inputId}
            type={item.type === 'number' ? 'number' : 'text'}
            // The unit goes in the placeholder: an absent `unit` is null, and a
            // rendered "null" beside the field would be a lie about the catalog.
            placeholder={item.unit ?? undefined}
            min={item.min ?? undefined}
            max={item.max ?? undefined}
            step={item.type === 'number' ? 1 : undefined}
            value={typeof draft === 'boolean' ? String(draft) : draft}
            onChange={(event) => onDraftChange(item.key, event.target.value)}
            aria-describedby={describedBy}
            className='max-w-xs'
          />
          <p id={descriptionId} className='mt-1.5 text-xs leading-relaxed text-muted-foreground'>
            {item.description}
          </p>
        </>
      )}

      {/* Where the effective value comes from. This is the line that answers
          "cambié el .env y no pasó nada": a saved row outranks the variable. */}
      <p className='mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-faint'>
        {SOURCE_LABELS[item.source]}
      </p>

      {item.requiresRestart && (
        <p
          id={noticeId}
          aria-live='polite'
          className='mt-1.5 flex items-start gap-2 text-xs leading-relaxed text-warning'
        >
          <AlertCircle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
          <span>{RESTART_NOTICE}</span>
        </p>
      )}
    </div>
  );
}

interface SettingsSectionCardProps {
  section: StationSettingsSection;
  drafts: SettingDrafts;
  /** True while this section's own save or reset is in flight. */
  saving: boolean;
  canSave: boolean;
  /** The message from a save that failed here; the drafts stay as typed. */
  error: string | null;
  onDraftChange: (key: string, draft: SettingDraft) => void;
  onSave: () => void;
  onReset: () => void;
}

/**
 * One section of the catalog with its own save. Sections are independent by
 * design: a value the backend rejects must not block the sections beside it, so
 * only this card is disabled while it writes.
 */
export default function SettingsSectionCard({
  section,
  drafts,
  saving,
  canSave,
  error,
  onDraftChange,
  onSave,
  onReset,
}: SettingsSectionCardProps) {
  const headingId = `settings-section-${section.id}`;

  return (
    <section aria-labelledby={headingId} className='rounded-xl border border-border bg-card'>
      <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-5 py-4'>
        <div>
          <h2 id={headingId} className='text-[15px] font-semibold tracking-tight'>
            {section.label}
          </h2>
          <p className='mt-1 text-xs text-muted-foreground'>{section.description}</p>
        </div>
        <span className='font-mono text-[10px] tracking-[0.16em] text-faint'>
          {section.items.length} {section.items.length === 1 ? 'AJUSTE' : 'AJUSTES'}
        </span>
      </div>

      <div className='divide-y divide-border/60'>
        {section.items.map((item) => (
          <div key={item.key} className='px-5 py-4'>
            <SettingField
              item={item}
              draft={drafts[item.key] ?? draftFromValue(item)}
              onDraftChange={onDraftChange}
            />
          </div>
        ))}
      </div>

      {error && (
        <p
          role='alert'
          className='flex items-start gap-2 border-t border-destructive/25 bg-destructive/10 px-5 py-2.5 text-xs leading-relaxed text-destructive'
        >
          <AlertCircle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
          <span className='min-w-0 break-words'>{error}</span>
        </p>
      )}

      <div className='flex flex-wrap items-center gap-2 border-t border-border bg-sunken/40 px-5 py-3'>
        <Button type='button' onClick={onSave} disabled={saving || !canSave} className='h-9 gap-2'>
          {saving ? (
            <RefreshCw className='h-4 w-4 animate-spin' />
          ) : (
            <Save className='h-4 w-4' />
          )}
          {saving ? 'Guardando...' : 'Guardar sección'}
        </Button>
        <Button
          type='button'
          variant='outline'
          onClick={onReset}
          disabled={saving}
          className='h-9 gap-2'
        >
          <RotateCcw className='h-4 w-4' />
          Restablecer al entorno
        </Button>
      </div>
    </section>
  );
}