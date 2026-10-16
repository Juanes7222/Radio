import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { toSameOriginMediaUrls } from "@radio/api";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const srcRoot = join(webRoot, "src");

/**
 * The site CSP is `img-src 'self' data: https: blob:` (nginx, public domain),
 * so an image whose origin is anything else — or anything `http://` — is
 * blocked outright, and on HTTPS it is also rejected as mixed content before
 * the CSP is even consulted. AzuraCast reports artwork with whatever absolute
 * origin the deployment used, so the client has to normalize it.
 */
const PAGE_ORIGIN = "https://lavozverdad.com";

interface NowPlayingPayload {
  now_playing: { song: { art: string } | null };
  playing_next: { song: { art: string } | null };
  station: { mounts: Array<{ url: string }>; listen_url: string };
}

function payloadWithArt(art: string): NowPlayingPayload {
  return {
    now_playing: { song: { art } },
    playing_next: { song: { art: art.replace("1781219825", "1788150392") } },
    station: { mounts: [{ url: "https://stream.lavozverdad.com/live" }], listen_url: "https://stream.lavozverdad.com/live" },
  };
}

describe("toSameOriginMediaUrls", () => {
  // The suite runs in the node environment, where an empty API base URL has no
  // window origin to fall back on. Same-origin is the production setup, so that
  // is the case under test.
  beforeAll(() => {
    vi.stubGlobal("window", { location: { origin: PAGE_ORIGIN } });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("re-points artwork that points at a foreign origin", () => {
    const result = toSameOriginMediaUrls(
      payloadWithArt("http://localhost/api/station/la_voz_de_la_verdad/art/ef8f5fc46b39ef5db66f23a1-1781219825.jpg"),
      "",
    );

    expect(result.now_playing.song?.art).toBe(
      `${PAGE_ORIGIN}/api/station/la_voz_de_la_verdad/art/ef8f5fc46b39ef5db66f23a1-1781219825.jpg`,
    );
    expect(result.playing_next.song?.art).toBe(
      `${PAGE_ORIGIN}/api/station/la_voz_de_la_verdad/art/ef8f5fc46b39ef5db66f23a1-1788150392.jpg`,
    );
  });

  it("covers every origin the station might report, not just loopback", () => {
    const origins = [
      "http://localhost",
      "http://127.0.0.1:8080",
      "https://panel.lavozverdad.com",
      "http://192.168.1.50:8000",
      "http://azuracast",
    ];

    for (const origin of origins) {
      const result = toSameOriginMediaUrls(payloadWithArt(`${origin}/api/station/1/media/7/art`), "");
      expect(result.now_playing.song?.art).toBe(`${PAGE_ORIGIN}/api/station/1/media/7/art`);
    }
  });

  it("never leaves a media URL on the http scheme", () => {
    const result = toSameOriginMediaUrls(payloadWithArt("http://192.168.1.50:8000/api/station/1/art/abc.jpg"), "");

    expect(result.now_playing.song?.art?.startsWith("https://")).toBe(true);
  });

  // mounts[].url and listen_url address the ICEcast server, not this origin.
  // Reducing them to a path would break playback outright, which is why the
  // rewrite is scoped to /api/station/ instead of applied to every URL.
  it("leaves the stream URLs alone", () => {
    const result = toSameOriginMediaUrls(
      payloadWithArt("http://192.168.1.50:8000/api/station/1/media/7/art"),
      "",
    );

    expect(result.station.mounts[0]?.url).toBe("https://stream.lavozverdad.com/live");
    expect(result.station.listen_url).toBe("https://stream.lavozverdad.com/live");
  });

  it("returns the same reference when there is nothing to rewrite", () => {
    const payload = payloadWithArt(`${PAGE_ORIGIN}/api/station/1/media/7/art`);

    expect(toSameOriginMediaUrls(payload, "")).toBe(payload);
  });

  it("respects an explicit API origin instead of the window origin", () => {
    const result = toSameOriginMediaUrls(
      payloadWithArt("http://192.168.1.50:8000/api/station/1/media/7/art"),
      "https://api.example.com",
    );

    expect(result.now_playing.song?.art).toBe("https://api.example.com/api/station/1/media/7/art");
  });
});

describe("public chrome", () => {
  function listSourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...listSourceFiles(full));
      } else if (entry.name.endsWith(".tsx")) {
        out.push(full);
      }
    }
    return out;
  }

  function toPosixRelative(file: string): string {
    return relative(webRoot, file).split(sep).join("/");
  }

  /**
   * The header is persistent chrome, so it belongs to PublicLayout. Mounted per
   * page it only carried the "Pedir oración" action on the home route, because
   * the action is gated on the `onOpenPrayer` callback every other page left
   * undefined. A page that mounts its own header is the regression.
   */
  it("keeps the header out of the routed pages", () => {
    const offenders = listSourceFiles(join(srcRoot, "pages"))
      .filter((file) => !toPosixRelative(file).includes("pages/admin/"))
      .filter((file) => /<Header[\s/>]/.test(readFileSync(file, "utf8")))
      .map(toPosixRelative);

    expect(offenders, "mount <Header /> in PublicLayout, not in a page").toEqual([]);
  });
});