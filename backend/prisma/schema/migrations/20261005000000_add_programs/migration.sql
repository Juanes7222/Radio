-- Programs produced outside the station team: each program owns an AzuraCast
-- playlist plus two library folders (pending / played). An uploaded episode is
-- composed with the program intro and outro, queued once, and archived in the
-- played folder as soon as it leaves the playlist.
CREATE TABLE "programs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "artist" TEXT,
    "album" TEXT,
    "genre" TEXT,
    "art_file" TEXT,
    "intro_file" TEXT,
    "outro_file" TEXT,
    "fade_seconds" REAL NOT NULL DEFAULT 0,
    "playlist_id" INTEGER NOT NULL,
    "pending_folder" TEXT NOT NULL DEFAULT 'NO REPRODUCIDOS',
    "played_folder" TEXT NOT NULL DEFAULT 'REPRODUCIDOS',
    "folder_name" TEXT NOT NULL,
    "schedule_mode" TEXT NOT NULL DEFAULT 'none',
    "days_mask" INTEGER NOT NULL DEFAULT 127,
    "air_start_minute" INTEGER,
    "air_end_minute" INTEGER,
    "days_ahead" INTEGER NOT NULL DEFAULT 7,
    "lead_minutes" INTEGER NOT NULL DEFAULT 10,
    "buffer_minutes" INTEGER NOT NULL DEFAULT 2,
    "category_id" TEXT,
    "active" INTEGER NOT NULL DEFAULT 1,
    "last_sync_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "program_episodes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "program_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source_file" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "upload_date" TEXT NOT NULL,
    "duration_sec" REAL,
    "relative_path" TEXT,
    "media_id" TEXT,
    "art_file" TEXT,
    "error_message" TEXT,
    "queued_at" DATETIME,
    "played_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "program_episodes_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "program_episodes_program_id_status_idx" ON "program_episodes"("program_id", "status");
CREATE INDEX "program_episodes_program_id_created_at_idx" ON "program_episodes"("program_id", "created_at");
CREATE UNIQUE INDEX "programs_name_key" ON "programs"("name");
CREATE UNIQUE INDEX "programs_slug_key" ON "programs"("slug");