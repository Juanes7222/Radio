import { useState } from 'react';
import { NavLink, Outlet, Navigate, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  ListMusic,
  MessageSquare,
  Mic2,
  CalendarDays,
  LogOut,
  Radio,
  Menu,
  ExternalLink,
  UploadCloud,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui-custom';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useTheme } from '@/hooks';
import type { AdminUser } from '@/types/admin';

const NAV_ITEMS = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/upload', label: 'Subir archivo', icon: UploadCloud },
  { to: '/admin/playlists', label: 'Playlists', icon: ListMusic },
  { to: '/admin/requests', label: 'Solicitudes', icon: MessageSquare },
  { to: '/admin/streaming', label: 'Streaming / DJs', icon: Mic2 },
  { to: '/admin/schedule', label: 'Programación', icon: CalendarDays },
];

const AZURACAST_URL = import.meta.env.VITE_STATION_URL || 'http://localhost';

interface AdminSidebarProps {
  isDark: boolean;
  user: AdminUser;
  onCloseMobile: () => void;
  onLogout: () => void;
}

function AdminSidebar({ isDark, user, onCloseMobile, onLogout }: AdminSidebarProps) {
  const sidebarClasses = `flex flex-col h-full ${
    isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
  } border-r`;

  return (
    <div className={sidebarClasses}>
      {/* Logo */}
      <div className={`p-5 border-b ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Radio className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{user.stationName || 'Radio'}</p>
            <p className={`text-xs truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {user.name || user.email}
            </p>
          </div>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => onCloseMobile()}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : isDark
                  ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className={`p-3 border-t space-y-1 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
        <a
          href={AZURACAST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs transition-colors ${
            isDark
              ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <ExternalLink className="w-4 h-4" />
          Panel AzuraCast
        </a>
        <button
          onClick={onLogout}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            isDark
              ? 'text-slate-400 hover:bg-red-900/30 hover:text-red-400'
              : 'text-slate-600 hover:bg-red-50 hover:text-red-600'
          }`}
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const { user, logout } = useAdminAuth();
  const { resolvedTheme } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isDark = resolvedTheme === 'dark';

  if (!user) return <Navigate to="/admin/login" replace />;

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  return (
    <div
      className={`min-h-screen flex transition-colors duration-300 ${
        isDark ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* Sidebar escritorio */}
      <aside className="hidden md:block w-60 shrink-0 fixed inset-y-0 left-0 z-30">
        <AdminSidebar isDark={isDark} user={user} onCloseMobile={() => setSidebarOpen(false)} onLogout={handleLogout} />
      </aside>

      {/* Sidebar móvil - overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-60 z-50 md:hidden"
            >
              <AdminSidebar isDark={isDark} user={user} onCloseMobile={() => setSidebarOpen(false)} onLogout={handleLogout} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Contenido principal */}
      <div className="flex-1 md:ml-60 flex flex-col min-h-screen">
        {/* Topbar */}
        <header
          className={`sticky top-0 z-20 flex items-center justify-between gap-4 px-4 py-3 border-b ${
            isDark
              ? 'bg-slate-900/95 backdrop-blur border-slate-700'
              : 'bg-white/95 backdrop-blur border-slate-200'
          }`}
        >
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex-1" />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="hidden md:flex items-center gap-2 text-muted-foreground"
          >
            <LogOut className="w-4 h-4" />
            Salir
          </Button>
        </header>

        {/* Área de página */}
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
