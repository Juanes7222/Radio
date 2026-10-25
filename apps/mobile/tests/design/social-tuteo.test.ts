import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('social tuteo', () => {
  it('usa "Escríbenos" en tuteo', () => {
    expect(read('app/(tabs)/social.tsx')).toMatch(/Escríbenos/);
    expect(read('app/(tabs)/social.tsx')).not.toMatch(/Escríbanos/);
  });
});
