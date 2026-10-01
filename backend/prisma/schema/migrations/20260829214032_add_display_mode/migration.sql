-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_app_notices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "image_url" TEXT,
    "cta_label" TEXT,
    "cta_url" TEXT,
    "variant" TEXT NOT NULL DEFAULT 'info',
    "audience" TEXT NOT NULL DEFAULT 'all',
    "audience_zone_id" TEXT,
    "audience_platform" TEXT,
    "audience_program" TEXT,
    "audience_device_ids" TEXT,
    "display_mode" TEXT NOT NULL DEFAULT 'toast',
    "starts_at" DATETIME NOT NULL,
    "ends_at" DATETIME NOT NULL,
    "max_displays_per_user" INTEGER NOT NULL DEFAULT 3,
    "dismissible" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_app_notices" ("audience", "audience_device_ids", "audience_platform", "audience_program", "audience_zone_id", "body", "created_at", "cta_label", "cta_url", "dismissible", "ends_at", "id", "image_url", "is_active", "max_displays_per_user", "starts_at", "title", "updated_at", "variant") SELECT "audience", "audience_device_ids", "audience_platform", "audience_program", "audience_zone_id", "body", "created_at", "cta_label", "cta_url", "dismissible", "ends_at", "id", "image_url", "is_active", "max_displays_per_user", "starts_at", "title", "updated_at", "variant" FROM "app_notices";
DROP TABLE "app_notices";
ALTER TABLE "new_app_notices" RENAME TO "app_notices";
CREATE INDEX "app_notices_is_active_idx" ON "app_notices"("is_active");
CREATE INDEX "app_notices_starts_at_idx" ON "app_notices"("starts_at");
CREATE INDEX "app_notices_ends_at_idx" ON "app_notices"("ends_at");
CREATE INDEX "app_notices_audience_idx" ON "app_notices"("audience");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
