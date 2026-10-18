import type { StationSettingChange } from "@radio/types";
import { prisma } from "../../infrastructure/database/prisma";
import { AppError } from "../../shared/errors/app-error";
import { logger } from "../../shared/logger/logger";
import { getDefinition } from "./settings.catalog";
import { hydrateFromRows } from "./settings.cache";
import { normalizeSettingValue, parseSettingInput } from "./settings.validation";
import {
  buildSettingsView,
  redactForAudit,
  type StationSettingsSection,
} from "./settings.view";
import type { SettingRow } from "./settings.types";

/**
 * How long the change log keeps an entry. The table only grows when somebody
 * saves, and pruning on the read that displays it costs nothing on the write
 * path — there is no job to add to the scheduler for a table nobody reads.
 */
const CHANGE_RETENTION_DAYS = 180;

const MS_PER_DAY = 86_400_000;

/**
 * Loads the stored settings into the module cache.
 *
 * Fails soft on purpose: a station that boots on environment values is
 * recoverable, a station that does not boot is not. Callers therefore get a
 * resolved promise whether or not the database answered.
 */
export async function hydrateSettings(): Promise<void> {
  try {
    const rows = await prisma.stationSetting.findMany();
    hydrateFromRows(rows);

    logger.info("Settings", "Settings cache hydrated", { rows: rows.length });
  } catch (error) {
    logger.warn("Settings", "Hydration failed; running on environment values", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * The settings page: the whole catalog, grouped by section, each entry carrying
 * the effective value and where it came from.
 */
export async function readSettings(): Promise<StationSettingsSection[]> {
  const rows = await prisma.stationSetting.findMany();
  const entries: Array<[string, SettingRow]> = rows.map((row) => [row.key, row]);

  return buildSettingsView(new Map(entries));
}

/**
 * Applies a partial save.
 *
 * An unknown key is a 400 and never a silent skip: a panel running an older
 * version sends a key that no longer exists, and ignoring it would make the
 * panel report "saved" over a change that never happened. Every key is
 * validated before anything is written, so a rejected patch leaves no partial
 * state behind.
 */
export async function applyPatch(
  patch: Record<string, unknown>,
  changedBy: string
): Promise<{ applied: string[] }> {
  const entries = Object.entries(patch).map(([key, raw]) => {
    const parsed = parseSettingInput(key, raw);
    if (!parsed.ok) throw new AppError(400, parsed.error);
    return { key, text: normalizeSettingValue(key, parsed.value) };
  });

  if (entries.length === 0) return { applied: [] };

  const previous = await currentRowValues();

  await prisma.$transaction([
    ...entries.map((entry) =>
      prisma.stationSetting.upsert({
        where: { key: entry.key },
        update: { value: entry.text, updatedBy: changedBy },
        create: { key: entry.key, value: entry.text, updatedBy: changedBy },
      })
    ),
    // Both sides of the change go through the audit redaction, so a value the
    // catalog marks sensitive never reaches the log even for its own successor.
    ...entries.map((entry) =>
      prisma.stationSettingChange.create({
        data: {
          key: entry.key,
          previousValue: redactForAudit(entry.key, previous.get(entry.key) ?? null),
          newValue: redactForAudit(entry.key, entry.text),
          changedBy,
        },
      })
    ),
  ]);

  await refreshCache();

  return { applied: entries.map((entry) => entry.key) };
}

/**
 * Drops the stored rows of the given keys, so each one goes back to its
 * environment value or its catalog default.
 *
 * A key with no row is not an error: it already resolves from the fallback, so
 * there is nothing to clear and the view says so on its own. A key outside the
 * catalog is a 400, for the same reason an unknown key in a patch is.
 */
export async function resetKeys(
  keys: string[],
  changedBy: string
): Promise<{ cleared: string[] }> {
  for (const key of keys) {
    if (!getDefinition(key)) {
      throw new AppError(400, `No existe el ajuste "${key}" en el catálogo.`);
    }
  }

  const previous = await currentRowValues();
  const stored = [...new Set(keys)].filter((key) => previous.has(key));

  if (stored.length > 0) {
    await prisma.$transaction([
      prisma.stationSetting.deleteMany({ where: { key: { in: stored } } }),
      ...stored.map((key) =>
        prisma.stationSettingChange.create({
          data: {
            key,
            previousValue: redactForAudit(key, previous.get(key) ?? null),
            newValue: null,
            changedBy,
          },
        })
      ),
    ]);

    await refreshCache();
  }

  return { cleared: stored };
}

/**
 * The most recent changes, newest first, pruning the entries past the retention
 * window on the way.
 */
export async function listChanges(limit: number): Promise<StationSettingChange[]> {
  const cutoff = new Date(Date.now() - CHANGE_RETENTION_DAYS * MS_PER_DAY);

  await prisma.stationSettingChange.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  const rows = await prisma.stationSettingChange.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    previousValue: row.previousValue,
    newValue: row.newValue,
    changedBy: row.changedBy,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * Rereads the table into the cache after a write. The cache is the only holder
 * of that state, and rehydrating is also what clears the set of rows it knows
 * to be unparseable — a key whose value was just corrected has to stop being
 * shadowed by that entry.
 */
async function refreshCache(): Promise<void> {
  hydrateFromRows(await prisma.stationSetting.findMany());
}

async function currentRowValues(): Promise<Map<string, string>> {
  const rows = await prisma.stationSetting.findMany();
  return new Map(rows.map((row) => [row.key, row.value]));
}
