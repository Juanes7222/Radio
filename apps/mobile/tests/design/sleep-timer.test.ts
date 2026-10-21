import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('sleep timer', () => {
  it('stops counting in the hook that owns the whole screen', () => {
    const hook = read('hooks/useSleepTimer.ts');

    expect(hook).not.toMatch(/setRemaining/);
    expect(hook).not.toMatch(/display:/);
  });

  it('counts down inside the bubble, once per second', () => {
    const bubble = read('components/player/SleepTimerBubble.tsx');

    expect(bubble).toMatch(/setInterval\([^,]+,\s*1000\)/);
    expect(bubble).toMatch(/endTime/);
  });

  it('gives the bubble the end time instead of a precomputed string', () => {
    const screen = read('app/(tabs)/index.tsx');

    expect(screen).toMatch(/<SleepTimerBubble[\s\S]{0,320}endTime=/);
    expect(screen).not.toMatch(/display=\{sleepTimer\.display\}/);
  });
});
