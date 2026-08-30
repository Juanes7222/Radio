export function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Env ${key} is not defined`);
  return value;
}

export function envOr(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export function intEnvOr(key: string, fallback: number): number {
  const value = process.env[key];
  if (value === undefined || value === "") return fallback;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function floatEnvOr(key: string, fallback: number): number {
  const value = process.env[key];
  if (value === undefined || value === "") return fallback;
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function listEnvOr(key: string, separator = ","): string[] {
  return (process.env[key] ?? "")
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function boolEnvOr(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true" || value === "1";
}

/** Strips a trailing slash and enforces an http(s) scheme. */
export function normalizeHttpUrl(value: string): string {
  const url = value.replace(/\/$/, "");
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
