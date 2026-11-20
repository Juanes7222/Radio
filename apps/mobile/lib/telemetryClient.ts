import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { BACKEND_URL } from '@/constants/api';
import { getDeviceId } from '@/lib/device';
import {
  createSessionDeduper,
  errorDedupeKey,
  shouldReportOpen,
  stationDay,
} from '@/lib/telemetry';

const LAST_OPEN_DAY_KEY = '@radio/telemetryLastOpenDay';
const REQUEST_TIMEOUT_MS = 8000;

interface ErrorUtilsLike {
  getGlobalHandler: () => (error: Error, isFatal?: boolean) => void;
  setGlobalHandler: (handler: (error: Error, isFatal?: boolean) => void) => void;
}

// Fast Refresh re-runs the layout module, and wrapping the handler twice would
// report every failure twice: each wrapper owns its own session deduper.
declare global {
  var __telemetryErrorHandlerInstalled: boolean | undefined;
}

function currentAppVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

async function post(path: string, body: unknown): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${BACKEND_URL}/api/telemetry/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`backend responded ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Reports at most one open per station day. The stored day is only written
 * after a successful request, so an offline start retries on the next one
 * instead of losing the day.
 */
export async function reportAppOpen(): Promise<void> {
  try {
    const today = stationDay(new Date());
    const lastReportedDay = await AsyncStorage.getItem(LAST_OPEN_DAY_KEY);

    if (!shouldReportOpen(lastReportedDay, today)) return;

    await post('open', {
      deviceId: await getDeviceId(),
      appVersion: currentAppVersion(),
      platform: Platform.OS,
    });
    await AsyncStorage.setItem(LAST_OPEN_DAY_KEY, today);
  } catch (error) {
    console.warn('[Telemetry] app open not reported:', error);
  }
}

async function sendError(message: string, stack: string | null): Promise<void> {
  try {
    await post('error', {
      deviceId: await getDeviceId(),
      message,
      stack,
      appVersion: currentAppVersion(),
      platform: Platform.OS,
    });
  } catch (error) {
    console.warn('[Telemetry] error not reported:', error);
  }
}

/**
 * Wraps the React Native global handler instead of replacing it: the previous
 * one keeps owning the red box in development and the native log in release.
 * Only uncaught JavaScript errors are covered; native crashes and ANRs are
 * reported by Android Vitals in Play Console.
 */
export function installErrorReporting(): void {
  if (globalThis.__telemetryErrorHandlerInstalled) return;

  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!errorUtils) return;

  const previousHandler = errorUtils.getGlobalHandler();
  const shouldSend = createSessionDeduper();

  errorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    try {
      const message = error?.message ?? String(error);
      const stack = error?.stack ?? null;

      if (shouldSend(errorDedupeKey(message, stack))) {
        void sendError(message, stack);
      }
    } finally {
      previousHandler(error, isFatal);
    }
  });

  globalThis.__telemetryErrorHandlerInstalled = true;
}
