import { Request } from "express";
import { isIP } from "net";
import axios from "axios";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";

const ZONE_MAX_LENGTH = 80;

interface ZoneCacheEntry {
  zone: string;
  expiresAt: number;
}

// In-memory cache keyed by IP so the provider rate limit is never an issue
// across registrations coming from the same address.
const cache = new Map<string, ZoneCacheEntry>();

/** Returns true for loopback, private, reserved or non-routable addresses. */
function isNonRoutableIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true;
    return false;
  }
  return true;
}

/**
 * Extracts the public client IP from the request. In production the backend is
 * behind nginx, which sets X-Real-IP and X-Forwarded-For; when hit directly it
 * falls back to the socket address. Private and loopback addresses are
 * discarded because they cannot be geolocated.
 */
export function getClientIp(req: Request): string | null {
  const realIp = req.headers["x-real-ip"];
  const realValue = Array.isArray(realIp) ? realIp[0] : realIp;
  const forwarded = req.headers["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const forwardedIp = forwardedValue?.split(",")[0]?.trim();

  const candidate =
    (typeof realValue === "string" ? realValue.trim() : "") ||
    (typeof forwardedIp === "string" ? forwardedIp : "") ||
    req.socket.remoteAddress ||
    "";

  return candidate && !isNonRoutableIp(candidate) ? candidate : null;
}

interface GeoIpResponse {
  status: "success" | "fail";
  city?: string;
  regionName?: string;
}

async function fetchZoneFromProvider(ip: string): Promise<string | null> {
  const response = await axios.get<GeoIpResponse>(`${config.geoip.endpoint}/${ip}`, {
    params: { fields: "status,city,regionName" },
    timeout: config.geoip.timeoutMs,
  });
  const data = response.data;
  if (data.status !== "success") return null;

  const city = typeof data.city === "string" ? data.city.trim() : "";
  const region = typeof data.regionName === "string" ? data.regionName.trim() : "";
  const zone = (city || region).slice(0, ZONE_MAX_LENGTH);
  return zone.length > 0 ? zone : null;
}

/**
 * Resolves a public IP to a zone label (city, falling back to region).
 * Failures are cached with a short TTL so a provider outage or a rate limit
 * does not turn every registration into an outbound call. Raw IPs are never
 * persisted nor logged; only the derived zone is.
 */
export async function resolveZoneFromIp(ip: string): Promise<string | null> {
  if (!config.geoip.enabled) return null;

  const now = Date.now();
  const cached = cache.get(ip);
  if (cached && cached.expiresAt > now) return cached.zone;

  let zone: string | null = null;
  let failureTtl = false;
  try {
    zone = await fetchZoneFromProvider(ip);
  } catch (err) {
    logger.warn("GeoIP", "Zone lookup failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    failureTtl = true;
  }

  if (zone) {
    cache.set(ip, { zone, expiresAt: now + config.geoip.cacheTtlSeconds * 1000 });
  } else if (failureTtl) {
    cache.set(ip, { zone: "", expiresAt: now + config.geoip.failureTtlSeconds * 1000 });
  }

  return zone;
}