-- AddColumn
ALTER TABLE "generated_audios" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'kokoro';

-- CreateIndex
CREATE INDEX "generated_audios_provider_idx" ON "generated_audios"("provider");
