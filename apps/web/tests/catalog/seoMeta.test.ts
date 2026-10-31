import { describe, expect, it } from "vitest";
import {
  PUBLIC_ROUTES,
  ROUTE_META,
  buildHeadTags,
  buildHeadTagsFor,
  buildSocialTags,
  buildSocialTagsFor,
  buildSitemapXml,
  canonicalUrl,
  escapeHtml,
  type SitemapEntry,
} from "../../src/config/seo.config";

const PAGE = {
  title: "Job 1 en español | Reina-Valera Gómez 2004",
  description: "Texto completo de Job 1 en la traducción Reina-Valera Gómez 2004, con la Biblia de la Voz de la Verdad.",
  ogTitle: "Job 1 en español",
  canonical: "https://lavozverdad.com/biblia/job/1/",
};

describe("buildHeadTagsFor", () => {
  it("emits the title, the description and the canonical of the page", () => {
    const html = buildHeadTagsFor(PAGE);
    expect(html).toContain(`<title>${PAGE.title}</title>`);
    expect(html).toContain(`<link rel="canonical" href="${PAGE.canonical}" />`);
  });

  it("escapes the values it writes into the attributes", () => {
    const html = buildHeadTagsFor({ ...PAGE, title: 'Grace & "Truth"' });
    expect(html).toContain("Grace &amp; &quot;Truth&quot;");
  });
});

describe("buildSocialTagsFor", () => {
  it("emits the Open Graph and the Twitter tags of the page", () => {
    const html = buildSocialTagsFor(PAGE);
    expect(html).toContain(`<meta property="og:url" content="${PAGE.canonical}" />`);
    expect(html).toContain(`<meta property="og:title" content="${PAGE.ogTitle}" />`);
    expect(html).toContain(
      `<meta property="og:description" content="${escapeHtml(PAGE.description)}" />`,
    );
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });
});

/**
 * The builders of the nine public routes are the ones the routes that are
 * already ranking in production ship, and a silent regression there (an
 * empty description, an og:url pointing at the wrong host) costs traffic
 * without a single error. These assertions read the builders, not a built
 * `dist`, so they hold even when the build output is stale.
 */
describe("the head builders of the public routes", () => {
  it("carry the title and the description of every route", () => {
    for (const route of PUBLIC_ROUTES) {
      const meta = ROUTE_META[route];
      const html = buildHeadTags(route);

      expect(html, route).toContain(`<title>${escapeHtml(meta.title)}</title>`);
      expect(html, route).toContain(
        `<meta name="description" content="${escapeHtml(meta.description)}" />`,
      );
    }
  });

  it("point the canonical and the og:url of every route at its own URL", () => {
    for (const route of PUBLIC_ROUTES) {
      const canonical = canonicalUrl(route);
      const head = buildHeadTags(route);
      const social = buildSocialTags(route);

      expect(head, route).toContain(`<link rel="canonical" href="${canonical}" />`);
      expect(social, route).toContain(`<meta property="og:url" content="${canonical}" />`);
    }
  });

  it("give every route a description of its own", () => {
    const descriptions = PUBLIC_ROUTES.map((route) => ROUTE_META[route].description);
    expect(new Set(descriptions).size).toBe(PUBLIC_ROUTES.length);
  });
});

describe("buildSitemapXml", () => {
  it("appends the extra entries to the public routes", () => {
    const extra: SitemapEntry[] = [
      { loc: "https://lavozverdad.com/biblia/job/1/", priority: 0.7, changefreq: "yearly", lastmod: "2026-10-21" },
    ];
    const sitemap = buildSitemapXml(new Date("2026-10-21T00:00:00Z"), extra);
    expect(sitemap).toContain("<loc>https://lavozverdad.com/</loc>");
    expect(sitemap).toContain("<loc>https://lavozverdad.com/biblia/job/1/</loc>");
    expect(sitemap).toContain("<lastmod>2026-10-21</lastmod>");
  });
});
