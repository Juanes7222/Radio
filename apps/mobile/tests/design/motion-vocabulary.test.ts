import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('motion vocabulary', () => {
  it('has one pressable with a scale response', () => {
    const pressable = read('components/ui/PressScale.tsx');

    expect(pressable).toMatch(/scale: 1 - pressed\.value \* intensity/);
    expect(pressable).toMatch(/useReducedMotion/);
  });

  it('is the only pressable the app has', () => {
    for (const file of [
      'app/(tabs)/request.tsx',
      'components/options/QualityOptions.tsx',
      'components/options/SleepTimerOptions.tsx',
      'components/options/NotificationsOptions.tsx',
    ]) {
      expect(read(file)).toMatch(/PressScale/);
      expect(read(file)).not.toMatch(/PressableScale/);
    }
  });

  it('has three named entrances instead of a copied literal', () => {
    const motion = read('constants/motion.ts');

    expect(motion).toMatch(/enterList/);
    expect(motion).toMatch(/enterSheet/);
    expect(motion).toMatch(/enterBlock/);
    expect(read('app/(tabs)/social.tsx')).not.toMatch(/Easing\.bezier\(0\.16, 1, 0\.3, 1\)/);
  });
});
