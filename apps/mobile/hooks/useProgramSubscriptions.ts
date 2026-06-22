// hooks/useProgramSubscriptions.ts
import { useState, useEffect, useCallback } from 'react';
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

  useEffect(() => {
    AsyncStorage.getItem(SUBSCRIPTIONS_KEY).then(data => {
      if (data) {
        setSubscribedPrograms(JSON.parse(data));
      } else {
        AsyncStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(DEFAULT_SUBSCRIPTIONS));
      }
    });
  }, []);

  const notifyUpdate = (newSubs: string[]) => {
    AsyncStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(newSubs)).then(() => {
      DeviceEventEmitter.emit(SUBSCRIPTIONS_EVENT);
    });
  };

  const toggleSubscription = useCallback((programTitle: string) => {
    setSubscribedPrograms(prev => {
      const next = prev.includes(programTitle)
        ? prev.filter(title => title !== programTitle)
        : [...prev, programTitle];
      
      notifyUpdate(next);
      return next;
    });
  }, []);

  const subscribeAll = useCallback((allPrograms: string[]) => {
    setSubscribedPrograms(allPrograms);
    notifyUpdate(allPrograms);
  }, []);

  const unsubscribeAll = useCallback(() => {
    setSubscribedPrograms([]);
    notifyUpdate([]);
  }, []);

  return { 
    subscribedPrograms, 
    toggleSubscription, 
    subscribeAll, 
    unsubscribeAll 
  };
}