import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { AnimatePresence } from 'framer-motion';
import { MiniPlayer } from '@/components/player/MiniPlayer';
import { StationHealthBanner } from './StationHealthBanner';
import { PageTransition } from './PageTransition';
import { useRouteMeta } from './useRouteMeta';

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

export function PublicLayout() {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const [dock, setDock] = useState<{ route: string; docked: boolean }>({
    route: location.pathname,
    docked: false,
  });

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
      if (hero) setDock({ route: location.pathname, docked: isHeroOutOfSight(hero) });
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
      <div className={isHome ? 'flex-1 overflow-hidden' : 'bottom-player-clearance flex-1 overflow-hidden'}>
        <AnimatePresence mode="wait" initial={false}>
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </AnimatePresence>
      </div>

      {/* Home: docked bar under the header, only while the full console is
          scrolled out of sight. Other routes: permanent bottom MiniPlayer. */}
      <AnimatePresence>
        {isHome && heroDocked && <MiniPlayer key="docked" variant="top" />}
      </AnimatePresence>
      {!isHome && <MiniPlayer />}
    </div>
  );
}
