// hooks/useProgramSubscriptions.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SUBSCRIPTIONS_KEY = 'radio-program-subscriptions';
export const SUBSCRIPTIONS_EVENT = 'onSubscriptionsUpdated';

export const DEFAULT_SUBSCRIPTIONS: string[] = [
  "Rev Javier Carrascal", 
  "Rev Humberto Henao", 
  "Rev José Soto", 
  "Noticias de Israel", 
  "Lectura Biblica"
];

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
  }, [subscribedPrograms]);

  const toggleSubscription = useCallback((programTitle: string) => {
    setSubscribedPrograms(prev => {
      const next = prev.includes(programTitle)
        ? prev.filter(title => title !== programTitle)
        : [...prev, programTitle];
      return next;
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