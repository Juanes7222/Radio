import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

export interface RadioAlarm {
  id: string;
  hour: number;
  minute: number;
  /** JS weekday numbers (0=Sunday..6=Saturday); empty means a one-time alarm */
  days: number[];
  /** Target time for one-time alarms, ms epoch */
  date?: number;
  /** Optional user-provided label shown in the notification */
  label?: string;
  /** Whether the alarm is armed and schedules notifications */
  enabled: boolean;
}

export interface AlarmInput {
  hour: number;
  minute: number;
  days: number[];
  label?: string;
}

const ALARMS_KEY = 'radio-alarms';
const ALARM_CHANNEL_ID = 'radio-alarms';
// Base filename of the bundled custom sound (registered in app.json > expo-notifications > sounds)
const ALARM_SOUND = 'ring.wav';

// expo-notifications weekdays: 1=Sunday..7=Saturday
function toExpoWeekday(jsDay: number): number {
  return jsDay + 1;
}

function getAlarmIdentifiers(alarm: RadioAlarm): string[] {
  if (alarm.days.length === 0) return [`radio-alarm-${alarm.id}-once`];
  if (alarm.days.length === 7) return [`radio-alarm-${alarm.id}-daily`];
  return alarm.days.map((day) => `radio-alarm-${alarm.id}-w${toExpoWeekday(day)}`);
}

function nextOneTimeDate(hour: number, minute: number): Date {
  const now = new Date();
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  if (date.getTime() <= now.getTime()) {
    date.setDate(date.getDate() + 1);
  }
  return date;
}

async function ensureAlarmChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ALARM_CHANNEL_ID, {
    name: 'Recordatorios de radio',
    importance: Notifications.AndroidImportance.HIGH,
    sound: ALARM_SOUND,
    vibrationPattern: [0, 250, 250, 250],
  });
}

// Ask for the display permission only when the user explicitly arms an alarm,
// never at app startup, so the prompt happens in context.
async function ensureNotificationPermission(): Promise<void> {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return;
  if (current.canAskAgain) {
    await Notifications.requestPermissionsAsync();
  }
}

function buildContent(alarm: RadioAlarm): Notifications.NotificationContentInput {
  const label = alarm.label?.trim();
  return {
    title: label || 'Recordatorio de radio',
    body: label ? `Es hora de ${label}.` : 'Es hora de escuchar La Voz de la Verdad.',
    sound: ALARM_SOUND,
    data: { alarmId: alarm.id },
  };
}

async function scheduleAlarm(alarm: RadioAlarm) {
  await ensureAlarmChannel();
  const content = buildContent(alarm);

  if (alarm.days.length === 0) {
    await Notifications.scheduleNotificationAsync({
      identifier: getAlarmIdentifiers(alarm)[0],
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: nextOneTimeDate(alarm.hour, alarm.minute),
        channelId: ALARM_CHANNEL_ID,
      },
    });
    return;
  }

  if (alarm.days.length === 7) {
    await Notifications.scheduleNotificationAsync({
      identifier: getAlarmIdentifiers(alarm)[0],
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: alarm.hour,
        minute: alarm.minute,
        channelId: ALARM_CHANNEL_ID,
      },
    });
    return;
  }

  for (const day of alarm.days) {
    await Notifications.scheduleNotificationAsync({
      identifier: `radio-alarm-${alarm.id}-w${toExpoWeekday(day)}`,
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: toExpoWeekday(day),
        hour: alarm.hour,
        minute: alarm.minute,
        channelId: ALARM_CHANNEL_ID,
      },
    });
  }
}

async function cancelAlarm(alarm: RadioAlarm) {
  for (const identifier of getAlarmIdentifiers(alarm)) {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  }
}

function parseAlarms(raw: string | null): RadioAlarm[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (alarm): alarm is RadioAlarm =>
          typeof alarm === 'object' &&
          alarm !== null &&
          typeof (alarm as RadioAlarm).hour === 'number' &&
          typeof (alarm as RadioAlarm).minute === 'number' &&
          Array.isArray((alarm as RadioAlarm).days),
      )
      .map((alarm) => ({ ...alarm, enabled: alarm.enabled !== false }));
  } catch {
    return [];
  }
}

