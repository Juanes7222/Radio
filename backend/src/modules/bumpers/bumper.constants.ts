// Permission shared with the programs module: the bumpers exist to serve the
// special programs, and reusing it avoids reassigning permissions to the admins
// that already have it.
export const BUMPER_PERMISSION = "programs";

export const BUMPER_ASSET_KINDS = ["intro", "outro"] as const;
export type BumperAssetKind = (typeof BUMPER_ASSET_KINDS)[number];

export function isBumperAssetKind(value: unknown): value is BumperAssetKind {
  return typeof value === "string" && (BUMPER_ASSET_KINDS as readonly string[]).includes(value);
}

/** Folder of the station library where the intro/outro files are uploaded. */
export const BUMPER_LIBRARY_FOLDER = "BUMPERS";