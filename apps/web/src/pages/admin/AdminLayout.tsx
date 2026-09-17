import { useEffect, useState } from 'react';
import { NavLink, Outlet, Navigate, useNavigate, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  ListMusic,
  MessageSquare,
  Heart,
  Mic2,
  Mic,
  Megaphone,
  CalendarDays,
  Tags,
  LogOut,
  Radio,
  Menu,
  ExternalLink,
  UploadCloud,
  AudioLines,
  Smartphone,
  Youtube,
  Repeat,
  BookOpen,
  Terminal,
  Cog,
  DatabaseBackup,
  Users,
  HeartPulse,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OnAirStrip } from '@/components/admin/OnAirStrip';
import { StationStatusProvider } from '@/hooks/useStationStatus';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import type { AdminPermission, AdminUser } from '@radio/types';
import { hasAdminPermission } from '@radio/types';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission: AdminPermission;
  /** Visible only for SUPERADMIN, regardless of the permission model. */
  superAdminOnly?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

function canAccessItem(user: AdminUser, item: NavItem): boolean {
  if (item.superAdminOnly && user.role !== 'SUPERADMIN') return false;
  return hasAdminPermission(user.role, user.permissions, item.permission);
}

/**
 * Sidebar sections mirror the operator's mental model:
 * what is on air, what feeds it, and who is listening.
 */
const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Emisión',
    items: [
      { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard' },
      { to: '/admin/health', label: 'Salud', icon: HeartPulse, permission: 'dashboard' },
      { to: '/admin/schedule', label: 'Programación', icon: CalendarDays, permission: 'schedule' },
      { to: '/admin/schedule/categories', label: 'Tipos de programa', icon: Tags, permission: 'schedule.categories' },
      { to: '/admin/streaming', label: 'Streaming / DJs', icon: Mic2, permission: 'streaming' },
      { to: '/admin/live', label: 'Transmitir', icon: Mic, permission: 'live' },
    ],
  },
  {
    title: 'Contenido',
    items: [
      { to: '/admin/upload', label: 'Subir archivo', icon: UploadCloud, permission: 'upload' },
      { to: '/admin/playlists', label: 'Playlists', icon: ListMusic, permission: 'playlists' },
      { to: '/admin/rotations', label: 'Rotaciones', icon: Repeat, permission: 'rotations' },
      { to: '/admin/reading-history', label: 'Historial de lectura', icon: BookOpen, permission: 'reading.history' },
      { to: '/admin/locutor', label: 'Locutor', icon: AudioLines, permission: 'locutor' },
      { to: '/admin/youtube', label: 'YouTube', icon: Youtube, permission: 'youtube' },
    ],
  },
  {
    title: 'Audiencia',
    items: [
      { to: '/admin/requests', label: 'Solicitudes', icon: MessageSquare, permission: 'requests' },
      { to: '/admin/prayer', label: 'Oración', icon: Heart, permission: 'prayer' },
      { to: '/admin/devices', label: 'Dispositivos', icon: Smartphone, permission: 'devices' },
      { to: '/admin/notices', label: 'Avisos', icon: Megaphone, permission: 'notices' },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { to: '/admin/logs', label: 'Bitácora', icon: Terminal, permission: 'logs' },
      { to: '/admin/jobs', label: 'Jobs', icon: Cog, permission: 'jobs' },
      { to: '/admin/backups', label: 'Respaldos', icon: DatabaseBackup, permission: 'jobs', superAdminOnly: true },
      { to: '/admin/users', label: 'Usuarios', icon: Users, permission: 'users' },
    ],
  },
];

const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((section) =>
  section.items.map((item) => ({ ...item, section: section.title }))
);

function resolveCurrentPage(pathname: string) {
  return (
    [...ALL_NAV_ITEMS]
      .sort((a, b) => b.to.length - a.to.length)
      .find((item) => pathname.startsWith(item.to)) ?? null
  );
}

const AZURACAST_URL = import.meta.env.VITE_STATION_URL || 'http://localhost';

const NAV_LINK_BASE =
  'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface AdminSidebarProps {
  user: AdminUser;
  onCloseMobile: () => void;
  onLogout: () => void;
}

