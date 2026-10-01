import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { AnimatePresence } from 'framer-motion';
import { MiniPlayer } from '@/components/player/MiniPlayer';
import { StationHealthBanner } from './StationHealthBanner';
import { PageTransition } from './PageTransition';

/**
 * Dock once this fraction of the hero remains visible: the console controls
 * live in the middle of the hero, so when a third of it is left the user has
 * no usable player on screen and the docked bar must take over.
 */
const DOCK_VISIBLE_RATIO = 0.35;

export function PublicLayout() {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const [heroDocked, setHeroDocked] = useState(false);

  useEffect(() => {
    if (!isHome) {
      setHeroDocked(false);
      return;
    }

    const hero = document.getElementById('station-console');
    if (!hero || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) =>
        setHeroDocked(!entry.isIntersecting || entry.intersectionRatio < DOCK_VISIBLE_RATIO),
      { threshold: [0, DOCK_VISIBLE_RATIO, 1] }
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [isHome]);

  return (
    <div className="flex flex-col min-h-screen">
      <StationHealthBanner />
      <div className={isHome ? 'flex-1 overflow-hidden' : 'flex-1 pb-20 overflow-hidden'}>
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
