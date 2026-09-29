-- AlterTable
ALTER TABLE "prayer_requests" ADD COLUMN "consent_accepted_at" TIMESTAMP(3);
ALTER TABLE "prayer_requests" ADD COLUMN "consent_version" TEXT;
