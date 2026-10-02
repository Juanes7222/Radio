import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useReducedMotion } from 'framer-motion';
import { Heart, Share2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useGlobalAudio } from '@/hooks/useGlobalAudio';
import { formatMediaTitle } from '@/lib/formatMedia';
import { formatTime } from '@/lib/utils';
import { LEGAL_LINKS, PUBLIC_DESTINATIONS } from '@/lib/navigation';

const METER_BARS = 14;
const METER_FRAME_MS = 80;
const METER_BASS_BINS = 18;
const NO_TITLE = 'Sin información';
const STATION_TAGLINE = 'Radio cristiana · Cartago, Colombia';

/**
 * Exponential moving average applied to the analyser window. The raw average
 * arrives every 80ms and jumps; smoothing is what makes the bars read as one
 * continuous needle instead of a strobe.
 */
const METER_SMOOTHING = 0.65;

type AnalyserRef = React.MutableRefObject<AnalyserNode | null>;

interface MobileNavDrawerProps {
  stationName: string;
  onOpenShare: () => void;
  onOpenPrayer?: () => void;
}

/**
 * Binds the signal meter to the live audio level. Each bar's `--lit` is 0 at
 * rest and 1 when the level reaches it; the stylesheet derives height and
 * color from it, so a frame costs one custom-property write per bar and React
 * never re-renders at meter frequency.
 */
function useSignalMeter(
  meterRef: React.RefObject<HTMLDivElement | null>,
  analyserRef: AnalyserRef,
  active: boolean,
  reducedMotion: boolean,
) {
  useEffect(() => {
    const meter = meterRef.current;
    const bars = meter ? (Array.from(meter.children) as HTMLElement[]) : [];

    const rest = () => {
      for (const bar of bars) bar.style.setProperty('--lit', '0');
    };

    if (reducedMotion || !active || bars.length === 0) {
      rest();
      return;
    }

    const bins = new Uint8Array(analyserRef.current?.frequencyBinCount ?? 0);
    let frame = 0;
    let last = 0;
    let smoothed = 0;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last < METER_FRAME_MS) return;
      last = now;

      const analyser = analyserRef.current;
      if (!analyser) return;

      // The context is created on first playback, so the node can appear
      // after the loop started. Reallocate once instead of sampling garbage.
      if (bins.length !== analyser.frequencyBinCount) {
        bins.set(new Uint8Array(analyser.frequencyBinCount));
        return;
      }

      analyser.getByteFrequencyData(bins);

      const bassBins = Math.min(METER_BASS_BINS, bins.length);
      let sum = 0;
      for (let i = 0; i < bassBins; i++) sum += bins[i];

      smoothed = smoothed * METER_SMOOTHING + (sum / bassBins / 255) * (1 - METER_SMOOTHING);

      for (let i = 0; i < bars.length; i++) {
        const lit = Math.min(1, Math.max(0, smoothed * bars.length - i));
        bars[i].style.setProperty('--lit', lit.toFixed(3));
      }
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      rest();
    };
  }, [active, analyserRef, meterRef, reducedMotion]);
}

interface SignalWellProps {
  stationName: string;
  analyserRef: AnalyserRef;
  isOnAir: boolean;
  isLive: boolean;
  bitrate: string;
  timecode: string;
  reducedMotion: boolean;
}

