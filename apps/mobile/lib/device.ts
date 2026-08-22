import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { BACKEND_URL } from '@/constants/api';

const DEVICE_ID_KEY = '@radio/deviceId';
const FCM_TOKEN_KEY = '@radio/fcmToken';

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
// itself is granted by the OS), so this never prompts the user. Local alarms
// request the display permission themselves, when the user arms one.
export async function getFCMToken(): Promise<string | null> {
  try {
    const tokenData = await Notifications.getDevicePushTokenAsync();
    return tokenData.data;
  } catch {
    return null;
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
