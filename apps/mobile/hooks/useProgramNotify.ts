// hooks/useProgramNotify.ts
import { useEffect, useState } from 'react';
import { Platform, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';

interface ExactAlarmPermissionStatus {
  canScheduleExactNotifications?: boolean;
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
 * Program reminders are delivered server-side via FCM (see the backend
 * ProgramNotify job), so this hook only tracks the exact-alarm permission
 * status used by the alarm features.
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