function SignalWell({
  stationName,
  analyserRef,
  isOnAir,
  isLive,
  bitrate,
  timecode,
  reducedMotion,
}: SignalWellProps) {
  const meterRef = useRef<HTMLDivElement>(null);
  const { data } = useGlobalAudio();
  useSignalMeter(meterRef, analyserRef, isOnAir && !reducedMotion, reducedMotion);

  const song = data?.now_playing?.song ?? null;
  const { title, artist } = formatMediaTitle(song?.title ?? '', song?.artist ?? '');

  return (
    <section className="nav-drawer__well" aria-label="Estado de la emisión">
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${isOnAir ? 'bg-tally animate-pulse' : 'bg-muted-foreground/40'}`}
          aria-hidden
        />
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground/90">
          {isOnAir ? 'Al aire' : 'En espera'}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground/50" aria-hidden>
          &middot;
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {isLive ? 'En vivo' : 'AutoDJ'}
        </span>
      </div>

      <p className="font-display text-[19px] leading-tight mt-2 truncate">
        {title === NO_TITLE ? stationName : title}
      </p>
      <p className="font-mono text-[11px] text-muted-foreground mt-0.5 truncate">
        {artist || STATION_TAGLINE}
      </p>

      <div className="flex items-end justify-between gap-3 mt-3">
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{timecode}</span>
        {reducedMotion ? (
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{bitrate}</span>
        ) : (
          <div ref={meterRef} className="nav-drawer__meter" aria-hidden>
            {Array.from({ length: METER_BARS }, (_, index) => (
              <span key={index} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function MobileNavDrawer({ stationName, onOpenShare, onOpenPrayer }: MobileNavDrawerProps) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const reducedMotion = useReducedMotion() === true;
  const { data, playerState, analyserRef } = useGlobalAudio();

  const nowPlaying = data?.now_playing ?? null;
  const isOnAir = playerState.isPlaying && !playerState.isLoading;
  // Dashes read as a broken widget; say what is actually missing instead.
  const timecode = nowPlaying
    ? `${formatTime(nowPlaying.elapsed)} / -${formatTime(nowPlaying.remaining)}`
    : 'Sin datos de la emisión';

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="Abrir menú"
          aria-expanded={open}
          className="rounded-xl bg-card/60 border-border/60"
        >
          <MenuGlyph />
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="nav-drawer w-[86vw] max-w-[360px] p-0 gap-0"
        closeButtonClassName="nav-drawer__close"
      >
        <SheetTitle className="sr-only">Menú</SheetTitle>
        <SheetDescription className="sr-only">
          Secciones de la emisora y documentos legales
        </SheetDescription>

        <div className="nav-drawer__body">
          <SignalWell
            stationName={stationName}
            analyserRef={analyserRef}
            isOnAir={isOnAir}
            isLive={data?.live?.is_live ?? false}
            bitrate={`${playerState.quality} kbps`}
            timecode={timecode}
            reducedMotion={reducedMotion}
          />

          <nav className="nav-drawer__meta" aria-label="Secciones de la emisora">
            <p className="nav-group-label">Ir a</p>
            <ul className="flex flex-col">
              {PUBLIC_DESTINATIONS.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <Link
                    to={to}
                    onClick={() => setOpen(false)}
                    className="nav-row"
                    aria-current={location.pathname === to ? 'page' : undefined}
                  >
                    <span className="nav-row__lamp" aria-hidden>
                      <Icon className="size-[18px]" />
                    </span>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>

            <p className="nav-group-label mt-6">La estación</p>
            <ul className="flex flex-col">
              <li>
                <button type="button" className="nav-row" onClick={() => { setOpen(false); onOpenShare(); }}>
                  <span className="nav-row__lamp" aria-hidden>
                    <Share2 className="size-[18px]" />
                  </span>
                  Compartir la emisora
                </button>
              </li>
              {onOpenPrayer && (
                <li>
                  <button type="button" className="nav-row" onClick={() => { setOpen(false); onOpenPrayer(); }}>
                    <span className="nav-row__lamp text-rose-400" aria-hidden>
                      <Heart className="size-[18px]" />
                    </span>
                    Pedir una oración
                  </button>
                </li>
              )}
            </ul>

            <p className="nav-group-label mt-6">Documentos</p>
            <ul className="flex flex-col">
              {LEGAL_LINKS.map(({ to, label }) => (
                <li key={to}>
                  <Link to={to} onClick={() => setOpen(false)} className="nav-legal-link">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <footer className="nav-drawer__footer">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Movimiento Misionero Mundial · Cartago
          </p>
          <p className="font-mono text-[10px] text-muted-foreground/70 mt-1">
            {stationName} — 24/7
          </p>
        </footer>
      </SheetContent>
    </Sheet>
  );
}

function MenuGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M3 7h18M3 12h12M3 17h18" />
    </svg>
  );
}