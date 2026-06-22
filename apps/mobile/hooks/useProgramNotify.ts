// hooks/useProgramNotify.ts
import { useEffect } from 'react';
import { DeviceEventEmitter, Platform, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAzuraCast } from '@radio/api';
import { BACKEND_URL } from '@/constants/api';
import { formatMediaTitle, formatScheduleTime, normalizeTitle } from '@/lib/formatMedia';
import { 
  SUBSCRIPTIONS_KEY, 
  SUBSCRIPTIONS_EVENT, 
  DEFAULT_SUBSCRIPTIONS 
} from './useProgramSubscriptions';

const PROGRAM_NOTIFY_MINUTES_BEFORE = 10;
const LOOK_AHEAD_HOURS = 24;
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

/**
 * Fetches the schedule, filters by user subscriptions and the look-ahead window,
 * and schedules local notifications for upcoming programs.
 */
export async function setupNotifications(fetchSchedule: FetchSchedule) {
  
  await ensureExactAlarmPermission();

  const schedule = await fetchSchedule();
  if (!schedule || schedule.length === 0) {
    return;
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    return;
  }

  const subsData = await AsyncStorage.getItem(SUBSCRIPTIONS_KEY);
  const subscribedTitles: string[] = subsData ? JSON.parse(subsData) : DEFAULT_SUBSCRIPTIONS;
  

  const nowUtcSeconds = Math.floor(Date.now() / 1000);
  const maxFutureUtcSeconds = nowUtcSeconds + (LOOK_AHEAD_HOURS * 3600);
  const validNotificationIds: string[] = [];

  for (const item of schedule) {
    if (item.start_timestamp <= nowUtcSeconds || item.start_timestamp > maxFutureUtcSeconds) {
      continue;
    }

    const isSubscribed = subscribedTitles.some(
      sub => normalizeTitle(sub) === normalizeTitle(item.title)
    );
    
    if (!isSubscribed) continue;

    const notifyUtcSeconds = item.start_timestamp - (PROGRAM_NOTIFY_MINUTES_BEFORE * 60);
    if (notifyUtcSeconds <= nowUtcSeconds) continue;

    const { title, artist, isPreaching } = formatMediaTitle(item.title);
    const startTime = formatScheduleTime(item.start_timestamp);

    let notificationBody: string;
    if (isPreaching) {
      notificationBody = `La prédica "${title}" de ${artist} empieza a las ${startTime}.`;
    } else if (artist) {
      notificationBody = `El programa "${title}" de ${artist} empieza a las ${startTime}.`;
    } else {
      notificationBody = `El programa "${title}" empieza a las ${startTime}.`;
    }

    const notificationId = `radio-program-${item.id}`;
    validNotificationIds.push(notificationId);

    const triggerDate = new Date(notifyUtcSeconds * 1000);
    

    await Notifications.scheduleNotificationAsync({
      identifier: notificationId,
      content: {
        title: 'Transmisión en vivo pronto',
        body: notificationBody,
        sound: true,
        data: { isProgramNotify: true },
      },
      trigger: {
        type: 'date',
        date: triggerDate,
      } as Notifications.NotificationTriggerInput,
    });
  }

  const existingScheduled = await Notifications.getAllScheduledNotificationsAsync();
  let cancelledCount = 0;
  
  for (const notif of existingScheduled) {
    const isProgramNotif = notif.content.data?.isProgramNotify;
    const isStillValid = validNotificationIds.includes(notif.identifier);

    if (isProgramNotif && !isStillValid) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      cancelledCount++;
    }
  }
  
}

export async function registerScheduleBackgroundTask(fetchSchedule: FetchSchedule) {
  TaskManager.defineTask(SCHEDULE_TASK, async () => {
    try {
      await setupNotifications(fetchSchedule);
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
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