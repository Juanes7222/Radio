import { readFileSync } from 'node:fs';
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
  });

  it('opens an index of three rows instead of one long sheet', () => {
    const sheet = read('components/player/ListeningOptionsSheet.tsx');

    expect(sheet).toMatch(/Calidad del audio/);
    expect(sheet).toMatch(/Notificaciones/);
    expect(sheet).toMatch(/Alarmas de radio/);
    expect(sheet).toMatch(/Opciones de escucha/);
  });

  it('keeps the sleep timer out of the options sheet', () => {
    const sheet = read('components/player/ListeningOptionsSheet.tsx');

    expect(sheet).not.toMatch(/SleepTimerOptions/);
    expect(sheet).not.toMatch(/timerEndTime|onSelectPreset/);
  });

  it('shows the sleep timer in its own short sheet', () => {
    const sheet = read('components/player/SleepTimerSheet.tsx');

    expect(sheet).toMatch(/Apagar la radio/);
    expect(sheet).toMatch(/SleepTimerOptions/);
  });

  it('keeps the timer bubble visible next to the controls', () => {
    const screen = read('app/(tabs)/index.tsx');

    expect(screen).toMatch(/SleepTimerSheet/);
    expect(screen).not.toMatch(/NotificationsModal|SleepTimerModal|QualityModal/);
  });
});
