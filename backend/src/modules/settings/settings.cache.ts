import { logger } from "../../shared/logger/logger";
import { getDefinition, SETTINGS_CATALOG } from "./settings.catalog";
import type { SettingDefinition, SettingRow, SettingSource, SettingValue } from "./settings.types";

export interface ResolvedSetting {
  value: SettingValue | null;
  source: SettingSource;
  /**
   * The entry this resolution consulted, `null` when the catalog does not know
   * the key. Handed back so a typed reader can narrow the value against the
   * declaration that produced it, instead of looking the catalog up again and
   * risking a second, different answer.
   */
  definition: SettingDefinition | null;
}

/**
 * Catalog keys whose default declares a number, so a boolean key cannot be read
 * through a numeric reader and the compiler rejects the mix-up.
 */
type NumberSettingKey = {
  [K in keyof typeof SETTINGS_CATALOG]: (typeof SETTINGS_CATALOG)[K]["defaultValue"] extends number
    ? K
    : never;
}[keyof typeof SETTINGS_CATALOG];

type BooleanSettingKey = {
  [K in keyof typeof SETTINGS_CATALOG]: (typeof SETTINGS_CATALOG)[K]["defaultValue"] extends boolean
    ? K
    : never;
}[keyof typeof SETTINGS_CATALOG];

type TextSettingKey = {
  [K in keyof typeof SETTINGS_CATALOG]: (typeof SETTINGS_CATALOG)[K]["defaultValue"] extends string
    ? K
    : never;
}[keyof typeof SETTINGS_CATALOG];

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
 *
 * A missing, unknown or unparseable value never throws, because these reads run
 * on synchronous paths — health checks, job dispatch, audio composition — where
 * a bad row must not stop the station. A value whose type contradicts the entry
 * that declares it is a different thing: not a data problem but an authoring one,
 * so the typed readers log it and answer that entry's default rather than
 * failing. Throwing here would travel `registerHealthJob` -> `startScheduler` ->
 * the `process.exit(1)` in `bootstrap` and take the backend down with it.
 */
export function resolveFromRows(
  key: string,
  rows: ReadonlyMap<string, SettingRow>,
): ResolvedSetting {
  const definition = getDefinition(key);
  if (!definition) return { value: null, source: "default", definition: null };

  const row = rows.get(key);
  if (row) {
    try {
      return { value: definition.parse(row.value), source: "panel", definition };
    } catch {
      // Falls through to the environment value and the default. The warning
      // belongs to the hydration, which is where the row enters the cache.
    }
  }

  const envValue = readEnvFallback(definition);
  if (envValue !== undefined && !isSameValue(envValue, definition.defaultValue)) {
    return { value: envValue, source: "env", definition };
  }

  return { value: definition.defaultValue, source: "default", definition };
}

/** The effective value of a key, or `null` when the catalog does not know it. */
export function getSetting(key: string): SettingValue | null {
  return resolveCurrent(key).value;
}

/** Where the value of a key comes from, for the panel to label it. */
export function settingSource(key: string): SettingSource {
  return resolveCurrent(key).source;
}

/**
 * The value of a numeric key, typed. `getSetting` answers with every value
 * shape the catalog can hold because one reader serves all keys, so a config
 * module delegating to it would hand a union to a consumer that needs a
 * number. This is the narrowing the callers would otherwise write by hand.
 *
 * Everything comes out of one resolution. The value is what `resolveCurrent`
 * resolved, and the fallback is the default of the very definition that
 * resolution consulted, so this cannot answer a number that resolution did not
 * already have in hand.
 */
export function getNumberSetting(key: NumberSettingKey): number {
  const { value, definition } = resolveCurrent(key);
  if (typeof value === "number") return value;

  // Reachable only when the catalog entry contradicts itself: it declares a
  // numeric default here, so only a `parse` or an `envFallback` of the wrong
  // type can produce anything else, and `satisfies` does not check that a key's
  // three sources agree. Answering the default quietly would hide a threshold
  // that disagrees with the panel, so it is logged. It is answered rather than
  // thrown because an authoring mistake must not become an outage: see the note
  // on `resolveFromRows` about what this call sits in front of.
  const fallback = definition?.defaultValue;
  if (typeof fallback === "number") {
    logger.error("Settings", "Numeric reader resolved a non-number; using the catalog default", {
      key,
      received: typeof value,
    });
    return fallback;
  }

  // Structural: a key that is not in the catalog cannot reach a reader, whose
  // parameter type is built from the catalog. Kept so a future caller that
  // widens that type fails loudly instead of reading something meaningless.
  throw new Error(`Setting "${key}" is not in the catalog`);
}

/** The text counterpart of {@link getNumberSetting}. */
export function getTextSetting(key: TextSettingKey): string {
  const { value, definition } = resolveCurrent(key);
  if (typeof value === "string") return value;

  const fallback = definition?.defaultValue;
  if (typeof fallback === "string") {
    logger.error("Settings", "Text reader resolved a non-string; using the catalog default", {
      key,
      received: typeof value,
    });
    return fallback;
  }

  throw new Error(`Setting "${key}" is not in the catalog`);
}

/** The boolean counterpart of {@link getNumberSetting}. */
export function getBooleanSetting(key: BooleanSettingKey): boolean {
  const { value, definition } = resolveCurrent(key);
  if (typeof value === "boolean") return value;

  const fallback = definition?.defaultValue;
  if (typeof fallback === "boolean") {
    logger.error("Settings", "Boolean reader resolved a non-boolean; using the catalog default", {
      key,
      received: typeof value,
    });
    return fallback;
  }

  throw new Error(`Setting "${key}" is not in the catalog`);
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
