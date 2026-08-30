import { Request } from "express";
import { isIP } from "net";
import fs from "fs";
import axios from "axios";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";

const ZONE_MAX_LENGTH = 80;

export type GeoIpSource = "MAXMIND" | "IPWHOIS" | "IPAPI_CO" | "CF" | "MANUAL" | "LEGACY_IPAPI";

export interface GeoIpResult {
  city: string;
  region: string | null;
  country: string | null;
  source: GeoIpSource;
}

interface GeoIpCacheEntry {
  result: GeoIpResult | null;
  expiresAt: number;
}

// In-memory cache keyed by IP. Success and failure have distinct TTLs and
// the entry explicitly stores null for failures instead of an empty string.
const cache = new Map<string, GeoIpCacheEntry>();

// Lazy MaxMind reader. The mmdb file is optional; if it does not exist the
// provider is silently skipped.
type MaxmindCityResponse = {
  city?: { names?: { en?: string; es?: string } };
  subdivisions?: Array<{ names?: { en?: string; es?: string } }>;
  country?: { iso_code?: string; names?: { en?: string } };
};

let maxmindReader: { get(ip: string): MaxmindCityResponse | null } | null = null;
let maxmindTried = false;

async function getMaxmindReader(): Promise<typeof maxmindReader> {
  if (maxmindTried) return maxmindReader;
  maxmindTried = true;
  const mmdbPath = config.geoip.mmdbPath?.trim();
  if (!mmdbPath) return null;
  if (!fs.existsSync(mmdbPath)) {
    logger.warn("GeoIP", "MaxMind mmdb not found, skipping local lookup", { mmdbPath });
    return null;
  }
  try {
    // Dynamic import so the dependency is optional until a mmdb is configured.
    // @ts-ignore - maxmind is an optional peer dependency, installed via pnpm add maxmind
    const maxmind = await import("maxmind");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const open = (maxmind as unknown as { open: (path: string) => Promise<any> }).open;
    if (typeof open !== "function") throw new Error("maxmind.open not found");
    maxmindReader = await open(mmdbPath);
    logger.info("GeoIP", "MaxMind mmdb loaded", { mmdbPath });
  } catch (err) {
    logger.warn("GeoIP", "Failed to load MaxMind mmdb", {
      error: err instanceof Error ? err.message : String(err),
    });
    maxmindReader = null;
  }
  return maxmindReader;
}

function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  if (trimmed.startsWith("::ffff:")) return trimmed.slice(7);
  // Handle bracketed IPv6 literals (e.g. "[::1]")
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return trimmed.slice(1, -1);
  return trimmed;
}

/** Returns true for loopback, private, reserved or non-routable addresses. */
function isNonRoutableIp(ip: string): boolean {
  const normalized = normalizeIp(ip);
  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split(".").map(Number);
    if (a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    // 0.0.0.0/8 and 255.255.255.255
    if (a === 0 || normalized === "255.255.255.255") return true;
    return false;
  }
  if (isIP(normalized) === 6) {
    const lower = normalized.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true;
    if (lower.startsWith("ff")) return true;
    return false;
  }
  return true;
}

function sanitizeZone(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, ZONE_MAX_LENGTH);
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

  const normalized = normalizeIp(candidate);
  return normalized && !isNonRoutableIp(normalized) ? normalized : null;
}

/**
 * Returns a city from trusted proxy headers (e.g. Cloudflare) only when
 * GEOIP_TRUST_PROXY_HEADERS=true. Otherwise returns null to avoid spoofing.
 */
export function getTrustedProxyCity(req: Request): string | null {
  if (!config.geoip.trustProxyHeaders) return null;
  const cfCity = req.headers["cf-ipcity"];
  const cfValue = Array.isArray(cfCity) ? cfCity[0] : cfCity;
  // Cloudflare also sends cf-ipcountry; we validate city is non-empty.
  const city = sanitizeZone(typeof cfValue === "string" ? cfValue : null);
  return city;
}

// --- Providers (sequential, validated) ---

async function fetchFromMaxmind(ip: string): Promise<GeoIpResult | null> {
  const reader = await getMaxmindReader();
  if (!reader) return null;
  try {
    const data = reader.get(ip);
    if (!data) return null;
    const city =
      sanitizeZone(data.city?.names?.es) ||
      sanitizeZone(data.city?.names?.en) ||
      null;
    if (!city) return null;
    const region = sanitizeZone(data.subdivisions?.[0]?.names?.es) || sanitizeZone(data.subdivisions?.[0]?.names?.en) || null;
    const country = data.country?.iso_code?.trim().toUpperCase() || null;
    return { city, region, country, source: "MAXMIND" };
  } catch {
    return null;
  }
}

interface IpWhoIsResponse {
  success: boolean;
  city?: string;
  region?: string;
  country_code?: string;
}

async function fetchFromIpWhoIs(ip: string): Promise<GeoIpResult | null> {
  const endpoint = config.geoip.ipWhoIsEndpoint.replace(/\/$/, "");
  const response = await axios.get<IpWhoIsResponse>(`${endpoint}/${ip}`, {
    timeout: config.geoip.timeoutMs,
  });
  const data = response.data;
  if (!data?.success) return null;
  const city = sanitizeZone(data.city);
  if (!city) return null;
  return {
    city,
    region: sanitizeZone(data.region) || null,
    country: typeof data.country_code === "string" ? data.country_code.trim().toUpperCase() : null,
    source: "IPWHOIS",
  };
}

