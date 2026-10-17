-- CreateTable
CREATE TABLE "playlist_bumpers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "playlist_id" INTEGER NOT NULL,
    "intro_media_id" TEXT,
    "outro_media_id" TEXT,
    "intro_file" TEXT,
    "outro_file" TEXT,
    "glued" BOOLEAN NOT NULL DEFAULT true,
    "prior_backend_options" TEXT,
    "prior_order" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "playlist_bumpers_playlist_id_key" ON "playlist_bumpers"("playlist_id");