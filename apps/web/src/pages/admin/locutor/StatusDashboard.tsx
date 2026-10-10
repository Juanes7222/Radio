import { useCallback, useEffect, useState } from 'react';
import { AudioLines, CalendarClock, Cpu, KeyRound, Mic, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAdminApi } from '@/hooks/useAdminApi';
import { toast } from 'sonner';
import type { LocutorStatus, TtsKeyStatus, TtsProviderId } from '@radio/types';
import { Section, Readout, EmptyNote } from './Section';

const PROVIDER_LABELS: Record<TtsProviderId, string> = {
  elevenlabs: 'ElevenLabs',
  kokoro: 'Kokoro',
};

const KEY_BLOCK_LABELS: Record<string, string> = {
  quota: 'Sin cuota',
  invalid: 'Key inválida',
  transient: 'Fallo temporal',
};

const JOB_STATUS: Record<string, { label: string; className: string }> = {
  success: { label: 'Exitoso', className: 'border-success/25 bg-success/10 text-success' },
  partial: { label: 'Parcial', className: 'border-warning/25 bg-warning/10 text-warning' },
  running: { label: 'En ejecución', className: 'border-info/25 bg-info/10 text-info' },
  error: { label: 'Error', className: 'border-destructive/25 bg-destructive/10 text-destructive' },
};

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-CO');
}

/**
 * The character balance is the number that decides how many keys the station
 * needs: the free plan allows 10 000 characters a month and a 100-character
 * announcement spends about 100 of them. A bar makes "how much is left" a
 * glance instead of a subtraction, so it is drawn rather than printed.
 */
function CreditMeter({
  remaining,
  limit,
}: {
  remaining: number | null;
  limit: number | null;
}) {
  if (remaining === null || limit === null || limit <= 0) {
    return (
      <p className="text-xs text-faint">
        El saldo se lee al pulsar <span className="text-foreground">Probar la voz</span> o cuando una
        key se agota.
      </p>
    );
  }

  const pct = Math.max(0, Math.min(100, (remaining / limit) * 100));
  const tone = pct > 40 ? 'bg-success' : pct > 15 ? 'bg-warning' : 'bg-destructive';

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-sm tabular-nums text-foreground">
          {remaining.toLocaleString('es-CO')}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-faint">
          de {limit.toLocaleString('es-CO')} caracteres
        </span>
      </div>
      <div
        role="meter"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Caracteres restantes en el pool de keys"
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border/60"
      >
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * One row per API key. The key itself never leaves the backend: only the last
 * four characters, enough to tell two accounts apart when one runs out of
 * credits and the other does not.
 */
function KeyRow({ keyStatus }: { keyStatus: TtsKeyStatus }) {
  const available = keyStatus.available;

  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className={`size-1.5 shrink-0 rounded-full ${
            available ? 'bg-success' : keyStatus.blockReason === 'transient' ? 'bg-warning' : 'bg-destructive'
          }`}
        />
        <span className="font-mono text-xs text-foreground">{keyStatus.hint}</span>
        {keyStatus.inFlight > 0 && (
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-info">
            en uso
          </span>
        )}
      </span>

      <span className="flex shrink-0 items-center gap-2">
        {keyStatus.balance.remaining !== null && (
          <span className="font-mono text-[11px] tabular-nums text-faint">
            {keyStatus.balance.remaining.toLocaleString('es-CO')}
          </span>
        )}
        {keyStatus.blockedUntil && (
          <span className="font-mono text-[11px] text-faint">
            hasta {formatDateTime(keyStatus.blockedUntil)}
          </span>
        )}
        <span
          className={`text-[11px] ${
            available ? 'text-success' : keyStatus.blockReason === 'transient' ? 'text-warning' : 'text-destructive'
          }`}
        >
          {available
            ? 'Libre'
            : (KEY_BLOCK_LABELS[keyStatus.blockReason ?? ''] ?? 'Bloqueada')}
        </span>
      </span>
    </li>
  );
}

