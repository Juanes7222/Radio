import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

interface ExactAlarmsNativeModule {
  canScheduleExactAlarms(): Promise<boolean>;
  openExactAlarmSettings(): Promise<void>;
}

const nativeModule =
  requireOptionalNativeModule<ExactAlarmsNativeModule>('ExactAlarms');

/**
 * Whether the OS allows scheduling exact alarms. Always true on iOS and on
 * Android below 12; depends on the "Alarms & reminders" special access on
 * Android 12+. Returns true when the native module is unavailable so callers
 * keep working instead of showing an unactionable warning.
 */
export async function canScheduleExactAlarms(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (!nativeModule) return true;
  return nativeModule.canScheduleExactAlarms();
}

/**
 * Opens the system "Alarms & reminders" special access screen for this app.
 * Resolves without effect when the native module is unavailable.
 */
export async function openExactAlarmSettings(): Promise<void> {
  if (!nativeModule) return;
  await nativeModule.openExactAlarmSettings();
}
