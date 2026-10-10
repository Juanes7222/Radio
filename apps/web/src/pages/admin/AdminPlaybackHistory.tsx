import { useCallback, useEffect, useMemo, useState } from 'react';
import { History, RefreshCw, Search, Radio } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AdminPagination } from '@/components/ui-custom/AdminPagination';
import { useAdminApi } from '@/hooks/useAdminApi';
import { formatClock, stationDayKey } from '@/lib/format';
import type {
  PlaybackAudioOrder,
  PlaybackAudioRow,
  PlaybackEventRow,
  PlaybackLogQuery,
} from '@radio/types';

type Tab = 'log' | 'audios';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

/** The presets are capped by the backend retention, which rejects wider windows. */
const MAX_WINDOW_DAYS = 55;
const WINDOW_OPTIONS = [
  { value: '7', label: '7 días' },
  { value: '30', label: '30 días' },
  { value: String(MAX_WINDOW_DAYS), label: `${MAX_WINDOW_DAYS} días` },
];
const ORDER_OPTIONS: { value: PlaybackAudioOrder; label: string }[] = [
  { value: 'plays', label: 'Más reproducidos' },
  { value: 'recent', label: 'Reproducidos recientemente' },
  { value: 'first', label: 'Reproducidos por primera vez' },
];

