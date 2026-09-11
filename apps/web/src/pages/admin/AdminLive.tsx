import { useEffect, useRef, useState, useCallback } from 'react';
import { Mic, MicOff, Radio, AlertTriangle, Clock } from 'lucide-react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useAdminApi } from '@/hooks/useAdminApi';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { API_BASE_URL } from '@/config';
import type { DjAssignment, LiveRelayStatus } from '@radio/types';

const DOW_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const STATUS_POLL_MS = 15_000;
const MAX_RECONNECTS = 3;

type Phase = 'idle' | 'connecting' | 'live' | 'error';

function liveRelayUrl(): string {
  const override = import.meta.env.VITE_LIVE_RELAY_URL as string | undefined;
  if (override) return override.replace(/\/+$/, '');
  if (!API_BASE_URL) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/live-relay`;
  }
  return `${API_BASE_URL.replace(/^http/, 'ws')}/live-relay`;
}

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const mime of candidates) {
    try {
      if (window.MediaRecorder?.isTypeSupported(mime)) return mime;
    } catch {
      // Sigue con el siguiente candidato.
    }
  }
  return '';
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function formatSlots(rows: DjAssignment | undefined): string {
  if (!rows || rows.slots.length === 0) return 'Sin franjas';
  return rows.slots
    .map((s) => `${DOW_LABELS[s.dow - 1]} ${s.start}–${s.end}`)
    .join(' · ');
}

export default function AdminLive() {
  const api = useAdminApi();
  const { user, token, hasPermission } = useAdminAuth();
  const canTransmit = hasPermission('live');
  const canOverride =
    user?.role === 'SUPERADMIN' || user?.role === 'ADMIN';

  const [assignments, setAssignments] = useState<DjAssignment[]>([]);
  const [relay, setRelay] = useState<LiveRelayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>('');
  const [override, setOverride] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectsRef = useRef(0);
  const intentionalStopRef = useRef(false);
  const liveSinceRef = useRef<number>(0);

  const refreshStatus = useCallback(() => {
    api
      .getRelayStatus()
      .then((res) => setRelay(res.relay))
      .catch(() => undefined);
  }, [api]);

  useEffect(() => {
    if (!canTransmit) return;
    setLoading(true);
    api
      .getMyLive()
      .then((res) => {
        setAssignments(res.rows);
        const firstInSlot = res.rows.find((r) => r.inSlot) ?? res.rows[0];
        if (firstInSlot) setSelected(firstInSlot.streamerUsername);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
    refreshStatus();
    const poll = setInterval(refreshStatus, STATUS_POLL_MS);
    return () => clearInterval(poll);
  }, [api, canTransmit, refreshStatus]);

  useEffect(() => {
    if (!canTransmit) return;
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((all) => {
        const mics = all.filter((d) => d.kind === 'audioinput');
        setDevices(mics);
        if (mics[0] && !deviceId) setDeviceId(mics[0].deviceId);
      })
      .catch(() => undefined);
    // Solo al montar: la lista de micrófonos no cambia el resto del flujo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canTransmit]);

  const stopMeter = () => {
    cancelAnimationFrame(rafRef.current);
    setLevel(0);
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  };

  const startMeter = (stream: MediaStream) => {
    try {
      const Ctx = window.AudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 2.2));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Sin medidor no se bloquea la transmisión.
    }
  };

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    stopMeter();
    try {
      recorderRef.current?.stop();
    } catch {
      // Ya detenido.
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // Ya cerrado.
      }
      wsRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const connectAndGoLive = useCallback(
    (streamerUsername: string, useOverride: boolean) => {
      if (!token) {
        setError('Sesión inválida, vuelve a iniciar sesión.');
        setPhase('error');
        return;
      }
      setPhase('connecting');
      setError(null);
      const ws = new WebSocket(liveRelayUrl());
      wsRef.current = ws;
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', token }));
      };

      ws.onmessage = (event) => {
        let msg: { type?: string; message?: string; relay?: LiveRelayStatus };
        try {
          msg = JSON.parse(String(event.data)) as typeof msg;
        } catch {
          return;
        }
        if (msg.type === 'authed') {
          ws.send(JSON.stringify({ type: 'start', streamerUsername, override: useOverride }));
        } else if (msg.type === 'live') {
          reconnectsRef.current = 0;
          liveSinceRef.current = Date.now();
          setRelay(msg.relay ?? null);
          setPhase('live');
          setElapsed(0);
          timerRef.current = setInterval(() => {
            setElapsed(Math.floor((Date.now() - liveSinceRef.current) / 1000));
          }, 1000);
          const recorder = recorderRef.current;
          if (recorder && recorder.state === 'inactive') {
            try {
              recorder.start(1000);
            } catch (err) {
              setError('No se pudo iniciar la captura de audio.');
              setPhase('error');
            }
          }
        } else if (msg.type === 'stopped') {
          setRelay(msg.relay ?? null);
          setPhase('idle');
          cleanup();
          refreshStatus();
        } else if (msg.type === 'error') {
          setError(msg.message ?? 'Error en la transmisión.');
          setPhase('error');
          cleanup();
          refreshStatus();
        }
      };

      ws.onerror = () => {
        if (phase !== 'live') {
          setError('No se pudo conectar con el servidor de transmisión.');
          setPhase('error');
        }
      };

      ws.onclose = () => {
        if (intentionalStopRef.current) {
          intentionalStopRef.current = false;
          return;
        }
        // Corte inesperado en vivo: reintenta dentro de la ventana de gracia
        // del servidor para no cortar la señal al aire.
        if (phase === 'live' && reconnectsRef.current < MAX_RECONNECTS) {
          reconnectsRef.current += 1;
          setTimeout(() => {
            if (wsRef.current === ws) connectAndGoLive(streamerUsername, useOverride);
          }, 2000);
        } else if (phase === 'live') {
          setError('Se perdió la conexión con el servidor.');
          setPhase('error');
          cleanup();
          refreshStatus();
        }
      };
    },
    [token, phase, cleanup, refreshStatus]
  );

  const handleStart = async () => {
    if (!selected) {
      toast.error('Selecciona un DJ.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Este navegador no permite capturar micrófono.');
      setPhase('error');
      return;
    }
    intentionalStopRef.current = false;
    reconnectsRef.current = 0;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      startMeter(stream);
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          event.data.arrayBuffer().then(
            (buf) => wsRef.current?.send(buf),
            () => undefined
          );
        }
      };
      connectAndGoLive(selected, override);
    } catch {
      setError('Permiso de micrófono denegado. Autorízalo para transmitir.');
      setPhase('error');
    }
  };

  const handleStop = () => {
    intentionalStopRef.current = true;
    try {
      wsRef.current?.send(JSON.stringify({ type: 'stop' }));
    } catch {
      // El servidor detectará el cierre y detendrá el relevo.
    }
    setPhase('idle');
    setElapsed(0);
    cleanup();
    refreshStatus();
    toast.success('Transmisión detenida.');
  };

  if (!canTransmit) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <MicOff className="mx-auto h-8 w-8 text-faint" />
        <h1 className="mt-4 text-lg font-semibold">Sin permiso de transmisión</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pide al superadmin el permiso Transmitir en vivo o una asignación de DJ.
        </p>
      </div>
    );
  }

  const current = assignments.find((a) => a.streamerUsername === selected);
  const otherLive = relay?.active && phase !== 'live';
  const errMsg = axios.isAxiosError(error) ? 'Error de conexión.' : error;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-faint">
          Emisión · Solo en tu franja
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Transmitir en vivo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tu micrófono sale al aire por la señal de la estación. Usa audífonos para evitar
          acople.
        </p>
      </div>

      <Card className={phase === 'live' ? 'border-tally/50' : undefined}>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className={`h-5 w-5 ${phase === 'live' ? 'text-tally' : 'text-primary'}`} />
            Cabina en vivo
          </CardTitle>
          {phase === 'live' ? (
            <Badge variant="outline" className="border-tally/40 bg-tally/10 text-tally">
              <span className="mr-1.5 inline-block h-2 w-2 animate-tally rounded-full bg-tally" />
              EN VIVO · {formatElapsed(elapsed)}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
              Fuera del aire
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : assignments.length === 0 ? (
            <div className="py-6 text-center">
              <Mic className="mx-auto h-8 w-8 text-faint" />
              <p className="mt-3 text-sm font-medium">No tienes DJs asignados</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pide al superadmin que te asigne un DJ con su franja horaria.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>DJ</Label>
                  <Select value={selected} onValueChange={setSelected} disabled={phase !== 'idle' && phase !== 'error'}>
                    <SelectTrigger aria-label="DJ asignado">
                      <SelectValue placeholder="Selecciona tu DJ" />
                    </SelectTrigger>
                    <SelectContent>
                      {assignments.map((a) => (
                        <SelectItem key={a.id} value={a.streamerUsername}>
                          {a.streamerUsername}
                          {a.inSlot ? ' · en franja' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Micrófono</Label>
                  <Select value={deviceId} onValueChange={setDeviceId} disabled={phase === 'live' || phase === 'connecting'}>
                    <SelectTrigger aria-label="Micrófono">
                      <SelectValue placeholder="Micrófono por defecto" />
                    </SelectTrigger>
                    <SelectContent>
                      {devices.map((d) => (
                        <SelectItem key={d.deviceId} value={d.deviceId}>
                          {d.label || `Micrófono ${d.deviceId.slice(0, 6)}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
                <Clock className="h-4 w-4 shrink-0 text-faint" />
                <span className="text-muted-foreground">{formatSlots(current)}</span>
                {current?.inSlot && current.slotEndsAt && (
                  <Badge variant="outline" className="ml-auto border-success/30 bg-success/10 text-success">
                    En franja hasta {current.slotEndsAt}
                  </Badge>
                )}
                {current && !current.inSlot && (
                  <Badge variant="outline" className="ml-auto border-border bg-muted text-muted-foreground">
                    Fuera de horario
                  </Badge>
                )}
              </div>

              {(phase === 'live' || phase === 'connecting') && (
                <div>
                  <div className="mb-1 flex justify-between text-[11px] text-faint">
                    <span>Nivel de micrófono</span>
                    {phase === 'connecting' && <span>Conectando…</span>}
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Nivel de micrófono" aria-valuenow={Math.round(level * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <div
                      className={`h-full transition-[width] duration-100 ${phase === 'live' ? 'bg-success' : 'bg-primary'}`}
                      style={{ width: `${Math.round(level * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {canOverride && phase !== 'live' && (
                <label className="flex cursor-pointer items-start gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={override}
                    onChange={(e) => setOverride(e.target.checked)}
                  />
                  Transmitir fuera de franja (permiso de admin, queda en bitácora)
                </label>
              )}

              {errMsg && (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errMsg}</span>
                </div>
              )}

              {otherLive && (
                <div className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-sm text-warning">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {relay?.streamerUsername} está en vivo
                    {relay?.adminEmail ? ` (${relay.adminEmail})` : ''}. Solo una
                    transmisión a la vez.
                  </span>
                </div>
              )}

              {phase === 'live' ? (
                <Button variant="destructive" size="lg" className="w-full" onClick={handleStop}>
                  <MicOff className="h-5 w-5" />
                  Salir del aire
                </Button>
              ) : (
                <Button
                  size="lg"
                  className="w-full"
                  onClick={handleStart}
                  disabled={phase === 'connecting' || (!current?.inSlot && !override)}
                >
                  <Mic className="h-5 w-5" />
                  {phase === 'connecting' ? 'Conectando…' : 'Salir al aire'}
                </Button>
              )}
              {current && !current.inSlot && !override && (
                <p className="text-center text-xs text-faint">
                  El botón se habilita dentro de tu franja asignada.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
