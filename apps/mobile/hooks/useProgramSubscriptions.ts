// hooks/useProgramSubscriptions.ts
import { useState, useEffect, useCallback } from 'react';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeTitle } from '@/lib/formatMedia';
import { getDeviceId } from '@/lib/device';
import { BACKEND_URL } from '@/constants/api';

export const SUBSCRIPTIONS_KEY = 'radio-program-subscriptions';
export const SUBSCRIPTIONS_EVENT = 'onSubscriptionsUpdated';
export const LOCAL_REMINDERS_KEY = 'radio-local-reminders-enabled';

export const DEFAULT_SUBSCRIPTIONS: string[] = [
  "Rev Javier Carrascal",
  "Rev Humberto Henao",
  "Rev José Soto",
  "Noticias de Israel",
  "Lectura Bíblica"
];

function parseStoredSubscriptions(raw: string | null): string[] {
  if (!raw) return DEFAULT_SUBSCRIPTIONS;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_SUBSCRIPTIONS;
  } catch {
    return DEFAULT_SUBSCRIPTIONS;
  }
}

export async function readStoredSubscriptions(): Promise<string[]> {
  return parseStoredSubscriptions(await AsyncStorage.getItem(SUBSCRIPTIONS_KEY));
}

/**
 * Whether this device schedules program reminders on its own. `null` means the
 * app never reported it, so the server keeps sending the push fallback.
 */
async function readLocalRemindersEnabled(): Promise<boolean | null> {
  const raw = await AsyncStorage.getItem(LOCAL_REMINDERS_KEY);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

/**
 * Stores the capability and mirrors it to the server when it changes, which is
 * what makes the server push resume for devices that cannot schedule locally.
 */
export async function setLocalRemindersEnabled(enabled: boolean): Promise<void> {
  const next = enabled ? 'true' : 'false';
  if ((await AsyncStorage.getItem(LOCAL_REMINDERS_KEY)) === next) return;

  await AsyncStorage.setItem(LOCAL_REMINDERS_KEY, next);
  await syncSubscriptionsToServer(await readStoredSubscriptions());
}

async function syncSubscriptionsToServer(subscriptions: string[]): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    const localRemindersEnabled = await readLocalRemindersEnabled();
    const response = await fetch(
      `${BACKEND_URL}/api/devices/${deviceId}/subscriptions`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptions,
          ...(localRemindersEnabled === null ? {} : { localRemindersEnabled }),
        }),
      }
    );
    if (!response.ok) {
      console.warn('[ProgramSubscriptions] Server sync failed', response.status);
    }
  } catch (err) {
    console.warn('[ProgramSubscriptions] Server sync error:', err);
  }
}

export function useProgramSubscriptions() {
  const [subscribedPrograms, setSubscribedPrograms] = useState<string[]>(DEFAULT_SUBSCRIPTIONS);
  const [hydrated, setHydrated] = useState(false);

  // Load persisted subscriptions on mount.
  useEffect(() => {
    let mounted = true;

    (async () => {
      const stored = await AsyncStorage.getItem(SUBSCRIPTIONS_KEY);
      const restored = parseStoredSubscriptions(stored);
      if (!stored) {
        await AsyncStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(restored));
      }
      if (!mounted) return;
      // A fresh array changes the reference even when the content still is the
      // default list, so the effect below always syncs once after hydration.
      setSubscribedPrograms([...restored]);
      setHydrated(true);
    })().catch(() => {
      // Storage unavailable: keep the in-memory defaults and let the server
      // mirror the next change the user makes.
    });

    return () => {
      mounted = false;
    };
  }, []);

  // Persist every change, notify other parts of the app and mirror the list on
  // the server, which is what the push job matches against. Done in an effect
  // (not inside a state updater) to avoid side effects during render and
  // double-invocation in StrictMode. The first run after hydration registers
  // the defaults, so a fresh install is subscribed without a manual toggle.
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(subscribedPrograms)).then(() => {
      DeviceEventEmitter.emit(SUBSCRIPTIONS_EVENT);
    });
    syncSubscriptionsToServer(subscribedPrograms);
  }, [hydrated, subscribedPrograms]);

  const toggleSubscription = useCallback((programTitle: string) => {
    const normalized = normalizeTitle(programTitle);
    setSubscribedPrograms(prev => {
      const isSubscribed = prev.some(title => normalizeTitle(title) === normalized);
      return isSubscribed
        ? prev.filter(title => normalizeTitle(title) !== normalized)
        : [...prev, programTitle];
    });
  }, []);

  const subscribeAll = useCallback((allPrograms: string[]) => {
    setSubscribedPrograms(allPrograms);
  }, []);

  const unsubscribeAll = useCallback(() => {
    setSubscribedPrograms([]);
  }, []);

  return { 
    subscribedPrograms, 
    toggleSubscription, 
    subscribeAll, 
    unsubscribeAll 
  };
}