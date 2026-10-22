import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry === 'tests') return [];
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.tsx') ? [full] : [];
  });
}

const sources = new Map(
  walk(appRoot).map((file) => [
    file.slice(appRoot.length + 1).replace(/\\/g, '/'),
    readFileSync(file, 'utf8'),
  ]),
);

describe('touch targets', () => {
  it('has no target declared below 48dp', () => {
    const offenders = [...sources.entries()]
      .filter(([, source]) => /minHeight: 44|minWidth: 44/.test(source))
      .map(([file]) => file);

    expect(offenders).toEqual([]);
  });

  it('keeps the small visual controls in the sheet layer at 48dp', () => {
    for (const file of [
      'components/bible/BibleSearch.tsx',
      'components/AlarmModal.tsx',
      'components/FacebookLivePlayer.tsx',
      'app/prayer/[id].tsx',
    ]) {
      expect(readFileSync(join(appRoot, file), 'utf8')).toMatch(
        /minHeight: 48|minWidth: 48|hitSlop/,
      );
    }
  });
});
