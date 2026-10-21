import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app', '(tabs)', 'prayer.tsx'),
  'utf8',
);

describe('prayer sensitive-data notice', () => {
  it('reads as information, not as a warning', () => {
    const notice = source.match(/sensitiveWarning: \{[\s\S]*?\n  \},/)?.[0] ?? '';

    expect(notice).not.toMatch(/Colors\.warning/);
    expect(notice).toMatch(/Colors\.textMuted/);
    expect(source).toMatch(/information-circle-outline/);
  });

  it('leaves the consent error in danger', () => {
    const error = source.match(/errorText: \{[\s\S]*?\n  \},/)?.[0] ?? '';

    expect(error).toMatch(/Colors\.danger/);
  });
});
