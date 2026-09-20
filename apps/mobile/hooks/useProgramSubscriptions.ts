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

/** Cached server catalog: which programs are notifiable and which are default. */
export interface ProgramCatalog {
  notifiable: string[];
  defaults: string[];
}

const CATALOG_CACHE_KEY = 'radio-program-catalog';
const CATALOG_CACHE_TIMESTAMP_KEY = 'radio-program-catalog-timestamp';
const CATALOG_CACHE_TTL_MS = 1000 * 60 * 60 * 24;

function parseStoredSubscriptions(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function readStoredCatalog(): Promise<ProgramCatalog | null> {
  try {
    const raw = await AsyncStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProgramCatalog;
    if (!Array.isArray(parsed.notifiable)) return null;
    return { notifiable: parsed.notifiable, defaults: parsed.defaults ?? [] };
  } catch {
    return null;
  }
}

/**
 * Fetches the admin-configured program catalog from the server. Stored
 * subscriptions that the admin removed are pruned: what the server already
 * pruned stays pruned here, so a disabled program cannot resurface.
 */
export async function loadProgramCatalog(): Promise<ProgramCatalog> {
  const cachedTimestamp = Number(
    await AsyncStorage.getItem(CATALOG_CACHE_TIMESTAMP_KEY)
  );
  const cached = await readStoredCatalog();
  const cachedIsFresh =
    cached !== null &&
    Number.isFinite(cachedTimestamp) &&
    Date.now() - cachedTimestamp < CATALOG_CACHE_TTL_MS;

  if (cached && cachedIsFresh) {
    return cached;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/notification-programs`);
    if (!response.ok) throw new Error(String(response.status));
    const data = (await response.json()) as ProgramCatalog;

    await AsyncStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(data));
    await AsyncStorage.setItem(CATALOG_CACHE_TIMESTAMP_KEY, String(Date.now()));

    // A disabled program was pruned from the device lists server-side; mirror
    // that here so it cannot resurface as a selectable program.
    const notifiableKeys = new Set(data.notifiable.map(normalizeTitle));
    const storedRaw = await AsyncStorage.getItem(SUBSCRIPTIONS_KEY);
    const stored = parseStoredSubscriptions(storedRaw);
    const pruned = stored.filter((title) => notifiableKeys.has(normalizeTitle(title)));
    if (pruned.length !== stored.length) {
      await AsyncStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(pruned));
    }

    return data;
  } catch {
    // Offline or backend down: keep the last good catalog when there is one,
    // or an empty list. Subscriptions stay untouched until the server answers.
    return cached ?? { notifiable: [], defaults: [] };
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
  const [subscribedPrograms, setSubscribedPrograms] = useState<string[]>([]);
  const [notifiablePrograms, setNotifiablePrograms] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Load persisted subscriptions and the server catalog on mount. The catalog
  // decides which programs are selectable; the stored subscriptions seed the
  // list so a fresh install can apply the admin defaults.
  useEffect(() => {
    let mounted = true;

    (async () => {
      const catalog = await loadProgramCatalog();
      const storedRaw = await AsyncStorage.getItem(SUBSCRIPTIONS_KEY);
      if (!mounted) return;

      // The catalog load already pruned stored subscriptions against the
      // server list, so what remains here is both user chosen and notifiable.
      const stored = parseStoredSubscriptions(await AsyncStorage.getItem(SUBSCRIPTIONS_KEY));
      const hasStoredSubscriptions = storedRaw !== null;
      const defaults = catalog.defaults.filter(
        (title) => !stored.some((item) => normalizeTitle(item) === normalizeTitle(title))
      );

      const restored = hasStoredSubscriptions && stored.length > 0 ? stored : defaults;
      if (!hasStoredSubscriptions) {
        await AsyncStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(restored));
      }

      setNotifiablePrograms([...catalog.notifiable]);
      setSubscribedPrograms(restored);
      setHydrated(true);
    })().catch(() => {
      // Storage unavailable: keep an empty list and let the next load retry.
      if (mounted) setHydrated(true);
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
    notifiablePrograms,
    toggleSubscription,
    subscribeAll,
    unsubscribeAll
  };
}