export default function StatusDashboard() {
  const { getLocutorStatus, testLocutorTts } = useAdminApi();
  const [status, setStatus] = useState<LocutorStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const data = await getLocutorStatus();
      setStatus(data);
      setError(null);
    } catch {
      setError('No se pudo consultar el estado del motor de voz.');
    }
  }, [getLocutorStatus]);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      await loadStatus();
    };

    void poll();
    const interval = setInterval(() => void poll(), 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [loadStatus]);

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await testLocutorTts();
      toast.success(`${PROVIDER_LABELS[result.provider]} respondió`, {
        description: result.message,
      });
      await loadStatus();
    } catch {
      toast.error('Ningún motor de voz respondió');
    } finally {
      setTesting(false);
    }
  };

  if (error && !status) {
    return (
      <Section title="Motor de voz" description={error} icon={Cpu}>
        <EmptyNote
          action={
            <Button variant="outline" size="sm" onClick={() => void loadStatus()}>
              Reintentar
            </Button>
          }
        >
          El estado del motor no está disponible.
        </EmptyNote>
      </Section>
    );
  }

  if (!status) {
    return (
      <Section title="Motor de voz" description="Consultando el motor activo." icon={Cpu}>
        <div className="h-24 animate-pulse rounded-xl bg-sunken" />
      </Section>
    );
  }

  const { tts } = status;
  const onElevenLabs = tts.preferredProvider === 'elevenlabs';
  const usingFallback = !onElevenLabs && tts.elevenLabs.configured;
  const lastJob = status.last_job;
  const jobStatus = lastJob ? JOB_STATUS[lastJob.status] : null;

  return (
    <Section
      title="Motor de voz"
      description="Qué motor responde hoy y cuánto le queda para seguir respondiendo."
      icon={Cpu}
      actions={
        <Button variant="outline" size="sm" className="gap-2" onClick={() => void handleTest()} disabled={testing}>
          <Radio className={`size-3.5 ${testing ? 'animate-pulse' : ''}`} />
          Probar la voz
        </Button>
      }
    >
      <div className="grid gap-3 lg:grid-cols-3">
        {/* Engine identity. This is the headline of the zone: the operator's
            first question is which engine is speaking, and it used to be a
            badge inside a card inside a card. */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <span
              className={`grid size-10 shrink-0 place-items-center rounded-lg border ${
                onElevenLabs
                  ? 'border-success/25 bg-success/10 text-success'
                  : usingFallback
                    ? 'border-warning/25 bg-warning/10 text-warning'
                    : 'border-info/25 bg-info/10 text-info'
              }`}
            >
              <Mic className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                Motor activo
              </p>
              <p
                className={`mt-0.5 text-lg font-semibold leading-tight ${
                  onElevenLabs ? 'text-success' : usingFallback ? 'text-warning' : 'text-info'
                }`}
              >
                {PROVIDER_LABELS[tts.preferredProvider]}
              </p>
            </div>
          </div>

          <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-faint">Última locución</dt>
              <dd className="truncate text-foreground">
                {tts.lastProvider ? PROVIDER_LABELS[tts.lastProvider] : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-faint">Caídas al motor de reserva</dt>
              <dd className={tts.fallbackCount > 0 ? 'text-warning' : 'text-foreground'}>
                {tts.fallbackCount}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-faint">Kokoro (reserva)</dt>
              <dd className={tts.kokoroReachable ? 'text-success' : 'text-faint'}>
                {tts.kokoroReachable ? 'En línea' : 'Inactivo'}
              </dd>
            </div>
          </dl>

          {usingFallback && (
            <p className="mt-3 rounded-md border border-warning/25 bg-warning/10 px-2.5 py-2 text-xs text-warning">
              Sin keys de ElevenLabs disponibles: las locuciones salen del motor de reserva.
            </p>
          )}
        </div>

        {/* Credit balance and the key pool. */}
        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
              <KeyRound className="size-3" />
              Pool de keys
            </p>
            {!tts.elevenLabs.configured && (
              <Badge variant="outline" className="border-border text-xs text-muted-foreground">
                Sin configurar
              </Badge>
            )}
          </div>

          {tts.elevenLabs.configured ? (
            <>
              <p className="mt-2 text-sm text-foreground">
                <span className="font-semibold tabular-nums text-success">
                  {tts.elevenLabs.availableKeys}
                </span>{' '}
                de {tts.elevenLabs.keys.length} keys libres
                <span className="ml-2 font-mono text-[11px] text-faint">
                  modelo {tts.elevenLabs.modelId}
                </span>
              </p>

              <div className="mt-3">
                <CreditMeter
                  remaining={tts.elevenLabs.balance.remaining}
                  limit={tts.elevenLabs.balance.characterLimit}
                />
              </div>

              {tts.elevenLabs.balance.resetAt && (
                <p className="mt-1.5 font-mono text-[11px] text-faint">
                  Reinicio de cuota {formatDateTime(tts.elevenLabs.balance.resetAt)}
                </p>
              )}

              <ul className="mt-3 divide-y divide-border border-t border-border">
                {tts.elevenLabs.keys.map((keyStatus) => (
                  <KeyRow key={keyStatus.index} keyStatus={keyStatus} />
                ))}
              </ul>
            </>
          ) : (
            <EmptyNote>
              No hay API keys configuradas, así que todos los avisos usan el motor de reserva.
            </EmptyNote>
          )}
        </div>
      </div>

      {/* The two remaining readouts sit on one row instead of two more boxes. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-sunken text-primary">
            <AudioLines className="size-5" />
          </span>
          <Readout
            label="Audios en banco"
            value={
              <>
                {status.bank.ready}{' '}
                <span className="font-normal text-muted-foreground">listos</span>,{' '}
                {status.bank.pending}{' '}
                <span className="font-normal text-muted-foreground">pendientes</span>
              </>
            }
            hint={
              status.bank.error > 0 ? (
                <span className="text-destructive">{status.bank.error} con error</span>
              ) : (
                'Solo los listos se vuelven a usar.'
              )
            }
          />
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-sunken text-primary">
            <CalendarClock className="size-5" />
          </span>
          <Readout
            label="Último job nocturno"
            value={lastJob ? formatDateTime(lastJob.startedAt) : 'Nunca'}
            hint={
              lastJob && lastJob.audiosGenerated !== null ? (
                <span className="flex items-center gap-2">
                  {jobStatus && (
                    <Badge variant="outline" className={`text-[11px] ${jobStatus.className}`}>
                      {jobStatus.label}
                    </Badge>
                  )}
                  <span className="font-mono">{lastJob.audiosGenerated} generados</span>
                </span>
              ) : (
                'Genera las locuciones del día siguiente.'
              )
            }
          />
        </div>
      </div>
    </Section>
  );
}