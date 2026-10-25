import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('social / estación name', () => {
  it('la pestaña y la pantalla se llaman Estación', () => {
    expect(read('app/(tabs)/_layout.tsx')).toMatch(/title: 'Estación'/);
    expect(read('app/(tabs)/social.tsx')).toMatch(/title="Estación"/);
  });
});
