import { useState, useEffect, useRef } from 'react';
import { apiUrl } from '@/config';

/**
 * Reconnect backoff for the live-status stream.
 *
 * A fixed 5s retry turns any transient failure into a reconnect storm: every
 * attempt takes a fresh connection slot on the server while the previous one is
 * still being reclaimed, which is enough to keep the origin at its connection
 * cap and leave the player stuck retrying. Backing off caps the attempt rate,
 * and the jitter keeps several listeners that dropped at the same moment from
 * re-joining in lockstep.
 */
const RECONNECT_DELAYS = [5000, 10000, 20000, 30000, 60000];
const MAX_RECONNECT_DELAY = 60000;

/**
 * How often the cheap status probe runs while no Facebook Live is detected.
 *
 * The stream is the expensive part: it holds an nginx connection slot for as
 * long as it stays open, and it is fed only by the Facebook webhook, so for
 * most listeners it carries nothing but 2-byte heartbeats for hours. The probe
 * is a short request, so trading a permanent socket for an occasional one is a
 * large net win. It only has to be quick enough that a broadcast surfaces
 * promptly, which is why this is measured in seconds and not in minutes.
 */
const IDLE_PROBE_INTERVAL_MS = 15000;

function nextReconnectDelay(attempt: number): number {
  const base = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
  return Math.min(base, MAX_RECONNECT_DELAY) + Math.random() * 2000;
}

interface LiveStatusResponse {
  active: boolean;
  url: string | null;
}

export function useFacebookLive() {
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    const sseUrl = apiUrl('/live-status/stream');

    const closeStream = () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      if (retryRef.current) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }
    };

    const stopProbe = () => {
      if (!probeRef.current) return;
      clearInterval(probeRef.current);
      probeRef.current = null;
    };

    // Guards against a probe tick landing just as a live event arrives, which
    // would otherwise open a second EventSource on top of the first.
    let streamOpen = false;

    const connect = () => {
      if (streamOpen) return;
      streamOpen = true;
      try {
        const eventSource = new EventSource(sseUrl);
        eventSourceRef.current = eventSource;

        eventSource.addEventListener('live_start', (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.url) {
              console.log('Facebook Live started:', data.url);
              setLiveUrl(data.url);
            }
          } catch (error) {
            console.error('Error parsing live_start event:', error);
          }
        });

        eventSource.addEventListener('live_end', () => {
          console.log('Facebook Live ended');
          setLiveUrl(null);
          // Nothing else will arrive on this socket, so release the connection
          // slot instead of holding it open until the page is closed.
          streamOpen = false;
          closeStream();
        });

        eventSource.onerror = () => {
          console.log('SSE connection error, will retry...');
          streamOpen = false;
          closeStream();
          retryRef.current = setTimeout(connect, nextReconnectDelay(retryCountRef.current++));
        };

        eventSource.onopen = () => {
          retryCountRef.current = 0;
          console.log('SSE connection established');
        };
      } catch (error) {
        console.error('Error creating EventSource:', error);
        streamOpen = false;
        retryRef.current = setTimeout(connect, nextReconnectDelay(retryCountRef.current++));
      }
    };

    const disconnect = () => {
      streamOpen = false;
      closeStream();
    };

    /**
     * Cheap status check. A hit opens the stream, a miss closes it. Runs on
     * mount and then on a timer while idle, so a listener that is not
     * broadcasting never holds a socket at all.
     */
    const probe = async () => {
      try {
        const response = await fetch(apiUrl('/live-status/'), {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return;

        const data = (await response.json()) as LiveStatusResponse;

        if (data.active) {
          if (data.url) setLiveUrl(data.url);
          // Active without a permalink yet: the stream delivers live_start.
          connect();
        } else {
          setLiveUrl(null);
          disconnect();
        }
      } catch {
        // A failed probe says nothing about the broadcast state, so the current
        // state is left alone rather than tearing down a working stream.
      }
    };

    void probe();

    probeRef.current = setInterval(() => {
      // Only idle listeners need the probe: once the stream is open it reports
      // live_start itself, so polling alongside it would be wasted requests.
      if (eventSourceRef.current === null) {
        void probe();
      }
    }, IDLE_PROBE_INTERVAL_MS);

    return () => {
      stopProbe();
      disconnect();
    };
  }, []);

  return { liveUrl, dismiss: () => setLiveUrl(null) };
}
