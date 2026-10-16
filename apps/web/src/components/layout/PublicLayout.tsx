import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { AnimatePresence } from 'framer-motion';
import { MiniPlayer } from '@/components/player/MiniPlayer';
import { Header } from '@/components/ui-custom';
import { useGlobalAudio } from '@/hooks/useGlobalAudio';
import { Spinner } from '@/components/ui/spinner';
import { StationHealthBanner } from './StationHealthBanner';
import { PageTransition } from './PageTransition';
import { useRouteMeta } from './useRouteMeta';

const PrayerRequestDialog = lazy(() =>
  import('@/components/prayer/PrayerRequestDialog').then((m) => ({ default: m.PrayerRequestDialog })),
);

const HERO_ID = 'station-console';

/**
 * Dock once this fraction of the hero remains visible: the console controls
 * live in the middle of the hero, so when a third of it is left the user has
 * no usable player on screen and the docked bar must take over.
 */
const DOCK_VISIBLE_RATIO = 0.35;

function isHeroOutOfSight(hero: HTMLElement): boolean {
  const rect = hero.getBoundingClientRect();
  const visibleHeight = Math.min(Math.max(rect.bottom, 0), window.innerHeight);
  return visibleHeight < rect.height * DOCK_VISIBLE_RATIO;
}

/**
 * Placeholder while a route chunk arrives. Bounded to the content area on
 * purpose: the header and the player stay on screen, so the wait reads as
 * "loading the page", not as "the app died".
 */
function RoutePending() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
      <span className="sr-only">Cargando</span>
      <Spinner className="size-8" />
    </div>
  );
}

/**
 * PublicLayout — chrome of every public route.
 *
 * The header and the prayer dialog live here, not in the pages. They are
 * persistent chrome: mounting them per page meant the "Pedir oración" action
 * only existed on the home route, because it is gated on the `onOpenPrayer`
 * callback and every other page rendered `<Header />` without it.
 */
export function PublicLayout() {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const { data } = useGlobalAudio();
  const [dock, setDock] = useState<{ route: string; docked: boolean }>({
    route: location.pathname,
    docked: false,
  });
  const [showPrayer, setShowPrayer] = useState(false);
  const openPrayer = useCallback(() => setShowPrayer(true), []);
  const closePrayer = useCallback(() => setShowPrayer(false), []);

  /**
   * Scoped to the route it was measured on: the dock state describes the hero of
   * the page that owns it, so a value carried over from another route must never
   * reach the current one.
   */
  const heroDocked = dock.route === location.pathname && dock.docked;

  useEffect(() => {
    if (!isHome) return;

    const syncDockState = () => {
      const hero = document.getElementById(HERO_ID);
      if (!hero) return;
      const docked = isHeroOutOfSight(hero);
      // Returning the previous state when nothing moved is what keeps a scroll
      // event from re-rendering the whole public tree: a fresh object with the
      // same values is still a new state value for React.
      setDock((prev) =>
        prev.route === location.pathname && prev.docked === docked ? prev : { route: location.pathname, docked },
      );
    };

    /**
     * The hero belongs to the routed page, so on a client-side navigation it is
     * still missing (or about to be discarded) while the previous page plays its
     * exit animation. Measuring once per route would leave the bar frozen on
     * whatever the route it came from said, so measure again when it lands.
     */
    const pendingHero = new MutationObserver(() => {
      if (!document.getElementById(HERO_ID)) return;
      pendingHero.disconnect();
      syncDockState();
    });
    pendingHero.observe(document.body, { childList: true, subtree: true });

    const frame = requestAnimationFrame(syncDockState);
    window.addEventListener('scroll', syncDockState, { passive: true });
    window.addEventListener('resize', syncDockState);

    return () => {
      cancelAnimationFrame(frame);
      pendingHero.disconnect();
      window.removeEventListener('scroll', syncDockState);
      window.removeEventListener('resize', syncDockState);
    };
  }, [isHome, location.pathname]);

  useRouteMeta();

  return (
    <div className="flex flex-col min-h-screen">
      <StationHealthBanner />
      <Header stationName={data?.station?.name} onOpenPrayer={openPrayer} />
      <div className={isHome ? 'flex-1 overflow-hidden' : 'bottom-player-clearance flex-1 overflow-hidden'}>
        {/*
          The Suspense boundary belongs around the Outlet, not around Routes.
          Route chunks are lazy, so a boundary higher up replaced the entire
          tree — header, player and dock state included — with a full-screen
          spinner, and rebuilt all of it when the chunk landed.
        */}
        <Suspense fallback={<RoutePending />}>
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </Suspense>
      </div>

      {/* Home: docked bar under the header, only while the full console is
          scrolled out of sight. Other routes: permanent bottom MiniPlayer. */}
      <AnimatePresence>
        {isHome && heroDocked && <MiniPlayer key="docked" variant="top" />}
      </AnimatePresence>
      {!isHome && <MiniPlayer />}

      <Suspense fallback={null}>
        <PrayerRequestDialog isOpen={showPrayer} onClose={closePrayer} />
      </Suspense>
    </div>
  );
}
