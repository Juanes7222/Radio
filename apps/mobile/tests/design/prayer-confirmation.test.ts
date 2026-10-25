import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('prayer confirmation', () => {
  it('muestra una confirmación a pantalla completa', () => {
    const src = read('app/(tabs)/prayer.tsx');
    expect(src).toMatch(/successScreen/);
    expect(src).toMatch(/Tu petición fue recibida/);
    expect(src).toMatch(/orando por ti/);
    expect(src).toMatch(/success\(\)/);
  });

  it('incluye acciones para enviar otra o ver el historial', () => {
    const src = read('app/(tabs)/prayer.tsx');
    expect(src).toMatch(/Enviar otra petición/);
    expect(src).toMatch(/Ver mis peticiones/);
  });
});
