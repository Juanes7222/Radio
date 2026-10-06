import { useEffect, useState } from 'react';
import {
  AudioWaveform,
  CalendarClock,
  ImagePlus,
  Loader2,
  Music4,
  RefreshCw,
  Send,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAdminApi } from '@/hooks/useAdminApi';
import { toast } from 'sonner';
import type { Program, ProgramEpisode, ProgramSlotSuggestion } from '@radio/types';
import { DAY_NAMES, errorMessage } from './shared';

const DEFAULT_ESTIMATE_SEC = 1800;

/** Rough estimate at the 128 kbps the composer outputs, used only to size the slot. */
function estimateDurationSec(file: File | null): number {
  if (!file || file.size <= 0) return DEFAULT_ESTIMATE_SEC;
  return Math.max(60, Math.ceil(file.size / 16_000));
}

interface PreparedEpisode {
  episode: ProgramEpisode;
  previewUrl: string;
}

interface Props {
  open: boolean;
  program: Program;
  onClose: () => void;
  onUploaded: () => void;
}

export function EpisodeUploadDialog({ open, program, onClose, onUploaded }: Props) {
  const { prepareProgramEpisode, publishProgramEpisode, fetchProgramEpisodePreview, deleteProgramEpisode, getProgramSlot } =
    useAdminApi();

  const [audio, setAudio] = useState<File | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [dayIndex, setDayIndex] = useState('1');
  const [startTime, setStartTime] = useState('18:00');
  const [normalizeLoudness, setNormalizeLoudness] = useState(true);
  const [reduceNoise, setReduceNoise] = useState(false);

  const [prepared, setPrepared] = useState<PreparedEpisode | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [slot, setSlot] = useState<ProgramSlotSuggestion | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || program.scheduleMode !== 'auto') return;
    const cancelled = false;
    getProgramSlot(program.id, estimateDurationSec(audio))
      .then(({ slot: found }) => {
        if (!cancelled) setSlot(found);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSlot(null);
        setSlotError(errorMessage(err, 'No se encontró una franja libre.'));
      });
    // The estimate only sizes the first preview of the slot; after preparing, the
    // exact duration from ffprobe replaces it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, getProgramSlot, program.id, program.scheduleMode]);

  /** Throws away a draft whose inputs no longer match what is on screen. */
  const discardPrepared = async () => {
    const current = prepared;
    setPrepared(null);
    setSlot(null);
    if (current) URL.revokeObjectURL(current.previewUrl);
    if (current) {
      deleteProgramEpisode(current.episode.id).catch(() => undefined);
    }
  };

  const resetPreview = () => {
    void discardPrepared();
    setError(null);
  };

  const handlePrepare = async () => {
    if (!audio) {
      setError('Selecciona el archivo de audio del episodio.');
      return;
    }

    setPreparing(true);
    setUploadProgress(0);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', audio);
      if (image) form.append('image', image);
      form.append('title', title);
      form.append('normalizeLoudness', String(normalizeLoudness));
      form.append('reduceNoise', String(reduceNoise));

      const result = await prepareProgramEpisode(program.id, form, setUploadProgress);
      for (const warning of result.warnings) toast.warning(warning);

      const previewUrl = await fetchProgramEpisodePreview(result.episode.id);
      setPrepared({ episode: result.episode, previewUrl });
      onUploaded();

      // The composed duration is exact, so the reserved window can be exact too.
      if (program.scheduleMode === 'auto' && result.episode.durationSec) {
        getProgramSlot(program.id, result.episode.durationSec)
          .then(({ slot: found }) => setSlot(found))
          .catch(() => setSlot(null));
      }
    } catch (err) {
      setError(errorMessage(err, 'No se pudo preparar el episodio.'));
    } finally {
      setPreparing(false);
      setUploadProgress(null);
    }
  };

  const handlePublish = async () => {
    if (!prepared) return;

    setPublishing(true);
    setError(null);
    try {
      await publishProgramEpisode(
        prepared.episode.id,
        program.scheduleMode === 'manual' ? { dayIndex: Number(dayIndex), startTime } : {}
      );
      toast.success('Episodio publicado. Se archiverá solo cuando se haya emitido.');
      URL.revokeObjectURL(prepared.previewUrl);
      setPrepared(null);
      onUploaded();
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo publicar el episodio.'));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Subir episodio · {program.name}</DialogTitle>
          <DialogDescription>
            Se compone con {program.hasIntro ? 'la intro' : 'sin intro'}
            {program.hasIntro && program.hasOutro ? ' y ' : ''}
            {program.hasOutro ? 'el outro' : ''}, con los metadatos y la imagen del programa. Escúchalo antes
            de publicarlo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Audio del episodio</Label>
            <label
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-center ${
                prepared ? 'pointer-events-none opacity-50' : 'hover:bg-primary/5'
              }`}
            >
              <Music4 className="w-5 h-5 text-faint" />
              {audio ? (
                <span className="text-sm">{audio.name}</span>
              ) : (
                <span className="text-sm text-faint">Selecciona el archivo (mp3, m4a, wav, ogg)</span>
              )}
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setAudio(file);
                  setTitle((current) => current || (file ? file.name.replace(/\.[a-z0-9]+$/i, '') : ''));
                  resetPreview();
                }}
              />
            </label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="episode-title">Título del episodio</Label>
            <Input
              id="episode-title"
              value={title}
              disabled={prepared !== null}
              onChange={(e) => {
                setTitle(e.target.value);
                resetPreview();
              }}
              placeholder="Se arma con el nombre del archivo, capitalizado y sin tildes"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Imagen del episodio (opcional)</Label>
            <label
              className={`inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs ${
                prepared ? 'pointer-events-none opacity-50' : 'cursor-pointer hover:bg-primary/10'
              }`}
            >
              <ImagePlus className="w-3.5 h-3.5" />
              {image ? image.name : program.artUrl ? 'Usar la imagen del programa' : 'Sin imagen'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                className="hidden"
                onChange={(e) => {
                  setImage(e.target.files?.[0] ?? null);
                  resetPreview();
                }}
              />
            </label>
          </div>

          <Card className="border-border bg-muted/40">
            <CardContent className="pt-4 space-y-2.5">
              <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                <AudioWaveform className="w-3.5 h-3.5" />
                Ajuste de audio
              </p>
              <label className={`flex items-start gap-2.5 ${prepared ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={normalizeLoudness}
                  onChange={(e) => {
                    setNormalizeLoudness(e.target.checked);
                    resetPreview();
                  }}
                  className="mt-0.5 accent-[hsl(var(--primary))]"
                />
                <span className="space-y-0.5">
                  <span className="block text-sm">Normalizar volumen</span>
                  <span className="block text-xs text-faint">
                    Iguala el episodio al nivel de emisión (EBU R128, -16 LUFS). Útil cuando la persona grabó
                    con otro micrófono o a otra distancia.
                  </span>
                </span>
              </label>
              <label className={`flex items-start gap-2.5 ${prepared ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={reduceNoise}
                  onChange={(e) => {
                    setReduceNoise(e.target.checked);
                    resetPreview();
                  }}
                  className="mt-0.5 accent-[hsl(var(--primary))]"
                />
                <span className="space-y-0.5">
                  <span className="block text-sm">Reducir ruido de fondo</span>
                  <span className="block text-xs text-faint">
                    Atenúa el siseo del grabador. Se aplica antes de normalizar, así que activa también el
                    volumen para que la voz quede consistente.
                  </span>
                </span>
              </label>
            </CardContent>
          </Card>

          {prepared ? (
            <Card className="border-primary/40 bg-primary/5">
              <CardContent className="pt-4 space-y-2">
                <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
                  <Sparkles className="w-3.5 h-3.5" />
                  Escucha antes de publicar
                </p>
                <audio
                  key={prepared.previewUrl}
                  src={prepared.previewUrl}
                  controls
                  preload="metadata"
                  className="w-full"
                />
                <p className="font-mono text-[11px] text-faint">
                  {prepared.episode.durationSec ? formatClock(prepared.episode.durationSec) : ''} · esta es
                  exactamente la versión que se enviará
                </p>
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void discardPrepared()}>
                  <RefreshCw className="w-3.5 h-3.5" />
                  Descartar y cambiar ajustes
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Button
              variant="outline"
              className="w-full gap-2"
              disabled={!audio || preparing}
              onClick={() => void handlePrepare()}
            >
              {preparing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {preparing ? 'Componiendo el episodio...' : 'Preparar y escuchar'}
            </Button>
          )}

          {uploadProgress !== null && <Progress value={uploadProgress} className="h-1.5" />}

          {program.scheduleMode === 'auto' && (
            <Card className="border-border bg-muted/40">
              <CardContent className="pt-4 space-y-2">
                <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                  <CalendarClock className="w-3.5 h-3.5" />
                  Franja reservada
                </p>
                {slot ? (
                  <p className="text-sm">
                    {DAY_NAMES[(slot.dayIndex - 1) % 7]} {slot.startTime} – {slot.endTime}
                    <span className="ml-2 font-mono text-xs text-faint">{slot.dayKey}</span>
                  </p>
                ) : (
                  <p className="text-sm text-faint">
                    {slotError ?? (prepared ? 'Calculando con la duración exacta...' : 'Sin franja reservada.')}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {program.scheduleMode === 'manual' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Día</Label>
                <Select value={dayIndex} onValueChange={setDayIndex}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_NAMES.map((day, index) => (
                      <SelectItem key={day} value={String(index + 1)}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="episode-start">Hora de inicio</Label>
                <Input
                  id="episode-start"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  placeholder="18:00"
                />
              </div>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={publishing}>
            Cancelar
          </Button>
          <Button
            size="sm"
            className="gap-2"
            disabled={!prepared || publishing}
            onClick={() => void handlePublish()}
          >
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Publicar y programar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatClock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}