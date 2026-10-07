import { useCallback, useEffect, useState } from 'react';
import { Radio, RefreshCw, Clock3, ShieldCheck, ListChecks, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAdminApi } from '@/hooks/useAdminApi';
import { toast } from 'sonner';
import type {
  LocutorAnnouncementSettings,
  LocutorDayAnalysis,
  LocutorLiveState,
  LocutorPlanPreview,
  LocutorRunLogEntry,
} from '@radio/types';

/**
 * Configuración de los avisos de hora.
 *
 * La idea que organiza toda la pantalla: la programación dice qué debería estar
 * sonando y el sistema decide con lo que está sonando. Esa diferencia es la
 * que permite emitir un aviso cuando una predica termina antes de lo previsto
 * sin cortar nunca un programa.
 */

const REASON_LABELS: Record<string, string> = {
  ok: 'Se puede emitir',
  live_streamer: 'Persona transmitiendo en vivo',
  scheduled_program: 'Hay un programa en curso',
  unknown: 'Estado desconocido',
};

const OUTCOME_LABELS: Record<string, string> = {
  blocked_live_streamer: 'Bloqueado: persona en vivo',
  blocked_scheduled_program: 'Bloqueado: programa en curso',
  blocked_unknown: 'Bloqueado: estado desconocido',
  attempted: 'Intento',
  played: 'Reproducido',
  failed: 'Falló',
};

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

interface FieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

