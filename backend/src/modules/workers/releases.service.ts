import fs from "fs";
import path from "path";
import crypto from "crypto";
import * as semver from "semver";
import { prisma } from "../../infrastructure/database/prisma";

const RELEASES_DIR = path.join(process.cwd(), "data", "worker-releases");
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const MAX_SIZE = 50 * 1024 * 1024;

export function ensureReleasesDir(): void {
  if (!fs.existsSync(RELEASES_DIR)) {
    fs.mkdirSync(RELEASES_DIR, { recursive: true });
  }
}

export function validateSemver(version: string): void {
  if (!SEMVER_RE.test(version)) {
    throw new Error("Version debe ser semver x.y.z");
  }
}

export async function computeSha256(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

export async function createRelease(params: {
  version?: string;
  tmpPath: string;
  mandatory: boolean;
  createdBy?: string;
}): Promise<{ version: string; sha256: string; size: number }> {
  let version = params.version?.trim();
  if (!version) {
    const latest = await prisma.workerRelease.findFirst({ orderBy: { createdAt: "desc" }, select: { version: true } });
    version = latest?.version ? semver.inc(latest.version, "patch") ?? "1.0.1" : "1.0.1";
  }
  validateSemver(version);
  const exists = await prisma.workerRelease.findUnique({ where: { version } });
  if (exists) throw new Error("Version ya existe");
  const stat = fs.statSync(params.tmpPath);
  if (stat.size > MAX_SIZE) throw new Error("Artefacto excede 50 MB");
  const sha256 = await computeSha256(params.tmpPath);
  ensureReleasesDir();
  const dest = path.join(RELEASES_DIR, `${version}.zip`);
  fs.copyFileSync(params.tmpPath, dest);
  fs.unlinkSync(params.tmpPath);
  await prisma.workerRelease.create({
    data: {
      version,
      sha256,
      size: stat.size,
      filePath: dest,
      mandatory: params.mandatory,
      createdBy: params.createdBy,
    },
  });
  return { version, sha256, size: stat.size };
}

export async function getLatestRelease(): Promise<{
  version: string;
  sha256: string;
  size: number;
  mandatory: boolean;
} | null> {
  return prisma.workerRelease.findFirst({
    orderBy: { createdAt: "desc" },
    select: { version: true, sha256: true, size: true, mandatory: true },
  });
}

export async function getReleaseByVersion(version: string) {
  return prisma.workerRelease.findUnique({ where: { version } });
}
