import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Linking } from 'react-native';
import { useAzuraCast } from '@radio/api';
import { BACKEND_URL } from '@/constants/api';
import { formatMediaTitle } from '@/lib/formatMedia';

const PROGRAM_NOTIFY_MINUTES_BEFORE = 10;
const LAST_SCHEDULE_HASH_KEY = 'radio-schedule-hash';
const SCHEDULE_TASK = 'program-notify-schedule';

type FetchSchedule = ReturnType<typeof useAzuraCast>['fetchSchedule'];

async function ensureExactAlarmPermission() {
  if (Platform.OS !== 'android') return;
  if (parseInt(Platform.Version as unknown as string) < 31) return;

  const { canScheduleExactNotifications } = await Notifications.getPermissionsAsync() as any;
  if (canScheduleExactNotifications === false) {
    Linking.openSettings();
  }
}

export async function setupNotifications(fetchSchedule: FetchSchedule) {
  await ensureExactAlarmPermission();

  const schedule = await fetchSchedule();
  if (!schedule || schedule.length === 0) return;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  const existingScheduled = await Notifications.getAllScheduledNotificationsAsync();
  const existingProgramNotifs = existingScheduled.filter(
    n => n.content.data?.isProgramNotify
  );

  const hash = schedule.map(i => `${i.id}-${i.start_timestamp}`).join('|');
  const savedHash = await AsyncStorage.getItem(LAST_SCHEDULE_HASH_KEY);

  if (savedHash === hash && existingProgramNotifs.length > 0) return;

  for (const notif of existingProgramNotifs) {
    await Notifications.cancelScheduledNotificationAsync(notif.identifier);
  }

  await AsyncStorage.setItem(LAST_SCHEDULE_HASH_KEY, hash);

  const nowSeconds = Math.floor(Date.now() / 1000);

  for (const item of schedule) {
    if (item.start_timestamp <= nowSeconds) continue;
    if (item.title === 'CONTENIDO VARIADO') continue;

    const notifyTimeSeconds = item.start_timestamp - PROGRAM_NOTIFY_MINUTES_BEFORE * 60;
    if (notifyTimeSeconds <= nowSeconds) continue;

    const { title, artist, isPreaching } = formatMediaTitle(item.title);

    let notificationBody: string;
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
        date: new Date(notifyTimeSeconds * 1000),
      } as Notifications.NotificationTriggerInput,
    });
  }
}

export async function registerScheduleBackgroundTask(fetchSchedule: FetchSchedule) {
  TaskManager.defineTask(SCHEDULE_TASK, async () => {
    try {
      await setupNotifications(fetchSchedule);
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });

  const isRegistered = await TaskManager.isTaskRegisteredAsync(SCHEDULE_TASK);
  if (isRegistered) return;

  await BackgroundTask.registerTaskAsync(SCHEDULE_TASK, {
    minimumInterval: 60 * 60,
  });
}

/**
 * Schedules local notifications for upcoming radio programs.
 * Fires PROGRAM_NOTIFY_MINUTES_BEFORE minutes before each program starts.
 */
export function useProgramNotify() {
  const { fetchSchedule } = useAzuraCast({ apiBaseUrl: BACKEND_URL });

  useEffect(() => {
    setupNotifications(fetchSchedule);
    registerScheduleBackgroundTask(fetchSchedule);

    const interval = setInterval(
      () => setupNotifications(fetchSchedule),
      1000 * 60 * 60
    );
    return () => clearInterval(interval);
  }, [fetchSchedule]);
}