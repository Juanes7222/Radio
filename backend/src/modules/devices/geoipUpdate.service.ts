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

function getDownloadUrl(): string | null {
  const licenseKey = config.geoip.licenseKey?.trim();
  if (!licenseKey) return null;
  const editionId = config.geoip.editionId?.trim() || "GeoLite2-City";
  // MaxMind download endpoint (requires license key). Account ID is optional
  // for newer keys but kept for backwards compat.
  return `https://download.maxmind.com/app/geoip_download?edition_id=${encodeURIComponent(editionId)}&license_key=${encodeURIComponent(licenseKey)}&suffix=tar.gz`;
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

  const downloadUrl = getDownloadUrl();
  if (!downloadUrl) {
    logger.warn("GeoIPUpdate", "GEOIP_LICENSE_KEY not set, skipping update");
    return { updated: false, reason: "GEOIP_LICENSE_KEY missing" };
  }

  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "geoip-"));
  const tmpTarGz = path.join(tmpDir, "GeoLite2-City.tar.gz");

  try {
    logger.info("GeoIPUpdate", "Downloading MaxMind database", {
      editionId: config.geoip.editionId,
    });

    const response = await axios.get(downloadUrl, {
      responseType: "stream",
      timeout: 60_000,
      validateStatus: (s) => s >= 200 && s < 300,
      headers: { "User-Agent": "Radio-GeoIP-Updater/1.0" },
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
 * Checks if the mmdb file is missing or older than maxAgeMs.
 */
export async function isDatabaseStale(maxAgeMs = 7 * 24 * 60 * 60 * 1000): Promise<boolean> {
  const mmdbPath = config.geoip.mmdbPath?.trim();
  if (!mmdbPath) return true;
  try {
    const stat = await fs.promises.stat(mmdbPath);
    return Date.now() - stat.mtimeMs > maxAgeMs;
  } catch {
    return true;
  }
}
