import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function read(...parts: string[]): string {
  return readFileSync(join(repoRoot, ...parts), 'utf8');
}

/**
 * The ingestion went quiet for two independent reasons and the panel reported
 * neither: the hub could not verify the callback because a guarded router was
 * mounted in front of it, and the topic it was watching answered an empty stub.
 * Both are invisible in a screenshot, so they are pinned here.
 */
describe('the websub ingestion', () => {
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

  it('points the hub and the feed check at the same live feed', () => {
    const feed = read('backend', 'src', 'modules', 'youtube', 'channelFeed.service.ts');
    const subscription = read('backend', 'src', 'modules', 'youtube', 'subscription.service.ts');

    // /xml/feeds/videos.xml answers 200 with the same 463 byte stub for a real
    // channel, for someone else's channel and for an invented id, so a topic
    // there can never have anything to publish. Naming it in a comment is fine;
    // building a URL on it is not.
    expect(feed).not.toMatch(/xml\/feeds\/videos\.xml\?channel_id/);
    expect(feed).toMatch(/feeds\/videos\.xml\?channel_id/);

    // One URL for both readers, or the hub watches a feed the panel never reports on.
    expect(subscription).toContain('channelFeedUrl');
    expect(subscription).not.toMatch(/feeds\/videos\.xml/);
  });
});