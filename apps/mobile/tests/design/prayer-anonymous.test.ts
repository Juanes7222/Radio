import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('prayer optional name', () => {
  it('el campo nombre indica que es opcional', () => {
    const src = read('app/(tabs)/prayer.tsx');
    expect(src).toMatch(/Nombre \(opcional\)/);
    expect(src).toMatch(/Tu nombre \(opcional\)/);
    expect(src).toMatch(/Nombre, opcional/);
  });

  it('no bloquea el envío si el nombre está vacío', () => {
    const src = read('app/(tabs)/prayer.tsx');
    expect(src).not.toMatch(/Ingresa tu nombre/);
    expect(src).not.toMatch(/errors\.name/);
  });
});
