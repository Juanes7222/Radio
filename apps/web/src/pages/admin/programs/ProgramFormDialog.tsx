import { useMemo, useState } from 'react';
import { ImagePlus, ImageOff, Loader2, Upload, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAdminApi } from '@/hooks/useAdminApi';
import type { Program } from '@radio/types';
import {
  ALL_DAYS_MASK,
  DAY_NAMES,
  SCHEDULE_MODE_HINTS,
  SCHEDULE_MODE_LABELS,
  daysMaskToSet,
  errorMessage,
  setToDaysMask,
} from './shared';

interface Props {
  open: boolean;
  program: Program | null;
  onClose: () => void;
  onSaved: (program: Program) => void;
}

interface FormState {
  name: string;
  description: string;
  artist: string;
  album: string;
  genre: string;
  fadeSeconds: string;
  scheduleMode: 'none' | 'auto' | 'manual';
  daysMask: number;
  airStart: string;
  airEnd: string;
  daysAhead: string;
  leadMinutes: string;
  bufferMinutes: string;
  active: boolean;
}

function initialForm(program: Program | null): FormState {
  return {
    name: program?.name ?? '',
    description: program?.description ?? '',
    artist: program?.artist ?? '',
    album: program?.album ?? '',
    genre: program?.genre ?? '',
    fadeSeconds: program ? String(program.fadeSeconds) : '0.3',
    scheduleMode: program?.scheduleMode ?? 'none',
    daysMask: program?.daysMask ?? ALL_DAYS_MASK,
    airStart: program?.airStart ?? '',
    airEnd: program?.airEnd ?? '',
    daysAhead: program ? String(program.daysAhead) : '7',
    leadMinutes: program ? String(program.leadMinutes) : '10',
    bufferMinutes: program ? String(program.bufferMinutes) : '2',
    active: program?.active ?? true,
  };
}

