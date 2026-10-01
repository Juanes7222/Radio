-- CreateTable
CREATE TABLE "playlist_rotations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "source_playlist_id" INTEGER NOT NULL,
    "target_playlist_id" INTEGER NOT NULL,
    "items_per_day" INTEGER NOT NULL DEFAULT 7,
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "loop" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "bible_mode" BOOLEAN NOT NULL DEFAULT false,
    "translation" TEXT,
    "bible_start_ordinal" INTEGER NOT NULL DEFAULT 1,
    "notify_enabled" BOOLEAN NOT NULL DEFAULT false,
    "notify_program" TEXT,
    "last_run_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "playlist_rotations_active_idx" ON "playlist_rotations"("active");

-- CreateTable
CREATE TABLE "rotation_run_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rotation_id" TEXT NOT NULL,
    "run_date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "items_picked" INTEGER NOT NULL DEFAULT 0,
    "items_placed" INTEGER NOT NULL DEFAULT 0,
    "details" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rotation_run_logs_rotation_id_fkey" FOREIGN KEY ("rotation_id") REFERENCES "playlist_rotations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "rotation_run_logs_rotation_id_idx" ON "rotation_run_logs"("rotation_id");

-- CreateIndex
CREATE INDEX "rotation_run_logs_run_date_idx" ON "rotation_run_logs"("run_date");
