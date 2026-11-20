import { describe, expect, it } from 'vitest';
import {
  createSessionDeduper,
  errorDedupeKey,
  shouldReportOpen,
  stationDay,
} from '../../lib/telemetry';

describe('stationDay', () => {
  it('uses the station calendar, not UTC', () => {
    expect(stationDay(new Date('2026-11-20T04:59:00Z'))).toBe('2026-11-19');
    expect(stationDay(new Date('2026-11-20T05:00:00Z'))).toBe('2026-11-20');
  });

  it('keeps the same day through the afternoon', () => {
    expect(stationDay(new Date('2026-11-20T23:30:00Z'))).toBe('2026-11-20');
  });
});

describe('shouldReportOpen', () => {
  it('reports the first open of a device', () => {
    expect(shouldReportOpen(null, '2026-11-19')).toBe(true);
  });

  it('skips a second open on the same day', () => {
    expect(shouldReportOpen('2026-11-19', '2026-11-19')).toBe(false);
  });

  it('reports again when the station day changes', () => {
    expect(shouldReportOpen('2026-11-19', '2026-11-20')).toBe(true);
  });
});

describe('errorDedupeKey', () => {
  it('ignores the frames after the first one', () => {
    const first = 'Error: boom\n    at play (player.ts:10:2)\n    at onPress (index.tsx:1:1)';
    const second = 'Error: boom\n    at play (player.ts:10:2)\n    at other (timer.ts:9:9)';

    expect(errorDedupeKey('boom', first)).toBe(errorDedupeKey('boom', second));
  });

  it('separates different messages', () => {
    expect(errorDedupeKey('boom', null)).not.toBe(errorDedupeKey('bang', null));
  });

  it('works without a stack', () => {
    expect(errorDedupeKey(' boom ', null)).toBe('boom|');
  });
});

describe('createSessionDeduper', () => {
  it('accepts a key once', () => {
    const shouldSend = createSessionDeduper();

    expect(shouldSend('a')).toBe(true);
    expect(shouldSend('a')).toBe(false);
  });

  it('stops at the limit even for new keys', () => {
    const shouldSend = createSessionDeduper(2);

    expect(shouldSend('a')).toBe(true);
    expect(shouldSend('b')).toBe(true);
    expect(shouldSend('c')).toBe(false);
  });
});
