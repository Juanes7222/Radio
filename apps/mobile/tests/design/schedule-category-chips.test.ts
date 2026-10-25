import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('schedule category chips', () => {
  it('renderiza chips de categoría desplazables', () => {
    expect(read('app/(tabs)/schedule.tsx')).toMatch(/CategoryChips/);
    expect(read('app/(tabs)/schedule.tsx')).toMatch(/chipsContainer/);
    expect(read('app/(tabs)/schedule.tsx')).toMatch(/chipDot/);
  });

  it('incluye el chip "Todas"', () => {
    expect(read('app/(tabs)/schedule.tsx')).toMatch(/Todas/);
  });
});
