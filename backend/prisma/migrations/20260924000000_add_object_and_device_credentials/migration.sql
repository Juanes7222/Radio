-- AlterTable
ALTER TABLE "prayer_requests" ADD COLUMN "access_token_hash" TEXT;

-- AlterTable
ALTER TABLE "devices" ADD COLUMN "device_secret_hash" TEXT;
