-- AlterTable
ALTER TABLE "ProcessingJob" ADD COLUMN "deadlineAt" DATETIME;
ALTER TABLE "ProcessingJob" ADD COLUMN "nextRetryAt" DATETIME;

-- CreateIndex
CREATE INDEX "ProcessingJob_status_idx" ON "ProcessingJob"("status");

-- CreateIndex
CREATE INDEX "ProcessingJob_deadlineAt_idx" ON "ProcessingJob"("deadlineAt");

-- CreateIndex
CREATE INDEX "ProcessingJob_nextRetryAt_idx" ON "ProcessingJob"("nextRetryAt");