function formatMoment(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export default function AdminPlaybackHistory() {
  const { getPlaybackLog, getPlaybackAudios, getPlaybackFilters } = useAdminApi();

  const [tab, setTab] = useState<Tab>('log');
  const [windowDays, setWindowDays] = useState('30');
  const [playlist, setPlaylist] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [automatedOnly, setAutomatedOnly] = useState(false);
  const [order, setOrder] = useState<PlaybackAudioOrder>('plays');

  const [logRows, setLogRows] = useState<PlaybackEventRow[]>([]);
  const [audioRows, setAudioRows] = useState<PlaybackAudioRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  /**
   * Key of the request whose rows are on screen. `loading` is derived from it
   * instead of being a separate flag, so no handler has to remember to flip it
   * and react-hooks v7 does not see a setState call in the effect body.
   */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  // `to` is the last day the window covers, not an exclusive bound: the backend
  // derives the exclusive limit itself, so naming tomorrow would cover one extra
  // day and push the 55 day preset over the retention cap.
  const range = useMemo(() => {
    const days = Number(windowDays);
    return { from: stationDayKey(-(days - 1)), to: stationDayKey(0) };
  }, [windowDays]);

  const query = useMemo<PlaybackLogQuery>(
    () => ({
      from: range.from,
      to: range.to,
      playlist: playlist ?? undefined,
      search: search === '' ? undefined : search,
      automated: automatedOnly ? '1' : '0',
      page,
      limit: PAGE_SIZE,
    }),
    [range, playlist, search, automatedOnly, page]
  );

  const requestKey = `${tab}|${order}|${JSON.stringify(query)}|${refreshToken}`;
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    let cancelled = false;
    getPlaybackFilters()
      .then((data) => {
        if (!cancelled) setPlaylists(data.playlists);
      })
      .catch(() => {
        if (!cancelled) setPlaylists([]);
      });
    return () => {
      cancelled = true;
    };
  }, [getPlaybackFilters, refreshToken]);

  // The text is applied with a delay so a query is not fired per keystroke, and
  // the page reset rides behind the same guard: clicking the field, typing a
  // character and deleting it leaves the effective text untouched, so resetting
  // the page there would throw away the page the admin was reading and fire an
  // extra `page=1` request. `search` is a dependency only so the guard can read
  // the applied text; re-running on it just re-arms the timer and returns early.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim();
      if (next === search) return;
      setSearch(next);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

  /**
   * Rows are replaced per response. `setPage` falls back to the first page when
   * the answer says the requested page no longer exists: the backend does not
   * clamp an out-of-range page, it answers `rows: []` with the real `total`, which
   * would render the "nothing recorded" message while history does exist. It is
   * done here, where the answer lands, instead of in a follow-up effect so the
   * recovery costs no request with the stale page in between.
   */
  useEffect(() => {
    let cancelled = false;
    const key = requestKey;

    if (tab === 'log') {
      getPlaybackLog(query)
        .then((data) => {
          if (cancelled) return;
          setLogRows(data.rows);
          setTotal(data.total);
          setTotalPages(data.totalPages);
          setPage((current) => (current > data.totalPages ? 1 : current));
          setError(null);
          setLoadedKey(key);
        })
        .catch(() => {
          if (cancelled) return;
          setLogRows([]);
          setTotal(0);
          setTotalPages(1);
          setError('No se pudo cargar el historial de reproducción.');
          setLoadedKey(key);
        });
    } else {
      getPlaybackAudios({ ...query, order })
        .then((data) => {
          if (cancelled) return;
          setAudioRows(data.rows);
          setTotal(data.total);
          setTotalPages(data.totalPages);
          setPage((current) => (current > data.totalPages ? 1 : current));
          setError(null);
          setLoadedKey(key);
        })
        .catch(() => {
          if (cancelled) return;
          setAudioRows([]);
          setTotal(0);
          setTotalPages(1);
          setError('No se pudo cargar el historial de reproducción.');
          setLoadedKey(key);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [tab, order, query, requestKey, getPlaybackLog, getPlaybackAudios]);

  const handleRefresh = useCallback(() => {
    setRefreshToken((current) => current + 1);
  }, []);

  const rows = tab === 'log' ? logRows : audioRows;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Historial de reproducción</h1>
          <p className="text-sm mt-0.5 text-faint">
            Qué se emitió, a qué hora y cuántas veces se reprodujo cada audio.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      <Card className="border-border bg-muted/60">
        <CardContent className="p-4 flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex gap-1 p-1 rounded-lg bg-card border border-border w-fit">
            {(['log', 'audios'] as Tab[]).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={tab === value}
                onClick={() => {
                  setTab(value);
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  tab === value ? 'bg-primary text-primary-foreground' : 'text-faint hover:text-foreground'
                }`}
              >
                {value === 'log' ? 'Reproducciones' : 'Por audio'}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end flex-1">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-faint">Período</span>
              <Select value={windowDays} onValueChange={(value) => { setWindowDays(value); setPage(1); }}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WINDOW_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-faint">Playlist</span>
              <Select
                value={playlist ?? 'all'}
                onValueChange={(value) => { setPlaylist(value === 'all' ? null : value); setPage(1); }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {playlists.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="flex flex-col gap-1 flex-1">
              <span className="text-xs font-medium text-faint">Buscar</span>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-faint" />
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Título o artista"
                  className="pl-8"
                  maxLength={200}
                />
              </div>
            </label>

            <label className="flex items-center gap-2 pb-2">
              <input
                type="checkbox"
                checked={automatedOnly}
                onChange={(event) => { setAutomatedOnly(event.target.checked); setPage(1); }}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <span className="text-xs text-faint">Solo programación automática</span>
            </label>

            {tab === 'audios' && (
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-faint">Orden</span>
                <Select value={order} onValueChange={(value) => { setOrder(value as PlaybackAudioOrder); setPage(1); }}>
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-muted/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            {tab === 'log' ? <Radio className="w-5 h-5 text-primary" /> : <History className="w-5 h-5 text-primary" />}
            <CardTitle className="text-base">
              {tab === 'log' ? 'Reproducciones' : 'Por audio'}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(8)].map((_, index) => (
                <div key={index} className="h-11 rounded-lg animate-pulse bg-muted" />
              ))}
            </div>
          ) : error ? (
            <p className="py-10 text-center text-sm text-destructive">{error}</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-faint">
              No hay reproducciones registradas en este periodo. El historial se sincroniza
              cada 5 minutos y conserva {MAX_WINDOW_DAYS} días.
            </p>
          ) : tab === 'log' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Momento</TableHead>
                  <TableHead>Audio</TableHead>
                  <TableHead>Playlist</TableHead>
                  <TableHead className="text-right">Duración</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logRows.map((row) => (
                  <TableRow key={row.shId}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatMoment(row.playedAt)}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="text-sm text-foreground break-words">{row.title}</p>
                      {row.artist !== '' && <p className="text-xs text-faint">{row.artist}</p>}
                    </TableCell>
                    <TableCell className="text-faint">
                      <span className="flex items-center gap-2">
                        {row.playlist === '' ? '—' : row.playlist}
                        {row.streamer !== '' && <Badge variant="secondary" className="text-[10px]">DJ</Badge>}
                        {row.isRequest && <Badge variant="outline" className="text-[10px]">Pedido</Badge>}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-faint">
                      {formatClock(row.durationSec)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Audio</TableHead>
                  <TableHead className="text-right">Reproducciones</TableHead>
                  <TableHead>Primera</TableHead>
                  <TableHead>Última</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audioRows.map((row) => (
                  <TableRow key={row.songId}>
                    <TableCell className="max-w-md">
                      <p className="text-sm text-foreground break-words">{row.title}</p>
                      {row.artist !== '' && <p className="text-xs text-faint">{row.artist}</p>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{row.plays}</TableCell>
                    <TableCell className="whitespace-nowrap text-faint">
                      {formatMoment(row.firstPlayedAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-faint">
                      {formatMoment(row.lastPlayedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {!loading && total > 0 && (
            <div className="mt-4">
              <AdminPagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                label={`${total} ${tab === 'log' ? 'reproducciones' : 'audios'}`}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
