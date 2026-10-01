-- AlterTable: add videoUrl to AppNotice
ALTER TABLE "app_notices" ADD COLUMN "video_url" TEXT;

-- CreateTable: notice_videos
CREATE TABLE "notice_videos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_ms" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "notice_videos_filename_key" ON "notice_videos"("filename");

-- CreateIndex
CREATE INDEX "notice_videos_created_at_idx" ON "notice_videos"("created_at");
