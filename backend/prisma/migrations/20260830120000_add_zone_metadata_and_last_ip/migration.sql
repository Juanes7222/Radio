-- AlterTable: add zone metadata and last IP tracking for bulk zone recalculation
ALTER TABLE "devices" ADD COLUMN "zone_source" TEXT;
ALTER TABLE "devices" ADD COLUMN "zone_assigned_at" DATETIME;
ALTER TABLE "devices" ADD COLUMN "zone_region" TEXT;
ALTER TABLE "devices" ADD COLUMN "zone_country" TEXT;
ALTER TABLE "devices" ADD COLUMN "last_ip" TEXT;
ALTER TABLE "devices" ADD COLUMN "last_ip_at" DATETIME;

-- CreateIndex
CREATE INDEX "devices_zone_source_idx" ON "devices"("zone_source");
CREATE INDEX "devices_last_ip_idx" ON "devices"("last_ip");
