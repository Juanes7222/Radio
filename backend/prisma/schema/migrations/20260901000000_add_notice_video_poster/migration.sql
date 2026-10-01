-- Add poster URL for video notices (thumbnail for slow networks)
ALTER TABLE "notice_videos" ADD COLUMN "poster_url" TEXT;
