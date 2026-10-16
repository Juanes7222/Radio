import { useEffect, useState } from 'react';
import { Clock, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAdminApi } from '@/hooks/useAdminApi';
import type { AdminPlaylist, PlaylistScheduleItem } from '@radio/types';
import { DAY_FULL, DAY_SHORT, minutesToTime, timeToMinutes } from './playlistLabels';

/**
 * Editor for the weekly time blocks a playlist is scheduled to play in.
 * Blocks are staged locally and persisted with the save button.
 */
export default function PlaylistScheduleDialog({
  playlist,
  onClose,
}: {
  playlist: AdminPlaylist;
  onClose: () => void;
}) {
  const { getPlaylistDetail, updatePlaylist } = useAdminApi();

  const [items, setItems] = useState<PlaylistScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState('06:00');
  const [endTime, setEndTime] = useState('07:00');

  useEffect(() => {
    let cancelled = false;
    getPlaylistDetail(playlist.id)
      .then((detail) => {
        if (!cancelled) setItems(detail.schedule_items ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo cargar el horario de la playlist.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [playlist, getPlaylistDetail]);

  const toggleDay = (day: number) => {
    setDays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day]
    );
  };

  const addItem = () => {
    setError('');
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    if (start === null || end === null || end <= start) {
      setError('Horario inválido: la hora final debe ser posterior a la inicial.');
      return;
    }
    if (days.length === 0) {
      setError('Selecciona al menos un día para el bloque.');
      return;
    }
    setItems((current) => [...current, { start_time: start, end_time: end, days: [...days].sort() }]);
    setDays([]);
  };

  const removeItem = (index: number) => {
    setItems((current) => current.filter((_, i) => i !== index));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await updatePlaylist(playlist.id, { schedule_items: items });
      onClose();
    } catch {
      setError('No se pudo guardar el horario. Revisa que los horarios no se solapen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Horario de {playlist.name}</DialogTitle>
          <DialogDescription>
            Los días y horas en que esta playlist se emite. Los cambios se guardan con el botón Guardar.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-xs text-destructive">{error}</p>}

        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 rounded-lg animate-pulse bg-muted" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-faint rounded-lg border border-border bg-card py-6 text-center">
            Esta playlist no tiene horario configurado.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item, index) => (
              <div
                key={`${item.id ?? index}-${item.start_time}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
              >
                <Clock className="w-4 h-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {minutesToTime(item.start_time)} → {minutesToTime(item.end_time)}
                  </p>
                  <p className="text-[11px] text-faint mt-0.5">
                    {item.days
                      .slice()
                      .sort((a, b) => a - b)
                      .map((day) => (
                        <span key={day} title={DAY_FULL[day - 1]} className="mr-1.5 last:mr-0">
                          {DAY_SHORT[day - 1]}
                        </span>
                      ))}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => removeItem(index)}
                  title="Quitar bloque"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-border bg-card p-3 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Nuevo bloque</p>
          <div className="flex flex-wrap gap-1.5">
            {DAY_FULL.map((dayLabel, index) => {
              const day = index + 1;
              const selected = days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`h-8 px-2.5 rounded-lg text-xs font-medium transition-colors ${
                    selected
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-faint hover:text-foreground'
                  }`}
                  title={dayLabel}
                >
                  {DAY_SHORT[index]}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-32 bg-sunken border-input" />
            <span className="text-faint">→</span>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-32 bg-sunken border-input" />
            <Button variant="outline" size="sm" className="gap-1.5" onClick={addItem}>
              <Plus className="w-3.5 h-3.5" />
              Agregar bloque
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={() => void save()} disabled={saving || loading}>
            {saving ? 'Guardando...' : 'Guardar horario'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
