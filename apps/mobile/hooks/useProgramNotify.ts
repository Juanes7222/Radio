// hooks/useProgramNotify.ts
import { useEffect, useState } from 'react';
import { DeviceEventEmitter, Platform, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchSchedule } from '@radio/api';
import { BACKEND_URL } from '@/constants/api';
import { formatMediaTitle, normalizeTitle } from '@/lib/formatMedia';
import { formatScheduleTime } from '@/lib/time';
import {
  SUBSCRIPTIONS_KEY,
  SUBSCRIPTIONS_EVENT,
  DEFAULT_SUBSCRIPTIONS,
} from './useProgramSubscriptions';

const PROGRAM_NOTIFY_MINUTES_BEFORE = 10;
const LOOK_AHEAD_HOURS = 24;
const SCHEDULE_TASK = 'program-notify-schedule';

interface ExactAlarmPermissionStatus {
  canScheduleExactNotifications?: boolean;
}

function parseSubscriptions(raw: string | null): string[] {
  if (!raw) return DEFAULT_SUBSCRIPTIONS;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_SUBSCRIPTIONS;
  } catch {
    return DEFAULT_SUBSCRIPTIONS;
  }
}

/**
 * Returns true when exact scheduling is available for notifications.
 * On Android 14+ this depends on the SCHEDULE_EXACT_ALARM special access
 * being granted by the user; expo-notifications falls back to inexact
 * scheduling otherwise.
 */
export async function canScheduleExactAlarms(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const permissions = await Notifications.getPermissionsAsync() as ExactAlarmPermissionStatus;
  return permissions.canScheduleExactNotifications !== false;
}

/**
 * Fetches the schedule, filters by user subscriptions and the look-ahead window,
 * and schedules local notifications for upcoming programs.
 */
export async function setupNotifications() {
  const schedule = await fetchSchedule(BACKEND_URL);
  if (!schedule || schedule.length === 0) {
    return;
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    return;
  }

  const subscribedTitles = parseSubscriptions(
    await AsyncStorage.getItem(SUBSCRIPTIONS_KEY)
  );

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
  }  const existingScheduled = await Notifications.getAllScheduledNotificationsAsync();

  for (const notif of existingScheduled) {
    const isProgramNotif = notif.content.data?.isProgramNotify;
    const isStillValid = validNotificationIds.includes(notif.identifier);

    if (isProgramNotif && !isStillValid) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }
  
}

export async function registerScheduleBackgroundTask() {
  TaskManager.defineTask(SCHEDULE_TASK, async () => {
    try {
      await setupNotifications();
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
  const [exactAlarmGranted, setExactAlarmGranted] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    const refreshExactAlarmPermission = async () => {
      const granted = await canScheduleExactAlarms();
      if (mounted) {
        setExactAlarmGranted(granted);
      }
    };

    refreshExactAlarmPermission();
    setupNotifications();
    registerScheduleBackgroundTask();

    const subscription = DeviceEventEmitter.addListener(SUBSCRIPTIONS_EVENT, () => {
      setupNotifications();
    });

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshExactAlarmPermission();
      }
    });

    const interval = setInterval(() => setupNotifications(), 1000 * 60 * 60);

    return () => {
      mounted = false;
      clearInterval(interval);
      subscription.remove();
      appStateSubscription.remove();
    };
  }, []);

  return { exactAlarmGranted };
}