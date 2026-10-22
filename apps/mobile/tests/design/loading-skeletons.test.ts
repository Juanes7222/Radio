import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('loading states', () => {
  it('paints a skeleton while the catalogue loads', () => {
    const request = read('app/(tabs)/request.tsx');
    const initialLoad = request.match(/isInitialLoading \? \([\s\S]*?\) : \(/)?.[0] ?? '';

    expect(initialLoad).toMatch(/ShimmerBox/);
  });

  it('paints skeletons for the rows of the schedule', () => {
    expect(read('app/(tabs)/schedule.tsx')).toMatch(/ShimmerBox/);
  });
});
