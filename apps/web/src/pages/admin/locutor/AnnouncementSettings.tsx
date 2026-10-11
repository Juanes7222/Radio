import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  History,
  Radio,
  RefreshCw,
  Repeat,
  ShieldCheck,
  SlidersHorizontal,
  Volume2,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useAdminApi } from '@/hooks/useAdminApi';
import { toast } from 'sonner';
import type {
  LocutorAnnouncementSettings,
  LocutorAnnouncementReason,
  LocutorDayAnalysis,
  LocutorLiveState,
  LocutorPlanPreview,
  LocutorRunLogEntry,
} from '@radio/types';
import { DayRail } from './DayRail';
import { EmptyNote, Section, Faceplate, FaceplateReading } from './Section';

/**
 * Configuración de los avisos de hora.
 *
 * La idea que organiza toda la pantalla: la programación dice qué debería estar
 * sonando y el sistema decide con lo que está sonando. Esa diferencia es la
 * que permite emitir un aviso cuando una predica termina antes de lo previsto
 * sin cortar nunca un programa.
 */

type Tone = 'success' | 'warning' | 'info' | 'tally' | 'muted';

/**
 * The one thing this zone must not let the operator miss is whether the
 * locutor is allowed to speak right now, so the reason carries the colour
 * rather than the surrounding box. `tally` stays reserved for a person on air.
 */
const REASON: Record<LocutorAnnouncementReason, { label: string; tone: Tone }> = {
  ok: { label: 'Se puede emitir ahora', tone: 'success' },
  live_streamer: { label: 'Persona transmitiendo en vivo', tone: 'tally' },
  scheduled_program: { label: 'Hay un programa en curso', tone: 'warning' },
  unknown: { label: 'Estado desconocido', tone: 'warning' },
};

const OUTCOME: Record<string, { label: string; tone: Tone }> = {
  blocked_live_streamer: { label: 'Bloqueado: persona en vivo', tone: 'tally' },
  blocked_scheduled_program: { label: 'Bloqueado: programa en curso', tone: 'warning' },
  blocked_unknown: { label: 'Bloqueado: estado desconocido', tone: 'warning' },
  attempted: { label: 'Intento', tone: 'info' },
  played: { label: 'Reproducido', tone: 'success' },
  failed: { label: 'Falló', tone: 'tally' },
};

const DOT_TONE: Record<Tone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  info: 'bg-info',
  tally: 'bg-tally',
  muted: 'bg-faint/50',
};

const VERDICT_TEXT_TONE: Record<Tone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-info',
  tally: 'text-tally',
  muted: 'text-muted-foreground',
};

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

/**
 * A labelled number. The unit lives in the label rather than as a suffix inside
 * the field, so the value stays a plain editable number and the hint keeps
 * explaining the consequence instead of restating the unit.
 *
 * The field saves on blur, not on every keystroke: one PUT per field the
 * operator actually touched, instead of a rain of requests and toasts while
 * a number is being dialed in.
 */
function NumberField({
  label,
  unit,
  hint,
  value,
  min,
  max,
  step,
  disabled,
  onCommit,
}: {
  label: string;
  unit: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (draft === '' || !Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-foreground">
        {label} <span className="text-faint">({unit})</span>
      </Label>
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
        }}
      />
      <p className="text-xs leading-snug text-faint">{hint}</p>
    </div>
  );
}

function GuardRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} className="mt-0.5" />
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm text-foreground">
          {label}
        </Label>
        <p className="mt-0.5 text-xs leading-snug text-faint">{hint}</p>
      </div>
    </div>
  );
}

function AirFreeReading({
  analysis,
  freeMinutes,
}: {
  analysis: LocutorDayAnalysis | null;
  freeMinutes: number;
}) {
  return (
    <FaceplateReading label="Aire libre hoy">
      {formatDuration(freeMinutes)}
      <span className="ml-1.5 font-mono text-[10px] normal-case tracking-normal text-faint">
        {analysis && analysis.busyIntervals.length > 0
          ? `${analysis.busyIntervals.length} programa${analysis.busyIntervals.length === 1 ? '' : 's'} bloqueando`
          : 'programación sin bloqueos'}
      </span>
    </FaceplateReading>
  );
}

