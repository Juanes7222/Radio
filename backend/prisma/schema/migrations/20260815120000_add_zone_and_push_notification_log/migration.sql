-- AlterTable
ALTER TABLE "devices" ADD COLUMN "zoneId" TEXT;

-- CreateTable
CREATE TABLE "push_notification_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "filters" TEXT,
    "targetedCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "invalidTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "devices_zoneId_idx" ON "devices"("zoneId");

-- CreateIndex
CREATE INDEX "push_notification_logs_createdAt_idx" ON "push_notification_logs"("createdAt");
