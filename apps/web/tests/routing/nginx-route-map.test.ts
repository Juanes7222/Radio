import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PUBLIC_ROUTES } from "../../src/config/seo.config";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);

const nginx = readFileSync(
  join(repoRoot, "scripts", "nginx", "radio-global.conf"),
  "utf8",
);

/**
 * The patterns of the map that decides which paths may fall back to the
 * application shell.
 *
 * nginx writes them as quoted regular expressions ("~^/programacion/?$"), and
 * the root is one of them ("~^/$"), so the routes are compared as patterns
 * and not as text.
 */
function mapPatterns(): string[] {
  const block = /map\s+\$uri\s+\$spa_route\s*\{([^}]*)\}/.exec(nginx);
  if (block === null) return [];
  return [...block[1].matchAll(/"~([^"]+)"/g)].map((match) => match[1]);
}

/** The forms of a route that reach the server: the bare one and the canonical. */
function formsOf(route: string): string[] {
  return route === "/" ? ["/"] : [route, `${route}/`];
}

/**
 * The map and the route list are two lists of the same thing, written in two
 * places, and nothing tied them together: a route added to the route table
 * without touching the map is announced in the sitemap and answers 404 in
 * production.
 *
 * The rule is one-directional on purpose. Every public route has to be
 * covered by the map, because the map is the allowlist of the paths that may
 * fall back to the shell. The map may carry more than the public routes: the
 * admin panel lives on this host too, and it is not a public route.
 */
describe("the nginx route map", () => {
  it("lets every public route fall back to the application shell", () => {
    const patterns = mapPatterns();
    expect(patterns.length, "the map of $spa_route was not found").toBeGreaterThan(0);

    const missing = PUBLIC_ROUTES.filter((route) =>
      formsOf(route).some(
        (form) => !patterns.some((pattern) => new RegExp(pattern).test(form)),
      ),
    );

    expect(
      missing,
      "these public routes are not in the map of $spa_route and would answer 404",
    ).toEqual([]);
  });

  it("keeps the admin panel reachable", () => {
    const patterns = mapPatterns();

    expect(
      patterns.some((pattern) => new RegExp(pattern).test("/admin/login")),
      "the admin panel is not in the map of $spa_route",
    ).toBe(true);
  });
});
