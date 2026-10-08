import axios from "axios";
import { config } from "../../../config";
import { logger } from "../../../shared/logger/logger";
import { ApiKeyLease, ApiKeyPool, type ApiKeySnapshot } from "./apiKeyPool.service";
import {
  TtsProviderConfigError,
  type TtsProvider,
  type TtsProviderOutput,
  type TtsSynthesisRequest,
} from "./tts.types";

const settings = config.locutor.tts.elevenLabs;
const pool = new ApiKeyPool(settings.apiKeys);

const LOG = "TtsElevenLabs";

/** Range ElevenLabs accepts for `voice_settings.speed`. */
const MIN_SPEED = 0.7;
const MAX_SPEED = 1.2;

interface SubscriptionInfo {
  charactersUsed: number | null;
  characterLimit: number | null;
  resetAt: Date | null;
  checkedAt: Date;
}

/**
 * One balance per key, not one for the pool. The accounts are independent, so
 * a single cached reading would attribute one account's balance to all of them
 * and the panel would show a number that is wrong for every key.
 */
const subscriptions = new Map<number, SubscriptionInfo>();

/**
 * Reads the balance of the account behind a key. This is the only reliable
 * source for when a key comes back after running out of quota, and it is also
 * the number that decides how many keys the station actually needs. It is only
 * called when a quota failure happens or an admin asks for it, because the
 * endpoint is metered too.
 */
