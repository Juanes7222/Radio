import type { NextFunction, Request, Response } from "express";
import { AppError } from "./app-error";
import { logger } from "../logger/logger";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // Multer file size / filter errors — must return 413/400 instead of 500
  if (err instanceof Error) {
    const code = (err as unknown as { code?: string }).code;
    if (code === "LIMIT_FILE_SIZE") {
      // Distinguish image vs video by route path
      const isVideo = req.originalUrl.includes("/videos");
      res.status(413).json({
        error: isVideo
          ? "Video demasiado grande. Máximo 120 MB."
          : "Imagen demasiado grande. Máximo 20 MB.",
      });
      return;
    }
    if (err.message.includes("Tipo de imagen no permitido") || err.message.includes("Tipo de video no permitido")) {
      res.status(400).json({ error: err.message });
      return;
    }
    // Express json payload too large
    if (code === "EBADCSRFTOKEN" || err.message.includes("request entity too large") || code === "LIMIT_FILE_COUNT") {
      res.status(413).json({ error: "Contenido demasiado grande." });
      return;
    }
  }

  // Fallback: check raw message for payload too large (body-parser / multer)
  if (err instanceof Error && err.message.toLowerCase().includes("entity too large")) {
    res.status(413).json({ error: "Contenido demasiado grande." });
    return;
  }

  logger.error("ErrorHandler", "Unhandled error", {
    path: req.originalUrl,
    method: req.method,
    error: err instanceof Error ? err.message : String(err),
  });

  res.status(500).json({ error: "Internal server error" });
}
