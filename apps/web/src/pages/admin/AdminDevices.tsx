import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Smartphone,
  BellPlus,
  Globe,
  Signal,
  Radio,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Faceplate, FaceplateReading } from '@/components/admin/Faceplate';
import AdminPageTabs, { type AdminPageTab } from '@/components/admin/AdminPageTabs';
import { OnAirStrip } from '@/components/admin/OnAirStrip';
import { useAdminApi } from '@/hooks/useAdminApi';
import type { NotificationStats } from '@radio/types';

const DEVICE_TABS: AdminPageTab[] = [
  { to: 'dispositivos', label: 'Dispositivos', icon: Smartphone },
  { to: 'notificaciones', label: 'Notificaciones', icon: BellPlus },
  { to: 'zonas', label: 'Zonas', icon: Globe },
];

function AdminDevicesHeader({
  notify7d,
  onRefresh,
  refreshing,
}: {
  notify7d: number | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-[50px]" />
      <div aria-hidden className="pointer-events-none absolute -left-20 -bottom-16 h-48 w-48 rounded-full bg-info/10 blur-[40px]" />
      <div aria-hidden className="pointer-events-none absolute right-10 top-1/2 hidden -translate-y-1/2 lg:block">
        <div className="relative h-24 w-24">
          <span className="absolute inset-0 rounded-full border border-primary/10" />
          <span className="absolute inset-3 rounded-full border border-primary/15" />
          <span className="absolute inset-6 rounded-full border border-primary/20" />
          <span className="absolute left-1/2 top-1/2 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary text-primary-foreground"><Radio className="h-3.5 w-3.5" /></span>
        </div>
      </div>
      <div className="relative flex flex-col gap-4 p-5 sm:p-6">
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-faint">Transmisión · Audiencia conectada</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">Dispositivos y notificaciones</h1>
          <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">Cada teléfono es una antena. Elige la audiencia exacta, previsualiza el alcance y deja rastro de cada envío.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-info/20 bg-info/10 px-3 py-1 text-xs font-medium text-info"><Signal className="h-3 w-3" />{notify7d !== null ? `${notify7d} notificaciones / 7d` : '—'}</span>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing} className="ml-auto gap-1.5 rounded-full border-border bg-card active:scale-[0.97] transition-transform duration-150"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />Actualizar</Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Devices page split into nested routes (dispositivos / notificaciones / zonas).
 * This component only renders the header, the tab bar and the Outlet, so each
 * section mounts and loads its own data independently.
 */
export default function AdminDevices() {
  const { getNotificationStats } = useAdminApi();
  const shouldReduceMotion = useReducedMotion();

  const [notify7d, setNotify7d] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(() => {
    setRefreshing(true);
    getNotificationStats()
      .then((s: NotificationStats) => setNotify7d(s.total7d))
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [getNotificationStats]);

  useEffect(() => {
    getNotificationStats().then((s) => setNotify7d(s.total7d)).catch(() => {});
  }, [getNotificationStats]);

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
      className="space-y-6"
    >
      <AdminDevicesHeader notify7d={notify7d} onRefresh={loadStats} refreshing={refreshing} />

      <Faceplate
        lamp="bg-success"
        label="Secciones"
        verdict={<span className="text-muted-foreground font-normal">Elige la audiencia exacta; deja rastro de cada envío.</span>}
        slots={[
          <FaceplateReading key="push" label="Pushes 7d">{notify7d ?? '—'}</FaceplateReading>,
        ]}
      />

      <div className="flex items-center gap-3">
        <AdminPageTabs sections={DEVICE_TABS} ariaLabel="Secciones de dispositivos" />
        <div className="ml-auto hidden md:block">
          <OnAirStrip />
        </div>
      </div>

      <Outlet />
    </motion.div>
  );
}
