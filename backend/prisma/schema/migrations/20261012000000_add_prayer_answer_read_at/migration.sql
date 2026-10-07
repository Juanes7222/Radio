-- AddColumn
ALTER TABLE "prayer_requests" ADD COLUMN "answerReadAt" DATETIME;

-- Backfill: petitions that already carried an answer predate the unread marker.
-- Leaving them NULL would hand every existing device a full inbox of "unread"
-- badges on the day the app ships, so they start as already seen.
UPDATE "prayer_requests"
SET "answerReadAt" = COALESCE("answeredAt", "created_at")
WHERE "respuesta" IS NOT NULL;
