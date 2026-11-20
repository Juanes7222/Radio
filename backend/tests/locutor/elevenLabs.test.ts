import { afterEach, beforeEach, expect, it, vi } from "vitest";
import axios from "axios";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const settings = vi.hoisted(() => ({
  apiKeys: ["key-a", "key-b"],
  voiceIdByTemplateVoice: { ef_dora: "mapped" },
  defaultVoiceId: "default",
  baseUrl: "https://elevenlabs.invalid",
  modelId: "test-model",
  outputFormat: "mp3_44100_128",
  quotaCooldownMinutes: 360,
  transientCooldownMinutes: 2,
}));

vi.mock("../../src/config", () => ({
  config: { locutor: {
    kokoroUrl: "http://kokoro.invalid",
    tts: { elevenLabs: settings, requestTimeoutMs: 1000, maxTextLength: 4000 },
  } },
}));
vi.mock("../../src/shared/logger/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

function apiFailure(status: number, code: string) {
  return {
    isAxiosError: true,
    response: { status, data: Buffer.from(JSON.stringify({ detail: { code, message: "Test failure" } })) },
  };
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

it("tries the configured default voice on ElevenLabs before giving up", async () => {
  const { elevenLabsProvider } = await import("../../src/modules/locutor/tts/elevenLabs.provider");
  const request = vi.spyOn(axios, "post")
    .mockRejectedValueOnce(apiFailure(404, "voice_not_found"))
    .mockResolvedValueOnce({ data: Buffer.from("mp3") });

  await expect(elevenLabsProvider.synthesize({ text: "Son las dos y cuarto de la tarde.", speed: 0.9, templateVoice: "ef_dora" }))
    .resolves.toMatchObject({ voice: "elevenlabs:default" });
  expect(request.mock.calls.map(([url]) => url)).toEqual([
    "https://elevenlabs.invalid/v1/text-to-speech/mapped?output_format=mp3_44100_128",
    "https://elevenlabs.invalid/v1/text-to-speech/default?output_format=mp3_44100_128",
  ]);
});

it("moves to the next key on an exhausted quota without waiting on subscription lookup", async () => {
  const { elevenLabsProvider, getElevenLabsStatus } = await import("../../src/modules/locutor/tts/elevenLabs.provider");
  const get = vi.spyOn(axios, "get");
  const post = vi.spyOn(axios, "post")
    .mockRejectedValueOnce(apiFailure(402, "insufficient_credits"))
    .mockResolvedValueOnce({ data: Buffer.from("mp3") });

  await expect(elevenLabsProvider.synthesize({ text: "Son las tres y media.", speed: 1, templateVoice: "ef_dora" }))
    .resolves.toMatchObject({ voice: "elevenlabs:mapped" });
  expect(post.mock.calls.map(([, , options]) => options?.headers?.["xi-api-key"])).toEqual(["key-a", "key-b"]);
  expect(get).not.toHaveBeenCalled();
  expect(getElevenLabsStatus()).toMatchObject({ availableKeys: 1 });
});

const audioToolsAvailable = ["ffmpeg", "ffprobe"].every((program) =>
  spawnSync(program, ["-version"], { stdio: "ignore" }).status === 0
);

it.skipIf(!audioToolsAvailable)("uses Kokoro when no ElevenLabs key can synthesize the notice", async () => {
  const { synthesize } = await import("../../src/modules/locutor/tts.service");
  const directory = await mkdtemp(path.join(tmpdir(), "radio-tts-test-"));
  try {
    const fixture = path.join(directory, "fixture.mp3");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440",
      "-t", "0.3", "-c:a", "libmp3lame", fixture]);
    const audio = await readFile(fixture);
    const request = vi.spyOn(axios, "post")
      .mockRejectedValueOnce(apiFailure(401, "invalid_api_key"))
      .mockRejectedValueOnce(apiFailure(401, "invalid_api_key"))
      .mockResolvedValueOnce({ data: audio });
    const text = "Son las tres y diecisiete de la tarde.";
    const outputPath = path.join(directory, "notice.mp3");

    await expect(synthesize({ text, voice: "ef_dora", speed: 0.9, outputPath }))
      .resolves.toMatchObject({ provider: "kokoro", voice: "kokoro:ef_dora" });
    expect(request).toHaveBeenLastCalledWith(
      "http://kokoro.invalid/v1/audio/speech",
      expect.objectContaining({ input: text, response_format: "mp3" }),
      expect.anything()
    );
    expect(await readFile(outputPath)).toEqual(audio);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
