type LogLevel = "info" | "warn" | "error";

function log(level: LogLevel, context: string, message: string, meta?: object): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    context,
    message,
    ...meta,
  };
  console[level === "error" ? "error" : "log"](JSON.stringify(entry));
}

export const logger = {
  info: (context: string, message: string, meta?: object) => log("info", context, message, meta),
  warn: (context: string, message: string, meta?: object) => log("warn", context, message, meta),
  error: (context: string, message: string, meta?: object) => log("error", context, message, meta),
};