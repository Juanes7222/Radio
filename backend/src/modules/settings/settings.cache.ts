import { logger } from "../../shared/logger/logger";
import { getDefinition } from "./settings.catalog";
import type { SettingDefinition, SettingRow, SettingSource, SettingValue } from "./settings.types";

export interface ResolvedSetting {
  value: SettingValue | null;
  source: SettingSource;
}

/** Rows as they came out of `station_settings` at the last hydration. */
const storedRows = new Map<string, SettingRow>();

/**
 * Keys whose stored value already failed to parse. Remembering them keeps a
 * hot read from running a parse that is known to throw.
 */
const unparseableKeys = new Set<string>();

/** Rows the cache would report as absent, without allocating a new map. */
const NO_ROWS: ReadonlyMap<string, SettingRow> = new Map();

/** Rows whose key the catalog no longer knows, since the last hydration. */
let unknownKeyCount = 0;

/**
 * Reads one setting with the precedence the whole module shares: a parseable
 * stored row wins, then the environment variable, then the catalog default.
 * Never throws, because it runs on synchronous paths — health checks, job
 * dispatch, audio composition — where a bad row must not stop the station.
 */
export function resolveFromRows(
  key: string,
  rows: ReadonlyMap<string, SettingRow>,
): ResolvedSetting {
  const definition = getDefinition(key);
  if (!definition) return { value: null, source: "default" };

  const row = rows.get(key);
  if (row) {
    try {
      return { value: definition.parse(row.value), source: "panel" };
    } catch {
      // Falls through to the environment value and the default. The warning
      // belongs to the hydration, which is where the row enters the cache.
    }
  }

  const envValue = readEnvFallback(definition);
  if (envValue !== undefined && !isSameValue(envValue, definition.defaultValue)) {
    return { value: envValue, source: "env" };
  }

  return { value: definition.defaultValue, source: "default" };
}

/** The effective value of a key, or `null` when the catalog does not know it. */
export function getSetting(key: string): SettingValue | null {
  return resolveCurrent(key).value;
}

/** Where the value of a key comes from, for the panel to label it. */
export function settingSource(key: string): SettingSource {
  return resolveCurrent(key).source;
}

/** Every hydrated row, including the ones the catalog does not know. */
export function currentRows(): ReadonlyMap<string, SettingRow> {
  return storedRows;
}

/**
 * Replaces the cache content. Called on boot and after a write, so a row the
 * catalog does not know — left behind by an older version — is a warning and
 * not a failure.
 */
export function hydrateFromRows(rows: readonly SettingRow[]): void {
  resetCache();

  for (const row of rows) {
    storedRows.set(row.key, row);

    const definition = getDefinition(row.key);
    if (!definition) {
      unknownKeyCount += 1;
      logger.warn("Settings", "Ignoring a stored row whose key is not in the catalog", {
        key: row.key,
        unknownKeys: unknownKeyCount,
      });
      continue;
    }

    try {
      definition.parse(row.value);
    } catch (error) {
      unparseableKeys.add(row.key);
      logger.warn("Settings", "Stored value cannot be parsed; reading the fallback", {
        key: row.key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/** Drops every cached row, so the next read reports the environment again. */
export function resetCache(): void {
  storedRows.clear();
  unparseableKeys.clear();
  unknownKeyCount = 0;
}

/** `resolveFromRows` over the module state, minus the rows known to be bad. */
function resolveCurrent(key: string): ResolvedSetting {
  return resolveFromRows(key, unparseableKeys.has(key) ? NO_ROWS : storedRows);
}

/**
 * The environment is the last source before the default, so a reader that
 * throws must not take the read down with it. Silent on purpose: hydration
 * already logs the row problems that matter, and this runs on every read.
 */
function readEnvFallback(definition: SettingDefinition): SettingValue | undefined {
  if (!definition.envFallback) return undefined;
  try {
    return definition.envFallback();
  } catch {
    return undefined;
  }
}

/** A list read from the environment is a new array every time, so compare items. */
function isSameValue(left: SettingValue, right: SettingValue): boolean {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  return left.length === right.length && left.every((item, index) => item === right[index]);
}
