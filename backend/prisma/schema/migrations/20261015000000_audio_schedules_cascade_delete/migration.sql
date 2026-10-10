-- audio_schedules: ON DELETE RESTRICT -> ON DELETE CASCADE.
--
-- SQLite cannot alter a foreign key, so the table is rebuilt.
-- PRAGMA foreign_keys=OFF is mandatory here: with the pragma on, the DROP of
-- the old table fires the constraint and aborts the migration.
--
-- A schedule row without its audio means nothing, so it should not block the
-- delete. RESTRICT made the delete button fail on every single audio (P2003),
-- because hourly.job.ts writes one schedule per audio it generates or reuses.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_audio_schedules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "audio_id" TEXT NOT NULL,
    "scheduled_date" DATETIME NOT NULL,
    "scheduled_hour" INTEGER NOT NULL,
    "cron_expression" TEXT,
    "azuracast_playlist_id" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "played_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audio_schedules_audio_id_fkey" FOREIGN KEY ("audio_id") REFERENCES "generated_audios" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_audio_schedules" ("id", "audio_id", "scheduled_date", "scheduled_hour", "cron_expression", "azuracast_playlist_id", "enabled", "played_at", "created_at")
SELECT "id", "audio_id", "scheduled_date", "scheduled_hour", "cron_expression", "azuracast_playlist_id", "enabled", "played_at", "created_at"
FROM "audio_schedules";

DROP TABLE "audio_schedules";

ALTER TABLE "new_audio_schedules" RENAME TO "audio_schedules";

CREATE INDEX "audio_schedules_scheduled_date_idx" ON "audio_schedules"("scheduled_date");

CREATE INDEX "audio_schedules_scheduled_hour_idx" ON "audio_schedules"("scheduled_hour");

CREATE INDEX "audio_schedules_enabled_idx" ON "audio_schedules"("enabled");

CREATE UNIQUE INDEX "audio_schedules_scheduled_date_scheduled_hour_key" ON "audio_schedules"("scheduled_date", "scheduled_hour");

PRAGMA foreign_keys=ON;