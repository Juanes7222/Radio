import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('prayer verse hero', () => {
  it('presenta el versículo del día como héroe con tarjeta amplia', () => {
    const src = read('app/(tabs)/prayer.tsx');
    expect(src).toMatch(/verseHero/);
    expect(src).toMatch(/verseHalo/);
    expect(src).toMatch(/verseTextHero/);
    expect(src).toMatch(/verseReferenceHero/);
  });

  it('usa la tipografía serif para el versículo', () => {
    expect(read('app/(tabs)/prayer.tsx')).toMatch(/Typography\.message/);
  });

  it('ofrece acciones de compartir y abrir en Biblia', () => {
    const src = read('app/(tabs)/prayer.tsx');
    expect(src).toMatch(/Compartir versículo del día/);
    expect(src).toMatch(/Abrir Biblia en En vivo/);
    expect(src).toMatch(/Share\.share/);
  });
});
