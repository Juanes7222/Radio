import { Outlet, useLocation } from 'react-router';
import { AnimatePresence } from 'framer-motion';
import { MiniPlayer } from '@/components/player/MiniPlayer';
import { StationHealthBanner } from './StationHealthBanner';
import { PageTransition } from './PageTransition';

export function PublicLayout() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <div className="flex flex-col min-h-screen">
      <StationHealthBanner />
      {/* Reserve space for the fixed MiniPlayer only where it is rendered */}
      <div className={isHome ? 'flex-1 overflow-hidden' : 'flex-1 pb-20 overflow-hidden'}>
        <AnimatePresence mode="wait" initial={false}>
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </AnimatePresence>
      </div>
      
      {/* Ocultar el MiniPlayer en la ruta principal para dar protagonismo al reproductor completo */}
      {!isHome && <MiniPlayer />}
    </div>
  );
}
