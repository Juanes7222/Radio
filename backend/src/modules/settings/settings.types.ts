export type SettingFieldType = "number" | "boolean" | "text" | "emailList";

export type SettingSectionId =
  | "identity"
  | "health"
  | "announcements"
  | "voice"
  | "programs"
  | "processing"
  | "notifications"
  | "backups";

/** The value shape a definition can produce. Narrow per key via the catalog. */
export type SettingValue = string | number | boolean | string[];

export type SettingSource = "panel" | "env" | "default";

export interface SettingDefinition<T extends SettingValue = SettingValue> {
  key: string;
  section: SettingSectionId;
  label: string;
  description: string;
  type: SettingFieldType;
  defaultValue: T;
  /**
   * Reads the environment variable that seeds the value and stays as the
   * fallback. A function, not a value, because the catalog is built at import
   * time — long before Infisical has finished loading — and a direct read
   * there would capture the empty value.
   */
  envFallback?: () => T;
  unit?: string;
  min?: number;
  max?: number;
  parse: (raw: string) => T;
  format: (value: T) => string;
  /** The consumer captures the value at import; a change needs a restart. */
  requiresRestart?: boolean;
  /** Never written to the change log in clear text. */
  sensitive?: boolean;
}

/** A row of `station_settings`, as Prisma returns it. */
export interface SettingRow {
  key: string;
  value: string;
  updatedAt: Date;
  updatedBy: string | null;
}
