import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('schedule on-air card', () => {
  it('renderiza una tarjeta "Al aire ahora"', () => {
    expect(read('app/(tabs)/schedule.tsx')).toMatch(/Al aire ahora/);
    expect(read('app/(tabs)/schedule.tsx')).toMatch(/OnAirCard/);
    expect(read('app/(tabs)/schedule.tsx')).toMatch(/onAirProgram/);
  });

  it('usa fondo índigo elevado y insignia en vivo', () => {
    const src = read('app/(tabs)/schedule.tsx');
    expect(src).toMatch(/Colors\.inkElevated/);
    expect(src).toMatch(/onAirDot/);
  });
});
