-- Per-episode repair options chosen when the audio is uploaded. The program
-- level `category_id` is dropped: the public schedule already tags a playlist
-- event through ScheduleCategory.keywords matching the playlist name, so the
-- column was never read.
ALTER TABLE "program_episodes" ADD COLUMN "normalize_loudness" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "program_episodes" ADD COLUMN "reduce_noise" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "programs" DROP COLUMN "category_id";