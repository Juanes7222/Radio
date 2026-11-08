/**
 * Renders the Play Store feature graphic from the brand logo.
 *
 * Run from the repository root: node scripts/aso/feature-graphic.ts
 * Output: apps/mobile/fastlane/metadata/android/es-CO/images/featureGraphic.png
 *
 * Play requires exactly 1024x500 in JPEG or 24-bit PNG without alpha, crops the
 * outer edges on some surfaces, and overlays the preview video play button on
 * the centre, so every readable element stays left of centre and away from the
 * edges.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const requireFromMobile = createRequire(join(ROOT, 'apps', 'mobile', 'package.json'));
const sharp = requireFromMobile('sharp') as typeof import('sharp');

const LOGO_PATH = join(ROOT, 'packages', 'assets', 'img', 'LOGO_COMPLETO_SINFONDO2-opt.png');
const OUTPUT_PATH = join(
  ROOT,
  'apps',
  'mobile',
  'fastlane',
  'metadata',
  'android',
  'es-CO',
  'images',
  'featureGraphic.png',
);

const WIDTH = 1024;
const HEIGHT = 500;

const BRAND = {
  ink: '#020817',
  inkElevated: '#16264D',
  inkGlow: '#1B2E5C',
  signal: '#8D86F4',
  text: '#F1F4FA',
} as const;

const HEADLINE = 'Radio cristiana en vivo, 24 horas';

const MARGIN_LEFT = 72;
const LOGO_WIDTH = 340;
const LOGO_TOP = 116;
const RULE_Y = 296;
const HEADLINE_BASELINE = 356;
const HEADLINE_SIZE = 44;

function buildBackgroundSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <radialGradient id="ground" cx="40%" cy="38%" r="80%">
      <stop offset="0%" stop-color="${BRAND.inkGlow}"/>
      <stop offset="58%" stop-color="${BRAND.inkElevated}"/>
      <stop offset="100%" stop-color="${BRAND.ink}"/>
    </radialGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${BRAND.signal}" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="${BRAND.signal}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#ground)"/>
  <ellipse cx="300" cy="190" rx="330" ry="220" fill="url(#halo)"/>
  <g fill="none" stroke="${BRAND.signal}" stroke-opacity="0.16" stroke-width="1.5">
    <circle cx="1050" cy="250" r="260"/>
    <circle cx="1050" cy="250" r="215"/>
    <circle cx="1050" cy="250" r="170"/>
  </g>
  <rect x="${MARGIN_LEFT}" y="${RULE_Y}" width="56" height="4" rx="2" fill="${BRAND.signal}"/>
  <text x="${MARGIN_LEFT}" y="${HEADLINE_BASELINE}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="${HEADLINE_SIZE}" font-weight="600" letter-spacing="-0.5" fill="${BRAND.text}">${HEADLINE}</text>
</svg>`;
}

async function renderFeatureGraphic(): Promise<void> {
  const base = await sharp(Buffer.from(buildBackgroundSvg())).png().toBuffer();
  const logo = await sharp(LOGO_PATH).trim().resize({ width: LOGO_WIDTH }).png().toBuffer();

  const graphic = await sharp(base)
    .composite([{ input: logo, left: MARGIN_LEFT, top: LOGO_TOP }])
    .flatten({ background: BRAND.ink })
    .removeAlpha()
    .toColourspace('srgb')
    .png({ compressionLevel: 9 })
    .toBuffer();

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, graphic);

  const meta = await sharp(graphic).metadata();
  console.log(`feature graphic: ${meta.width}x${meta.height} ${meta.format} alpha=${meta.hasAlpha}`);
  console.log(`${(graphic.length / 1024).toFixed(1)} KB -> ${OUTPUT_PATH}`);
}

renderFeatureGraphic().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
