import type { NowPlayingData } from '@radio/types';
import { formatMediaTitle } from '@/lib/formatMedia';

const HISTORY_LIMIT = 4;

const SECTION_LABEL = 'font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground';

interface EmissionQueueProps {
  stationData: NowPlayingData | null;
  currentSongId: string | null;
}

function formatPlayedAt(playedAt: number): string | null {
  if (!Number.isFinite(playedAt) || playedAt <= 0) return null;
  return new Date(playedAt * 1000).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

export function EmissionQueue({ stationData, currentSongId }: EmissionQueueProps) {
  const playingNext = stationData?.playing_next ?? null;
  const recent = (stationData?.song_history ?? [])
    .filter((entry) => entry.song?.id !== currentSongId)
    .slice(0, HISTORY_LIMIT);

  if (!playingNext && recent.length === 0) return null;

  const next = playingNext ? formatMediaTitle(playingNext.song?.title, playingNext.song?.artist) : null;

  return (
    <aside aria-label="Cola de emisión" className="hidden xl:block xl:col-start-11 xl:col-end-13 xl:row-start-2 2xl:col-start-10 2xl:col-end-13 xl:self-center">
      <div className="flex flex-col gap-7 border-l border-border/40 pl-5 2xl:pl-6">
        {next && (
          <section>
            <h2 className={SECTION_LABEL}>Sigue</h2>
            <p className="mt-2 font-display text-[1.75rem] leading-[1.15] text-foreground line-clamp-2">
              {next.title}
            </p>
            {next.artist && (
              <p className="mt-1 font-mono text-xs text-muted-foreground truncate">{next.artist}</p>
            )}
          </section>
        )}

        {recent.length > 0 && (
          <section>
            <h2 className={SECTION_LABEL}>Reproducido</h2>
            <ol className="mt-2 flex flex-col gap-3.5">
              {recent.map((entry) => {
                const media = formatMediaTitle(entry.song?.title, entry.song?.artist);
                const at = formatPlayedAt(entry.played_at);
                return (
                  <li key={entry.sh_id} className="grid grid-cols-[auto_1fr] gap-x-3">
                    <span className="mt-2 h-1 w-1 rounded-full bg-primary/50" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm leading-snug text-foreground/85 line-clamp-1">{media.title}</p>
                      <p className="mt-0.5 flex items-baseline gap-2 font-mono text-[11px] text-muted-foreground">
                        {at && <span className="tabular-nums shrink-0">{at}</span>}
                        {media.artist && <span className="truncate">{media.artist}</span>}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </div>
    </aside>
  );
}
