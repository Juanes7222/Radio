import { describe, expect, it } from "vitest";
import { buildHeadTagsFor, buildSitemapXml, type SitemapEntry } from "../../src/config/seo.config";

const PAGE = {
  title: "Job 1 en español | Reina-Valera Gómez 2004",
  description: "Texto completo de Job 1 en la traducción Reina-Valera Gómez 2004, con la Biblia de la Voz de la Verdad.",
  ogTitle: "Job 1 en español",
  canonical: "https://lavozverdad.com/biblia/job/1/",
  jsonLd: '{"@type":"WebPage"}',
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
