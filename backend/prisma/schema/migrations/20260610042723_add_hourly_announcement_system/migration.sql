-- CreateTable
CREATE TABLE "announcement_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "text_template" TEXT NOT NULL,
    "voice" TEXT NOT NULL DEFAULT 'ef_dora',
    "speed" REAL NOT NULL DEFAULT 0.95,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "generated_audios" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "template_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "filepath" TEXT NOT NULL,
    "text_rendered" TEXT NOT NULL,
    "duration_ms" INTEGER,
    "file_size_bytes" INTEGER,
    "voice" TEXT NOT NULL,
    "azuracast_media_id" TEXT,
    "generated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "hour_value" INTEGER,
    "time_slot_group" TEXT,
    "last_used_at" DATETIME,
    "last_used_date" DATETIME,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "generated_audios_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "announcement_templates" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audio_schedules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "audio_id" TEXT NOT NULL,
    "scheduled_date" DATETIME NOT NULL,
    "scheduled_hour" INTEGER NOT NULL,
    "cron_expression" TEXT,
    "azuracast_playlist_id" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "played_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audio_schedules_audio_id_fkey" FOREIGN KEY ("audio_id") REFERENCES "generated_audios" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "generation_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "job_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "details" TEXT,
    "audios_generated" INTEGER,
    "duration_ms" INTEGER,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "generated_audios_filename_key" ON "generated_audios"("filename");

-- CreateIndex
CREATE INDEX "generated_audios_hour_value_idx" ON "generated_audios"("hour_value");

-- CreateIndex
CREATE INDEX "generated_audios_time_slot_group_idx" ON "generated_audios"("time_slot_group");

-- CreateIndex
CREATE INDEX "generated_audios_status_idx" ON "generated_audios"("status");

-- CreateIndex
CREATE INDEX "generated_audios_last_used_date_idx" ON "generated_audios"("last_used_date");

-- CreateIndex
CREATE INDEX "audio_schedules_scheduled_date_idx" ON "audio_schedules"("scheduled_date");

-- CreateIndex
CREATE INDEX "audio_schedules_scheduled_hour_idx" ON "audio_schedules"("scheduled_hour");

-- CreateIndex
CREATE INDEX "audio_schedules_enabled_idx" ON "audio_schedules"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "audio_schedules_scheduled_date_scheduled_hour_key" ON "audio_schedules"("scheduled_date", "scheduled_hour");

-- CreateIndex
CREATE INDEX "generation_logs_started_at_idx" ON "generation_logs"("started_at");
