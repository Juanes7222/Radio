import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('schedule program bell', () => {
  it('muestra una campana de suscripción por programa', () => {
    const src = read('app/(tabs)/schedule.tsx');
    expect(src).toMatch(/bellButton/);
    expect(src).toMatch(/notifications-outline|notifications/);
    expect(src).toMatch(/toggleSubscription/);
    expect(src).toMatch(/isSubscribed/);
  });

  it('aparece tanto en la vista por categoría como en la cronológica', () => {
    const src = read('app/(tabs)/schedule.tsx');
    expect((src.match(/bellButton/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
