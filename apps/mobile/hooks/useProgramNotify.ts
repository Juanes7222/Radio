// hooks/useProgramNotify.ts
import { useEffect } from 'react';
import { DeviceEventEmitter, Platform, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAzuraCast } from '@radio/api';
import { BACKEND_URL, STATION_UTC_OFFSET_HOURS } from '@/constants/api';
import { formatMediaTitle } from '@/lib/formatMedia';
import { SUBSCRIPTIONS_KEY, SUBSCRIPTIONS_EVENT } from './useProgramSubscriptions';

const PROGRAM_NOTIFY_MINUTES_BEFORE = 10;
const LAST_SCHEDULE_HASH_KEY = 'radio-schedule-hash';
const SCHEDULE_TASK = 'program-notify-schedule';

function formatStationTime(timestampSeconds: number): string {
  const date = new Date((timestampSeconds - STATION_UTC_OFFSET_HOURS * 3600) * 1000);
  return date.toLocaleTimeString('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Bogota',
  });
}

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

  const subsData = await AsyncStorage.getItem(SUBSCRIPTIONS_KEY);
  const subscribedTitles: string[] = subsData ? JSON.parse(subsData) : [];

  const existingScheduled = await Notifications.getAllScheduledNotificationsAsync();
  const existingProgramNotifs = existingScheduled.filter(
    n => n.content.data?.isProgramNotify
  );

  const scheduleHash = schedule.map(i => `${i.id}-${i.start_timestamp}`).join('|');
  const subsHash = subscribedTitles.join('|');
  const finalHash = `${scheduleHash}-${subsHash}`;
  
  const savedHash = await AsyncStorage.getItem(LAST_SCHEDULE_HASH_KEY);

  if (savedHash === finalHash && existingProgramNotifs.length > 0) return;

  for (const notif of existingProgramNotifs) {
    await Notifications.cancelScheduledNotificationAsync(notif.identifier);
  }

  await AsyncStorage.setItem(LAST_SCHEDULE_HASH_KEY, finalHash);

  const nowUtcSeconds = Math.floor(Date.now() / 1000);
  const stationOffsetSeconds = STATION_UTC_OFFSET_HOURS * 3600;

  for (const item of schedule) {
    if (!subscribedTitles.includes(item.title)) continue;

    const itemUtcSeconds = item.start_timestamp - stationOffsetSeconds;
    if (itemUtcSeconds <= nowUtcSeconds) continue;

    const notifyUtcSeconds = itemUtcSeconds - PROGRAM_NOTIFY_MINUTES_BEFORE * 60;
    if (notifyUtcSeconds <= nowUtcSeconds) continue;

    const { title, artist, isPreaching } = formatMediaTitle(item.title);
    const startTime = formatStationTime(item.start_timestamp);

    let notificationBody: string;
    if (isPreaching) {
      notificationBody = `La prédica "${title}" de ${artist} empieza a las ${startTime}.`;
    } else if (artist) {
      notificationBody = `El programa "${title}" de ${artist} empieza a las ${startTime}.`;
    } else {
      notificationBody = `El programa "${title}" empieza a las ${startTime}.`;
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
        date: new Date(notifyUtcSeconds * 1000),
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

export function useProgramNotify() {
  const { fetchSchedule } = useAzuraCast({ apiBaseUrl: BACKEND_URL });

  useEffect(() => {
    setupNotifications(fetchSchedule);
    registerScheduleBackgroundTask(fetchSchedule);

    const subscription = DeviceEventEmitter.addListener(SUBSCRIPTIONS_EVENT, () => {
      setupNotifications(fetchSchedule);
    });

    const interval = setInterval(
      () => setupNotifications(fetchSchedule),
      1000 * 60 * 60
    );
    
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [fetchSchedule]);
}