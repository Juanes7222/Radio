import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteSecretItem, getSecretItem, setSecretItem } from './secureStorage';

// The server returns one bearer token per prayer request. The token authorizes
// exactly that request, so a compromised token never exposes the whole history.
// Only the non-secret ids are indexed in AsyncStorage; tokens stay in the keystore.
const PRAYER_IDS_KEY = '@radio/prayerIds';

function tokenKey(id: string): string {
  return `prayer_token_${id}`;
}

export async function listPrayerIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(PRAYER_IDS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
}

async function writePrayerIds(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(PRAYER_IDS_KEY, JSON.stringify(ids));
}

export async function rememberPrayerCredential(id: string, token: string): Promise<void> {
  await setSecretItem(tokenKey(id), token);
  const ids = await listPrayerIds();
  if (!ids.includes(id)) {
    await writePrayerIds([id, ...ids]);
  }
}

export async function getPrayerCredential(id: string): Promise<string | null> {
  return getSecretItem(tokenKey(id));
}

export async function forgetPrayerCredential(id: string): Promise<void> {
  await deleteSecretItem(tokenKey(id));
  const ids = await listPrayerIds();
  await writePrayerIds(ids.filter((value) => value !== id));
}
