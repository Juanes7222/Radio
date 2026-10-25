import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('social icon tone', () => {
  it('usa un tono lavanda único para los iconos de redes', () => {
    const src = read('app/(tabs)/social.tsx');
    expect(src).toMatch(/Colors\.signalLight/);
    expect(src).not.toMatch(/#1877f2/);
    expect(src).not.toMatch(/#e1306c/);
    expect(src).not.toMatch(/#ff0000/);
    expect(src).not.toMatch(/#1DB954/);
  });

  it('usa un recuadro neutro para los círculos de icono', () => {
    expect(read('app/(tabs)/social.tsx')).toMatch(/Colors\.signalMuted/);
  });
});