interface IpApiCoResponse {
  city?: string;
  region?: string;
  country_code?: string;
  error?: boolean;
}

async function fetchFromIpApiCo(ip: string): Promise<GeoIpResult | null> {
  const endpoint = config.geoip.ipApiCoEndpoint.replace(/\/$/, "");
  const response = await axios.get<IpApiCoResponse>(`${endpoint}/${ip}/json/`, {
    timeout: config.geoip.timeoutMs,
    validateStatus: (s) => s < 500,
  });
  const data = response.data;
  if (!data || data.error) return null;
  const city = sanitizeZone(data.city);
  if (!city) return null;
  return {
    city,
    region: sanitizeZone(data.region) || null,
    country: typeof data.country_code === "string" ? data.country_code.trim().toUpperCase() : null,
    source: "IPAPI_CO",
  };
}

interface LegacyIpApiResponse {
  status: "success" | "fail";
  city?: string;
  regionName?: string;
  countryCode?: string;
}

async function fetchFromLegacyIpApi(ip: string): Promise<GeoIpResult | null> {
  const endpoint = config.geoip.endpoint.replace(/\/$/, "");
  // Only use legacy endpoint when explicitly configured to something other than default
  // and when the primary fallbacks failed.
  const response = await axios.get<LegacyIpApiResponse>(`${endpoint}/${ip}`, {
    params: { fields: "status,city,regionName,countryCode" },
    timeout: config.geoip.timeoutMs,
  });
  const data = response.data;
  if (data.status !== "success") return null;
  const city = sanitizeZone(data.city);
  if (!city) return null;
  return {
    city,
    region: sanitizeZone(data.regionName) || null,
    country: typeof data.countryCode === "string" ? data.countryCode.trim().toUpperCase() : null,
    source: "LEGACY_IPAPI",
  };
}

function isValidResult(result: GeoIpResult | null): result is GeoIpResult {
  return result !== null && typeof result.city === "string" && result.city.length > 0;
}

/**
 * Resolves a public IP to a structured GeoIP result (city, region, country,
 * source). Providers are consulted sequentially with validation:
 *   1. MaxMind local mmdb (if configured)
 *   2. ipwho.is
 *   3. ipapi.co
 *   4. legacy ip-api.com (only if endpoint is custom)
 *
 * Failures are cached with a short TTL so a provider outage does not turn
 * every registration into outbound calls. Successful lookups are cached with
 * the configured success TTL. Raw IPs are never persisted nor logged; only
 * the derived zone is.
 */
export async function resolveZoneDetails(ip: string): Promise<GeoIpResult | null> {
  if (!config.geoip.enabled) return null;
  const normalized = normalizeIp(ip);
  if (!normalized || isNonRoutableIp(normalized)) return null;

  const now = Date.now();
  const cached = cache.get(normalized);
  if (cached && cached.expiresAt > now) return cached.result;

  const providers: Array<() => Promise<GeoIpResult | null>> = [
    () => fetchFromMaxmind(normalized),
    () => fetchFromIpWhoIs(normalized),
    () => fetchFromIpApiCo(normalized),
  ];

  // Only add legacy provider if endpoint was customized (not the default ip-api.com)
  // to avoid an extra HTTP call when the operator has not opted in.
  if (config.geoip.endpoint && !config.geoip.endpoint.includes("ip-api.com")) {
    providers.push(() => fetchFromLegacyIpApi(normalized));
  }

  let result: GeoIpResult | null = null;
  for (const provider of providers) {
    try {
      const candidate = await provider();
      if (isValidResult(candidate)) {
        result = candidate;
        break;
      }
    } catch (err) {
      logger.warn("GeoIP", "Provider lookup failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      // Continue to next provider instead of failing fast.
    }
  }

  // Diagnostic log without raw IP (privacy: IP is not persisted nor logged verbatim).
  if (result) {
    logger.info("GeoIP", "Zone resolved", {
      city: result.city,
      region: result.region,
      country: result.country,
      source: result.source,
    });
    cache.set(normalized, {
      result,
      expiresAt: now + config.geoip.cacheTtlSeconds * 1000,
    });
  } else {
    logger.warn("GeoIP", "Zone lookup returned no result", {});
    cache.set(normalized, {
      result: null,
      expiresAt: now + config.geoip.failureTtlSeconds * 1000,
    });
  }

  return result;
}

/**
 * Backwards-compatible helper that returns only the city string.
 * Prefer resolveZoneDetails when you need source/region metadata.
 */
export async function resolveZoneFromIp(ip: string): Promise<string | null> {
  const details = await resolveZoneDetails(ip);
  return details?.city ?? null;
}

/**
 * Resolves zone from request, honoring trusted proxy headers first.
 * City from CF-IPCity is trusted only when GEOIP_TRUST_PROXY_HEADERS=true.
 */
export async function resolveZoneFromRequest(req: Request, ip: string | null): Promise<GeoIpResult | null> {
  const proxyCity = getTrustedProxyCity(req);
  if (proxyCity) {
    return { city: proxyCity, region: null, country: null, source: "CF" };
  }
  if (!ip) return null;
  return resolveZoneDetails(ip);
}

// Test helpers
export function __clearGeoIpCache(): void {
  cache.clear();
}

export function __resetMaxmindForTests(): void {
  maxmindReader = null;
  maxmindTried = false;
}
