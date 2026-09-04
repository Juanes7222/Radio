import { Request } from "express";
import { isIP } from "net";
import fs from "fs";
import axios from "axios";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";

const ZONE_MAX_LENGTH = 80;

export type GeoIpSource = "MAXMIND" | "DBIP" | "IPWHOIS" | "IPAPI_CO" | "CF" | "MANUAL" | "LEGACY_IPAPI";

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
let dbipReader: { get(ip: string): MaxmindCityResponse | null } | null = null;
let dbipTried = false;

async function openMmdb(mmdbPath: string, label: string): Promise<{ get(ip: string): MaxmindCityResponse | null } | null> {
  if (!mmdbPath || !fs.existsSync(mmdbPath)) {
    if (mmdbPath) logger.warn("GeoIP", `${label} mmdb not found, skipping`, { mmdbPath });
    return null;
  }
  try {
    // @ts-ignore - maxmind is optional, lee tanto MaxMind como DB-IP (ambos .mmdb)
    const maxmind = await import("maxmind");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const open = (maxmind as unknown as { open: (path: string) => Promise<any> }).open;
    if (typeof open !== "function") throw new Error("maxmind.open not found");
    const reader = await open(mmdbPath);
    logger.info("GeoIP", `${label} mmdb loaded`, { mmdbPath });
    return reader;
  } catch (err) {
    logger.warn("GeoIP", `Failed to load ${label} mmdb`, {
      mmdbPath,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function getMaxmindReader(): Promise<typeof maxmindReader> {
  if (maxmindTried) return maxmindReader;
  maxmindTried = true;
  maxmindReader = await openMmdb(config.geoip.mmdbPath?.trim() ?? "", "MaxMind");
  return maxmindReader;
}

async function getDbIpReader(): Promise<typeof dbipReader> {
  if (dbipTried) return dbipReader;
  dbipTried = true;
  dbipReader = await openMmdb(config.geoip.dbipPath?.trim() ?? "", "DB-IP");
  return dbipReader;
}

/**
 * Forces reload of the MaxMind/DB-IP readers (used after DB auto-update).
 * Clears cache so next lookup uses fresh data.
 */
export async function reloadMaxmindReader(): Promise<void> {
  maxmindTried = false;
  maxmindReader = null;
  dbipTried = false;
  dbipReader = null;
  cache.clear();
  await Promise.all([getMaxmindReader(), getDbIpReader()]);
  logger.info("GeoIP", "MaxMind/DB-IP readers reloaded after update");
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

// --- Providers ( AzuraCast: GeoLite + DB-IP + APIs ) ---

function parseMmdbResult(data: MaxmindCityResponse | null, source: GeoIpSource): GeoIpResult | null {
  if (!data) return null;
  const city = sanitizeZone(data.city?.names?.es) || sanitizeZone(data.city?.names?.en) || null;
  if (!city) return null;
  const region = sanitizeZone(data.subdivisions?.[0]?.names?.es) || sanitizeZone(data.subdivisions?.[0]?.names?.en) || null;
  const country = data.country?.iso_code?.trim().toUpperCase() || null;
  return { city, region, country, source };
}

async function fetchFromMaxmind(ip: string): Promise<GeoIpResult | null> {
  const reader = await getMaxmindReader();
  if (!reader) return null;
  try {
    return parseMmdbResult(reader.get(ip), "MAXMIND");
  } catch {
    return null;
  }
}

async function fetchFromDbIp(ip: string): Promise<GeoIpResult | null> {
  const reader = await getDbIpReader();
  if (!reader) return null;
  try {
    return parseMmdbResult(reader.get(ip), "DBIP");
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

function pickBestResult(candidates: GeoIpResult[]): GeoIpResult | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Para Colombia (caso principal de la app), si algún proveedor dice CO y otro
  // dice otro país (ej: Mumbai/IN), descartamos los no-CO como outliers de
  // bases desactualizadas. Esto corrige el caso que reportas: Mumbai vs Cartago.
  const coCandidates = candidates.filter((c) => c.country === "CO");
  const pool = coCandidates.length > 0 ? coCandidates : candidates;

  // Votación por ciudad normalizada
  const cityCounts = new Map<string, number>();
  for (const c of pool) {
    const key = c.city.toLowerCase();
    cityCounts.set(key, (cityCounts.get(key) ?? 0) + 1);
  }
  const maxVotes = Math.max(...cityCounts.values());
  const winners = pool.filter((c) => (cityCounts.get(c.city.toLowerCase()) ?? 0) === maxVotes);

  if (winners.length === 1) return winners[0];

  // Empate: AzuraCast usa DB-IP y GeoLite; en CO DB-IP suele acertar más
  // que GeoLite free (que da Chia/San José para el pool de Bogotá).
  const priority: GeoIpSource[] = ["DBIP", "IPWHOIS", "MAXMIND", "IPAPI_CO", "LEGACY_IPAPI"];
  for (const src of priority) {
    const found = winners.find((c) => c.source === src);
    if (found) return found;
  }
  return winners[0];
}

/**
 * Resolves a public IP to a structured GeoIP result (city, region, country,
 * source). Los proveedores se consultan en paralelo y se vota:
 *   - MaxMind local (si hay mmdb), ipwho.is, ipapi.co (y legacy si está configurado)
 *   - Se descarta el primer válido si es outlier (ej: Mumbai/IN vs 2× CO)
 *   - Esto corrige el secuencial anterior que se quedaba con Chia/San José/Mumbai
 *     aunque los otros proveedores dijeran Valle del Cauca.
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

  const providerFns: Array<() => Promise<GeoIpResult | null>> = [
    () => fetchFromDbIp(normalized),
    () => fetchFromMaxmind(normalized),
    () => fetchFromIpWhoIs(normalized),
    () => fetchFromIpApiCo(normalized),
  ];
  if (config.geoip.endpoint && !config.geoip.endpoint.includes("ip-api.com")) {
    providerFns.push(() => fetchFromLegacyIpApi(normalized));
  }

  const settled = await Promise.allSettled(providerFns.map((fn) => fn()));
  const candidates: GeoIpResult[] = [];
  const rawForLog: Array<{ source: string; city: string | null; region: string | null; country: string | null; error?: string }> = [];

  settled.forEach((r, idx) => {
    const src = ["DBIP", "MAXMIND", "IPWHOIS", "IPAPI_CO", "LEGACY_IPAPI"][idx] ?? `P${idx}`;
    if (r.status === "fulfilled" && isValidResult(r.value)) {
      candidates.push(r.value);
      rawForLog.push({ source: r.value.source, city: r.value.city, region: r.value.region, country: r.value.country });
    } else if (r.status === "fulfilled") {
      rawForLog.push({ source: src, city: null, region: null, country: null });
    } else {
      rawForLog.push({ source: src, city: null, region: null, country: null, error: String(r.reason) });
      logger.warn("GeoIP", "Provider lookup failed", {
        source: src,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  });

  const result = pickBestResult(candidates);

  // Log diagnóstico sin IP cruda: permite medir por qué GeoLite decía
  // Chia/San José/Mumbai mientras AzuraCast decía Cartago.
  if (result) {
    logger.info("GeoIP", "Zone resolved", {
      city: result.city,
      region: result.region,
      country: result.country,
      source: result.source,
      candidates: rawForLog,
      picked: result.source,
    });
    cache.set(normalized, {
      result,
      expiresAt: now + config.geoip.cacheTtlSeconds * 1000,
    });
  } else {
    logger.warn("GeoIP", "Zone lookup returned no result", { candidates: rawForLog });
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
  dbipReader = null;
  dbipTried = false;
}
