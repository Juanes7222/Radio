import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('social two column', () => {
  it('renderiza las redes en una cuadrícula de dos columnas', () => {
    const src = read('app/(tabs)/social.tsx');
    expect(src).toMatch(/flexDirection: 'row'/);
    expect(src).toMatch(/flexWrap: 'wrap'/);
    expect(src).toMatch(/linkItem/);
    expect(src).toMatch(/width: '50%'/);
  });
});
