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
    return full.endsWith('.tsx') || full.endsWith('.ts') ? [full] : [];
  });
}

const sources = new Map(
  walk(appRoot).map((file) => [
    file.slice(appRoot.length + 1).replace(/\\/g, '/'),
    readFileSync(file, 'utf8'),
  ]),
);

describe('haptics', () => {
  it('has one module with the four responses', () => {
    const module = sources.get('lib/haptics.ts') ?? '';

    expect(module).toMatch(/export function tick/);
    expect(module).toMatch(/export function click/);
    expect(module).toMatch(/export function success/);
    expect(module).toMatch(/export function error/);
  });

  it('never calls expo-haptics outside that module', () => {
    const offenders = [...sources.entries()]
      .filter(([file, source]) => file !== 'lib/haptics.ts' && /Haptics\./.test(source))
      .map(([file]) => file);

    expect(offenders).toEqual([]);
  });

  it('does not use the warning notification as an error', () => {
    expect(sources.get('lib/haptics.ts')).not.toMatch(/NotificationFeedbackType\.Warning/);
  });
});
