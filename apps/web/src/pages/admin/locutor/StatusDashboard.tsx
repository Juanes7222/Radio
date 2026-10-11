import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAdminApi } from '@/hooks/useAdminApi';
import { toast } from 'sonner';
import type { LocutorStatus, TtsKeyStatus, TtsProviderId } from '@radio/types';
import { Section, EmptyNote, Faceplate, FaceplateReading } from './Section';

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
 * The unit's verdict lamp: lit green while ElevenLabs keys are free, warning
 * amber while the fallback is carrying the voice, dark when nothing speaks.
 */
function engineLamp(status: LocutorStatus): string {
  const { tts } = status;
  if (tts.preferredProvider === 'elevenlabs' && tts.elevenLabs.availableKeys > 0) {
    return 'bg-success';
  }
  if (tts.elevenLabs.configured) return 'bg-warning';
  return 'bg-faint/40';
}

function engineVerdict(status: LocutorStatus): string {
  const { tts } = status;
  if (tts.preferredProvider === 'elevenlabs' && tts.elevenLabs.availableKeys > 0) {
    return 'ElevenLabs responde hoy';
  }
  if (tts.elevenLabs.configured) {
    return 'ElevenLabs sin keys: el motor de reserva Kokoro lleva la voz';
  }
  return 'Kokoro responde hoy: sin API keys configuradas';
}

/**
 * Character balance as a drawn bar: "how much is left" becomes a glance
 * instead of a subtraction. Same gesture as the panel's key table, so the
 * two readouts of the same pool agree.
 */
