import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('reduced motion', () => {
  it('lets reanimated honour the system setting for every animation', () => {
    const layout = read('app/_layout.tsx');

    expect(layout).toMatch(/ReducedMotionConfig/);
    expect(layout).toMatch(/ReduceMotion\.System/);
  });

  it('keeps one source for the preference', () => {
    for (const file of [
      'components/player/DialVivo.tsx',
      'components/player/NextUpCard.tsx',
      'app/(tabs)/_layout.tsx',
    ]) {
      expect(read(file)).toMatch(/useReducedMotion/);
      expect(read(file)).not.toMatch(/isReduceMotionEnabled/);
    }
  });

  it('wakes the live moment up instead of showing a static circle', () => {
    expect(read('components/FacebookLivePlayer.tsx')).toMatch(/withRepeat/);
  });
});