function Field({ label, hint, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-foreground">{label}</Label>
      {children}
      {hint && <p className="text-xs text-faint">{hint}</p>}
    </div>
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
  } = useAdminApi();

  const [settings, setSettings] = useState<LocutorAnnouncementSettings | null>(null);
  const [liveState, setLiveState] = useState<LocutorLiveState | null>(null);
  const [analysis, setAnalysis] = useState<LocutorDayAnalysis | null>(null);
  const [preview, setPreview] = useState<LocutorPlanPreview | null>(null);
  const [runLog, setRunLog] = useState<LocutorRunLogEntry[]>([]);
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

    if (settingsResult.status === 'fulfilled') {
      setSettings(settingsResult.value);
    }
    if (liveResult.status === 'fulfilled') setLiveState(liveResult.value);
    if (analysisResult.status === 'fulfilled') setAnalysis(analysisResult.value);
    if (previewResult.status === 'fulfilled') setPreview(previewResult.value);
    if (logResult.status === 'fulfilled') setRunLog(logResult.value);

    const anyFailure = result.some((entry) => entry.status === 'rejected');
    setError(anyFailure ? 'No se pudo cargar toda la información del sistema.' : null);
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
    return <p className="text-sm text-muted-foreground">Cargando configuración de avisos...</p>;
  }

  if (!settings) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{error ?? 'No se pudo cargar la configuración.'}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-sm text-warning border border-warning/20 bg-warning/10 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Radio className="w-4 h-4" />
            Estado de los avisos de hora
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Switch
              id="announcements-enabled"
              checked={settings.enabled}
              onCheckedChange={() => void toggle()}
              aria-label="Activar avisos de hora"
            />
            <Label htmlFor="announcements-enabled" className="text-sm">
              {settings.enabled ? 'Avisos activos' : 'Avisos desactivados'}
            </Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void rebuild()}
              disabled={rebuilding}
            >
              <RefreshCw className={`w-4 h-4 ${rebuilding ? 'animate-spin' : ''}`} />
              Reconstruir plan
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-faint flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                ¿Se emitiría ahora mismo?
              </p>
              <p className="text-sm mt-1">
                {liveState ? REASON_LABELS[liveState.reason] ?? liveState.reason : 'Consultando...'}
              </p>
              {liveState && <p className="text-xs text-faint mt-1">{liveState.detail}</p>}
            </div>

            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-faint flex items-center gap-1.5">
                <Clock3 className="w-3.5 h-3.5" />
                Tiempo libre hoy
              </p>
              <p className="text-sm mt-1">
                {analysis ? formatDuration(analysis.freeMinutes) : 'Consultando...'}
              </p>
              <p className="text-xs text-faint mt-1">
                {analysis && analysis.currentProgram
                  ? `En curso: ${analysis.currentProgram.title}`
                  : 'Sin programa en curso según la programación'}
              </p>
            </div>
          </div>

          {liveState?.liveStreamer && (
            <div className="rounded-md border border-tally/30 bg-tally/10 px-3 py-2">
              <p className="text-sm text-foreground">
                Hay una persona transmitiendo en vivo ({liveState.liveStreamer}). Los avisos no se
                emitirán ni la interrumpiremos.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ritmo de emisión</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              label="Avisos por hora de espacio libre"
              hint="Se reparten entre las ventanas libres, no entre las 24 horas del día."
            >
              <Input
                type="number"
                min={1}
                max={12}
                value={settings.perHour}
                disabled={saving}
                onChange={(event) => void patch({ perHour: Number(event.target.value) })}
              />
            </Field>

            <Field
              label="Separación mínima entre avisos (minutos)"
              hint="Evita dos avisos casi seguidos al inicio de una ventana."
            >
              <Input
                type="number"
                min={0}
                max={180}
                value={settings.minGapMinutes}
                disabled={saving}
                onChange={(event) => void patch({ minGapMinutes: Number(event.target.value) })}
              />
            </Field>

            <Field
              label="Margen respecto a los bordes de la ventana (minutos)"
              hint="Un aviso pegado al programa puede pisar su entrada o su salida."
            >
              <Input
                type="number"
                min={0}
                max={30}
                value={settings.windowEdgeMarginMinutes}
                disabled={saving}
                onChange={(event) =>
                  void patch({ windowEdgeMarginMinutes: Number(event.target.value) })
                }
              />
            </Field>

            <Field
              label="Ventana libre mínima (minutos)"
              hint="Descarta huecos demasiado cortos, como los que deja un bloque de seis minutos."
            >
              <Input
                type="number"
                min={1}
                max={120}
                value={settings.minWindowMinutes}
                disabled={saving}
                onChange={(event) => void patch({ minWindowMinutes: Number(event.target.value) })}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reintentos cuando hay un programa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-faint">
              Si al momento del aviso hay un programa sonando, el aviso no se pierde: se vuelve a
              evaluar. Esto es lo que permite anunciarlo cuando la predica termina antes de lo
              previsto.
            </p>

            <Field label="Cada cuánto reintentar (minutos)">
              <Input
                type="number"
                min={1}
                max={60}
                value={settings.retryIntervalMinutes}
                disabled={saving}
                onChange={(event) =>
                  void patch({ retryIntervalMinutes: Number(event.target.value) })
                }
              />
            </Field>

            <Field
              label="Máximo de reintentos por aviso"
              hint="Al agotarlos el aviso queda registrado como omitido, con el motivo."
            >
              <Input
                type="number"
                min={0}
                max={20}
                value={settings.maxRetries}
                disabled={saving}
                onChange={(event) => void patch({ maxRetries: Number(event.target.value) })}
              />
            </Field>

            <div className="rounded-md border border-border p-3 space-y-3">
              <div className="flex items-start gap-3">
                <Switch
                  id="respect-live"
                  checked={settings.respectLiveStreamer}
                  disabled={saving}
                  onCheckedChange={(checked) => void patch({ respectLiveStreamer: checked })}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="respect-live" className="text-sm">
                    No interrumpir a quien está en vivo
                  </Label>
                  <p className="text-xs text-faint">
                    Si un DJ se conecta, el aviso espera. Desactívalo solo si aceptas el riesgo de
                    cortar la transmisión.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Switch
                  id="respect-programs"
                  checked={settings.respectScheduledPrograms}
                  disabled={saving}
                  onCheckedChange={(checked) => void patch({ respectScheduledPrograms: checked })}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="respect-programs" className="text-sm">
                    No interrumpir ningún programa programado
                  </Label>
                  <p className="text-xs text-faint">
                    Se comprueba contra la playlist que está sonando realmente, no contra el
                    horario. Si un programa termina antes, el aviso sale.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            Ventanas libres de hoy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {analysis && analysis.freeWindows.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {analysis.freeWindows.map((window) => (
                <Badge key={`${window.from}-${window.to}`} variant="outline" className="font-mono">
                  {window.from} - {window.to} · {formatDuration(window.minutes)}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No hay ventanas libres con el tamaño mínimo actual.
            </p>
          )}

          {analysis && analysis.busyIntervals.length > 0 && (
            <div>
              <p className="text-xs text-faint mb-2">Programas que bloquean los avisos</p>
              <div className="flex flex-wrap gap-2">
                {analysis.busyIntervals.map((interval) => (
                  <Badge
                    key={`${interval.from}-${interval.title}`}
                    variant="outline"
                    className="border-border text-muted-foreground"
                  >
                    {interval.from} - {interval.to} · {interval.title}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="w-4 h-4" />
              Plan propuesto para hoy
            </CardTitle>
          </CardHeader>
          <CardContent>
            {preview && preview.slotCount > 0 ? (
              <>
                <p className="text-sm text-muted-foreground mb-3">
                  {preview.slotCount} avisos
                  {preview.droppedByGap > 0 && `, ${preview.droppedByGap} descartados por separación`}
                </p>
                <div className="flex flex-wrap gap-2">
                  {preview.slots.map((slot) => (
                    <Badge key={slot.minuteOfDay} variant="outline" className="font-mono">
                      {slot.at}
                    </Badge>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No hay avisos propuestos. Revisa las ventanas libres y el tamaño mínimo.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Actividad reciente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {runLog.length > 0 ? (
              <ul className="space-y-2 max-h-72 overflow-y-auto">
                {runLog.map((entry) => (
                  <li key={entry.id} className="text-xs flex items-start gap-2">
                    <span className="font-mono text-faint shrink-0">
                      {new Date(entry.at).toLocaleTimeString('es-CO', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="text-foreground">
                      {OUTCOME_LABELS[entry.outcome] ?? entry.outcome}
                      {entry.playingPlaylist && (
                        <span className="text-faint"> · {entry.playingPlaylist}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Sin actividad registrada todavía.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audio</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Carpeta de bases musicales" hint="Si no existe, el aviso sale sin música.">
            <Input
              value={settings.bedsDir}
              disabled={saving}
              onChange={(event) => void patch({ bedsDir: event.target.value })}
            />
          </Field>

          <Field label="Volumen de la base">
            <Input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={settings.bedVolume}
              disabled={saving}
              onChange={(event) => void patch({ bedVolume: Number(event.target.value) })}
            />
          </Field>

          <Field label="Silencio final (segundos)" hint="Evita que Liquidsoap corte la pista.">
            <Input
              type="number"
              min={0}
              max={30}
              value={settings.trailingSilenceSeconds}
              disabled={saving}
              onChange={(event) =>
                void patch({ trailingSilenceSeconds: Number(event.target.value) })
              }
            />
          </Field>
        </CardContent>
      </Card>
    </div>
  );
}
