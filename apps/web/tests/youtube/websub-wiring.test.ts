import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function read(...parts: string[]): string {
  return readFileSync(join(repoRoot, ...parts), 'utf8');
}

/**
 * Ingestion went quiet while the panel claimed the subscription was healthy: the
 * hub could not verify the callback because a guarded router was mounted in front
 * of it, and later the topic it watched stopped serving entries at all. None of
 * that is visible in a screenshot, so the wiring is pinned here.
 *
 * Measured on 31 Oct 2026: `/feeds/videos.xml` answers 404 for a real and for an
 * invented channel, and `/xml/feeds/videos.xml` answers the same 463 byte stub
 * for both. The panel check and the poller therefore read the Data API.
 */
describe('the youtube ingestion', () => {
  it('mounts the webhook before the admin router', () => {
    const app = read('backend', 'src', 'app.ts');
    const webhook = app.indexOf('app.use("/admin-api/youtube", youtubeRouter)');
    const admin = app.indexOf('app.use("/admin-api/youtube", youtubeAdminRouter)');

    expect(webhook).toBeGreaterThan(-1);
    expect(admin).toBeGreaterThan(-1);
    // requireAuth guards every path of the admin router, so with it first the hub
    // gets a 401 instead of the challenge and the subscription never verifies.
    expect(webhook).toBeLessThan(admin);
  });

  it('reads uploads from the Data API instead of the retired feed', () => {
    const uploads = read('backend', 'src', 'modules', 'youtube', 'channelUploads.service.ts');

    expect(uploads).toContain('googleapis.com/youtube/v3/playlistItems');
    expect(uploads).toContain('uploadsPlaylistId');
    expect(uploads).not.toMatch(/feeds\/videos\.xml\?channel_id/);
  });

  it('feeds the queue from polling and from the webhook through one path', () => {
    const subscription = read('backend', 'src', 'modules', 'youtube', 'subscription.service.ts');
    const webhook = read('backend', 'src', 'modules', 'youtube', 'youtube.routes.ts');

    expect(subscription).toContain('fetchChannelUploads');
    expect(subscription).toContain('ingestVideo');
    expect(webhook).toContain('ingestVideo');
  });
});
