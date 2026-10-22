import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  join(__dirname, "..", "..", "scripts", "seed-bible.ts"),
  "utf8",
);

/**
 * The seed skips the write when the database already holds the verses the
 * XML declares. The FTS index has to be rebuilt before that skip, because a
 * rebuild that failed during a deploy (a locked database, a missing table) is
 * never retried otherwise: the count matches, the seed returns, and the
 * biblical search stays broken until someone intervenes by hand.
 */
describe("the Bible seed", () => {
  it("rebuilds the FTS index before it skips the seed", () => {
    const skip = script.indexOf("Skipping the seed.");
    expect(skip, "the seed no longer reports the skip").toBeGreaterThan(-1);

    const endOfBranch = script.indexOf("return;", skip);
    expect(endOfBranch, "the skip no longer returns early").toBeGreaterThan(-1);

    const rebuild = script.indexOf("rebuildBibleFts(prisma)", skip);
    expect(
      rebuild,
      "the FTS index is not rebuilt on the path that skips the seed",
    ).toBeGreaterThan(-1);
    expect(rebuild).toBeLessThan(endOfBranch);
  });
});
