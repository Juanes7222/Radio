// hooks/useProgramNotify.ts
import { useEffect, useState } from 'react';
import { AppState, DeviceEventEmitter } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { ScheduleItem } from '@radio/types';
import { canScheduleExactAlarms } from '@/modules/exact-alarms';
import { ensureNotificationChannels, NOTIFICATION_CHANNEL_ID } from '@/lib/device';
import { loadScheduleWithCache } from '@/lib/scheduleCache';
import { formatMediaTitle, normalizeTitle } from '@/lib/formatMedia';
import { formatScheduleTime } from '@/lib/time';
import {
  readStoredSubscriptions,
  setLocalRemindersEnabled,
  SUBSCRIPTIONS_EVENT,
} from './useProgramSubscriptions';

/** How long before the program starts the reminder fires. */
const MINUTES_BEFORE = 10;
/**
 * iOS keeps only the soonest 64 pending local notifications per app and the
 * alarms share that budget, so the plan is capped below it. The list is
 * rebuilt on every start and on every change, which keeps the cap from
 * starving reminders later in the week.
 */
const MAX_SCHEDULED_REMINDERS = 50;
const RESCHEDULE_INTERVAL_MS = 60 * 60 * 1000;
const REMINDER_SOURCE = 'local-program-reminder';

/**
 * One identifier per program occurrence, so rebuilding the plan is idempotent
 * and an occurrence that disappeared from the schedule can be cancelled.
 */
function reminderIdentifier(programTitle: string, startTimestamp: number): string {
  const slug = normalizeTitle(programTitle).replace(/[^a-z0-9]+/g, '-');
  return `program-reminder-${slug}-${startTimestamp}`;
}

interface PlannedReminder {
  identifier: string;
  title: string;
  body: string;
  notifyAt: Date;
  data: Record<string, string>;
}

function buildBody(programTitle: string, startTimestamp: number): string {
  const { title, artist, isPreaching } = formatMediaTitle(programTitle);
  const startTime = formatScheduleTime(startTimestamp);

  if (isPreaching) return `La prédica "${title}" de ${artist} empieza a las ${startTime}.`;
  if (artist) return `El programa "${title}" de ${artist} empieza a las ${startTime}.`;
  return `El programa "${title}" empieza a las ${startTime}.`;
}

function planReminders(schedule: ScheduleItem[], subscriptions: string[]): PlannedReminder[] {
  const nowMs = Date.now();
  const nowSeconds = Math.floor(nowMs / 1000);
  const subscribedKeys = new Set(subscriptions.map(normalizeTitle));

  return schedule
    .filter((item) => item.start_timestamp > nowSeconds)
    .filter((item) => subscribedKeys.has(normalizeTitle(item.title)))
    .map((item) => {
      const startTime = formatScheduleTime(item.start_timestamp);
      return {
        identifier: reminderIdentifier(item.title, item.start_timestamp),
        title: 'Transmisión en vivo pronto',
        body: buildBody(item.title, item.start_timestamp),
        notifyAt: new Date((item.start_timestamp - MINUTES_BEFORE * 60) * 1000),
        data: {
          source: REMINDER_SOURCE,
          type: 'program_start',
          programTitle: item.title,
          startTime,
        },
      };
    })
    .filter((reminder) => reminder.notifyAt.getTime() > nowMs)
    .sort((a, b) => a.notifyAt.getTime() - b.notifyAt.getTime())
    .slice(0, MAX_SCHEDULED_REMINDERS);
}

function isProgramReminder(request: Notifications.NotificationRequest): boolean {
  return request.content.data?.source === REMINDER_SOURCE;
}

/**
 * Rebuilds the local reminder plan: cancels the reminders that are no longer
 * needed and schedules the missing ones. Returns whether the device has local
 * reminders in place, which is what the server push fallback keys on: it must
 * not report "push covers this device" while pending reminders exist, or the
 * same reminder would arrive twice.
 */
async function syncProgramReminders(): Promise<boolean> {
  await ensureNotificationChannels();

  const pending = await Notifications.getAllScheduledNotificationsAsync();
  const hasPendingReminders = pending.some(isProgramReminder);

  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return false;

  const schedule = await loadScheduleWithCache();
  // Without a schedule the existing plan stays valid, so it is not a reason to
  // hand the reminder over to the server push.
  if (!schedule || schedule.length === 0) return hasPendingReminders;

  const planned = planReminders(schedule, await readStoredSubscriptions());
  const plannedIdentifiers = new Set(planned.map((reminder) => reminder.identifier));
  const alreadyScheduled = new Set<string>();

  for (const request of pending) {
    if (!isProgramReminder(request)) continue;
    alreadyScheduled.add(request.identifier);
    if (!plannedIdentifiers.has(request.identifier)) {
      await Notifications.cancelScheduledNotificationAsync(request.identifier);
    }
  }

  for (const reminder of planned) {
    if (alreadyScheduled.has(reminder.identifier)) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: reminder.identifier,
      content: {
        title: reminder.title,
        body: reminder.body,
        sound: 'default',
        data: reminder.data,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminder.notifyAt,
        channelId: NOTIFICATION_CHANNEL_ID,
      },
    });
  }

  return planned.length > 0;
}

/**
 * Keeps the program reminders of the device in sync with the schedule and the
 * user subscriptions. Reminders are scheduled locally so they fire at an exact
 * minute even when the device is offline or the app is not running; the server
 * push stays as the fallback for devices that cannot schedule locally, which
 * is why the capability is reported to the server after every pass.
 *
 * The hook also exposes the exact-alarm permission status used by the alarm
 * features: on Android 14+ the SCHEDULE_EXACT_ALARM special access is denied by
 * default and notifications fall back to inexact scheduling until it is granted.
 */
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

    const reschedule = async () => {
      try {
        await setLocalRemindersEnabled(await syncProgramReminders());
      } catch {
        // A reminder plan that cannot be rebuilt must never break the app.
      }
    };

    refreshExactAlarmPermission();
    reschedule();

    const subscription = DeviceEventEmitter.addListener(SUBSCRIPTIONS_EVENT, reschedule);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshExactAlarmPermission();
        reschedule();
      }
    });
    const interval = setInterval(reschedule, RESCHEDULE_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(interval);
      subscription.remove();
      appStateSubscription.remove();
    };
  }, []);

  return { exactAlarmGranted };
}