interface UseAlarmClockReturn {
  alarms: RadioAlarm[];
  saveAlarm: (input: AlarmInput) => void;
  updateAlarm: (id: string, input: AlarmInput) => void;
  removeAlarm: (id: string) => void;
  toggleAlarm: (id: string, enabled: boolean) => void;
}

/**
 * Radio alarm clock. One-time alarms carry an explicit date; once the time
 * passes they are kept in storage but disarmed, so the user can re-enable
 * them later. Repeating alarms use daily/weekly notification triggers and
 * are re-scheduled on every start. Disabled alarms are kept but never
 * schedule notifications.
 */
export function useAlarmClock(): UseAlarmClockReturn {
  const [alarms, setAlarms] = useState<RadioAlarm[]>([]);

  useEffect(() => {
    let mounted = true;

    /**
     * Disarm expired one-time alarms and re-arm the remaining ones.
     * Runs on mount and every time the app returns to the foreground, so a
     * fired one-time alarm stops showing as enabled as soon as the user is
     * back in the app (the OS already fires it only once).
     */
    const sync = async () => {
      const stored = parseAlarms(await AsyncStorage.getItem(ALARMS_KEY));
      if (!mounted) return;

      const now = Date.now();
      let changed = false;
      const keep: RadioAlarm[] = [];

      for (const alarm of stored) {
        if (
          alarm.days.length === 0 &&
          alarm.enabled &&
          alarm.date !== undefined &&
          alarm.date <= now
        ) {
          // Fired one-time alarm: keep it in the list but turn it off.
          keep.push({ ...alarm, enabled: false });
          await cancelAlarm(alarm);
          changed = true;
          continue;
        }
        keep.push(alarm);
        await cancelAlarm(alarm);
        if (alarm.enabled) {
          await scheduleAlarm(alarm);
        }
      }

      setAlarms(keep);
      if (changed) {
        await AsyncStorage.setItem(ALARMS_KEY, JSON.stringify(keep)).catch(() => {});
      }
    };

    sync();

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        sync();
      }
    });

    return () => {
      mounted = false;
      appStateSubscription.remove();
    };
  }, []);

  const persist = useCallback(async (next: RadioAlarm[]) => {
    setAlarms(next);
    await AsyncStorage.setItem(ALARMS_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const saveAlarm = useCallback(
    async (input: AlarmInput) => {
      await ensureNotificationPermission();
      const alarm: RadioAlarm = {
        ...input,
        id: String(Date.now()),
        enabled: true,
        date:
          input.days.length === 0
            ? nextOneTimeDate(input.hour, input.minute).getTime()
            : undefined,
      };
      await scheduleAlarm(alarm);
      await persist([...alarms, alarm]);
    },
    [alarms, persist],
  );

  const updateAlarm = useCallback(
    async (id: string, input: AlarmInput) => {
      const alarm = alarms.find((a) => a.id === id);
      if (!alarm) return;
      await cancelAlarm(alarm);
      const next: RadioAlarm = {
        ...alarm,
        ...input,
        date:
          input.days.length === 0
            ? nextOneTimeDate(input.hour, input.minute).getTime()
            : undefined,
      };
      if (next.enabled) {
        await ensureNotificationPermission();
        await scheduleAlarm(next);
      }
      await persist(alarms.map((a) => (a.id === id ? next : a)));
    },
    [alarms, persist],
  );

  const toggleAlarm = useCallback(
    async (id: string, enabled: boolean) => {
      const alarm = alarms.find((a) => a.id === id);
      if (!alarm) return;
      await cancelAlarm(alarm);
      let next: RadioAlarm = { ...alarm, enabled };
      if (enabled && next.days.length === 0) {
        next = { ...next, date: nextOneTimeDate(next.hour, next.minute).getTime() };
      }
      if (enabled) {
        await ensureNotificationPermission();
        await scheduleAlarm(next);
      }
      await persist(alarms.map((a) => (a.id === id ? next : a)));
    },
    [alarms, persist],
  );

  const removeAlarm = useCallback(
    async (id: string) => {
      const alarm = alarms.find((a) => a.id === id);
      if (!alarm) return;
      await cancelAlarm(alarm);
      await persist(alarms.filter((a) => a.id !== id));
    },
    [alarms, persist],
  );

  return { alarms, saveAlarm, updateAlarm, removeAlarm, toggleAlarm };
}
