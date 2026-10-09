export interface NoticeViewState {
  count: number;
  dismissed: boolean;
  lastShown: number | null;
}

const KEY_PREFIX = 'radio:notice:';

function key(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

export function getNoticeState(id: string): NoticeViewState {
  try {
    const raw = localStorage.getItem(key(id));
    if (!raw) return { count: 0, dismissed: false, lastShown: null };
    return JSON.parse(raw) as NoticeViewState;
  } catch {
    return { count: 0, dismissed: false, lastShown: null };
  }
}

export function bumpNoticeView(id: string): NoticeViewState {
  const s = getNoticeState(id);
  const next: NoticeViewState = { count: s.count + 1, dismissed: s.dismissed, lastShown: Date.now() };
  try { localStorage.setItem(key(id), JSON.stringify(next)); } catch {
    // Modo privado o cuota llena: el contador solo vive en memoria.
  }
  return next;
}

export function dismissNotice(id: string): void {
  const s = getNoticeState(id);
  try { localStorage.setItem(key(id), JSON.stringify({ ...s, dismissed: true })); } catch {
    // Sin persistencia el aviso vuelve a mostrarse, pero la sesión sigue viva.
  }
}

export function shouldShowNotice(id: string, maxDisplays: number, dismissible: boolean): boolean {
  const s = getNoticeState(id);
  if (dismissible && s.dismissed) return false;
  if (maxDisplays > 0 && s.count >= maxDisplays) return false;
  return true;
}
