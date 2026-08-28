import AsyncStorage from '@react-native-async-storage/async-storage';

export interface NoticeViewState {
  count: number;
  dismissed: boolean;
  lastShown: number | null;
}

const PREFIX = '@radio:notice:';

function key(id: string): string {
  return `${PREFIX}${id}`;
}

export async function getNoticeState(id: string): Promise<NoticeViewState> {
  try {
    const raw = await AsyncStorage.getItem(key(id));
    if (!raw) return { count: 0, dismissed: false, lastShown: null };
    return JSON.parse(raw) as NoticeViewState;
  } catch {
    return { count: 0, dismissed: false, lastShown: null };
  }
}

export async function bumpNoticeView(id: string): Promise<NoticeViewState> {
  const s = await getNoticeState(id);
  const next: NoticeViewState = { count: s.count + 1, dismissed: s.dismissed, lastShown: Date.now() };
  try { await AsyncStorage.setItem(key(id), JSON.stringify(next)); } catch {}
  return next;
}

export async function dismissNotice(id: string): Promise<void> {
  const s = await getNoticeState(id);
  try { await AsyncStorage.setItem(key(id), JSON.stringify({ ...s, dismissed: true })); } catch {}
}

export async function shouldShowNotice(id: string, maxDisplays: number, dismissible: boolean): Promise<boolean> {
  const s = await getNoticeState(id);
  if (dismissible && s.dismissed) return false;
  if (maxDisplays > 0 && s.count >= maxDisplays) return false;
  return true;
}
