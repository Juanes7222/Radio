import { resolveFromRows } from "./settings.cache";
import { SETTING_SECTIONS, SETTINGS_CATALOG, getDefinition } from "./settings.catalog";
import type {
  SettingDefinition,
  SettingFieldType,
  SettingRow,
  SettingSectionId,
  SettingSource,
  SettingValue,
} from "./settings.types";

/** What the change log stores instead of a sensitive value. */
export const REDACTED_PLACEHOLDER = "(oculto)";

export interface StationSettingValue {
  key: string;
  label: string;
  description: string;
  type: SettingFieldType;
  value: SettingValue | null;
  source: SettingSource;
  unit: string | null;
  min: number | null;
  max: number | null;
  requiresRestart: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface StationSettingsSection {
  id: SettingSectionId;
  label: string;
  description: string;
  items: StationSettingValue[];
}

/**
 * Widened on purpose. Each catalog entry carries its own literal default, and
 * reading the optional metadata off that union is what the view needs; the
 * precedence that turns a default into the effective value belongs to
 * `resolveFromRows`, not to this module.
 */
const DEFINITIONS: readonly SettingDefinition[] = Object.values(SETTINGS_CATALOG);

/**
 * Assembles what the operator sees: the catalog grouped by section, each entry
 * carrying the effective value, where it came from and whether saving it takes
 * effect now.
 *
 * `source` and `requiresRestart` answer two different questions and are not
 * redundant. The first is about precedence — a row, the environment or the
 * catalog default. The second is about the consumer: a value in the cache can
 * still be one a module captured at import, so it needs a restart to be read.
 *
 * Pure: it reads the rows it is given and the environment through the catalog,
 * and writes nothing.
 */
export function buildSettingsView(
  rows: ReadonlyMap<string, SettingRow>
): StationSettingsSection[] {
  return SETTING_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
    description: section.description,
    items: DEFINITIONS.filter(
      (definition) => definition.section === section.id
    ).map((definition) => buildItem(definition, rows)),
  }));
}

/**
 * The value the change log records. A key the catalog marks sensitive is stored
 * as the placeholder, and so is a key the catalog does not know: a definition
 * retired in a later version must not leave its old value readable in the log,
 * and the write path already rejects an unknown key, so nothing real is lost.
 */
export function redactForAudit(key: string, value: string | null): string | null {
  if (value === null) return null;

  const definition = getDefinition(key);
  if (!definition || definition.sensitive) return REDACTED_PLACEHOLDER;

  return value;
}

function buildItem(
  definition: SettingDefinition,
  rows: ReadonlyMap<string, SettingRow>
): StationSettingValue {
  const { value, source } = resolveFromRows(definition.key, rows);
  const row = rows.get(definition.key);

  return {
    key: definition.key,
    label: definition.label,
    description: definition.description,
    type: definition.type,
    value,
    source,
    unit: definition.unit ?? null,
    min: definition.min ?? null,
    max: definition.max ?? null,
    requiresRestart: definition.requiresRestart ?? false,
    // The panel prints these as dates, and the JSON response carries ISO text.
    updatedAt: row ? row.updatedAt.toISOString() : null,
    updatedBy: row?.updatedBy ?? null,
  };
}