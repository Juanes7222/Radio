import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('bible reading settings', () => {
  it('reemplaza A-/A+ por el botón Aa', () => {
    const src = read('components/bible/BiblePanel.tsx');
    expect(src).toMatch(/<Text style={styles\.fontSizeBtnText}>Aa<\/Text>/);
    expect(src).not.toMatch(/>A-</);
    expect(src).not.toMatch(/>A\+</);
  });

  it('renderiza el panel de ajustes de lectura', () => {
    expect(read('components/bible/ReadingSettingsPanel.tsx')).toMatch(/ReadingSettingsPanel/);
    expect(read('components/bible/ReadingSettingsPanel.tsx')).toMatch(/Tema de lectura/);
    expect(read('components/bible/ReadingSettingsPanel.tsx')).toMatch(/Sepia/);
    expect(read('components/bible/ReadingSettingsPanel.tsx')).toMatch(/Alto contraste/);
  });

  it('aplica temas de lectura en el panel', () => {
    const src = read('components/bible/BiblePanel.tsx');
    expect(src).toMatch(/readingTheme/);
    expect(src).toMatch(/sepia/);
    expect(src).toMatch(/high-contrast/);
  });
});
