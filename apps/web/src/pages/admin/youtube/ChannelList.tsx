import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Plus, RefreshCw, Trash2 } from 'lucide-react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAdminApi } from '@/hooks/useAdminApi';
import { formatDateTime, timeAgoShort } from '@/lib/format';
import type { YoutubeChannelCategory, YoutubeChannelState, YouTubeChannelInfo } from '@radio/types';
import SilenceBar from './SilenceBar';

const REFRESH_INTERVAL_MS = 30_000;

const CATEGORY_LABELS: Record<YoutubeChannelCategory, string> = {
  GENERAL: 'Contenido general',
  NEWS: 'Noticias',
};

/**
 * Why a channel is in the state it is, in the operator's words. The row states its
 * time in the mono line under the name; this says the reason behind it, so nobody
 * has to open a log to tell a failed renewal from a healthy one.
 */
function explainState(channel: YouTubeChannelInfo): string {
  const states: Record<YoutubeChannelState, string> = {
    subscribed: `Suscripción vigente${channel.leaseExpiresAt ? ` hasta el ${formatDateTime(channel.leaseExpiresAt)}` : ''}`,
    expiring: 'La suscripción vence pronto y el próximo refresco la renueva',
    failed: channel.subscriptionError ?? 'La última suscripción falló',
    unverified: 'El feed todavía no se ha comprobado',
  };
  return states[channel.state];
}

/** A channel that never spoke has no ratio to place against the others. */
function silenceRatios(channels: YouTubeChannelInfo[]): Map<string, number> {
  const ratios = new Map<string, number>();
  const ages = channels
    .map((channel) => ({ channelId: channel.channelId, at: channel.lastNotifiedAt ? Date.parse(channel.lastNotifiedAt) : null }))
    .filter((entry): entry is { channelId: string; at: number } => entry.at !== null)
    .sort((a, b) => b.at - a.at);

  const shortest = ages.at(-1)?.at ?? 0;
  const longest = ages[0]?.at ?? 0;
  const span = longest - shortest;

  // With every channel equally silent (or only one of them) the comparison carries
  // no information, so every bar stays full rather than all of them collapsing.
  for (const entry of ages) {
    ratios.set(entry.channelId, span > 0 ? (entry.at - shortest) / span : 1);
  }
  return ratios;
}

