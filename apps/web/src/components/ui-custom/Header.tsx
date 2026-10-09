import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useLocation, useNavigate } from 'react-router';
import { PUBLIC_DESTINATIONS } from '@/lib/navigation';
import { ShareModal } from './SharedModla';
import { StationLogo } from './OptimizedLogo';
import { MobileNavDrawer } from './MobileNavDrawer';

interface HeaderProps {
  stationName?: string;
  onOpenPrayer?: () => void;
}

export function Header({ stationName = 'La Voz de la Verdad', onOpenPrayer }: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';

  const [shareOpen, setShareOpen] = useState(false);

  return (
    <>
      <ShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        stationName={stationName}
      />

      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
        className="sticky top-0 z-50 w-full border-b backdrop-blur-xl bg-background/70 border-border/50 supports-[backdrop-filter]:bg-background/60 will-change-transform"
      >
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {!isHome && (
              <motion.div
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
                className="w-[72px] h-10 rounded-xl overflow-hidden flex items-center justify-center cursor-pointer p-1 will-change-transform"
                onClick={() => navigate('/')}
                role="button"
                tabIndex={0}
                aria-label="Ir al inicio"
                onKeyDown={(e) => e.key === 'Enter' && navigate('/')}
              >
                <StationLogo className="w-full h-full object-contain" />
              </motion.div>
            )}
            <div>
              <h1 className="font-display text-[15px] sm:text-[17px] leading-tight tracking-tight">{stationName}</h1>
              <p className="text-[11px] font-mono tracking-widest uppercase text-muted-foreground">24/7 · Cartago</p>
            </div>
          </div>

          {/* Destinations read from the same source as the drawer and the
              footer, so a route added there lands here too. The hairline
              separates them from the station's own actions. */}
          <div className="hidden lg:flex self-stretch">
            <nav className="header-nav" aria-label="Secciones de la emisora">
              {PUBLIC_DESTINATIONS.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className="header-nav__link"
                  aria-current={location.pathname === to ? 'page' : undefined}
                >
                  {label}
                </Link>
              ))}
            </nav>

            <div className="header-actions">
              <button type="button" className="header-actions__item" onClick={() => setShareOpen(true)}>
                Compartir
              </button>
              {onOpenPrayer && (
                <button type="button" className="header-actions__item" onClick={onOpenPrayer}>
                  Pedir oración
                </button>
              )}
            </div>
          </div>

          <div className="lg:hidden flex items-center gap-2">
            <MobileNavDrawer
              stationName={stationName}
              onOpenShare={() => setShareOpen(true)}
              onOpenPrayer={onOpenPrayer}
            />
          </div>
        </div>
      </motion.header>
    </>
  );
}