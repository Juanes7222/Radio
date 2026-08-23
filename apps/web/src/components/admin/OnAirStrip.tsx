import { useStationStatus } from '@/hooks/useStationStatus';
import { formatClock } from '@/lib/format';

interface OnAirStripProps {
  /** Mobile variant: signal dot + status word only. */
  compact?: boolean;
}

/**
 * Persistent broadcast-state readout for the admin topbar.
 * The tally light is red only while a streamer is live; the amber light
 * marks automated programming. A hairline progress bar tracks the song.
 */
export function OnAirStrip({ compact = false }: OnAirStripProps) {
  const { nowPlaying, loading } = useStationStatus();

  const song = nowPlaying?.now_playing?.song;
  const isLive = nowPlaying?.live?.is_live ?? false;
  const streamerName = nowPlaying?.live?.streamer_name;
  const elapsed = nowPlaying?.now_playing?.elapsed ?? 0;
  const duration = nowPlaying?.now_playing?.duration ?? 0;
  const progress = duration > 0 ? Math.min((elapsed / duration) * 100, 100) : 0;

  const stateLabel = isLive
    ? 'En vivo'
    : loading && !nowPlaying
      ? 'Conectando'
      : song
        ? 'Al aire'
        : 'Sin señal';

  return (
    <div
      aria-label={`Estado de la transmisión: ${stateLabel}`}
      title={song ? `${song.title} — ${song.artist ?? ''}` : undefined}
      className="relative flex h-9 min-w-0 items-center gap-2.5 overflow-hidden rounded-md border border-border bg-sunken px-3"
    >
      {/* Signal light */}
      <span
        aria-hidden
        className={
          isLive
            ? 'h-2 w-2 shrink-0 rounded-full bg-tally animate-tally'
            : loading && !nowPlaying
              ? 'h-2 w-2 shrink-0 animate-pulse rounded-full bg-muted-foreground/50'
              : song
                ? 'h-2 w-2 shrink-0 rounded-full bg-primary'
                : 'h-2 w-2 shrink-0 rounded-full bg-faint/40'
        }
      />

      <span
        className={`font-mono text-[10px] font-medium uppercase tracking-[0.14em] ${
          isLive ? 'text-tally' : 'text-faint'
        }`}
      >
        {stateLabel}
      </span>

      {!compact && (
        <>
          {isLive ? (
            <span className="truncate text-xs font-medium text-foreground">
              {streamerName || 'Streamer'}
            </span>
          ) : song ? (
            <span className="max-w-[150px] truncate text-xs font-medium text-foreground lg:max-w-[240px]">
              {song.title || 'Sin título'}
            </span>
          ) : null}

          {!isLive && song && duration > 0 && (
            <span className="ml-auto hidden shrink-0 font-mono text-[11px] tabular-nums text-faint md:inline">
              {formatClock(elapsed)} / {formatClock(duration)}
            </span>
          )}
        </>
      )}

      {/* Song progress hairline */}
      {!isLive && song && duration > 0 && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-border">
          <span
            className="block h-full bg-primary transition-all duration-1000"
            style={{ width: `${progress}%` }}
          />
        </span>
      )}
    </div>
  );
}
