import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('NextUpCard', () => {
  it('shows the artwork of the next track', () => {
    const card = read('components/player/NextUpCard.tsx');

    expect(card).toMatch(/art\?: string \| null/);
    expect(card).toMatch(/<Image/);
  });

  it('receives the artwork from the payload', () => {
    const screen = read('app/(tabs)/index.tsx');

    expect(screen).toMatch(/playing_next\?\.song\.art/);
  });
});
