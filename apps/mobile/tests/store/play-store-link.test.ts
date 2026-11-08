import { describe, expect, it } from 'vitest';
import { buildPlayStoreUrl } from '../../lib/playStore';

const SHARE_URL = buildPlayStoreUrl({
  source: 'app',
  medium: 'share',
  campaign: 'player_share',
});

describe('Play Store link', () => {
  it('points at the published listing', () => {
    expect(SHARE_URL.startsWith('https://play.google.com/store/apps/details?id=com.lavozverdad.radio')).toBe(
      true,
    );
  });

  it('carries the campaign in the referrer Play Console reads', () => {
    const referrer = new URL(SHARE_URL).searchParams.get('referrer');
    expect(referrer).toBe('utm_source=app&utm_medium=share&utm_campaign=player_share');
  });

  it('encodes the referrer exactly once', () => {
    expect(SHARE_URL).toContain(
      'referrer=utm_source%3Dapp%26utm_medium%3Dshare%26utm_campaign%3Dplayer_share',
    );
    expect(SHARE_URL).not.toContain('%253D');
  });

  it('keeps the referrer under the 512 characters Play accepts', () => {
    const referrer = new URL(SHARE_URL).searchParams.get('referrer') ?? '';
    expect(referrer.length).toBeLessThanOrEqual(512);
  });

  it('still opens the listing when the campaign is empty', () => {
    const url = buildPlayStoreUrl({ source: '', medium: '', campaign: '' });
    expect(url).toContain('id=com.lavozverdad.radio');
    expect(new URL(url).searchParams.get('referrer')).toBe(
      'utm_source=&utm_medium=&utm_campaign=',
    );
  });
});
