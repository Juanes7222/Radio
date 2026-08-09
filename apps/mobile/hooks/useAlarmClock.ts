import { useCallback, useEffect, useState } from 'react';
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
}

const ALARMS_KEY = 'radio-alarms';

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

function buildContent(alarm: RadioAlarm): Notifications.NotificationContentInput {
  return {
    title: 'Alarma de radio',
    body: 'Es hora de escuchar La Voz de la Verdad.',
    sound: true,
    data: { alarmId: alarm.id },
  };
}

async function scheduleAlarm(alarm: RadioAlarm) {
  const content = buildContent(alarm);

  if (alarm.days.length === 0) {
    await Notifications.scheduleNotificationAsync({
      identifier: getAlarmIdentifiers(alarm)[0],
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: nextOneTimeDate(alarm.hour, alarm.minute),
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
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface UseAlarmClockReturn {
  alarms: RadioAlarm[];
  saveAlarm: (input: Omit<RadioAlarm, 'id' | 'date'>) => void;
  removeAlarm: (id: string) => void;
}

/**
 * Radio alarm clock. One-time alarms carry an explicit date so they are
 * purged (and never ring again) once the time passes; repeating alarms use
 * daily/weekly notification triggers and are re-scheduled on every start.
 */
export function useAlarmClock(): UseAlarmClockReturn {
  const [alarms, setAlarms] = useState<RadioAlarm[]>([]);

  useEffect(() => {
    let mounted = true;

    const hydrate = async () => {
      const stored = parseAlarms(await AsyncStorage.getItem(ALARMS_KEY));
      if (!mounted) return;

      const now = Date.now();
      const keep: RadioAlarm[] = [];

      for (const alarm of stored) {
        if (alarm.days.length === 0 && alarm.date !== undefined && alarm.date <= now) {
          continue;
        }
        keep.push(alarm);
        await cancelAlarm(alarm);
        await scheduleAlarm(alarm);
      }

      setAlarms(keep);
      if (keep.length !== stored.length) {
        await AsyncStorage.setItem(ALARMS_KEY, JSON.stringify(keep)).catch(() => {});
      }
    };

    hydrate();

    return () => {
      mounted = false;
    };
  }, []);

  const persist = useCallback(async (next: RadioAlarm[]) => {
    setAlarms(next);
    await AsyncStorage.setItem(ALARMS_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const saveAlarm = useCallback(
    async (input: Omit<RadioAlarm, 'id' | 'date'>) => {
      const alarm: RadioAlarm = {
        ...input,
        id: String(Date.now()),
        date: input.days.length === 0 ? nextOneTimeDate(input.hour, input.minute).getTime() : undefined,
      };
      await scheduleAlarm(alarm);
      await persist([...alarms, alarm]);
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

  return { alarms, saveAlarm, removeAlarm };
}
