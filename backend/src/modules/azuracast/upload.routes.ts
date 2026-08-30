import { Router } from "express";
import multer from "multer";
import axios from "axios";
import { asyncHandler } from "../../shared/errors/async-handler";
import { AppError } from "../../shared/errors/app-error";
import { MAX_UPLOAD_FILE_SIZE_BYTES, ALLOWED_AUDIO_MIME_TYPES } from "../../shared/constants";
import { sanitizeFilename, sanitizeRelativePath } from "../../shared/utils/sanitize";
import { requireAuth } from "../auth/auth.middleware";
import {
  deleteStationFile,
  getRecentFiles,
  triggerMediaRescan,
  uploadFileToStation,
} from "./upload.service";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_AUDIO_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});

/**
 * POST /admin-api/upload
 * Body: multipart/form-data
 *   - file      : audio file
 *   - path      : optional relative destination path, preserves folder structure
 *   - playlist  : optional playlist ID
 */
router.post(
  "/",
  requireAuth,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError(400, "No file received");
    }

    const sanitizedOriginal = sanitizeFilename(req.file.originalname);
    const uploadPath =
      req.body.path && String(req.body.path).trim() !== ""
        ? sanitizeRelativePath(String(req.body.path))
        : sanitizedOriginal;

    const base64File = req.file.buffer.toString("base64");
    const fileData = await uploadFileToStation(uploadPath, base64File, req.body.playlist);

    res.json({ ok: true, file: fileData });
  })
);

/**
 * GET /admin-api/upload/recent
 * Returns the most recently uploaded files.
 */
router.get(
  "/recent",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const data = await getRecentFiles();
    res.json(data);
  })
);

/**
 * POST /admin-api/upload/rescan
 * Orders AzuraCast to rescan the media library.
 */
router.post(
  "/rescan",
  requireAuth,
  asyncHandler(async (_req, res) => {
    try {
      await triggerMediaRescan();
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        if (err.response.status < 400) {
          res.json({ ok: true });
          return;
        }
        const message = typeof err.response.data === "string" ? err.response.data : err.response.data?.message;
        res.status(err.response.status).json({ error: message ?? "Failed to rescan" });
        return;
      }
      res.status(502).json({ error: "Could not reach AzuraCast for rescan" });
      return;
    }
    res.json({ ok: true, message: "Rescan started successfully" });
  })
);

/**
 * DELETE /admin-api/upload/:id
 * Deletes a file by its unique id.
 */
router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      await deleteStationFile(String(req.params.id));
      res.json({ ok: true });
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        res.status(err.response.status).json(err.response.data);
        return;
      }
      res.status(502).json({ error: "Failed to delete file" });
    }
  })
);

export default router;
