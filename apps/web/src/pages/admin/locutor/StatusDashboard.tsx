import { useCallback, useEffect, useState } from 'react';
import { Cpu, AudioLines, CalendarClock, KeyRound, Radio } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAdminApi } from '@/hooks/useAdminApi';
import { toast } from 'sonner';
import type { LocutorStatus, TtsKeyStatus, TtsProviderId } from '@radio/types';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  success: { label: 'Exitoso', color: 'bg-success/10 text-success border-success/20' },
  partial: { label: 'Parcial', color: 'bg-warning/10 text-warning border-warning/20' },
  running: { label: 'En ejecución', color: 'bg-info/10 text-info border-info/20' },
  error: { label: 'Error', color: 'bg-destructive/10 text-destructive border-destructive/20' },
};

const PROVIDER_LABELS: Record<TtsProviderId, string> = {
  elevenlabs: 'ElevenLabs',
  kokoro: 'Kokoro',
};

const KEY_BLOCK_LABELS: Record<string, string> = {
  quota: 'Sin cuota',
  invalid: 'Key inválida',
  transient: 'Fallo temporal',
};

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '—';
}

function formatRemaining(used: number | null, limit: number | null): string {
  if (used === null || limit === null) return '—';
  return `${Math.max(0, limit - used).toLocaleString()} de ${limit.toLocaleString()}`;
}

interface StatusCardProps {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}

function StatusCard({ title, icon: Icon, children }: StatusCardProps) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <p className="flex items-center gap-2 text-xs font-medium text-faint">
          <Icon className="w-4 h-4" />
          {title}
        </p>
        <div className="mt-2 text-sm text-foreground">{children}</div>
      </CardContent>
    </Card>
  );
}

/**
 * One row per API key. The key itself never leaves the backend: only the last
 * four characters, enough to tell two accounts apart when one runs out of
 * credits and the other does not.
 */
function KeyRow({ keyStatus }: { keyStatus: TtsKeyStatus }) {
  const badge = keyStatus.available
    ? { label: 'Libre', color: 'bg-success/10 text-success border-success/20' }
    : {
        label: KEY_BLOCK_LABELS[keyStatus.blockReason ?? ''] ?? 'Bloqueada',
        color: 'bg-destructive/10 text-destructive border-destructive/20',
      };

  return (
    <li className="flex items-center justify-between gap-3 py-1">
      <span className="font-mono text-xs text-muted-foreground">
        {keyStatus.hint}
        {keyStatus.inFlight > 0 && <span className="ml-2 text-info">en uso</span>}
      </span>
      <span className="flex items-center gap-2">
        {keyStatus.balance.remaining !== null && (
          <span className="text-xs text-faint">
            {keyStatus.balance.remaining.toLocaleString()} caracteres
          </span>
        )}
        {keyStatus.blockedUntil && (
          <span className="text-xs text-faint">hasta {formatDateTime(keyStatus.blockedUntil)}</span>
        )}
        <Badge variant="outline" className={`text-xs border ${badge.color}`}>
          {badge.label}
        </Badge>
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
      setError('Error al obtener el estado del sistema.');
    }
  }, [getLocutorStatus]);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      await loadStatus();
    };

    void poll();
    const interval = setInterval(poll, 30000);
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

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estado del Sistema TTS</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return <div className="text-sm text-muted-foreground">Cargando estado del sistema...</div>;
  }

  const lastJobConfig = status.last_job ? STATUS_LABELS[status.last_job.status] : null;
  const { tts } = status;
  const usingFallback = tts.preferredProvider === 'kokoro' && tts.elevenLabs.configured;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Estado del Sistema TTS</CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => void handleTest()}
            disabled={testing}
            title="Genera una locución de prueba y actualiza el saldo de créditos"
          >
            <Radio className={`w-3.5 h-3.5 ${testing ? 'animate-pulse' : ''}`} />
            Probar la voz
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatusCard title="Motor de voz" icon={Cpu}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={`text-xs border ${
                  tts.preferredProvider === 'elevenlabs'
                    ? 'bg-success/10 text-success border-success/20'
                    : usingFallback
                      ? 'bg-warning/10 text-warning border-warning/20'
                      : 'bg-info/10 text-info border-info/20'
                }`}
              >
                {PROVIDER_LABELS[tts.preferredProvider]}
              </Badge>
              {usingFallback && (
                <span className="text-xs text-warning">
                  Sin keys de ElevenLabs: se está usando el motor de reserva.
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-faint">
              Última locución: {tts.lastProvider ? PROVIDER_LABELS[tts.lastProvider] : '—'}
              {tts.lastProviderAt && ` · ${formatDateTime(tts.lastProviderAt)}`}
            </p>
            <p className="text-xs text-faint">
              {tts.fallbackCount === 0
                ? 'Sin caídas al motor de reserva.'
                : `${tts.fallbackCount} caída(s) al motor de reserva desde que arrancó el proceso.`}
            </p>
          </StatusCard>

          <StatusCard title="Audios en banco" icon={AudioLines}>
            <span>
              {status.bank.ready} listos, {status.bank.pending} pendientes
            </span>
            {status.bank.error > 0 && (
              <span className="text-destructive">, {status.bank.error} con error</span>
            )}
          </StatusCard>

          <StatusCard title="Último job nocturno" icon={CalendarClock}>
            <p>
              {status.last_job ? new Date(status.last_job.startedAt).toLocaleString() : 'Nunca'}
            </p>
            {status.last_job && lastJobConfig && (
              <Badge variant="outline" className={`mt-1 text-xs border ${lastJobConfig.color}`}>
                {lastJobConfig.label}
              </Badge>
            )}
          </StatusCard>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatusCard title="Credits de ElevenLabs" icon={KeyRound}>
            {!tts.elevenLabs.configured ? (
              <p className="text-muted-foreground">
                No hay API keys configuradas. Todos los avisos usan Kokoro.
              </p>
            ) : (
              <>
                <p>
                  {tts.elevenLabs.availableKeys} de {tts.elevenLabs.keys.length} keys libres
                </p>
                <p className="text-xs text-faint">
                  {formatRemaining(
                    tts.elevenLabs.balance.charactersUsed,
                    tts.elevenLabs.balance.characterLimit
                  )}{' '}
                  caracteres restantes en el pool · modelo {tts.elevenLabs.modelId}
                </p>
                {tts.elevenLabs.balance.resetAt && (
                  <p className="text-xs text-faint">
                    Reinicio de cuota: {formatDateTime(tts.elevenLabs.balance.resetAt)}
                  </p>
                )}
                <ul className="mt-2 divide-y divide-border border-t border-border">
                  {tts.elevenLabs.keys.map((keyStatus) => (
                    <KeyRow key={keyStatus.index} keyStatus={keyStatus} />
                  ))}
                </ul>
              </>
            )}
          </StatusCard>

          <StatusCard title="Kokoro (motor de reserva)" icon={Cpu}>
            <Badge
              variant="outline"
              className={`text-xs border ${
                tts.kokoroReachable
                  ? 'bg-success/10 text-success border-success/20'
                  : 'bg-destructive/10 text-destructive border-destructive/20'
              }`}
            >
              {tts.kokoroReachable ? 'En línea' : 'Inactivo'}
            </Badge>
            <p className="mt-2 text-xs text-faint">
              Solo se consulta si ninguna key externa está disponible.
            </p>
          </StatusCard>
        </div>
      </CardContent>
    </Card>
  );
}
