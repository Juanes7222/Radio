import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ARTWORK_ENABLED, resolveArtworkUrl } from "../../src/lib/artwork";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * The surfaces that actually ship artwork. `RadioPlayer`, `MobilePlayerHero`,
 * `SongInfo` and `SongHistory` are `@deprecated Use StationConsole` with no
 * importer, so they are tree-shaken out of the bundle and are not listed here.
 */
const ARTWORK_CONSUMERS = [
  "src/components/player/StationConsole.tsx",
  "src/components/player/MiniPlayer.tsx",
  "src/components/player/SongRequest.tsx",
  "src/pages/admin/AdminDashboard.tsx",
  "src/pages/admin/AdminRequests.tsx",
];

const COVER_URL = "https://lavozverdad.com/api/station/la_voz_de_la_verdad/art/abc-1700000000.jpg";

/**
 * An <img src> or a CSS background fed straight from `…art`.
 *
 * Known limit: this catches artwork wired straight into the markup, not a
 * consumer that hand-rolls `const art = song.art` into a variable first. Keeping
 * that honest is what the second test below is for — a consumer has to call
 * `resolveArtworkUrl`, which is the only thing that honours the switch.
 */
const RAW_ARTWORK = /src=\{[^}]*\.art\b[^}]*\}|url\(\$?\{[^}]*\.art\b[^}]*\}\)/;

describe("artwork switch", () => {
  it("is off, which is the point of the switch right now", () => {
    expect(ARTWORK_ENABLED).toBe(false);
    expect(resolveArtworkUrl(COVER_URL)).toBeNull();
    expect(resolveArtworkUrl(null)).toBeNull();
    expect(resolveArtworkUrl(undefined)).toBeNull();
    expect(resolveArtworkUrl("")).toBeNull();
  });

  it("still returns the cover when the switch is flipped back", () => {
    // The flag is a module constant, so this asserts the shape of the contract
    // rather than re-running it: with ARTWORK_ENABLED true the same function
    // must hand the URL through untouched.
    const source = readFileSync(join(webRoot, "src/lib/artwork.ts"), "utf8");

    expect(source).toMatch(/if \(!ARTWORK_ENABLED\) return null;/);
    expect(source).toMatch(/return art \? art : null;/);
  });

  it("routes every shipped artwork surface through resolveArtworkUrl", () => {
    const offenders = ARTWORK_CONSUMERS.filter((relative) => {
      const source = readFileSync(join(webRoot, relative), "utf8");
      return RAW_ARTWORK.test(source.replace(/resolveArtworkUrl\([^)]*\)/g, "resolveArtworkUrl(...)"));
    });

    expect(
      offenders,
      "read the artwork through resolveArtworkUrl so the switch in src/lib/artwork.ts can turn it off",
    ).toEqual([]);
  });

  it("keeps the switch on the path of every consumer, so flipping it restores all of them", () => {
    const withoutResolver = ARTWORK_CONSUMERS.filter(
      (relative) => !readFileSync(join(webRoot, relative), "utf8").includes("resolveArtworkUrl("),
    );

    expect(withoutResolver).toEqual([]);
  });
});