async function readSubscription(lease: ApiKeyLease): Promise<SubscriptionInfo> {
  const now = new Date();
  const ttlMs = settings.subscriptionCacheMinutes * 60_000;
  const cached = subscriptions.get(lease.index);

  if (cached && now.getTime() - cached.checkedAt.getTime() < ttlMs) {
    return cached;
  }

  let info: SubscriptionInfo;

  try {
    const response = await axios.get<{
      character_count?: number;
      character_limit?: number;
      next_character_count_reset_unix?: number | null;
    }>(`${settings.baseUrl}/v1/user/subscription`, {
      headers: { "xi-api-key": lease.key },
      timeout: config.locutor.tts.requestTimeoutMs,
    });

    const resetUnix = response.data.next_character_count_reset_unix;

    info = {
      charactersUsed: response.data.character_count ?? null,
      characterLimit: response.data.character_limit ?? null,
      resetAt: typeof resetUnix === "number" && resetUnix > 0 ? new Date(resetUnix * 1000) : null,
      checkedAt: now,
    };
  } catch (err) {
    logger.warn(LOG, "Could not read the subscription balance", {
      keyIndex: lease.index,
      keyHint: lease.hint,
      error: err instanceof Error ? err.message : String(err),
    });
    info = {
      charactersUsed: null,
      characterLimit: null,
      resetAt: null,
      checkedAt: now,
    };
  }

  subscriptions.set(lease.index, info);
  return info;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * The request asks for `arraybuffer` because the success path is audio, so an
 * error body arrives as bytes rather than as a parsed object. Without decoding
 * it every failure looks like an anonymous 400 and the quota case is
 * indistinguishable from a transient one.
 */
function decodeErrorBody(data: unknown): unknown {
  if (typeof data === "string") return parseJson(data);
  if (Buffer.isBuffer(data)) return parseJson(data.toString("utf8"));
  if (data instanceof ArrayBuffer) return parseJson(Buffer.from(data).toString("utf8"));
  if (ArrayBuffer.isView(data)) {
    return parseJson(Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8"));
  }
  return data;
}

/**
 * ElevenLabs reports the cause as `detail.status` in the body. The status code
 * alone is not enough: quota exhaustion arrives as a 400 and an invalid key as
 * a 401, but a 429 can be either a concurrency limit (retry later) or the
 * account being throttled.
 */
function readFailureDetail(err: unknown): { httpStatus: number | null; status: string | null; message: string } {
  const fallbackMessage = err instanceof Error ? err.message : String(err);

  if (!axios.isAxiosError(err)) {
    return { httpStatus: null, status: null, message: fallbackMessage };
  }

  const httpStatus = err.response?.status ?? null;
  const body = decodeErrorBody(err.response?.data);
  const detail =
    typeof body === "object" && body !== null ? (body as { detail?: unknown }).detail : undefined;

  if (typeof detail === "object" && detail !== null) {
    const typed = detail as { status?: unknown; message?: unknown };
    return {
      httpStatus,
      status: typeof typed.status === "string" ? typed.status : null,
      message: typeof typed.message === "string" ? typed.message : fallbackMessage,
    };
  }

  return {
    httpStatus,
    status: null,
    message: typeof detail === "string" ? detail : fallbackMessage,
  };
}

/**
 * Kokoro voices are the labels the announcement templates carry, so the
 * template stays valid whichever provider answers. A template with no mapping
 * falls back to the configured default voice, and a station with neither is
 * not configured for ElevenLabs at all.
 */
function resolveVoiceId(templateVoice: string | null): string | null {
  const mapped =
    templateVoice === null ? undefined : settings.voiceIdByTemplateVoice[templateVoice];

  return mapped || settings.defaultVoiceId || null;
}

/**
 * Whether the provider is usable at all, ignoring which template voice it
 * would be. This is what the status endpoint reports, and requiring a default
 * voice there would make a station that maps only `ef_dora` look like it was
 * still on the fallback engine, which is the opposite of what it wants to see.
 */
function isConfigured(): boolean {
  if (pool.isEmpty) return false;
  return Boolean(settings.defaultVoiceId) || Object.keys(settings.voiceIdByTemplateVoice).length > 0;
}

function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
}

async function requestAudio(
  lease: ApiKeyLease,
  voiceId: string,
  text: string,
  speed: number
): Promise<Buffer> {
  const response = await axios.post(
    `${settings.baseUrl}/v1/text-to-speech/${encodeURIComponent(voiceId)}` +
      `?output_format=${encodeURIComponent(settings.outputFormat)}`,
    {
      text,
      model_id: settings.modelId,
      voice_settings: {
        stability: settings.stability,
        similarity_boost: settings.similarityBoost,
        speed,
      },
    },
    {
      headers: { "xi-api-key": lease.key, "Content-Type": "application/json" },
      responseType: "arraybuffer",
      timeout: config.locutor.tts.requestTimeoutMs,
    }
  );

  return Buffer.from(response.data);
}

/**
 * Parks the key according to what the failure actually means. Returns the
 * error to throw so the caller can decide whether another key is worth trying.
 */
async function handleFailure(lease: ApiKeyLease, voiceId: string, err: unknown): Promise<Error> {
  const { httpStatus, status, message } = readFailureDetail(err);

  if (status === "voice_not_found") {
    throw new TtsProviderConfigError(
      `ElevenLabs no reconoce la voz ${voiceId}: ${message}. Revisa ELEVENLABS_VOICE_IDS.`
    );
  }

  if (status === "max_character_limit_exceeded") {
    throw new TtsProviderConfigError(
      `El texto supera el límite de caracteres de ${settings.modelId}: ${message}`
    );
  }

  if (status === "invalid_api_key" || httpStatus === 401 || httpStatus === 403) {
    lease.block("invalid", message, null);
    logger.error(LOG, "API key rejected, disabling it until the process restarts", {
      keyIndex: lease.index,
      keyHint: lease.hint,
      httpStatus,
      detail: status,
    });
    return err instanceof Error ? err : new Error(message);
  }

  if (status === "quota_exceeded" || status === "insufficient_quota") {
    const subscription = await readSubscription(lease);
    const until =
      subscription.resetAt ??
      new Date(Date.now() + settings.quotaCooldownMinutes * 60_000);

    lease.block("quota", message, until);
    logger.warn(LOG, "Quota exhausted on this key, moving to the next one", {
      keyIndex: lease.index,
      keyHint: lease.hint,
      charactersUsed: subscription.charactersUsed,
      characterLimit: subscription.characterLimit,
      retryAt: until.toISOString(),
    });
    return err instanceof Error ? err : new Error(message);
  }

  const until = new Date(Date.now() + settings.transientCooldownMinutes * 60_000);
  lease.block("transient", message, until);
  logger.warn(LOG, "Request failed without touching the quota, parking the key briefly", {
    keyIndex: lease.index,
    keyHint: lease.hint,
    httpStatus,
    detail: status,
    retryAt: until.toISOString(),
  });
  return err instanceof Error ? err : new Error(message);
}

export const elevenLabsProvider: TtsProvider = {
  id: "elevenlabs",

  isAvailable(templateVoice: string | null): boolean {
    if (!isConfigured()) return false;
    if (templateVoice !== null && !resolveVoiceId(templateVoice)) return false;
    return pool.availableCount() > 0;
  },

  async synthesize({ text, templateVoice, speed }: TtsSynthesisRequest): Promise<TtsProviderOutput> {
    const voiceId = resolveVoiceId(templateVoice);

    if (!voiceId) {
      throw new TtsProviderConfigError(
        "No hay una voz de ElevenLabs para esta plantilla. Define ELEVENLABS_VOICE_IDS o ELEVENLABS_DEFAULT_VOICE_ID."
      );
    }

    let lastError: Error = new Error("ElevenLabs no tiene ninguna API key disponible");

    for (let attempt = 0; attempt < pool.size; attempt += 1) {
      const lease = pool.reserve();
      if (!lease) break;

      try {
        const audio = await requestAudio(lease, voiceId, text, clampSpeed(speed));
        lease.succeed();
        return { audio, voice: `elevenlabs:${voiceId}` };
      } catch (err) {
        lastError = await handleFailure(lease, voiceId, err);
      } finally {
        lease.release();
      }
    }

    throw lastError;
  },
};

export interface ElevenLabsBalance {
  charactersUsed: number | null;
  characterLimit: number | null;
  remaining: number | null;
  resetAt: string | null;
  checkedAt: string | null;
}

export interface ElevenLabsKeyStatus extends ApiKeySnapshot {
  balance: ElevenLabsBalance;
}

export interface ElevenLabsStatus {
  configured: boolean;
  modelId: string;
  keys: ElevenLabsKeyStatus[];
  availableKeys: number;
  /** Pool totals. `resetAt` is the earliest reset, i.e. the first key to return. */
  balance: ElevenLabsBalance;
}

function toBalance(info: SubscriptionInfo | undefined): ElevenLabsBalance {
  const used = info?.charactersUsed ?? null;
  const limit = info?.characterLimit ?? null;

  return {
    charactersUsed: used,
    characterLimit: limit,
    remaining: used !== null && limit !== null ? Math.max(0, limit - used) : null,
    resetAt: info?.resetAt?.toISOString() ?? null,
    checkedAt: info?.checkedAt.toISOString() ?? null,
  };
}

/** Sums the known per-key balances. A key never read yet contributes nothing. */
function totalBalance(keys: ElevenLabsKeyStatus[]): ElevenLabsBalance {
  const known = keys.filter((key) => key.balance.characterLimit !== null);
  const used = known.reduce((sum, key) => sum + (key.balance.charactersUsed ?? 0), 0);
  const limit = known.reduce((sum, key) => sum + (key.balance.characterLimit ?? 0), 0);

  // Nulls are filtered before sorting: `Array.sort` stringifies them and "null"
  // sorts after any ISO date, which would silently hide the last reading.
  const resets = keys
    .map((key) => key.balance.resetAt)
    .filter((value): value is string => value !== null)
    .sort();
  const reads = keys
    .map((key) => key.balance.checkedAt)
    .filter((value): value is string => value !== null)
    .sort();

  return {
    charactersUsed: known.length > 0 ? used : null,
    characterLimit: known.length > 0 ? limit : null,
    remaining: known.length > 0 ? Math.max(0, limit - used) : null,
    resetAt: resets[0] ?? null,
    checkedAt: reads[reads.length - 1] ?? null,
  };
}

export function getElevenLabsStatus(): ElevenLabsStatus {
  const keys = pool.snapshot().map((key) => ({
    ...key,
    balance: toBalance(subscriptions.get(key.index)),
  }));

  return {
    configured: isConfigured(),
    modelId: settings.modelId,
    keys,
    availableKeys: pool.availableCount(),
    balance: totalBalance(keys),
  };
}

/**
 * Forces a subscription read on every free key so the panel can show the
 * balance on demand instead of waiting for a quota failure to discover it.
 * Returns the pool totals, which is the number that decides how many keys the
 * station needs.
 */
export async function refreshElevenLabsBalance(): Promise<ElevenLabsBalance> {
  for (let index = 0; index < pool.size; index += 1) {
    const lease = pool.reserve();
    if (!lease) break;

    try {
      await readSubscription(lease);
    } finally {
      lease.release();
    }
  }

  return getElevenLabsStatus().balance;
}
