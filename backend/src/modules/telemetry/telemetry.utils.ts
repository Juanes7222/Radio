import { createHash } from "node:crypto";
import { AppError } from "../../shared/errors/app-error";

const DEVICE_ID_PATTERN = /^[A-Za-z0-9._:-]{6,128}$/;
const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 4000;
const MAX_APP_VERSION_LENGTH = 32;
const KNOWN_PLATFORMS = new Set(["android", "ios"]);
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 180;
const FINGERPRINT_FRAMES = 3;

export function isValidDeviceId(value: unknown): value is string {
  return typeof value === "string" && DEVICE_ID_PATTERN.test(value.trim());
}

/** Trims the message and rejects an empty one: a blank group is not triageable. */
export function normalizeMessage(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AppError(400, '"message" es obligatorio.');
  }

  return value.trim().slice(0, MAX_MESSAGE_LENGTH);
}

export function normalizeStack(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.trim().slice(0, MAX_STACK_LENGTH);
}

export function normalizeAppVersion(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.trim().slice(0, MAX_APP_VERSION_LENGTH);
}

export function normalizePlatform(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const platform = value.trim().toLowerCase();
  return KNOWN_PLATFORMS.has(platform) ? platform : null;
}

/**
 * Stack frames without their line and column: those numbers change on every
 * build and would split the same failure into a new row each release.
 */
function stableFrames(stack: string | null): string {
  if (!stack) return "";

  return stack
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("at "))
    .slice(0, FINGERPRINT_FRAMES)
    .map((frame) => frame.replace(/:\d+(?::\d+)?\)?$/, "").replace(/\s+/g, " "))
    .join("\n");
}

/** Stable grouping key for an application failure. */
export function fingerprintError(message: string, stack: string | null): string {
  return createHash("sha256").update(`${message}\n${stableFrames(stack)}`).digest("hex");
}

/**
 * `?days` for the admin snapshot. It follows the same contract as the rest of
 * the panel: absent means the default, a value above the cap is clamped, and
 * anything that is not a plain positive integer is rejected instead of
 * reaching Prisma as NaN.
 */
export function parseWindowDays(raw: unknown): number {
  if (raw === undefined) return DEFAULT_WINDOW_DAYS;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
    throw new AppError(400, '"days" debe ser un número entero positivo.');
  }

  const days = Number(raw);
  if (days < 1) {
    throw new AppError(400, '"days" debe ser un número entero positivo.');
  }

  return Math.min(days, MAX_WINDOW_DAYS);
}
