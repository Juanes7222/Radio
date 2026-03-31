import { Outlet, useLocation } from 'react-router-dom';
import { MiniPlayer } from '@/components/player/MiniPlayer';

export function PublicLayout() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 pb-20">
        <Outlet />
      </div>
      
      {/* Ocultar el MiniPlayer en la ruta principal para dar protagonismo al reproductor completo */}
      {!isHome && <MiniPlayer />}
    </div>
  );
}
