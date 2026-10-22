import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dialPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..',
  'components', 'player', 'DialVivo.tsx',
);

describe('DialVivo voice state', () => {
  it('stops the disc when a preaching is on air, on start and on resume', () => {
    const source = readFileSync(dialPath, 'utf8');
    const spinGates = source.match(/isPlaying && !isPreaching && !reduceMotion\.value/g) ?? [];

    expect(spinGates).toHaveLength(2);
  });

  it('empties the progress ring while the voice is on air', () => {
    const source = readFileSync(dialPath, 'utf8');

    expect(source).toMatch(/isPreaching \? 0 :/);
    expect(source).toMatch(/\}, \[progress, songId, isPreaching, ringProgress\]\);/);
  });

  it('shows a voice mark instead of a cover when there is no artwork', () => {
    const source = readFileSync(dialPath, 'utf8');

    expect(source).toMatch(/name="mic"/);
  });
});