function CreditMeter({
  remaining,
  limit,
}: {
  remaining: number | null;
  limit: number | null;
}) {
  if (remaining === null || limit === null || limit <= 0) return null;

  const pct = Math.max(0, Math.min(100, (remaining / limit) * 100));
  const tone = pct > 40 ? 'bg-success' : pct > 15 ? 'bg-warning' : 'bg-destructive';

  return (
    <div
      role="meter"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Caracteres restantes en el pool de keys"
      className="mt-1 h-1 overflow-hidden rounded-full bg-border/60"
    >
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * One row per API key, printed as data rather than boxed. The key itself
 * never leaves the backend: only the last four characters, enough to tell
 * two accounts apart when one runs out of credits and the other does not.
 */
function KeyRow({ keyStatus }: { keyStatus: TtsKeyStatus }) {
  const available = keyStatus.available;
  const rowTone = available
    ? 'text-success'
    : keyStatus.blockReason === 'transient'
      ? 'text-warning'
      : 'text-destructive';

  return (
    <li className="flex items-baseline gap-3 py-2">
      <span
        aria-hidden
        className={`size-1.5 shrink-0 translate-y-[-1px] self-center rounded-full ${
          available ? 'bg-success' : keyStatus.blockReason === 'transient' ? 'bg-warning' : 'bg-destructive'
        }`}
      />
      <span className="font-mono text-xs text-foreground">{keyStatus.hint}</span>
      {keyStatus.inFlight > 0 && (
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-info">en uso</span>
      )}
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-faint">
        {keyStatus.balance.remaining !== null &&
          `${keyStatus.balance.remaining.toLocaleString('es-CO')} car`}
        {keyStatus.blockedUntil && ` · hasta ${formatDateTime(keyStatus.blockedUntil)}`}
      </span>
      <span className={`shrink-0 text-[11px] ${rowTone}`}>
        {available ? 'Libre' : (KEY_BLOCK_LABELS[keyStatus.blockReason ?? ''] ?? 'Bloqueada')}
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
      <Section title="Motor de voz">
        <EmptyNote
          action={
            <Button variant="outline" size="sm" onClick={() => void loadStatus()}>
              Reintentar
            </Button>
          }
        >
          El estado del motor no está disponible. {error}
        </EmptyNote>
      </Section>
    );
  }

  if (!status) {
    return (
      <Section title="Motor de voz">
        <div className="h-16 animate-pulse rounded-xl bg-sunken" />
      </Section>
    );
  }

  const { tts } = status;
  const lastJob = status.last_job;
  const jobStatus = lastJob ? JOB_STATUS[lastJob.status] : null;

  return (
    <Section
      title="Motor de voz"
      actions={
        <Button variant="outline" size="sm" className="gap-2" onClick={() => void handleTest()} disabled={testing}>
          <Radio className={`size-3.5 ${testing ? 'animate-pulse' : ''}`} />
          Probar la voz
        </Button>
      }
    >
      <div className="space-y-4">
        {/* The faceplate is the unit's headline: which engine speaks and how
            much it has left, at one glance and at top-bar scale. */}
        <Faceplate
          lamp={engineLamp(status)}
          label="Motor activo"
          verdict={engineVerdict(status)}
          slots={[
            <FaceplateReading key="keys" label="Keys libres">
              {tts.elevenLabs.configured
                ? `${tts.elevenLabs.availableKeys} / ${tts.elevenLabs.keys.length}`
                : '—'}
            </FaceplateReading>,
            <FaceplateReading key="balance" label="Última locución">
              {tts.lastProvider ? PROVIDER_LABELS[tts.lastProvider] : '—'}
            </FaceplateReading>,
          ]}
        />

        {/* The same pool, drawn: the bar agrees with the key rows below it. */}
        {tts.elevenLabs.configured && (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                <KeyRound className="size-3" />
                Saldo del pool
              </p>
              <span className="font-mono text-xs tabular-nums text-foreground">
                {tts.elevenLabs.balance.remaining !== null
                  ? `${tts.elevenLabs.balance.remaining.toLocaleString('es-CO')} / ${tts.elevenLabs.balance.characterLimit?.toLocaleString('es-CO') ?? '—'} car`
                  : 'Se lee al probar la voz'}
              </span>
            </div>
            <CreditMeter
              remaining={tts.elevenLabs.balance.remaining}
              limit={tts.elevenLabs.balance.characterLimit}
            />
            {tts.elevenLabs.balance.resetAt && (
              <p className="mt-1.5 font-mono text-[11px] text-faint">
                Reinicio de cuota {formatDateTime(tts.elevenLabs.balance.resetAt)} · modelo{' '}
                {tts.elevenLabs.modelId}
              </p>
            )}
          </div>
        )}

        {tts.elevenLabs.configured ? (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
              Keys
            </p>
            <ul className="mt-1 divide-y divide-border border-y border-border">
              {tts.elevenLabs.keys.map((keyStatus) => (
                <KeyRow key={keyStatus.index} keyStatus={keyStatus} />
              ))}
            </ul>
          </div>
        ) : (
          <EmptyNote>
            No hay API keys configuradas, así que todos los avisos usan el motor de reserva Kokoro.
          </EmptyNote>
        )}

        {/* The remaining readouts, printed as data on one ruled row instead of
            two more boxes competing with the faceplate. */}
        <dl className="grid gap-x-8 gap-y-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0">
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
              Audios en banco
            </dt>
            <dd className="mt-1 text-sm text-foreground">
              {status.bank.ready}{' '}
              <span className="text-muted-foreground">listos</span>, {status.bank.pending}{' '}
              <span className="text-muted-foreground">pendientes</span>
              {status.bank.error > 0 && (
                <span className="text-destructive">, {status.bank.error} con error</span>
              )}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
              Último job nocturno
            </dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm text-foreground">
              {lastJob ? formatDateTime(lastJob.startedAt) : 'Nunca'}
              {jobStatus && (
                <Badge variant="outline" className={`text-[11px] ${jobStatus.className}`}>
                  {jobStatus.label}
                </Badge>
              )}
            </dd>
            <dd className="mt-0.5 text-xs text-faint">
              {lastJob && lastJob.audiosGenerated !== null
                ? `${lastJob.audiosGenerated} audios generados`
                : 'Genera las locuciones del día siguiente.'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
              Caídas a reserva
            </dt>
            <dd
              className={`mt-1 text-sm tabular-nums ${
                tts.fallbackCount > 0 ? 'text-warning' : 'text-foreground'
              }`}
            >
              {tts.fallbackCount}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
              Kokoro (reserva)
            </dt>
            <dd
              className={`mt-1 text-sm ${
                tts.kokoroReachable ? 'text-success' : 'text-faint'
              }`}
            >
              {tts.kokoroReachable ? 'En línea' : 'Inactivo'}
            </dd>
          </div>
        </dl>
      </div>
    </Section>
  );
}
