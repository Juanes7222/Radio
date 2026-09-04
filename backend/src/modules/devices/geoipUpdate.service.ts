import fs from "fs";
import path from "path";
import os from "os";
import { pipeline } from "stream/promises";
import axios from "axios";
// @ts-ignore - tar is installed as runtime dep for GeoIP updates
import * as tar from "tar";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { reloadMaxmindReader } from "./geoip.service";

type DownloadConfig = { url: string; auth?: { username: string; password: string } };

function getDownloadConfig(): DownloadConfig | null {
  const licenseKey = config.geoip.licenseKey?.trim();
  if (!licenseKey) return null;
  const editionId = config.geoip.editionId?.trim() || "GeoLite2-City";
  const accountId = config.geoip.accountId?.trim();

  // Desde enero 2024 MaxMind usa R2 presigned URLs: el permalink redirige con 302
  // a mm-prod-geoip-databases...r2.cloudflarestorage.com. El cliente debe seguir
  // redirects y permitir HTTPS a ese host. El método recomendado es Basic Auth
  // contra el permalink. Si hay AccountID, lo usamos; si no, fallback al
  // endpoint legacy con license_key en query (también redirige).
  if (accountId) {
    return {
      url: `https://download.maxmind.com/geoip/databases/${encodeURIComponent(editionId)}/download?suffix=tar.gz`,
      auth: { username: accountId, password: licenseKey },
    };
  }
  return {
    url: `https://download.maxmind.com/app/geoip_download?edition_id=${encodeURIComponent(editionId)}&license_key=${encodeURIComponent(licenseKey)}&suffix=tar.gz`,
  };
}

