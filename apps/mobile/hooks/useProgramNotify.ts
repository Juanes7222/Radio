// hooks/useProgramNotify.ts
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { canScheduleExactAlarms } from '@/modules/exact-alarms';

/**
 * Program reminders are delivered server-side via FCM (see the backend
 * ProgramNotify job), so this hook only tracks the exact-alarm permission
 * status used by the alarm features. On Android 14+ the SCHEDULE_EXACT_ALARM
 * special access is denied by default; expo-notifications falls back to
 * inexact scheduling until the user grants it.
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

    refreshExactAlarmPermission();

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshExactAlarmPermission();
      }
    });

    return () => {
      mounted = false;
      appStateSubscription.remove();
    };
  }, []);

  return { exactAlarmGranted };
}
