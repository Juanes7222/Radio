/**
 * Single decision point for the station artwork.
 *
 * Artwork is switched off for now (Oct 2026). AzuraCast serves the cover as a
 * full-size JPEG, and the station art route 404s for most tracks, so every song
 * change costs a handful of failed image requests plus a full-resolution
 * download over a listener's mobile connection. The failures also put a row of
 * red errors in the console of every visitor.
 *
 * Returning `null` is not a new state: the console, the mini player and the
 * request dialog already fall back to `VinylDisc` or a plain icon when there is
 * no artwork, so nothing had to be redesigned to switch it off.
 *
 * Re-enabling is one flag. Consumers must keep resolving through here rather
 * than reading `song.art` directly, otherwise they will keep requesting it.
 */
export const ARTWORK_ENABLED = false;

/** Resolves the artwork URL for a track, or `null` when there is none to show. */
export function resolveArtworkUrl(art: string | null | undefined): string | null {
  if (!ARTWORK_ENABLED) return null;
  return art ? art : null;
}