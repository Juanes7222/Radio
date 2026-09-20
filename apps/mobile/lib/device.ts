import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { BACKEND_URL } from '@/constants/api';

const DEVICE_ID_KEY = '@radio/deviceId';
const FCM_TOKEN_KEY = '@radio/fcmToken';

/**
 * Android channel every visible notification uses, local and server sent. It
 * must match `ANDROID_NOTIFICATION_CHANNEL_ID` on the backend and the
 * `defaultChannel` of the expo-notifications plugin in app.json. The alarm
 * feature keeps its own channel because it plays a different sound.
 */
export const NOTIFICATION_CHANNEL_ID = 'radio-announcements';
const NOTIFICATION_CHANNEL_NAME = 'Avisos de la emisora';

function generateUUID(): string {
  const hex = '0123456789abcdef';
  let uuid = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += '-';
    } else if (i === 14) {
      uuid += '4';
    } else if (i === 19) {
      uuid += hex[(Math.random() * 4) | 8];
    } else {
      uuid += hex[(Math.random() * 16) | 0];
    }
  }
  return uuid;
}

let cachedDeviceId: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = generateUUID();
    await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  cachedDeviceId = deviceId;
  return deviceId;
}

// The push token does not require display notification permission (the token
// itself is granted by the OS), so this never prompts the user. Features that
// rely on a visible notification request the permission when the user opts in
// to them, through ensureNotificationPermission().
export async function getFCMToken(): Promise<string | null> {
  try {
    const tokenData = await Notifications.getDevicePushTokenAsync();
    return tokenData.data;
  } catch {
    return null;
  }
}

/**
 * Creates the Android channel shared by program reminders and server pushes.
 * Android 13+ does not show the permission prompt until a channel exists, and
 * FCM needs it to keep messages out of its own fallback channel, which the
 * user cannot configure.
 */
export async function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
      name: NOTIFICATION_CHANNEL_NAME,
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  } catch {
    // The channel is created again on the next start if this fails.
  }
}

/**
 * Requests the OS display permission needed to show push notifications in the
 * tray (Android 13+ and iOS). Fetching the push token does not request it, so
 * without this the FCM reminders are delivered but never displayed.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') return true;
    if (!current.canAskAgain) return false;

    const requested = await Notifications.requestPermissionsAsync();
    return requested.status === 'granted';
  } catch {
    return false;
  }
}

export async function registerDevice(): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    const fcmToken = await getFCMToken();

    if (!fcmToken) {
      console.warn('[Device] No FCM token available');
      return;
    }

    const existingToken = await AsyncStorage.getItem(FCM_TOKEN_KEY);
    if (existingToken === fcmToken) {
      return;
    }

    const response = await fetch(`${BACKEND_URL}/api/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        fcmToken,
        platform: Platform.OS === 'android' ? 'ANDROID' : 'IOS',
        appVersion: Constants.expoConfig?.version ?? '1.0.0',
      }),
    });

    if (response.ok) {
      await AsyncStorage.setItem(FCM_TOKEN_KEY, fcmToken);
      console.log('[Device] Registered successfully');
    }
  } catch (err) {
    console.warn('[Device] Registration failed:', err);
  }
}

// Android can emit several push-token events for the same token (app start,
// each getDevicePushTokenAsync call, listener replay). Collapse them so the
// backend only sees one request per real token change.
let tokenUpdateInFlight: Promise<void> | null = null;

export function updateFCMToken(newToken: string): Promise<void> {
  return (async () => {
    const existingToken = await AsyncStorage.getItem(FCM_TOKEN_KEY);
    if (existingToken === newToken) return;
    if (tokenUpdateInFlight) return tokenUpdateInFlight;

    tokenUpdateInFlight = (async () => {
      try {
        const deviceId = await getDeviceId();
        const response = await fetch(`${BACKEND_URL}/api/devices/${deviceId}/token`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fcmToken: newToken }),
        });

        if (response.ok) {
          await AsyncStorage.setItem(FCM_TOKEN_KEY, newToken);
          console.log('[Device] FCM token updated');
        } else if (response.status === 404) {
          // Device aún no existe en backend (fresh install o backend reiniciado)
          // Fallback a registro completo para crear el documento
          console.warn('[Device] Token update 404 -> fallback to registerDevice');
          await AsyncStorage.removeItem(FCM_TOKEN_KEY);
          await registerDevice();
        } else {
          console.warn('[Device] Token update failed:', response.status);
        }
      } catch (err) {
        console.warn('[Device] Token update failed:', err);
      } finally {
        tokenUpdateInFlight = null;
      }
    })();

    return tokenUpdateInFlight;
  })();
}
