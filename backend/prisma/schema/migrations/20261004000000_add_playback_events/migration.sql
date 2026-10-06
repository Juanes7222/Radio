-- CreateTable
CREATE TABLE "playback_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "azuracast_sh_id" INTEGER NOT NULL,
    "played_at" DATETIME NOT NULL,
    "duration_sec" INTEGER NOT NULL,
    "song_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL DEFAULT '',
    "album" TEXT NOT NULL DEFAULT '',
    "playlist" TEXT NOT NULL DEFAULT '',
    "streamer" TEXT NOT NULL DEFAULT '',
    "is_request" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "playback_events_azuracast_sh_id_key" ON "playback_events"("azuracast_sh_id");

-- CreateIndex
CREATE INDEX "playback_events_played_at_idx" ON "playback_events"("played_at");

-- CreateIndex
CREATE INDEX "playback_events_song_id_idx" ON "playback_events"("song_id");