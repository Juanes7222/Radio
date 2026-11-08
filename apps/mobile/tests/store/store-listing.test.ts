import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The store listing is copy that a human pastes into Play Console, so the
 * limits Google enforces have no other guard. These assertions keep the files
 * publishable: a title over 30 characters is rejected by the console, and a
 * promise the app does not keep is a metadata policy violation.
 */
const METADATA_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'fastlane',
  'metadata',
  'android',
  'es-CO',
);

const TITLE_LIMIT = 30;
const SHORT_DESCRIPTION_LIMIT = 80;
const FULL_DESCRIPTION_LIMIT = 4000;

/** Guarantees the next line (the description) stays above this length. */
const FULL_DESCRIPTION_MINIMUM = 700;

const BRAND = 'La Voz de la Verdad';

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

function readField(fileName: string): string {
  return readFileSync(join(METADATA_DIR, fileName), 'utf8').trim();
}

const title = readField('title.txt');
const shortDescription = readField('short_description.txt');
const fullDescription = readField('full_description.txt');

describe('Play Store title', () => {
  it('fits the 30 character limit Play Console enforces', () => {
    expect(title.length, `"${title}" has ${title.length} characters`).toBeLessThanOrEqual(
      TITLE_LIMIT,
    );
  });

  it('keeps the brand recognizable', () => {
    expect(title).toContain(BRAND);
  });

  it('carries no ranking, price or promotional claim', () => {
    expect(title).not.toMatch(/n[uú]mero\s*1|#1|la mejor|gratis|oferta|descarga/i);
  });

  it('uses no emoji, which Play treats as misleading metadata', () => {
    expect(title).not.toMatch(EMOJI);
  });
});

describe('Play Store short description', () => {
  it('fits the 80 character limit', () => {
    expect(
      shortDescription.length,
      `"${shortDescription}" has ${shortDescription.length} characters`,
    ).toBeLessThanOrEqual(SHORT_DESCRIPTION_LIMIT);
  });

  it('names the primary keyword users search for', () => {
    expect(shortDescription.toLowerCase()).toContain('radio cristiana');
  });

  it('states functionality instead of asking for the install', () => {
    expect(shortDescription).not.toMatch(/descarga|instala|prueba ahora|entra ya/i);
  });
});

describe('Play Store full description', () => {
  it('fits the 4000 character limit', () => {
    expect(
      fullDescription.length,
      `the description has ${fullDescription.length} characters`,
    ).toBeLessThanOrEqual(FULL_DESCRIPTION_LIMIT);
  });

  it('is long enough to describe the app instead of repeating the short one', () => {
    expect(fullDescription.length).toBeGreaterThanOrEqual(FULL_DESCRIPTION_MINIMUM);
    expect(fullDescription).not.toContain(shortDescription);
  });

  it('describes only features the app has', () => {
    expect(fullDescription).not.toMatch(/sin conexi[oó]n|offline|descargar (los )?programas/i);
  });

  it('repeats neither the brand nor the main keyword to the point of stuffing', () => {
    const mentions = fullDescription.match(/radio cristiana/gi) ?? [];
    expect(mentions.length, `"radio cristiana" appears ${mentions.length} times`).toBeLessThan(5);
  });
});
