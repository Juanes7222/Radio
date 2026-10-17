import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const webSrc = join(repoRoot, 'apps', 'web', 'src');

function read(...parts: string[]): string {
  return readFileSync(join(...parts), 'utf8');
}

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full;
  }
}

/**
 * The channel list used to be two env vars. The panel owns it now, so a stray read
 * of either is a silent regression: the backend would boot subscribing to nothing
 * while the panel showed an empty list and no error anywhere.
 *
 * The one-shot backfill is the exception — reading them is its whole purpose, and
 * it only runs once, by hand.
 */
const BACKFILL = 'backfillYoutubeChannels.ts';

describe('youtube channels in the panel', () => {
  it('keeps the /admin/youtube entry under the youtube permission', () => {
    const layout = read(webSrc, 'pages', 'admin', 'AdminLayout.tsx');
    expect(/to:\s*'\/admin\/youtube'[\s\S]{0,200}?permission:\s*'youtube'/.test(layout)).toBe(true);
  });

  it('calls the channel endpoints by name', () => {
    const api = read(webSrc, 'hooks', 'useAdminApi.ts');
    expect(api).toContain('/admin-api/youtube/channels');
    expect(api).toContain('/resubscribe');
    expect(api).toContain('encodeURIComponent(channelId)');
  });

  it('reads the two upload paths from the same channel row', () => {
    // The dispatcher picks the playlist a job is sent with and the worker upload
    // picks the folder the file lands in. If only one of them reads the category,
    // the video ends up in one playlist and the folder of the other.
    const dispatcher = read(repoRoot, 'backend', 'src', 'modules', 'workers', 'jobDispatcher.ts');
    const upload = read(repoRoot, 'backend', 'src', 'modules', 'workers', 'workerAdmin.routes.ts');

    for (const source of [dispatcher, upload]) {
      expect(source).toContain('channelCategoryOf');
      expect(source).toContain('category === "NEWS"');
    }
  });

  it('ignores notifications from channels that are not registered', () => {
    const webhook = read(repoRoot, 'backend', 'src', 'modules', 'youtube', 'youtube.routes.ts');
    expect(webhook).toContain('prisma.youTubeChannel.findUnique');
    expect(webhook).toContain('not registered');
  });

  it('reads no retired env var outside the one-shot backfill', () => {
    const offenders = [
      ...sourceFiles(webSrc),
      ...sourceFiles(join(repoRoot, 'backend', 'src')),
    ]
      .filter((file) => !file.endsWith(BACKFILL))
      .filter((file) => /YOUTUBE_CHANNEL_IDS|YOUTUBE_CHANNEL_NOTICES/.test(readFileSync(file, 'utf8')));

    expect(
      offenders,
      'the channel list lives in the database now; an env read would silently do nothing',
    ).toEqual([]);
  });

  it('has no leftover bootstrap setInterval for the resubscribe loop', () => {
    const bootstrap = read(repoRoot, 'backend', 'src', 'index.ts');
    expect(bootstrap).not.toContain('setInterval(subscribe');
    // The cadence belongs to the cron, so the bootstrap may only fire one pass.
    const setIntervalCalls = bootstrap.match(/setInterval\(/g) ?? [];
    expect(setIntervalCalls).toHaveLength(1);
  });
});