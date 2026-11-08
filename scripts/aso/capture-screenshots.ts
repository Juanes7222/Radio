/**
 * Captures the six Play Store screenshots from a connected Android device.
 *
 * Run from the repository root: node scripts/aso/capture-screenshots.ts
 * Output: apps/mobile/fastlane/metadata/android/es-CO/images/phoneScreenshots/
 *
 * The device must show the app with real station data and a 1080x1920 display
 * (`adb shell wm size 1080x1920`). Each step taps a label that the app exposes
 * to accessibility, waits for the screen to settle and writes a 24-bit PNG with
 * no alpha, which is what Play accepts.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const requireFromMobile = createRequire(join(ROOT, 'apps', 'mobile', 'package.json'));
const sharp = requireFromMobile('sharp') as typeof import('sharp');

const ADB = join(
  process.env.LOCALAPPDATA ?? '',
  'Android',
  'Sdk',
  'platform-tools',
  'adb.exe',
);
const OUTPUT_DIR = join(
  ROOT,
  'apps',
  'mobile',
  'fastlane',
  'metadata',
  'android',
  'es-CO',
  'images',
  'phoneScreenshots',
);

const WIDTH = 1080;
const HEIGHT = 1920;

interface Step {
  readonly file: string;
  readonly taps: readonly string[];
  readonly waitMs: number;
  readonly pressBackFirst?: boolean;
}

const STEPS: readonly Step[] = [
  { file: '01-reproductor.png', taps: ['En vivo'], waitMs: 9000 },
  { file: '02-biblia.png', taps: ['Biblia'], waitMs: 3000 },
  { file: '03-programacion.png', taps: ['Horarios'], waitMs: 5000, pressBackFirst: true },
  { file: '04-oracion.png', taps: ['Oración'], waitMs: 4000 },
  { file: '05-solicitar.png', taps: ['Solicitar'], waitMs: 4000 },
  { file: '06-opciones.png', taps: ['En vivo', 'Opciones de escucha'], waitMs: 2500 },
];

function adb(args: readonly string[]): Buffer {
  return execFileSync(ADB, args, { maxBuffer: 32 * 1024 * 1024 });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tapTarget(xml: string, label: string): { x: number; y: number } {
  const nodes = xml.match(/<node[^>]*>/g) ?? [];
  const match = nodes.find(
    (node) =>
      node.includes(`text="${label}"`) || node.includes(`content-desc="${label}"`),
  );

  if (!match) {
    const labels = nodes
      .map((node) => node.match(/(?:text|content-desc)="([^"]+)"/)?.[1])
      .filter((value): value is string => Boolean(value));
    throw new Error(
      `No node labelled "${label}". Visible labels: ${[...new Set(labels)].join(' | ')}`,
    );
  }

  const bounds = match.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!bounds) throw new Error(`Node labelled "${label}" has no bounds`);

  const [, left, top, right, bottom] = bounds.map(Number);
  return { x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2) };
}

function uiDump(): string {
  adb(['shell', 'uiautomator', 'dump', '/sdcard/window_dump.xml']);
  return adb(['shell', 'cat', '/sdcard/window_dump.xml']).toString('utf8');
}

async function capture(filename: string): Promise<void> {
  const raw = adb(['exec-out', 'screencap', '-p']);
  const meta = await sharp(raw).metadata();

  if (meta.width !== WIDTH || meta.height !== HEIGHT) {
    throw new Error(
      `${filename}: captured ${meta.width}x${meta.height}. Run "adb shell wm size ${WIDTH}x${HEIGHT}" first.`,
    );
  }

  const png = await sharp(raw)
    .removeAlpha()
    .toColourspace('srgb')
    .png({ compressionLevel: 9 })
    .toBuffer();

  await writeFile(join(OUTPUT_DIR, filename), png);
  console.log(`${filename} ${(png.length / 1024).toFixed(0)} KB`);
}

async function run(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });

  for (const step of STEPS) {
    if (step.pressBackFirst) {
      adb(['shell', 'input', 'keyevent', '4']);
      await sleep(800);
    }

    for (const label of step.taps) {
      const { x, y } = tapTarget(uiDump(), label);
      adb(['shell', 'input', 'tap', String(x), String(y)]);
      await sleep(1200);
    }

    await sleep(step.waitMs);
    await capture(step.file);
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