async function findMmdbInDir(dir: string): Promise<string | null> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith(".mmdb")) return full;
    if (entry.isDirectory()) {
      const nested = await findMmdbInDir(full);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * Downloads GeoLite2-City.tar.gz from MaxMind, extracts the .mmdb and
 * replaces the file at GEOIP_MMDB_PATH atomically. Returns true if updated.
 */
export async function updateGeoIpDatabase(): Promise<{ updated: boolean; reason?: string }> {
  if (!config.geoip.updateEnabled) {
    return { updated: false, reason: "GEOIP_UPDATE_ENABLED=false" };
  }

  const mmdbPath = config.geoip.mmdbPath?.trim();
  if (!mmdbPath) {
    logger.warn("GeoIPUpdate", "GEOIP_MMDB_PATH not set, skipping update");
    return { updated: false, reason: "GEOIP_MMDB_PATH empty" };
  }

  const dl = getDownloadConfig();
  if (!dl) {
    logger.warn("GeoIPUpdate", "GEOIP_LICENSE_KEY not set, skipping update");
    return { updated: false, reason: "GEOIP_LICENSE_KEY missing" };
  }

  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "geoip-"));
  const tmpTarGz = path.join(tmpDir, "GeoLite2-City.tar.gz");

  try {
    logger.info("GeoIPUpdate", "Downloading MaxMind database", {
      editionId: config.geoip.editionId,
      url: dl.url,
      hasAccountId: Boolean(dl.auth),
    });

    const response = await axios.get(dl.url, {
      responseType: "stream",
      timeout: 60_000,
      maxRedirects: 5,
      // axios sigue 302 a R2 presigned URL por defecto; no bloquear ese host en firewall/proxy
      validateStatus: (s) => s >= 200 && s < 300,
      headers: { "User-Agent": "Radio-GeoIP-Updater/1.0" },
      ...(dl.auth ? { auth: dl.auth } : {}),
    });

    await pipeline(response.data as NodeJS.ReadableStream, fs.createWriteStream(tmpTarGz));

    // Verify we got a gzip, not an HTML error page.
    const header = Buffer.alloc(2);
    const fd = await fs.promises.open(tmpTarGz, "r");
    await fd.read(header, 0, 2, 0);
    await fd.close();
    if (header[0] !== 0x1f || header[1] !== 0x8b) {
      const preview = (await fs.promises.readFile(tmpTarGz, "utf-8")).slice(0, 500);
      throw new Error(`Download did not return gzip (maybe invalid license): ${preview}`);
    }

    const extractDir = path.join(tmpDir, "extract");
    await fs.promises.mkdir(extractDir, { recursive: true });

    // tar handles gzip internally when file is .tar.gz
    await tar.x({ file: tmpTarGz, cwd: extractDir });

    const mmdbSource = await findMmdbInDir(extractDir);
    if (!mmdbSource) {
      throw new Error("GeoLite2-City.mmdb not found in archive");
    }

    // Ensure target directory exists
    await fs.promises.mkdir(path.dirname(mmdbPath), { recursive: true });

    // Atomic replace: write to temp file in same dir, then rename
    const tmpTarget = `${mmdbPath}.tmp`;
    await fs.promises.copyFile(mmdbSource, tmpTarget);
    await fs.promises.rename(tmpTarget, mmdbPath);

    logger.info("GeoIPUpdate", "Database updated", { mmdbPath });

    // Reload in-memory reader so new lookups use fresh data
    await reloadMaxmindReader();

    return { updated: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("GeoIPUpdate", "Update failed", { error: message });
    throw err;
  } finally {
    // Cleanup temp dir (best effort)
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Descarga DB-IP City Lite (gratuita, sin key) a GEOIP_DBIP_PATH.
 * La URL oficial free cambia cada mes (dbip-city-lite-YYYY-MM.mmdb.gz) y
 * https://download.db-ip.com/free/dbip-city-lite-latest.mmdb.gz da 404.
 * Usamos el mirror estable de WP-Statistics/jsDelivr que se actualiza el día 1:
 * https://cdn.jsdelivr.net/npm/dbip-city-lite/dbip-city-lite.mmdb.gz
 */
export async function updateDbIpDatabase(): Promise<{ updated: boolean; reason?: string }> {
  const dbipPath = config.geoip.dbipPath?.trim();
  if (!dbipPath) return { updated: false, reason: "GEOIP_DBIP_PATH empty" };

  const url = "https://cdn.jsdelivr.net/npm/dbip-city-lite/dbip-city-lite.mmdb.gz";
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dbip-"));
  const tmpGz = path.join(tmpDir, "dbip.mmdb.gz");
  const tmpMmdb = path.join(tmpDir, "dbip.mmdb");

  try {
    logger.info("GeoIPUpdate", "Downloading DB-IP database", { url });
    const response = await axios.get(url, {
      responseType: "stream",
      timeout: 60_000,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 300,
      headers: { "User-Agent": "Radio-GeoIP-Updater/1.0" },
    });
    await pipeline(response.data as NodeJS.ReadableStream, fs.createWriteStream(tmpGz));

    const { createGunzip } = await import("zlib");
    await pipeline(fs.createReadStream(tmpGz), createGunzip(), fs.createWriteStream(tmpMmdb));

    await fs.promises.mkdir(path.dirname(dbipPath), { recursive: true });
    const tmpTarget = `${dbipPath}.tmp`;
    await fs.promises.copyFile(tmpMmdb, tmpTarget);
    await fs.promises.rename(tmpTarget, dbipPath);

    logger.info("GeoIPUpdate", "DB-IP database updated", { dbipPath });
    await reloadMaxmindReader();
    return { updated: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("GeoIPUpdate", "DB-IP update failed (opcional)", { error: message });
    return { updated: false, reason: message };
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Checks if the mmdb file is missing or older than maxAgeMs.
 */
export async function isDatabaseStale(maxAgeMs = 7 * 24 * 60 * 60 * 1000): Promise<boolean> {
  const mmdbPath = config.geoip.mmdbPath?.trim();
  const dbipPath = config.geoip.dbipPath?.trim();
  const paths = [mmdbPath, dbipPath].filter(Boolean) as string[];
  if (paths.length === 0) return true;
  for (const p of paths) {
    try {
      const stat = await fs.promises.stat(p);
      if (Date.now() - stat.mtimeMs > maxAgeMs) return true;
    } catch {
      return true;
    }
  }
  return false;
}
