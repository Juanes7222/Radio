import { prisma } from "../../../infrastructure/database/prisma";
import { logger } from "../../../shared/logger/logger";
import { NOTICE_IMAGES_DIR, NOTICE_VIDEOS_DIR, deleteMediaFileIfExists, getMediaFilePath } from "./media.storage";
import fs from "fs";

/**
 * Removes orphan media files and records that are no longer referenced.
 * An orphan is a DB record older than the retention window that is not
 * referenced by any active or scheduled notice, or a file on disk without
 * a corresponding DB record.
 *
 * This job is best-effort and non-destructive for recent uploads.
 */
const RETENTION_DAYS = 90;

function isExpired(date: Date): boolean {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  return date < cutoff;
}

export async function cleanupOrphanNoticeMedia(): Promise<{ imagesRemoved: number; videosRemoved: number; filesRemoved: number }> {
  let imagesRemoved = 0;
  let videosRemoved = 0;
  let filesRemoved = 0;

  try {
    // Load all notice URLs currently in use
    const notices = await (prisma as any).appNotice.findMany({
      select: { imageUrl: true, videoUrl: true },
    });
    const usedImageUrls = new Set(notices.map((n: any) => n.imageUrl).filter(Boolean));
    const usedVideoUrls = new Set(notices.map((n: any) => n.videoUrl).filter(Boolean));

    // Find image records not referenced and expired
    const images = await (prisma as any).noticeImage.findMany();
    for (const img of images as Array<{ id: string; url: string; filename: string; createdAt: Date }>) {
      if (!usedImageUrls.has(img.url) && isExpired(img.createdAt)) {
        try {
          deleteMediaFileIfExists(getMediaFilePath(NOTICE_IMAGES_DIR, img.filename));
          filesRemoved++;
        } catch {}
        try {
          await (prisma as any).noticeImage.delete({ where: { id: img.id } });
          imagesRemoved++;
        } catch {}
      }
    }

    // Find video records not referenced and expired
    const videos = await (prisma as any).noticeVideo.findMany();
    for (const video of videos as Array<{ id: string; url: string; filename: string; posterUrl: string | null; createdAt: Date }>) {
      if (!usedVideoUrls.has(video.url) && isExpired(video.createdAt)) {
        try {
          deleteMediaFileIfExists(getMediaFilePath(NOTICE_VIDEOS_DIR, video.filename));
          filesRemoved++;
        } catch {}
        if (video.posterUrl) {
          try {
            const posterFilename = video.posterUrl.split("/").pop() as string;
            deleteMediaFileIfExists(getMediaFilePath(NOTICE_VIDEOS_DIR, posterFilename));
            filesRemoved++;
          } catch {}
        }
        try {
          await (prisma as any).noticeVideo.delete({ where: { id: video.id } });
          videosRemoved++;
        } catch {}
      }
    }

    // Second pass: remove files on disk without DB record (e.g., interrupted uploads)
    const reconcileDisk = (dir: string, knownFilenames: Set<string>) => {
      try {
        const files = fs.readdirSync(dir);
        for (const filename of files) {
          if (!knownFilenames.has(filename)) {
            // Only remove if file is older than retention to avoid racing with uploads
            const filePath = getMediaFilePath(dir, filename);
            try {
              const stat = fs.statSync(filePath);
              if (isExpired(stat.mtime)) {
                deleteMediaFileIfExists(filePath);
                filesRemoved++;
              }
            } catch {}
          }
        }
      } catch {}
    };

    reconcileDisk(
      NOTICE_IMAGES_DIR,
      new Set((images as Array<{ filename: string }>).map((i) => i.filename))
    );
    const knownVideoFiles = new Set<string>();
    for (const v of videos as Array<{ filename: string; posterUrl: string | null }>) {
      knownVideoFiles.add(v.filename);
      if (v.posterUrl) knownVideoFiles.add(v.posterUrl.split("/").pop() as string);
    }
    reconcileDisk(NOTICE_VIDEOS_DIR, knownVideoFiles);

    if (imagesRemoved > 0 || videosRemoved > 0 || filesRemoved > 0) {
      logger.info("NoticeMediaCleanup", "Completed", { imagesRemoved, videosRemoved, filesRemoved });
    }

    return { imagesRemoved, videosRemoved, filesRemoved };
  } catch (err) {
    logger.error("NoticeMediaCleanup", "Failed", { error: String(err) });
    return { imagesRemoved, videosRemoved, filesRemoved };
  }
}
