import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Typography } from '../../constants/theme';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('sentence-case labels', () => {
  it('stops the type tokens from forcing uppercase', () => {
    expect(Typography.label).not.toHaveProperty('textTransform');
    expect(Typography.body).not.toHaveProperty('textTransform');
    expect(Typography.caption).not.toHaveProperty('textTransform');
  });

  it('keeps the body at the 16px floor and the label at 13', () => {
    expect(Typography.body.fontSize).toBe(16);
    expect(Typography.label.fontSize).toBe(13);
  });

  it('keeps every readable role at 13px or more', () => {
    expect(Typography.body.fontSize).toBeGreaterThanOrEqual(13);
    expect(Typography.bodyStrong.fontSize).toBeGreaterThanOrEqual(13);
    expect(Typography.label.fontSize).toBeGreaterThanOrEqual(13);
    expect(Typography.caption.fontSize).toBeGreaterThanOrEqual(13);
    expect(Typography.captionStrong.fontSize).toBeGreaterThanOrEqual(13);
    expect(Typography.sectionTitle.fontSize).toBeGreaterThanOrEqual(13);
    // Numbers are data, not reading, so the mono role may sit one step below.
    expect(Typography.mono.fontSize).toBeGreaterThanOrEqual(12);
    expect(Typography.monoLarge.fontSize).toBeGreaterThanOrEqual(12);
  });

  it('drops uppercase from the tab bar and the preaching badges', () => {
    expect(read('app/(tabs)/_layout.tsx')).not.toMatch(/textTransform: 'uppercase'/);
    expect(read('components/player/NowPlayingInfo.tsx')).not.toMatch(/textTransform: 'uppercase'/);
    const request = read('app/(tabs)/request.tsx');
    expect(request).not.toMatch(/textTransform: 'uppercase'/);
    expect(request).toMatch(/Prédica/);
  });

  it('has no kicker above a heading', () => {
    const header = read('components/ui/ScreenHeader.tsx');

    expect(header).not.toMatch(/eyebrow/);
    for (const file of [
      'app/(tabs)/request.tsx',
      'app/(tabs)/prayer.tsx',
      'app/(tabs)/schedule.tsx',
      'app/(tabs)/social.tsx',
    ]) {
      expect(read(file)).not.toMatch(/eyebrow=/);
    }
  });

  it('keeps the marks that are deliberately uppercase', () => {
    expect(read('components/LiveBadge.tsx')).toMatch(/EN VIVO/);
    expect(read('app/feedback.tsx')).toMatch(/textTransform: 'uppercase'/);
  });
});
