import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('bible highlight and share', () => {
  it('permite resaltar un versículo al mantener pulsado', () => {
    const src = read('components/bible/BiblePanel.tsx');
    expect(src).toMatch(/highlightedVerses/);
    expect(src).toMatch(/toggleHighlight/);
    expect(src).toMatch(/onLongPress/);
  });

  it('marca visualmente el versículo resaltado', () => {
    expect(read('components/bible/BiblePanel.tsx')).toMatch(/verseRowHighlighted/);
    expect(read('components/bible/BiblePanel.tsx')).toMatch(/verseTextHighlighted/);
  });

});
