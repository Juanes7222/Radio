import { type ReactNode, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchMaintenanceStatus, type MaintenanceCheck } from '@radio/api';
import { API_BASE_URL } from '@/config';
import MaintenancePage from '@/pages/MaintenancePage';

type CheckState = { state: 'loading' } | MaintenanceCheck;

function CheckingScreen() {
  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Comprobando el estado de la emisora</span>
      </div>
    </div>
  );
}

/**
 * Holds the public site until the maintenance state is known, then decides
 * between the station and the maintenance screen.
 *
 * A check that cannot reach the backend renders the station: a failed read must
 * not become a second outage. Rechecking on focus catches a maintenance window
 * that starts while a tab stays open, without polling the endpoint from every
 * listener.
 */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const [check, setCheck] = useState<CheckState>({ state: 'loading' });

  useEffect(() => {
    let active = true;

    const run = () => {
      void fetchMaintenanceStatus(API_BASE_URL).then((result) => {
        if (active) setCheck(result);
      });
    };

    const runOnFocus = () => {
      if (document.visibilityState === 'visible') run();
    };

    run();
    document.addEventListener('visibilitychange', runOnFocus);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', runOnFocus);
    };
  }, []);

  if (check.state === 'loading') return <CheckingScreen />;

  if (check.state === 'enabled') {
    return (
      <MaintenancePage
        title={check.status.title}
        message={check.status.message}
        footerNote={check.status.footerNote}
      />
    );
  }

  return <>{children}</>;
}
