import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatPrayerMoment } from '../../lib/time';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('prayer moments', () => {
  // 20 October 2026, 18:30 in the station's timezone.
  const now = new Date('2026-10-20T23:30:00.000Z');

  it('names today, yesterday and an older day', () => {
    expect(formatPrayerMoment('2026-10-20T20:40:00.000Z', now)).toBe('Hoy, 15:40');
    expect(formatPrayerMoment('2026-10-19T23:40:00.000Z', now)).toBe('Ayer, 18:40');
    expect(formatPrayerMoment('2026-10-05T23:40:00.000Z', now)).toMatch(/^5 de oct, 18:40$/);
  });

  it('keeps the year when it is not the current one', () => {
    expect(formatPrayerMoment('2025-12-24T23:40:00.000Z', now)).toMatch(/2025/);
  });

  it('returns nothing for a broken date', () => {
    expect(formatPrayerMoment('not a date', now)).toBe('');
  });
});

describe('petition thread', () => {
  it('drops the nested card and the edge bar from the list', () => {
    const list = read('app/prayer-history.tsx');

    expect(list).not.toMatch(/responsePreview/);
    expect(list).not.toMatch(/unreadEdge/);
    expect(list).toMatch(/PrayerNode/);
  });

  it('threads the detail screen instead of stacking cards', () => {
    const detail = read('app/prayer/[id].tsx');

    expect(detail).toMatch(/PrayerNode/);
    expect(detail).toMatch(/formatPrayerMoment/);
    expect(detail).not.toMatch(/RESPONSE_TEXT|ACCENT_BORDER|ACCENT_TINT/);
  });

  it('leaves no hardcoded colour in the petition screens', () => {
    for (const file of ['app/prayer-history.tsx', 'app/prayer/[id].tsx', 'lib/prayer.ts']) {
      expect(read(file)).not.toMatch(/#[0-9a-fA-F]{6}/);
    }
  });
});
