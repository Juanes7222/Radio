import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAzuraCast } from '@radio/api';
import { BACKEND_URL } from '@/constants/api';
import { formatMediaTitle } from '@/lib/formatMedia';

const PROGRAM_NOTIFY_MINUTES_BEFORE = 10;
const LAST_SCHEDULE_HASH_KEY = 'radio-schedule-hash';

/**
 * Hook que se encarga de programar notificaciones locales para los programas de radio próximos.
 * Busca la programación y avisa N minutos antes de que empiece un programa de la programación.
 */
export function useProgramNotify() {
  const { fetchSchedule } = useAzuraCast({ apiBaseUrl: BACKEND_URL });

  useEffect(() => {
    async function setupNotifications() {
      const schedule = await fetchSchedule();
      if (!schedule || schedule.length === 0) return;

      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') return;

      const hash = schedule.map(i => `${i.id}-${i.start_timestamp}`).join('|');
      const savedHash = await AsyncStorage.getItem(LAST_SCHEDULE_HASH_KEY);
      
      if (savedHash === hash) return;
      await AsyncStorage.setItem(LAST_SCHEDULE_HASH_KEY, hash);

      const existingScheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const notif of existingScheduled) {
        if (notif.content.data?.isProgramNotify) {
          await Notifications.cancelScheduledNotificationAsync(notif.identifier);
        }
      }

      const nowSeconds = Math.floor(Date.now() / 1000);

      for (const item of schedule) {
        if (item.start_timestamp > nowSeconds) {
          const notifyTimeSeconds = item.start_timestamp - (PROGRAM_NOTIFY_MINUTES_BEFORE * 60);

          if (notifyTimeSeconds > nowSeconds) {
            let notificationBody = `El programa "${item.title}" empezará en ${PROGRAM_NOTIFY_MINUTES_BEFORE} minutos.`;
            
            const { title, artist, isPreaching } = formatMediaTitle(item.title);
            if (isPreaching) {
              notificationBody = `La prédica "${title}" de ${artist} empezará en ${PROGRAM_NOTIFY_MINUTES_BEFORE} minutos.`;
            } else if (artist) {
              notificationBody = `El programa "${title}" de ${artist} empezará en ${PROGRAM_NOTIFY_MINUTES_BEFORE} minutos.`;
            } else {
              notificationBody = `El programa "${title}" empezará en ${PROGRAM_NOTIFY_MINUTES_BEFORE} minutos.`;
            }

            await Notifications.scheduleNotificationAsync({
              content: {
                title: 'Transmisión en vivo pronto',
                body: notificationBody,
                sound: true,
                data: { isProgramNotify: true },
              },
              trigger: {
                type: 'date',
                date: new Date(notifyTimeSeconds * 1000)
              } as Notifications.NotificationTriggerInput,
            });
          }
        }
      }
    }

    setupNotifications();
    const interval = setInterval(setupNotifications, 1000 * 60 * 60);
    return () => clearInterval(interval);
  }, [fetchSchedule]);
}
