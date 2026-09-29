import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { BACKEND_URL } from '@/constants/api';
import { deleteSecretItem, getSecretItem, setSecretItem } from './secureStorage';

const DEVICE_ID_KEY = '@radio/deviceId';
const FCM_TOKEN_KEY = '@radio/fcmToken';
const DEVICE_SECRET_KEY = 'device_secret_v1';

/**
 * Android channel every visible notification uses, local and server sent. It
 * must match `ANDROID_NOTIFICATION_CHANNEL_ID` on the backend and the
 * `defaultChannel` of the expo-notifications plugin in app.json. The alarm
 * feature keeps its own channel because it plays a different sound.
 */
export const NOTIFICATION_CHANNEL_ID = 'radio-announcements';
const NOTIFICATION_CHANNEL_NAME = 'Avisos de la emisora';

let cachedDeviceId: string | null = null;

// The deviceId is a technical installation identifier. It is never a
// credential: device operations are authorized by the deviceSecret below.
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = Crypto.randomUUID();
    await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  cachedDeviceId = deviceId;
  return deviceId;
}

export async function getDeviceSecret(): Promise<string | null> {
  return getSecretItem(DEVICE_SECRET_KEY);
}

async function clearDeviceSecret(): Promise<void> {
  await deleteSecretItem(DEVICE_SECRET_KEY);
}

/**
 * Ensures this installation has a deviceSecret, registering it on the server
 * when needed. Returns null when registration could not complete, so callers
 * can skip the operation instead of falling back to deviceId-only writes.
 */
export async function ensureDeviceSecret(): Promise<string | null> {
  const existing = await getDeviceSecret();
  if (existing) return existing;

  await registerDevice();
  return getDeviceSecret();
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

async function performRegistration(): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    const fcmToken = await getFCMToken();
    const secret = await getDeviceSecret();

    const existingToken = await AsyncStorage.getItem(FCM_TOKEN_KEY);
    if (fcmToken && existingToken === fcmToken && secret) {
      return;
    }

    const response = await fetch(`${BACKEND_URL}/api/devices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({
        deviceId,
        ...(fcmToken ? { fcmToken } : {}),
        platform: Platform.OS === 'android' ? 'ANDROID' : 'IOS',
        appVersion: Constants.expoConfig?.version ?? '1.0.0',
      }),
    });

    if (!response.ok) {
      console.warn('[Device] Registration failed:', response.status);
      return;
    }

    const data = (await response.json().catch(() => null)) as { deviceSecret?: unknown } | null;
    if (typeof data?.deviceSecret === 'string') {
      await setSecretItem(DEVICE_SECRET_KEY, data.deviceSecret);
    }
    if (fcmToken) {
      await AsyncStorage.setItem(FCM_TOKEN_KEY, fcmToken);
    }
    console.log('[Device] Registered successfully');
  } catch (err) {
    console.warn('[Device] Registration failed:', err);
  }
}

let registrationInFlight: Promise<void> | null = null;

/**
 * Registers the installation, collapsing concurrent calls so a fresh or
 * legacy device cannot be issued two different secrets at once.
 */
export function registerDevice(): Promise<void> {
  if (registrationInFlight) return registrationInFlight;

  registrationInFlight = performRegistration().finally(() => {
    registrationInFlight = null;
  });
  return registrationInFlight;
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
        const secret = await getDeviceSecret();
        const response = await fetch(`${BACKEND_URL}/api/devices/${deviceId}/token`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
          },
          body: JSON.stringify({ fcmToken: newToken }),
        });

        if (response.ok) {
          await AsyncStorage.setItem(FCM_TOKEN_KEY, newToken);
          console.log('[Device] FCM token updated');
        } else if (response.status === 401 || response.status === 404) {
          // Missing or rejected secret: drop it and re-register so the server
          // can issue a fresh one (legacy installations claim theirs here).
          console.warn('[Device] Token update unauthorized -> fallback to registerDevice');
          await clearDeviceSecret();
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
