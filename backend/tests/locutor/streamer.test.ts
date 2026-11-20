import { execFileSync, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const locutor = vi.hoisted(() => ({
  harborHost: "127.0.0.1",
  harborPort: 0,
  mountPoint: "/",
}));

vi.mock("../../src/config", () => ({ config: { locutor } }));
vi.mock("../../src/shared/logger/logger", () => ({ logger: { info: vi.fn() } }));
vi.mock("../../src/modules/azuracast/azuracast.client", () => ({ azuracastApi: {}, STATION_ID: 1 }));
vi.mock("../../src/modules/locutor/settings.service", () => ({
  getSettings: async () => ({ streamerUser: "test-dj", streamerPassword: "test-password" }),
}));

import { playFileAsLive } from "../../src/modules/locutor/streamer.service";

const ffmpegAvailable = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

describe.skipIf(!ffmpegAvailable)("Liquidsoap source transport", () => {
  let directory: string;
  let filePath: string;

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "radio-harbor-test-"));
    filePath = path.join(directory, "tone.mp3");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440",
      "-t", "0.8", "-c:a", "libmp3lame", filePath]);
  });

  afterAll(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it.each([200, 403])("waits for Harbor and handles status %s", async (status) => {
    let bytes = 0;
    let headers = "";
    let accepted = false;
    const server = createServer((socket) => {
      socket.on("data", (chunk) => {
        if (accepted) {
          bytes += chunk.length;
          return;
        }

        headers += chunk.toString("utf8");
        if (!headers.includes("\r\n\r\n")) return;
        accepted = true;
        socket.write(`HTTP/1.0 ${status}`);
        socket.write(status === 200 ? " OK\r\n\r\n" : " Forbidden\r\n\r\n");
        if (status !== 200) socket.end();
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test port");
    locutor.harborPort = address.port;

    try {
      const startedAt = Date.now();
      const playback = playFileAsLive(filePath, 1000, async () => {});
      if (status === 200) {
        await playback;
        expect(Date.now() - startedAt).toBeGreaterThan(650);
        expect(bytes).toBeGreaterThan(1000);
      } else {
        await expect(playback).rejects.toThrow("403 Forbidden");
        expect(bytes).toBe(0);
      }
      expect(headers.startsWith("SOURCE / HTTP/1.0\r\n")).toBe(true);
      expect(headers.endsWith("\r\n\r\n")).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
