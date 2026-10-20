import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Colors } from '../../constants/theme';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

function channel(hex: string, index: number): number {
  const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('mobile palette', () => {
  it('keeps the night-blue family and earns the accent split', () => {
    expect(Colors.ink).toBe('#020817');
    expect(Colors.inkElevated).toBe('#16264D');
    expect(Colors.backgroundElevated).toBe(Colors.inkElevated);
    expect(Colors.signal).toBe('#8D86F4');
    expect(Colors.signalFill).toBe('#7C74F0');
    expect(Colors.tally).toBe('#E44456');
  });

  it('keeps AA contrast for the text that sits on each surface', () => {
    expect(contrast(Colors.textOnSignal, Colors.signalFill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(Colors.text, Colors.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(Colors.textMuted, Colors.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(Colors.textFaint, Colors.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(Colors.textAltFaint, Colors.ink)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the secondary text blue-grey instead of slate', () => {
    expect(Colors.text).toBe('#F1F4FA');
    expect(Colors.textMuted).toBe('#97A6C0');
    expect(Colors.textFaint).toBe('#7C8AA6');
    expect(Colors.textAltFaint).toBe('#6E7C96');

    for (const token of [Colors.textMuted, Colors.textFaint, Colors.textAltFaint]) {
      expect(channel(token, 2)).toBeGreaterThan(channel(token, 0));
    }
  });

  it('has no leftover literals from the previous palette', () => {
    const files = [
      'app/(tabs)/_layout.tsx',
      'app/(tabs)/index.tsx',
      'components/bible/BiblePanel.tsx',
    ];
    for (const file of files) {
      expect(read(file)).not.toMatch(/rgba\(8,\s*10,\s*30/);
    }
  });

  it('keeps the alarm wheel mask and glow on the sheet surface', () => {
    expect(read('components/alarm/TimeWheelPicker.tsx')).not.toMatch(/#12121f/i);
    expect(read('components/AlarmModal.tsx')).not.toMatch(/rgba\(245,\s*158,\s*11/);
  });

  it('reserves the on-air red for the on-air state', () => {
    const controls = read('components/PlayerControls.tsx');

    expect(controls).not.toMatch(/isFavorite \? Colors\.tally/);
    expect(controls).toMatch(/isFavorite \? Colors\.success/);
  });
});
