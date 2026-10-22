import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('font scaling', () => {
  it('never disables the system font scale', () => {
    expect(read('app/(tabs)/_layout.tsx')).not.toMatch(/allowFontScaling=\{false\}/);
    expect(read('components/alarm/TimeWheelPicker.tsx')).not.toMatch(/allowFontScaling=\{false\}/);
  });

  it('grows the fixed rows of the time wheel instead of clipping them', () => {
    const picker = read('components/alarm/TimeWheelPicker.tsx');

    expect(picker).not.toMatch(/^\s*height: 44,/m);
    expect(picker).toMatch(/const ITEM_HEIGHT = 48/);
    expect(picker).toMatch(/minHeight: ITEM_HEIGHT/);
    expect(picker).toMatch(/maxFontSizeMultiplier/);
  });

  it('caps the scale of the text inside the player fixed geometry', () => {
    expect(read('app/(tabs)/index.tsx')).toMatch(/maxFontSizeMultiplier/);
  });
});