export default function AnnouncementSettingsPanel() {
  const {
    getAnnouncementSettings,
    updateAnnouncementSettings,
    getAnnouncementLiveState,
    getAnnouncementDayAnalysis,
    getAnnouncementPlanPreview,
    getAnnouncementRunLog,
    rebuildAnnouncementPlan,
    toggleAnnouncements,
    getLocutorTemplates,
    previewLocutorTemplate,
  } = useAdminApi();

  const [settings, setSettings] = useState<LocutorAnnouncementSettings | null>(null);
  const [liveState, setLiveState] = useState<LocutorLiveState | null>(null);
  const [analysis, setAnalysis] = useState<LocutorDayAnalysis | null>(null);
  const [preview, setPreview] = useState<LocutorPlanPreview | null>(null);
  const [runLog, setRunLog] = useState<LocutorRunLogEntry[]>([]);
  /** The sentence the next slot will actually speak, from the same preview
      the template editor uses. */
  const [nextWords, setNextWords] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await Promise.allSettled([
      getAnnouncementSettings(),
      getAnnouncementLiveState(),
      getAnnouncementDayAnalysis(),
      getAnnouncementPlanPreview(),
      getAnnouncementRunLog(30),
    ]);

    const [settingsResult, liveResult, analysisResult, previewResult, logResult] = result;

    if (settingsResult.status === 'fulfilled') setSettings(settingsResult.value);
    if (liveResult.status === 'fulfilled') setLiveState(liveResult.value);
    if (analysisResult.status === 'fulfilled') setAnalysis(analysisResult.value);
    if (previewResult.status === 'fulfilled') setPreview(previewResult.value);
    if (logResult.status === 'fulfilled') setRunLog(logResult.value);

    setError(result.some((entry) => entry.status === 'rejected') ? 'No se pudo cargar toda la información.' : null);
  }, [
    getAnnouncementSettings,
    getAnnouncementLiveState,
    getAnnouncementDayAnalysis,
    getAnnouncementPlanPreview,
    getAnnouncementRunLog,
  ]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await load();
      if (!cancelled) setLoading(false);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [load]);

  // The faceplate's hidden signature: the first active template speaks the
  // hourly announcements, so its rendered first sample is the words the next
  // slot will say, without spending a TTS call. Failing quietly keeps the
  // faceplate honest without turning loading into noise.
  const shouldLoadWords = settings !== null;
  useEffect(() => {
    if (!shouldLoadWords) {
      setNextWords(null);
      return;
    }
    let cancelled = false;

    const loadWords = async () => {
      const templates = await getLocutorTemplates().catch(() => null);
      if (cancelled || !templates) return;
      const template = templates.find((entry) => entry.active && entry.type === 'hourly');
      if (!template) return;
      try {
        const data = await previewLocutorTemplate({ textTemplate: template.textTemplate });
        if (cancelled) return;
        setNextWords(data.samples[0]?.text ?? null);
      } catch {
        if (!cancelled) setNextWords(null);
      }
    };

    void loadWords();
    return () => {
      cancelled = true;
    };
  }, [shouldLoadWords, getLocutorTemplates, previewLocutorTemplate]);

  const patch = useCallback(
    async (changes: Parameters<typeof updateAnnouncementSettings>[0]) => {
      setSaving(true);
      const result = await updateAnnouncementSettings(changes).then(
        (data) => ({ ok: true as const, data }),
        (): { ok: false; data: null } => ({ ok: false, data: null })
      );

      if (result.ok) {
        setSettings(result.data);
        toast.success('Configuración guardada');
      } else {
        toast.error('No se pudo guardar la configuración');
      }
      setSaving(false);
    },
    [updateAnnouncementSettings]
  );

  const rebuild = useCallback(async () => {
    setRebuilding(true);
    const result = await rebuildAnnouncementPlan().then(
      (data) => ({ ok: true as const, data }),
      (): { ok: false; data: null } => ({ ok: false, data: null })
    );

    if (result.ok) {
      toast.success(`Plan reconstruido: ${result.data.registered} avisos programados`);
      await load();
    } else {
      toast.error('No se pudo reconstruir el plan');
    }
    setRebuilding(false);
  }, [rebuildAnnouncementPlan, load]);

  const toggle = useCallback(async () => {
    const result = await toggleAnnouncements().then(
      (data) => ({ ok: true as const, data }),
      (): { ok: false; data: null } => ({ ok: false, data: null })
    );

    if (result.ok) {
      setSettings(result.data);
      toast.success(result.data.enabled ? 'Avisos activados' : 'Avisos desactivados');
      await load();
    } else {
      toast.error('No se pudo cambiar el estado');
    }
  }, [toggleAnnouncements, load]);

  if (loading) {
    return <div className="h-40 animate-pulse rounded-xl bg-sunken" />;
  }

  if (!settings) {
    return (
      <EmptyNote>{error ?? 'No se pudo cargar la configuración de los avisos.'}</EmptyNote>
    );
  }

  const slots = preview?.slots ?? [];
  const freeMinutes = analysis?.freeMinutes ?? 0;
  const nowSlot = slots.find((slot) => {
    if (!liveState) return false;
    const [hours, minutes] = liveState.stationTime.clock.split(':').map(Number);
    return slot.minuteOfDay >= hours * 60 + minutes;
  });

  return (
    <Section
      title="Plan de hoy"
      actions={
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => void rebuild()}
          disabled={rebuilding}
        >
          <RefreshCw className={`size-3.5 ${rebuilding ? 'animate-spin' : ''}`} />
          Reconstruir plan
        </Button>
      }
    >
      <div className="space-y-4">
      {error && (
        <p className="flex items-center gap-2 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-sm text-warning">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </p>
      )}

      {/* The unit's faceplate: whether the locutor may speak, and the exact
          words it would say next. The topbar's ON AIR strip is the same
          gesture at a smaller scale. */}
      <Faceplate
        lamp={
          !settings.enabled
            ? 'bg-faint/40'
            : liveState
              ? DOT_TONE[REASON[liveState.reason].tone]
              : 'bg-faint/40'
        }
        label="Próximo aviso"
        verdict={
          <span
            className={
              !settings.enabled
                ? 'text-muted-foreground'
                : liveState
                  ? VERDICT_TEXT_TONE[REASON[liveState.reason].tone]
                  : 'text-foreground'
            }
          >
            {!settings.enabled
              ? 'Avisos desactivados'
              : (liveState ? REASON[liveState.reason].label : 'Consultando...')}
          </span>
        }
        slots={[
          nextWords !== null && (
            <FaceplateReading key="words" label="Dará la hora">
              <span className="max-w-[26rem] truncate font-normal text-foreground/90" title={nextWords}>
                {nextWords}
              </span>
            </FaceplateReading>
          ),
          <AirFreeReading key="air" analysis={analysis} freeMinutes={freeMinutes} />,
        ].filter(Boolean) as React.ReactNode[]}
      />

      {/* The main switch, directly under the faceplate it controls. */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <Switch
          id="announcements-enabled"
          checked={settings.enabled}
          onCheckedChange={() => void toggle()}
          aria-label="Activar avisos de hora"
        />
        <Label htmlFor="announcements-enabled" className="text-sm text-foreground">
          {settings.enabled ? 'Avisos activos' : 'Avisos desactivados'}
        </Label>
      </div>

      {liveState?.liveStreamer && (
        <p className="flex items-start gap-2 rounded-lg border border-tally/30 bg-tally/10 px-3 py-2 text-sm text-foreground">
          <Radio className="mt-0.5 size-4 shrink-0 text-tally" />
          <span>
            <span className="font-medium text-tally">{liveState.liveStreamer}</span> está
            transmitiendo en vivo. Los avisos esperan y no se interrumpe la transmisión.
          </span>
        </p>
      )}

      {/* The day as one object. Free windows, blocking programs and proposed
          slots are all on the same axis; no second cloud of chips repeats
          what the ticks already show. */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
            <ShieldCheck className="size-3" />
            El día de hoy
          </p>
          <p className="text-xs text-muted-foreground">
            {slots.length > 0 ? (
              <>
                <span className="font-semibold text-foreground">{slots.length}</span> avisos
                propuestos
                {preview && preview.droppedByGap > 0 && (
                  <span className="text-faint">
                    {' '}
                    · {preview.droppedByGap} descartado{preview.droppedByGap === 1 ? '' : 's'} por
                    separación
                  </span>
                )}
                {nowSlot && (
                  <span className="text-faint"> · el próximo cae a las {nowSlot.at}</span>
                )}
              </>
            ) : (
              'Sin avisos propuestos todavía'
            )}
          </p>
        </div>

        {analysis && (analysis.freeWindows.length > 0 || analysis.busyIntervals.length > 0) ? (
          <DayRail
            freeWindows={analysis.freeWindows}
            busyIntervals={analysis.busyIntervals}
            slots={slots}
            stationClock={liveState?.stationTime.clock}
          />
        ) : (
          <EmptyNote>
            No hay ventanas libres con el tamaño mínimo actual. Bájalo en{' '}
            <span className="text-foreground">Ventana libre mínima</span> o revisa la programación.
          </EmptyNote>
        )}
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {/* Rhythm: how the free air is spent. */}
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
            <SlidersHorizontal className="size-3" />
            Ritmo de emisión
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Avisos por hora"
              unit="de espacio libre"
              hint="Se reparten entre las ventanas libres, no entre las 24 horas."
              value={settings.perHour}
              min={1}
              max={12}
              disabled={saving}
              onCommit={(perHour) => void patch({ perHour })}
            />
            <NumberField
              label="Separación mínima"
              unit="minutos"
              hint="Evita dos avisos casi seguidos al inicio de una ventana."
              value={settings.minGapMinutes}
              min={0}
              max={180}
              disabled={saving}
              onCommit={(minGapMinutes) => void patch({ minGapMinutes })}
            />
            <NumberField
              label="Margen en los bordes"
              unit="minutos"
              hint="Un aviso pegado al programa puede pisar su entrada o su salida."
              value={settings.windowEdgeMarginMinutes}
              min={0}
              max={30}
              disabled={saving}
              onCommit={(windowEdgeMarginMinutes) => void patch({ windowEdgeMarginMinutes })}
            />
            <NumberField
              label="Ventana libre mínima"
              unit="minutos"
              hint="Descarta huecos demasiado cortos, como los de un bloque de seis minutos."
              value={settings.minWindowMinutes}
              min={1}
              max={120}
              disabled={saving}
              onCommit={(minWindowMinutes) => void patch({ minWindowMinutes })}
            />
          </div>
        </div>

        {/* Retries and guards: what happens when the moment is wrong. */}
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
            <Repeat className="size-3" />
            Reintentos y protecciones
          </p>
          <p className="text-xs leading-snug text-faint">
            Si al momento del aviso hay un programa sonando, el aviso no se pierde: se vuelve a
            evaluar. Eso es lo que permite anunciarlo cuando la predica termina antes de lo previsto.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Reintentar cada"
              unit="minutos"
              hint="Cada cuánto se vuelve a mirar si ya se puede emitir."
              value={settings.retryIntervalMinutes}
              min={1}
              max={60}
              disabled={saving}
              onCommit={(retryIntervalMinutes) => void patch({ retryIntervalMinutes })}
            />
            <NumberField
              label="Máximo de reintentos"
              unit="por aviso"
              hint="Al agotarlos queda registrado como omitido, con el motivo."
              value={settings.maxRetries}
              min={0}
              max={20}
              disabled={saving}
              onCommit={(maxRetries) => void patch({ maxRetries })}
            />
          </div>

          <div className="space-y-1 border-t border-border pt-2">
            <GuardRow
              id="respect-live"
              label="No interrumpir a quien está en vivo"
              hint="Si un DJ se conecta, el aviso espera. Desactívalo solo si aceptas cortar la transmisión."
              checked={settings.respectLiveStreamer}
              disabled={saving}
              onChange={(respectLiveStreamer) => void patch({ respectLiveStreamer })}
            />
            <GuardRow
              id="respect-programs"
              label="No interrumpir ningún programa programado"
              hint="Se comprueba contra la playlist que suena de verdad, no contra el horario."
              checked={settings.respectScheduledPrograms}
              disabled={saving}
              onChange={(respectScheduledPrograms) => void patch({ respectScheduledPrograms })}
            />
          </div>
        </div>
      </div>

      {/* The rundown of what is holding the schedule. Kept as a list because
          the program titles are information the rail cannot carry. */}
      {analysis && analysis.busyIntervals.length > 0 && (
        <details className="group rounded-xl border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm text-foreground">
            <Ban className="size-4 shrink-0 text-faint" />
            <span className="font-medium">
              {analysis.busyIntervals.length} programa
              {analysis.busyIntervals.length === 1 ? '' : 's'} bloquean los avisos
            </span>
            <span className="ml-auto font-mono text-[11px] text-faint group-open:hidden">
              ver lista
            </span>
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {analysis.busyIntervals.map((interval) => (
              <li key={`${interval.from}-${interval.title}`} className="flex items-baseline gap-3 px-4 py-2">
                <span className="shrink-0 font-mono text-xs tabular-nums text-faint">
                  {interval.from} – {interval.to}
                </span>
                <span className="min-w-0 truncate text-sm text-foreground" title={interval.title}>
                  {interval.title}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* The rundown of what actually happened. The outcome carries the colour
          that says whether anything went wrong. */}
      <div className="rounded-xl border border-border bg-card">
        <p className="flex items-center gap-1.5 px-4 pb-2 pt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
          <History className="size-3" />
          Actividad reciente
        </p>

        {runLog.length === 0 ? (
          <div className="px-4 pb-4">
            <EmptyNote>El sistema todavía no ha registrado ningún intento.</EmptyNote>
          </div>
        ) : (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto border-t border-border">
            {runLog.map((entry) => {
              const outcome = OUTCOME[entry.outcome] ?? { label: entry.outcome, tone: 'muted' as Tone };
              return (
                <li key={entry.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="shrink-0 font-mono text-xs tabular-nums text-faint">
                    {new Date(entry.at).toLocaleTimeString('es-CO', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${DOT_TONE[outcome.tone]}`} />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {outcome.label}
                    {entry.playingPlaylist && (
                      <span className="text-faint"> · {entry.playingPlaylist}</span>
                    )}
                  </span>
                  {entry.outcome === 'played' && (
                    <CheckCircle2 className="size-3.5 shrink-0 text-success" />
                  )}
                  {entry.outcome === 'failed' && (
                    <AlertTriangle className="size-3.5 shrink-0 text-tally" />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Audio bed. */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
          <Volume2 className="size-3" />
          Audio del aviso
        </p>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-foreground">Carpeta de bases musicales</Label>
            <Input
              value={settings.bedsDir}
              disabled={saving}
              onChange={(event) => void patch({ bedsDir: event.target.value })}
            />
            <p className="text-xs leading-snug text-faint">Si no existe, el aviso sale sin música.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-foreground">
              Volumen de la base <span className="text-faint">(0 a 1)</span>
            </Label>
            <Input
              type="number"
              inputMode="decimal"
              step={0.05}
              min={0}
              max={1}
              value={settings.bedVolume}
              disabled={saving}
              onChange={(event) => void patch({ bedVolume: Number(event.target.value) })}
            />
            <p className="text-xs leading-snug text-faint">Qué tan fuerte entra la música bajo la voz.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-foreground">
              Silencio final <span className="text-faint">(segundos)</span>
            </Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={30}
              value={settings.trailingSilenceSeconds}
              disabled={saving}
              onChange={(event) => void patch({ trailingSilenceSeconds: Number(event.target.value) })}
            />
            <p className="text-xs leading-snug text-faint">Evita que Liquidsoap corte la pista.</p>
          </div>
        </div>
      </div>
      </div>
    </Section>
  );
}
