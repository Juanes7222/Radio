import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('mini player', () => {
  it('existe el componente MiniPlayer', () => {
    expect(read('components/player/MiniPlayer.tsx')).toMatch(/MiniPlayer/);
  });

  it('renderiza carátula, título, artista y botón pausa', () => {
    const src = read('components/player/MiniPlayer.tsx');
    expect(src).toMatch(/<ExpoImage/);
    expect(src).toMatch(/title/);
    expect(src).toMatch(/artist/);
    expect(src).toMatch(/pauseBar/);
  });

  it('se renderiza sobre las pestañas cuando hay audio activo', () => {
    expect(read('app/(tabs)/_layout.tsx')).toMatch(/MiniPlayer/);
    expect(read('app/(tabs)/_layout.tsx')).toMatch(/usePlaybackState/);
  });
});
