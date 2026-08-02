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

  logger.error("ErrorHandler", "Unhandled error", {
    path: req.originalUrl,
    method: req.method,
    error: err instanceof Error ? err.message : String(err),
  });

  res.status(500).json({ error: "Internal server error" });
}
