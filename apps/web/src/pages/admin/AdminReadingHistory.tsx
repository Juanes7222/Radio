import { useEffect, useMemo, useState, useCallback } from 'react';
import { BookOpen, RefreshCw, CalendarDays } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAdminApi } from '@/hooks/useAdminApi';
import { formatChapters } from '@/lib/format';
import type { BibleReadingHistoryEntry } from '@radio/types';

const STATUS_LABELS: Record<string, string> = {
  success: 'Correcta',
  partial: 'Parcial',
  error: 'Error',
};

const DAY_NAMES = [
  'domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado',
];
const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Clave YYYY-MM-DD de un día en la zona horaria de la estación (Bogotá). */
function bogotaKey(offsetDays: number): string {
  const target = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(target);
}

/** "lunes, 15 de agosto" a partir de una clave YYYY-MM-DD. */
function formatDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${DAY_NAMES[date.getDay()]}, ${day} de ${MONTH_NAMES[month - 1]}`;
}

type RangeFilter = 'all' | '7' | '30';

const RANGE_OPTIONS: { value: RangeFilter; label: string }[] = [
  { value: 'all', label: 'Todo' },
  { value: '7', label: '7 días' },
  { value: '30', label: '30 días' },
];

function StatusBadge({ status }: { status: BibleReadingHistoryEntry['status'] }) {
  return (
    <Badge
      variant={status === 'success' ? 'default' : status === 'partial' ? 'secondary' : 'destructive'}
      className="text-[10px]"
    >
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

function DaySummaryCard({
  title,
  entry,
}: {
  title: string;
  entry: BibleReadingHistoryEntry | undefined;
}) {
  return (
    <Card className="border-border bg-muted/60">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <CalendarDays className="w-4 h-4 text-primary" />
          <p className="text-xs font-medium text-faint">{title}</p>
        </div>
        {entry ? (
          <>
            <p className="text-sm font-semibold leading-snug">{formatChapters(entry.chapters)}</p>
            <p className="text-xs text-faint mt-1">{entry.rotationName}</p>
            {entry.status !== 'success' && (
              <p className="text-[11px] text-warning mt-1">
                Ejecución {STATUS_LABELS[entry.status]?.toLowerCase()}: {entry.itemsPlaced}/{entry.itemsPicked} colocados
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-faint">Sin registro para este día.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminReadingHistory() {
  const { getReadingHistory } = useAdminApi();

  const [entries, setEntries] = useState<BibleReadingHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeFilter>('all');

  useEffect(() => {
    let cancelled = false;
    getReadingHistory(90)
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [getReadingHistory]);

  const todayKey = bogotaKey(0);
  const yesterdayKey = bogotaKey(-1);

  const filtered = useMemo(() => {
    if (range === 'all') return entries;
    const minKey = bogotaKey(-Number(range));
    return entries.filter((entry) => entry.dateKey >= minKey);
  }, [entries, range]);

  const yesterdayEntry = entries.find((entry) => entry.dateKey === yesterdayKey);
  const todayEntry = entries.find((entry) => entry.dateKey === todayKey);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    getReadingHistory(90)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [getReadingHistory]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lectura bíblica</h1>
          <p className="text-sm mt-0.5 text-faint">
            Capítulos emitidos cada día por las rotaciones bíblicas.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <DaySummaryCard title="Hoy" entry={todayEntry} />
        <DaySummaryCard title="Ayer" entry={yesterdayEntry} />
      </div>

      <Card className="border-border bg-muted/60">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Historial por día</CardTitle>
            </div>
            <div className="flex gap-1 p-1 rounded-lg bg-card border border-border w-fit">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRange(option.value)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    range === option.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-faint hover:text-foreground'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-11 rounded-lg animate-pulse bg-muted" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-faint">
              No hay lecturas registradas en este período. Ejecuta una rotación bíblica para ver el historial.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Programa</TableHead>
                  <TableHead>Capítulos</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Colocados</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      <span className="flex items-center gap-2">
                        {formatDateKey(entry.dateKey)}
                        {entry.dateKey === todayKey && (
                          <Badge variant="default" className="text-[10px]">Hoy</Badge>
                        )}
                        {entry.dateKey === yesterdayKey && (
                          <Badge variant="secondary" className="text-[10px]">Ayer</Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-faint">{entry.rotationName}</TableCell>
                    <TableCell className="max-w-md">
                      <p className="text-sm text-foreground whitespace-normal break-words">
                        {formatChapters(entry.chapters)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={entry.status} />
                    </TableCell>
                    <TableCell className="text-right text-faint">
                      {entry.itemsPlaced}/{entry.itemsPicked}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
