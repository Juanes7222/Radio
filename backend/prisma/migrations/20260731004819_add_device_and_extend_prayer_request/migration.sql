/*
  Warnings:

  - Added the required column `updated_at` to the `prayer_requests` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "fcmToken" TEXT,
    "platform" TEXT,
    "appVersion" TEXT,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_announcement_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "text_template" TEXT NOT NULL,
    "voice" TEXT NOT NULL DEFAULT 'ef_dora',
    "speed" REAL NOT NULL DEFAULT 0.85,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_announcement_templates" ("active", "created_at", "id", "name", "speed", "text_template", "type", "updated_at", "voice") SELECT "active", "created_at", "id", "name", "speed", "text_template", "type", "updated_at", "voice" FROM "announcement_templates";
DROP TABLE "announcement_templates";
ALTER TABLE "new_announcement_templates" RENAME TO "announcement_templates";
CREATE TABLE "new_prayer_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT,
    "name" TEXT NOT NULL,
    "request" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "respuesta" TEXT,
    "answeredAt" DATETIME,
    "readAt" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "prayer_requests_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices" ("deviceId") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_prayer_requests" ("created_at", "id", "name", "request") SELECT "created_at", "id", "name", "request" FROM "prayer_requests";
DROP TABLE "prayer_requests";
ALTER TABLE "new_prayer_requests" RENAME TO "prayer_requests";
CREATE INDEX "prayer_requests_deviceId_idx" ON "prayer_requests"("deviceId");
CREATE INDEX "prayer_requests_created_at_idx" ON "prayer_requests"("created_at");
CREATE INDEX "prayer_requests_estado_idx" ON "prayer_requests"("estado");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "devices_deviceId_key" ON "devices"("deviceId");

-- CreateIndex
CREATE INDEX "devices_deviceId_idx" ON "devices"("deviceId");

-- CreateIndex
CREATE INDEX "devices_fcmToken_idx" ON "devices"("fcmToken");
