// hooks/useProgramSubscriptions.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeTitle } from '@/lib/formatMedia';
import { getDeviceId } from '@/lib/device';
import { BACKEND_URL } from '@/constants/api';

export const SUBSCRIPTIONS_KEY = 'radio-program-subscriptions';
export const SUBSCRIPTIONS_EVENT = 'onSubscriptionsUpdated';

export const DEFAULT_SUBSCRIPTIONS: string[] = [
  "Rev Javier Carrascal", 
  "Rev Humberto Henao", 
  "Rev Jos� Soto", 
  "Noticias de Israel", 
  "Lectura Biblica"
];

async function syncSubscriptionsToServer(subscriptions: string[]): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    const response = await fetch(
      `${BACKEND_URL}/api/devices/${deviceId}/subscriptions`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptions }),
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
  const hydratedRef = useRef(false);

  // Load persisted subscriptions on mount
  useEffect(() => {
    AsyncStorage.getItem(SUBSCRIPTIONS_KEY).then(data => {
      if (data) {
        try {
          setSubscribedPrograms(JSON.parse(data));
        } catch {
          // Ignore corrupted storage and keep defaults
        }
      } else {
        // First run: persist defaults without notifying listeners
        AsyncStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(DEFAULT_SUBSCRIPTIONS));
      }
      hydratedRef.current = true;
    });
  }, []);

  // Persist every change and notify other parts of the app.
  // Done in an effect (not inside a state updater) to avoid side effects
  // during render and double-invocation in StrictMode. Skipped until the
  // initial load finishes so the app is not re-notified on mount.
  useEffect(() => {
    if (!hydratedRef.current) return;
    AsyncStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(subscribedPrograms)).then(() => {
      DeviceEventEmitter.emit(SUBSCRIPTIONS_EVENT);
    });
    syncSubscriptionsToServer(subscribedPrograms);
  }, [subscribedPrograms]);

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