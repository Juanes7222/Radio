-- The registered channel id was mistyped: an extra "v" and a lowercase "y".
-- YouTube answers 404 for it, so the channel never existed as far as the feed is
-- concerned and the ingestion had nothing to watch.
--
-- The ingested videos carry the same id, so they are corrected too. Leaving them
-- behind would make channelCategoryOf() miss the registry row and silently send
-- any still pending job to the general playlist instead of the news one.
UPDATE "YouTubeVideo" SET "channelId" = 'UCVqtYvLNHvGymJFoGeRH7nw' WHERE "channelId" = 'UCVqtvYvLNHvGymJFoGeRH7nw';

-- The subscription state on the row described the old topic, which answered an
-- empty stub. It is cleared instead of left in place: expiresAt null makes the
-- renewal cron re-subscribe with the working feed on its next pass (up to six
-- hours), and a feedEntryCount of zero would have the panel claim YouTube
-- answered a channel nobody asked about.
UPDATE "YouTubeChannel"
SET "channelId" = 'UCVqtYvLNHvGymJFoGeRH7nw',
    "expiresAt" = NULL,
    "feedEntryCount" = NULL,
    "feedCheckedAt" = NULL
WHERE "channelId" = 'UCVqtvYvLNHvGymJFoGeRH7nw';