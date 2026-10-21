import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('listening options', () => {
  it('keeps two elements in the top bar', () => {
    const bar = read('components/player/PlayerTopBar.tsx');

    expect(bar).toMatch(/onOpenOptions: \(\) => void/);
    expect(bar).not.toMatch(/onOpenNotifications|onOpenSleepTimer|onOpenAlarm|onOpenQuality/);
    expect(bar).not.toMatch(/timerBadge|qualityBadge/);
  });

  it('hosts every listening setting in one sheet', () => {
    const sheet = read('components/player/ListeningOptionsSheet.tsx');

    expect(sheet).toMatch(/NotificationsOptions/);
    expect(sheet).toMatch(/SleepTimerOptions/);
    expect(sheet).toMatch(/QualityOptions/);
    expect(sheet).toMatch(/onOpenAlarms/);
  });

  it('hides the quality section when there is a single mount', () => {
    const sheet = read('components/player/ListeningOptionsSheet.tsx');

    expect(sheet).toMatch(/availableQualities\.length > 1/);
  });

  it('removes the three sheets it replaces', () => {
    for (const file of [
      'components/NotificationsModal.tsx',
      'components/SleepTimerModal.tsx',
      'components/QualityModal.tsx',
    ]) {
      expect(existsSync(join(appRoot, file))).toBe(false);
    }
  });

  it('mounts the new sheet and no longer mounts the old ones', () => {
    const screen = read('app/(tabs)/index.tsx');

    expect(screen).toMatch(/<ListeningOptionsSheet/);
    expect(screen).not.toMatch(/NotificationsModal|SleepTimerModal|QualityModal/);
  });
});
