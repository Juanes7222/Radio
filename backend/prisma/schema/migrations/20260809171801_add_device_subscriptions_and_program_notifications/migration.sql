-- AlterTable
ALTER TABLE "devices" ADD COLUMN "subscriptions" TEXT;

-- CreateTable
CREATE TABLE "program_notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "program_id" TEXT NOT NULL,
    "start_timestamp" DATETIME NOT NULL,
    "notified_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "program_notifications_start_timestamp_idx" ON "program_notifications"("start_timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "program_notifications_program_id_start_timestamp_key" ON "program_notifications"("program_id", "start_timestamp");