const ROLE_BADGE_STYLES: Record<string, string> = {
  SUPERADMIN: 'bg-primary/15 text-primary border-primary/25',
  ADMIN: 'bg-info/10 text-info border-info/25',
  USER: 'bg-accent text-muted-foreground border-border',
};

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: 'Superadmin',
  ADMIN: 'Admin',
  USER: 'Usuario',
};

function AdminSidebar({ user, onCloseMobile, onLogout }: AdminSidebarProps) {
  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => canAccessItem(user, item)),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="flex h-full flex-col border-r border-border bg-background">
      {/* Logo */}
      <div className="border-b border-border p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Radio className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.stationName || 'Radio'}</p>
            <p className="truncate text-xs text-muted-foreground">{user.name || user.email}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] ${ROLE_BADGE_STYLES[user.role] ?? ROLE_BADGE_STYLES.USER}`}
          >
            {ROLE_LABELS[user.role] ?? user.role}
          </span>
          <span className="truncate font-mono text-[10px] text-faint">{user.email}</span>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Panel de administración">
        {visibleSections.map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-1 pt-4 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-faint">
              {section.title}
            </p>
            {section.items.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => onCloseMobile()}
                className={({ isActive }) =>
                  `${NAV_LINK_BASE} ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary"
                      />
                    )}
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="space-y-1 border-t border-border p-3">
        <a
          href={AZURACAST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`${NAV_LINK_BASE} px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground`}
        >
          <ExternalLink className="h-4 w-4" />
          Panel AzuraCast
        </a>
        <button
          onClick={onLogout}
          className={`${NAV_LINK_BASE} w-full px-3 py-2 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive`}
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const { user, logout } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const currentPage = resolveCurrentPage(location.pathname);

  useEffect(() => {
    if (!sidebarOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen]);

  if (!user) return <Navigate to="/admin/login" replace />;

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  const canAccessCurrent =
    !currentPage || (user && canAccessItem(user, currentPage));
  const firstAllowed = ALL_NAV_ITEMS.find((item) => user && canAccessItem(user, item));

  if (!canAccessCurrent) {
    if (firstAllowed && location.pathname !== firstAllowed.to) {
      return <Navigate to={firstAllowed.to} replace />;
    }
    return (
      <div className="admin-theme flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <div className="max-w-sm text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">Sin acceso</p>
          <h1 className="mt-2 text-lg font-semibold">Tu cuenta no tiene secciones asignadas</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Pide al superadmin que te asigne permisos o revisa tu correo de acceso.
          </p>
          <Button className="mt-4" variant="outline" onClick={handleLogout}>
            Cerrar sesión
          </Button>
        </div>
      </div>
    );
  }

  return (
    <StationStatusProvider>
      <div className="admin-theme min-h-screen bg-background text-foreground">
        {/* Sidebar escritorio */}
        <aside
          aria-label="Menú de administración"
          className="fixed inset-y-0 left-0 z-30 hidden w-60 shrink-0 md:block"
        >
          <AdminSidebar user={user} onCloseMobile={() => setSidebarOpen(false)} onLogout={handleLogout} />
        </aside>

        {/* Sidebar móvil - overlay */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-black/60 md:hidden"
                onClick={() => setSidebarOpen(false)}
              />
              <motion.aside
                aria-label="Menú de administración"
                initial={{ x: -240 }}
                animate={{ x: 0 }}
                exit={{ x: -240 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed inset-y-0 left-0 z-50 w-60 md:hidden"
              >
                <AdminSidebar user={user} onCloseMobile={() => setSidebarOpen(false)} onLogout={handleLogout} />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Contenido principal */}
        <div className="flex min-h-screen flex-col md:ml-60">
          {/* Topbar */}
          <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </Button>

            {currentPage && (
              <div className="hidden min-w-0 sm:block">
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-faint">
                  {currentPage.section}
                </p>
                <p className="truncate text-sm font-semibold leading-tight">{currentPage.label}</p>
              </div>
            )}

            <div className="flex-1" />

            <OnAirStrip />

            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="hidden items-center gap-2 text-muted-foreground md:flex"
            >
              <LogOut className="h-4 w-4" />
              Salir
            </Button>
          </header>

          {/* Área de página */}
          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </StationStatusProvider>
  );
}
