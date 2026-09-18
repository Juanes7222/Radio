import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, RadioTower } from 'lucide-react';
import { API_BASE_URL } from '@/config';
import { StreamDownHelp } from './StreamDownHelp';
import type { HealthStatus, PublicHealthSnapshot } from '@radio/types';

const POLL_MS = 60_000;

const BANNER_BY_STATUS: Partial<
  Record<HealthStatus, { text: string; className: string; Icon: typeof RadioTower }>
> = {
  degraded: {
    text: 'Estamos presentando fallas técnicas intermitentes. La transmisión puede cortarse unos momentos; el resto del sitio funciona con normalidad.',
    className: 'border-warning/30 bg-warning/10 text-warning',
    Icon: AlertTriangle,
  },
  critical: {
    text: 'La transmisión está temporalmente interrumpida. Estamos trabajando en restablecerla; mientras tanto puedes consultar la programación y la lectura bíblica de hoy.',
    className: 'border-tally/30 bg-tally/10 text-tally',
    Icon: AlertTriangle,
  },
};

/**
 * Public degraded-state banner. Polls the anonymous aggregate snapshot and
 * only renders when the watchdog reports something other than "ok", so the
 * normal listening experience stays untouched.
 */
export function StationHealthBanner() {
  const [status, setStatus] = useState<HealthStatus>('ok');

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetch(`${API_BASE_URL}/api/health/public`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: PublicHealthSnapshot | null) => {
          if (!cancelled && data) setStatus(data.status);
        })
        .catch(() => {
          // On fetch failure keep the last known status; silence beats noise.
        });
    };

    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const banner = BANNER_BY_STATUS[status];
  if (!banner) return null;

  const { Icon, text, className } = banner;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className={`px-4 py-2 text-sm ${className}`}
        role="status"
      >
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <Icon className="size-4 shrink-0" />
          <p>{text}</p>
        </div>
        {status === 'critical' && (
          <div>
            <div className="mx-auto max-w-5xl border-t border-current opacity-30" />
            <div className="mt-2">
              <StreamDownHelp />
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
