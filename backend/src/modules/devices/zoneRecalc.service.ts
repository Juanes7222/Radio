import { prisma } from "../../infrastructure/database/prisma";
import { logger } from "../../shared/logger/logger";
import { resolveZoneDetails } from "./geoip.service";

export type ZoneRecalcScope = "missing" | "auto" | "all";

export interface ZoneRecalcOptions {
  scope?: ZoneRecalcScope;
  forceManual?: boolean;
  dryRun?: boolean;
  limit?: number;
  overwriteStaleAuto?: boolean;
}

export interface ZoneRecalcResult {
  total: number;
  considered: number;
  updated: number;
  skippedManual: number;
  skippedNoIp: number;
  failed: number;
  dryRun: boolean;
  changes: Array<{
    deviceId: string;
    oldZone: string | null;
    newZone: string | null;
    oldSource: string | null;
    newSource: string | null;
    region: string | null;
    country: string | null;
  }>;
}

/**
 * Recalculates zones for devices in bulk using their stored lastIp.
 *
 * - scope `missing`: only devices where zoneId is null
 * - scope `auto`: devices with zoneSource != MANUAL (includes missing)
 * - scope `all`: all devices except MANUAL unless forceManual=true
 *
 * Devices without lastIp are counted as skippedNoIp; MANUAL zones are
 * preserved unless forceManual=true. When dryRun=true no DB writes occur.
 */
export async function recalculateZones(
  options: ZoneRecalcOptions = {}
): Promise<ZoneRecalcResult> {
  const scope: ZoneRecalcScope = options.scope ?? "auto";
  const forceManual = options.forceManual ?? false;
  const dryRun = options.dryRun ?? false;
  const limit = options.limit && options.limit > 0 ? Math.min(options.limit, 5000) : undefined;

  // Build where clause based on scope.
  let where: Record<string, unknown> = {};

  if (scope === "missing") {
    where = { zoneId: null };
  } else if (scope === "auto") {
    where = {
      OR: [{ zoneId: null }, { zoneSource: { not: "MANUAL" } }],
    };
  } else {
    // "all" — include everything; filtering of MANUAL happens per-device
    where = {};
  }

  const total = await prisma.device.count();
  const candidates = await prisma.device.findMany({
    where: where as never,
    select: {
      deviceId: true,
      zoneId: true,
      zoneSource: true,
      lastIp: true,
    },
    orderBy: { lastSeen: "desc" },
    take: limit,
  });

  let considered = candidates.length;
  let updated = 0;
  let skippedManual = 0;
  let skippedNoIp = 0;
  let failed = 0;
  const changes: ZoneRecalcResult["changes"] = [];

  for (const device of candidates) {
    // Preserve MANUAL zones unless forced.
    if (!forceManual && device.zoneSource === "MANUAL" && scope === "all") {
      skippedManual++;
      continue;
    }
    // In auto scope we already excluded MANUAL via where, but keep guard for safety
    if (!forceManual && device.zoneSource === "MANUAL") {
      skippedManual++;
      continue;
    }

    const lastIp = (device as unknown as { lastIp: string | null }).lastIp ?? null;
    if (!lastIp) {
      skippedNoIp++;
      continue;
    }

    try {
      const result = await resolveZoneDetails(lastIp);
      if (!result) {
        failed++;
        continue;
      }

      const oldZone = device.zoneId;
      const oldSource = device.zoneSource ?? null;
      const newZone = result.city;
      const newSource = result.source;

      // No change needed
      if (oldZone === newZone && oldSource === newSource) {
        continue;
      }

      changes.push({
        deviceId: device.deviceId,
        oldZone,
        newZone,
        oldSource,
        newSource,
        region: result.region,
        country: result.country,
      });

      if (!dryRun) {
        await prisma.device.update({
          where: { deviceId: device.deviceId },
          data: {
            zoneId: newZone,
            zoneSource: newSource,
            zoneAssignedAt: new Date(),
            zoneRegion: result.region,
            zoneCountry: result.country,
          },
        });
        updated++;
      } else {
        updated++;
      }
    } catch (err) {
      failed++;
      logger.warn("ZoneRecalc", "Failed to resolve zone for device", {
        deviceId: device.deviceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (dryRun) {
    logger.info("ZoneRecalc", "Dry run completed", {
      scope,
      considered,
      wouldUpdate: updated,
      skippedManual,
      skippedNoIp,
      failed,
    });
  } else {
    logger.info("ZoneRecalc", "Recalculation completed", {
      scope,
      considered,
      updated,
      skippedManual,
      skippedNoIp,
      failed,
    });
  }

  return {
    total,
    considered,
    updated,
    skippedManual,
    skippedNoIp,
    failed,
    dryRun,
    changes: dryRun ? changes.slice(0, 100) : changes.slice(0, 200),
  };
}

export interface ZoneRecalcStats {
  total: number;
  withZone: number;
  withoutZone: number;
  manual: number;
  auto: number;
  withIp: number;
  withoutIp: number;
  zones: string[];
}

export async function getZoneRecalcStats(): Promise<ZoneRecalcStats> {
  const [total, withZone, withoutZone, manual, auto, withIp] = await Promise.all([
    prisma.device.count(),
    prisma.device.count({ where: { zoneId: { not: null } } }),
    prisma.device.count({ where: { zoneId: null } }),
    prisma.device.count({ where: { zoneSource: "MANUAL" } }),
    prisma.device.count({ where: { zoneSource: { not: "MANUAL" } } }),
    prisma.device.count({ where: { lastIp: { not: null } } }),
  ]);

  const devices = await prisma.device.findMany({
    where: { zoneId: { not: null } },
    select: { zoneId: true },
  });
  const zones = [...new Set(devices.map((d) => d.zoneId).filter((z): z is string => Boolean(z)))].sort(
    (a, b) => a.localeCompare(b, "es")
  );

  return {
    total,
    withZone,
    withoutZone,
    manual,
    auto,
    withIp,
    withoutIp: total - withIp,
    zones,
  };
}
