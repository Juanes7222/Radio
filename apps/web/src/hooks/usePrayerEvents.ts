import { useEffect, useRef } from 'react';
import { apiUrl } from '@/config';
import { useAdminApi } from '@/hooks/useAdminApi';
import type { PrayerCreatedEvent } from '@radio/types';

const RECONNECT_MS = 5000;

/**
 * Subscribes to the prayer live feed (SSE) and invokes `onCreated` whenever a
 * new prayer request arrives. The connection is authorized with a short-lived
 * ticket because EventSource cannot send custom headers.
 */
export function usePrayerEvents(onCreated: (event: PrayerCreatedEvent) => void): void {
  const { createPrayerStreamTicket } = useAdminApi();
  const onCreatedRef = useRef(onCreated);

  useEffect(() => {
    onCreatedRef.current = onCreated;
  }, [onCreated]);

  useEffect(() => {
    let cancelled = false;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = () => {
      if (cancelled) return;
      retryTimer = setTimeout(() => void connect(), RECONNECT_MS);
    };

    const connect = async () => {
      if (cancelled) return;
      try {
        const { ticket } = await createPrayerStreamTicket();
        if (cancelled) return;

        source = new EventSource(
          apiUrl(`/api/prayer/stream?ticket=${encodeURIComponent(ticket)}`)
        );

        source.addEventListener('prayer_created', (event) => {
          try {
            const data = JSON.parse(event.data) as PrayerCreatedEvent;
            onCreatedRef.current(data);
          } catch {
            // Malformed payload: ignore the event, the next refresh recovers.
          }
        });

        source.onerror = () => {
          source?.close();
          source = null;
          scheduleRetry();
        };
      } catch {
        scheduleRetry();
      }
    };

    void connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, [createPrayerStreamTicket]);
}
