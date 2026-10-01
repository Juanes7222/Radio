-- AlterTable
ALTER TABLE "playlist_rotations" ADD COLUMN "source_type" TEXT NOT NULL DEFAULT 'playlist';
ALTER TABLE "playlist_rotations" ADD COLUMN "source_folder" TEXT;
