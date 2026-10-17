-- The channel list is the panel's configuration now, so the table is named after
-- what it holds. YouTubeSubscription only ever received an upsert at boot and was
-- never read; its rows carry over as pending channels.
CREATE TABLE "YouTubeChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "subscribedAt" DATETIME,
    "expiresAt" DATETIME,
    "lastNotifiedAt" DATETIME,
    "subscriptionError" TEXT,
    "feedEntryCount" INTEGER,
    "feedCheckedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "YouTubeChannel_channelId_key" ON "YouTubeChannel"("channelId");

INSERT INTO "YouTubeChannel" ("id", "channelId", "title", "category", "subscribedAt", "expiresAt", "createdAt", "updatedAt")
SELECT "id", "channelId", "channelId", 'GENERAL', "subscribedAt", "expiresAt", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "YouTubeSubscription";

DROP TABLE "YouTubeSubscription";