export default function ChannelList({ onChanged }: { onChanged?: () => void }) {
  const { getYoutubeChannels, addYoutubeChannel, removeYoutubeChannel, resubscribeYoutubeChannel } = useAdminApi();

  const [channels, setChannels] = useState<YouTubeChannelInfo[]>([]);
  const [channelId, setChannelId] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<YoutubeChannelCategory>('GENERAL');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<YouTubeChannelInfo | null>(null);

  const load = useCallback(
    () =>
      getYoutubeChannels().then(
        (rows) => setChannels(rows),
        () => undefined
      ),
    [getYoutubeChannels]
  );

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const errorMessage = (err: unknown, fallback: string): string =>
    axios.isAxiosError(err) && typeof err.response?.data?.error === 'string'
      ? err.response.data.error
      : fallback;

  const handleAdd = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setSaving(true);
      setFormError(null);
      try {
        await addYoutubeChannel({ channelId: channelId.trim(), title: title.trim(), category });
        setChannelId('');
        setTitle('');
        setCategory('GENERAL');
        await load();
        onChanged?.();
      } catch (err) {
        setFormError(errorMessage(err, 'No se pudo agregar el canal.'));
      } finally {
        setSaving(false);
      }
    },
    [addYoutubeChannel, channelId, title, category, load, onChanged]
  );

  const handleResubscribe = useCallback(
    async (channel: YouTubeChannelInfo) => {
      setBusyId(channel.channelId);
      try {
        await resubscribeYoutubeChannel(channel.channelId);
        await load();
      } catch (err) {
        setFormError(errorMessage(err, 'No se pudo renovar la suscripción.'));
      } finally {
        setBusyId(null);
      }
    },
    [resubscribeYoutubeChannel, load]
  );

  const handleRemove = useCallback(
    async (channel: YouTubeChannelInfo) => {
      setBusyId(channel.channelId);
      try {
        await removeYoutubeChannel(channel.channelId);
        setRemoving(null);
        await load();
        onChanged?.();
      } catch (err) {
        setFormError(errorMessage(err, 'No se pudo quitar el canal.'));
      } finally {
        setBusyId(null);
      }
    },
    [removeYoutubeChannel, load, onChanged]
  );

  const ratios = silenceRatios(channels);

  return (
    <>
      <section aria-labelledby="youtube-channels-heading" className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-5 py-4">
        <div>
          <h2 id="youtube-channels-heading" className="text-[15px] font-semibold tracking-tight">
            Canales de YouTube
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Cada canal que agregues se suscribe solo y sus videos entran a la cola.
          </p>
        </div>
        <span className="font-mono text-[10px] tracking-[0.16em] text-faint">
          {channels.length} {channels.length === 1 ? 'CANAL' : 'CANALES'}
        </span>
      </div>

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2 border-b border-border bg-sunken/40 px-5 py-4">
        <div className="min-w-[13rem] flex-1">
          <label htmlFor="channel-id" className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            Identificador o URL
          </label>
          <Input
            id="channel-id"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            placeholder="UCVqtYvLNHvGymJFoGeRH7nw"
            aria-invalid={formError !== null}
            aria-describedby={formError ? 'channel-add-error' : undefined}
            className="font-mono text-xs"
          />
        </div>
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="channel-title" className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            Nombre
          </label>
          <Input
            id="channel-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Radio Contrapunto - Noticias"
          />
        </div>
        <div>
          <label htmlFor="channel-category" className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            Destino
          </label>
          <select
            id="channel-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as YoutubeChannelCategory)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {(Object.keys(CATEGORY_LABELS) as YoutubeChannelCategory[]).map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={saving} className="h-9 gap-2">
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Agregar canal
        </Button>
      </form>

      {formError && (
        <p
          id="channel-add-error"
          role="alert"
          className="flex items-start gap-2 border-b border-destructive/25 bg-destructive/10 px-5 py-2.5 text-xs leading-relaxed text-destructive"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 break-words">{formError}</span>
        </p>
      )}

      {channels.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          Todavía no hay canales. Agrega el primero y la estación lo sigue automáticamente.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {channels.map((channel) => {
            const busy = busyId === channel.channelId;
            return (
              <li key={channel.channelId} title={explainState(channel)} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-sm font-medium text-foreground">{channel.title}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {CATEGORY_LABELS[channel.category]}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {channel.lastNotifiedAt ? timeAgoShort(channel.lastNotifiedAt) : 'sin avisos'}
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      onClick={() => void handleResubscribe(channel)}
                      aria-label={`Renovar la suscripción de ${channel.title}`}
                      title="Renovar ahora"
                      className="h-9 w-9 text-muted-foreground hover:text-foreground"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      onClick={() => setRemoving(channel)}
                      aria-label={`Quitar ${channel.title}`}
                      title="Quitar canal"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </div>

                <SilenceBar ratio={ratios.get(channel.channelId) ?? 1} />

                <p className="mt-2 font-mono text-[11px] text-faint">
                  <span className="break-all">{channel.channelId}</span>
                  {channel.lastNotifiedAt && (
                    <span className="ml-2 text-muted-foreground">
                      último aviso {formatDateTime(channel.lastNotifiedAt)}
                    </span>
                  )}
                </p>

                {channel.feedEntryCount === 0 && (
                  <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-warning">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      YouTube respondió, pero el feed de este canal no trae videos: no va a notificar por esta vía.
                    </span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      </section>

      {/* The only destructive action on the page, so it asks first. Videos already
          received stay in the history either way, and the copy says so. */}
      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
      <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quitar {removing?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              La estación deja de seguir este canal. Los videos que ya entraron se conservan en el historial.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removing && void handleRemove(removing)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Quitar canal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}