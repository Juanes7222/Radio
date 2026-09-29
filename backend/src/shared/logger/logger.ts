type LogLevel = "info" | "warn" | "error";

// Keys whose values must never reach stdout, PM2 files, or the admin log viewer.
const REDACTED_KEYS = new Set([
  "request",
  "respuesta",
  "accessToken",
  "accessTokenHash",
  "deviceSecret",
  "deviceSecretHash",
  "token",
  "fcmToken",
  "authorization",
  "password",
]);

const REDACTED_VALUE = "[redacted]";
const MAX_DEPTH = 6;

function redact(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    result[key] = REDACTED_KEYS.has(key) ? REDACTED_VALUE : redact(nested, depth + 1);
  }
  return result;
}

function log(level: LogLevel, context: string, message: string, meta?: object): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    context,
    message,
    ...(meta ? (redact(meta, 0) as object) : {}),
  };
  console[level === "error" ? "error" : "log"](JSON.stringify(entry));
}

export const logger = {
  info: (context: string, message: string, meta?: object) => log("info", context, message, meta),
  warn: (context: string, message: string, meta?: object) => log("warn", context, message, meta),
  error: (context: string, message: string, meta?: object) => log("error", context, message, meta),
};
