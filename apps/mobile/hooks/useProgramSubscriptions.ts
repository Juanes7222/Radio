// hooks/useProgramSubscriptions.ts
import { useState, useEffect, useCallback } from 'react';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SUBSCRIPTIONS_KEY = 'radio-program-subscriptions';
export const SUBSCRIPTIONS_EVENT = 'onSubscriptionsUpdated';

const DEFAULT_SUBSCRIPTIONS: string[] = [
  "Rev Javier Carrascal", 
  "Rev Humberto Henao", 
  "Rev José Soto", 
  "Noticias de Israel", 
  "Lectura Biblica"
];

/**
 * Manages user program subscriptions, loading initial defaults if no previous data exists.
 */
export function useProgramSubscriptions() {
  const [subscribedPrograms, setSubscribedPrograms] = useState<string[]>(DEFAULT_SUBSCRIPTIONS);

  useEffect(() => {
    AsyncStorage.getItem(SUBSCRIPTIONS_KEY).then(data => {
      if (data) {
        setSubscribedPrograms(JSON.parse(data));
      } else {
        AsyncStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(DEFAULT_SUBSCRIPTIONS));
      }
    });
  }, []);

  const toggleSubscription = useCallback(async (programTitle: string) => {
    setSubscribedPrograms(prev => {
      const next = prev.includes(programTitle)
        ? prev.filter(title => title !== programTitle)
        : [...prev, programTitle];
      
      AsyncStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(next)).then(() => {
        DeviceEventEmitter.emit(SUBSCRIPTIONS_EVENT);
      });
      
      return next;
    });
  }, []);

  return { subscribedPrograms, toggleSubscription };
}