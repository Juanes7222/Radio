import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Bearer credentials live in the OS keystore. SecureStore has no web
 * implementation, so web builds fall back to AsyncStorage instead of crashing.
 * Native builds always use the keystore.
 */
let secureStoreAvailable: Promise<boolean> | null = null;

function isSecureStoreAvailable(): Promise<boolean> {
  if (!secureStoreAvailable) {
    secureStoreAvailable = SecureStore.isAvailableAsync().catch(() => false);
  }
  return secureStoreAvailable;
}

export async function getSecretItem(key: string): Promise<string | null> {
  if (await isSecureStoreAvailable()) return SecureStore.getItemAsync(key);
  return AsyncStorage.getItem(key);
}

export async function setSecretItem(key: string, value: string): Promise<void> {
  if (await isSecureStoreAvailable()) {
    await SecureStore.setItemAsync(key, value);
    return;
  }
  await AsyncStorage.setItem(key, value);
}

export async function deleteSecretItem(key: string): Promise<void> {
  if (await isSecureStoreAvailable()) {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  await AsyncStorage.removeItem(key);
}
