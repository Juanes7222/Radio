import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('motion vocabulary', () => {
  it('has one pressable with a scale response', () => {
    const pressable = read('components/ui/PressableScale.tsx');

    expect(pressable).toMatch(/0\.97/);
    expect(pressable).toMatch(/useReducedMotion/);
  });

  it('has three named entrances instead of a copied literal', () => {
    const motion = read('constants/motion.ts');

    expect(motion).toMatch(/enterList/);
    expect(motion).toMatch(/enterSheet/);
    expect(motion).toMatch(/enterBlock/);
    expect(read('app/(tabs)/social.tsx')).not.toMatch(/Easing\.bezier\(0\.16, 1, 0\.3, 1\)/);
  });
});