export function ProgramFormDialog({ open, program, onClose, onSaved }: Props) {
  const { createProgram, updateProgram, uploadProgramArtwork, clearProgramArtwork, uploadProgramAsset, clearProgramAsset } =
    useAdminApi();

  const [form, setForm] = useState<FormState>(() => initialForm(program));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [artwork, setArtwork] = useState<File | null>(null);
  const [artworkPreview, setArtworkPreview] = useState<string | null>(program?.artUrl ?? null);
  const [introFile, setIntroFile] = useState<File | null>(null);
  const [outroFile, setOutroFile] = useState<File | null>(null);
  const [assetBusy, setAssetBusy] = useState<'intro' | 'outro' | null>(null);

  const selectedDays = useMemo(() => daysMaskToSet(form.daysMask), [form.daysMask]);

  const toggleDay = (dayIndex: number) => {
    setForm((current) => {
      const next = daysMaskToSet(current.daysMask);
      if (next.has(dayIndex)) next.delete(dayIndex);
      else next.add(dayIndex);
      return { ...current, daysMask: setToDaysMask(next) };
    });
  };

  const handleArtworkPick = (file: File | null) => {
    setArtwork(file);
    setArtworkPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (name.length === 0) {
      setError('El nombre del programa es obligatorio.');
      return;
    }
    if (selectedDays.size === 0) {
      setError('Selecciona al menos un día de emisión.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name,
        description: form.description || null,
        artist: form.artist || null,
        album: form.album || null,
        genre: form.genre || null,
        fadeSeconds: Number(form.fadeSeconds) || 0,
        scheduleMode: form.scheduleMode,
        daysMask: form.daysMask,
        airStart: form.airStart || null,
        airEnd: form.airEnd || null,
        daysAhead: Number(form.daysAhead) || 7,
        leadMinutes: Number(form.leadMinutes) || 0,
        bufferMinutes: Number(form.bufferMinutes) || 0,
        active: form.active,
      };

      const saved = program
        ? await updateProgram(program.id, payload)
        : await createProgram(payload);

      if (artwork) {
        onSaved(await uploadProgramArtwork(saved.id, artwork));
      } else if (artworkPreview === null && program?.artUrl) {
        onSaved(await clearProgramArtwork(saved.id));
      } else {
        onSaved(saved);
      }

      onClose();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar el programa.'));
    } finally {
      setSaving(false);
    }
  };

  const uploadAsset = async (kind: 'intro' | 'outro', file: File | null) => {
    if (!program) return;
    setAssetBusy(kind);
    setError(null);
    try {
      const saved = file
        ? await uploadProgramAsset(program.id, kind, file)
        : await clearProgramAsset(program.id, kind);
      onSaved(saved);
      setIntroFile(null);
      setOutroFile(null);
    } catch (err) {
      setError(errorMessage(err, 'No se pudo procesar el audio.'));
    } finally {
      setAssetBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{program ? 'Editar programa' : 'Nuevo programa'}</DialogTitle>
          <DialogDescription>
            Se crea una playlist secuencial en AzuraCast y las carpetas NO REPRODUCIDOS / REPRODUCIDOS en la
            biblioteca.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="program-name">Nombre</Label>
            <Input
              id="program-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Charlas de fe"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="program-description">Descripción</Label>
            <Input
              id="program-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Opcional"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="program-artist">Autor (metadatos)</Label>
              <Input
                id="program-artist"
                value={form.artist}
                onChange={(e) => setForm((f) => ({ ...f, artist: e.target.value }))}
                placeholder={form.name || 'Nombre del programa'}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="program-album">Álbum (metadatos)</Label>
              <Input
                id="program-album"
                value={form.album}
                onChange={(e) => setForm((f) => ({ ...f, album: e.target.value }))}
                placeholder={form.name || 'Nombre del programa'}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="program-genre">Género</Label>
              <Input
                id="program-genre"
                value={form.genre}
                onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="program-fade">Fundido en los bordes (segundos)</Label>
              <Input
                id="program-fade"
                type="number"
                min={0}
                max={5}
                step={0.1}
                value={form.fadeSeconds}
                onChange={(e) => setForm((f) => ({ ...f, fadeSeconds: e.target.value }))}
              />
            </div>
          </div>

          <Card className="border-border bg-muted/40">
            <CardContent className="pt-4 space-y-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                Imagen por defecto
              </p>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 shrink-0 overflow-hidden rounded-lg border border-border bg-sunken">
                  {artworkPreview ? (
                    <img src={artworkPreview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-faint">
                      <ImageOff className="w-5 h-5" />
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-xs hover:bg-primary/10">
                    <ImagePlus className="w-3.5 h-3.5" />
                    {artwork ? 'Cambiar' : 'Subir imagen'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                      className="hidden"
                      onChange={(e) => handleArtworkPick(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  {artworkPreview && (
                    <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => handleArtworkPick(null)}>
                      <X className="w-3.5 h-3.5" />
                      Quitar
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-faint">
                Se aplica a cada episodio que se suba sin imagen propia.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border bg-muted/40">
            <CardContent className="pt-4 space-y-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                Intro y outro
              </p>
              {(['intro', 'outro'] as const).map((kind) => {
                const hasAsset = kind === 'intro' ? Boolean(program?.hasIntro) : Boolean(program?.hasOutro);
                const pending = kind === 'intro' ? introFile : outroFile;
                return (
                  <div key={kind} className="flex items-center gap-2">
                    <span className="w-14 font-mono text-xs uppercase text-faint">{kind}</span>
                    <label className="inline-flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs hover:bg-primary/10">
                      <Upload className="w-3.5 h-3.5" />
                      <span className="truncate">
                        {pending
                          ? pending.name
                          : hasAsset
                            ? 'Ya configurado (reemplazar)'
                            : 'Sin configurar'}
                      </span>
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          if (kind === 'intro') setIntroFile(file);
                          else setOutroFile(file);
                          if (program && file) void uploadAsset(kind, file);
                        }}
                      />
                    </label>
                    {assetBusy === kind && <Loader2 className="w-4 h-4 animate-spin text-faint" />}
                    {!pending && hasAsset && program && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void uploadAsset(kind, null)}
                        disabled={assetBusy !== null}
                      >
                        Quitar
                      </Button>
                    )}
                  </div>
                );
              })}
              {!program && (
                <p className="text-xs text-faint">
                  Guarda el programa una vez para poder adjuntar intro y outro.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="space-y-1.5">
            <Label>Programación</Label>
            <Select
              value={form.scheduleMode}
              onValueChange={(value) =>
                setForm((f) => ({ ...f, scheduleMode: value as FormState['scheduleMode'] }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SCHEDULE_MODE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-faint">{SCHEDULE_MODE_HINTS[form.scheduleMode]}</p>
          </div>

          {form.scheduleMode !== 'none' && (
            <>
              <div className="space-y-1.5">
                <Label>Días de emisión</Label>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_NAMES.map((day, index) => {
                    const dayIndex = index + 1;
                    const active = selectedDays.has(dayIndex);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(dayIndex)}
                        className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                          active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="air-start">Desde (HH:MM)</Label>
                  <Input
                    id="air-start"
                    value={form.airStart}
                    onChange={(e) => setForm((f) => ({ ...f, airStart: e.target.value }))}
                    placeholder="06:00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="air-end">Hasta (HH:MM)</Label>
                  <Input
                    id="air-end"
                    value={form.airEnd}
                    onChange={(e) => setForm((f) => ({ ...f, airEnd: e.target.value }))}
                    placeholder="22:00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="days-ahead">Buscar días</Label>
                  <Input
                    id="days-ahead"
                    type="number"
                    min={1}
                    max={60}
                    value={form.daysAhead}
                    onChange={(e) => setForm((f) => ({ ...f, daysAhead: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-minutes">Antelación (min)</Label>
                  <Input
                    id="lead-minutes"
                    type="number"
                    min={0}
                    max={1440}
                    value={form.leadMinutes}
                    onChange={(e) => setForm((f) => ({ ...f, leadMinutes: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="buffer-minutes">Margen entre programas</Label>
                  <Input
                    id="buffer-minutes"
                    type="number"
                    min={0}
                    max={60}
                    value={form.bufferMinutes}
                    onChange={(e) => setForm((f) => ({ ...f, bufferMinutes: e.target.value }))}
                  />
                </div>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="program-active">Estado</Label>
            <Select
              value={form.active ? 'active' : 'inactive'}
              onValueChange={(value) => setForm((f) => ({ ...f, active: value === 'active' }))}
            >
              <SelectTrigger id="program-active">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="inactive">Inactivo</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-faint">
              El tipo de programa en la programación pública se asigna desde Tipos de programa, usando el
              nombre del programa como palabra clave.
            </p>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}