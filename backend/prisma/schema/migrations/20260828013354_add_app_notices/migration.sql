-- CreateTable
CREATE TABLE "app_notices" (
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
    "starts_at" DATETIME NOT NULL,
    "ends_at" DATETIME NOT NULL,
    "max_displays_per_user" INTEGER NOT NULL DEFAULT 3,
    "dismissible" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "app_notices_is_active_idx" ON "app_notices"("is_active");

-- CreateIndex
CREATE INDEX "app_notices_starts_at_idx" ON "app_notices"("starts_at");

-- CreateIndex
CREATE INDEX "app_notices_ends_at_idx" ON "app_notices"("ends_at");

-- CreateIndex
CREATE INDEX "app_notices_audience_idx" ON "app_notices"("audience");
