import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useAzuraCast } from '@radio/api';
import { BACKEND_URL } from '@/constants/api';

const PROGRAM_NOTIFY_MINUTES_BEFORE = 10;


/**
 * Hook que se encarga de programar notificaciones locales para los programas de radio próximos.
 * Busca la programación y avisa N minutos antes de que empiece un programa de la programación.
 */
export function useProgramNotify() {
  const lastScheduleHash = useRef<string>('');
  const { fetchSchedule } = useAzuraCast({ apiBaseUrl: BACKEND_URL });

  useEffect(() => {
    async function setupNotifications() {
      const schedule = await fetchSchedule();
      if (!schedule || schedule.length === 0) return;

      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') return;

      // Crear un hash simple para no reprogramar si la agenda no cambió sustancialmente
      const hash = schedule.map(i => `${i.id}-${i.start_timestamp}`).join('|');
      if (lastScheduleHash.current === hash) return;
      lastScheduleHash.current = hash;

      // Cancelar notificaciones de programas anteriores (incluso de sesiones pasadas)
      const existingScheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const notif of existingScheduled) {
        if (notif.content.data?.isProgramNotify) {
          await Notifications.cancelScheduledNotificationAsync(notif.identifier);
        }
      }

      const nowSeconds = Math.floor(Date.now() / 1000);

      for (const item of schedule) {
        // Solo programar para ítems futuros que no han empezado
        if (item.start_timestamp > nowSeconds) {
          const notifyTimeSeconds = item.start_timestamp - (PROGRAM_NOTIFY_MINUTES_BEFORE * 60);

          // Si falta tiempo para notificar (es decir, faltan más de 5 minutos) programamos
          if (notifyTimeSeconds > nowSeconds) {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: 'Programación en vivo pronto',
                body: `El programa "${item.title}" empezará en ${PROGRAM_NOTIFY_MINUTES_BEFORE} minutos.`,
                sound: true,
                data: { isProgramNotify: true },
              },
              trigger: {
                seconds: notifyTimeSeconds - nowSeconds,
              } as any,
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
