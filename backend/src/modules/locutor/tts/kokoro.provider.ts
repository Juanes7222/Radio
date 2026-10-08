import axios from "axios";
import { config } from "../../../config";
import { logger } from "../../../shared/logger/logger";
import type { TtsProvider, TtsProviderOutput, TtsSynthesisRequest } from "./tts.types";

const LOG = "TtsKokoro";

async function isKokoroReachable(): Promise<boolean> {
  try {
    const response = await axios.get(`${config.locutor.kokoroUrl}/health`, { timeout: 2000 });
    return response.status === 200;
  } catch {
    return false;
  }
}

export const kokoroProvider: TtsProvider = {
  id: "kokoro",

  isAvailable(): boolean {
    return true;
  },

  async synthesize({ text, templateVoice, speed }: TtsSynthesisRequest): Promise<TtsProviderOutput> {
    try {
      const response = await axios.post(
        `${config.locutor.kokoroUrl}/v1/audio/speech`,
        { model: "kokoro", input: text, voice: templateVoice, speed, response_format: "mp3" },
        {
          responseType: "arraybuffer",
          timeout: config.locutor.tts.requestTimeoutMs,
        }
      );

      return { audio: Buffer.from(response.data), voice: `kokoro:${templateVoice}` };
    } catch (err) {
      logger.error(LOG, "Synthesis failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
};

export { isKokoroReachable };
