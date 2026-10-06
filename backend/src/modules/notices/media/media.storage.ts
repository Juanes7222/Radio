import { resolveStorageDir, ensureDir } from "../../../shared/storage/localStorage";

export const NOTICE_IMAGES_DIR = resolveStorageDir("notice-images");
export const NOTICE_VIDEOS_DIR = resolveStorageDir("notice-videos");

ensureDir(NOTICE_IMAGES_DIR);
ensureDir(NOTICE_VIDEOS_DIR);

export {
  deleteMediaFileIfExists,
  ensureDir,
  getMediaFilePath,
  writeMediaFile,
} from "../../../shared/storage/localStorage";