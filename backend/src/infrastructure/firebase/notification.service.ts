import { getFirebaseAdmin } from "./firebase-admin";
import { logger } from "../../shared/logger/logger";

/**
 * Android channel the app creates on startup. Every visible push must name it,
 * otherwise FCM drops the message in its own fallback channel that the user
 * cannot configure (name, importance, sound).
 */
export const ANDROID_NOTIFICATION_CHANNEL_ID = "radio-announcements";

/** FCM accepts at most 500 tokens per multicast request. */
const MAX_TOKENS_PER_REQUEST = 500;
/**
 * Retryable failures are retried inside the call with exponential backoff and
 * jitter. The windows are capped so a cron run never holds for minutes: the
 * caller's next tick is the outer retry.
 */
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1_000;
const MAX_RETRY_WAIT_MS = 10_000;

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Android delivery overrides. Defaults to high priority on the app channel. */
  android?: { priority?: "normal" | "high"; channelId?: string };
  /** APNs header overrides. Defaults to priority 10 (deliver immediately). */
  apnsHeaders?: Record<string, string>;
}

export interface PushResult {
  sent: number;
  failed: number;
  invalidTokens: string[];
}

/** Narrow view of the errors the Admin SDK throws, without depending on its types. */
interface MessagingErrorLike {
  code?: string;
  httpResponse?: { status?: number; headers?: Record<string, string> };
}

interface MessagingResponse {
  successCount: number;
  failureCount: number;
  responses: Array<{ error?: { code?: string } }>;
}

interface MessagingClient {
  messaging: () => {
    sendEachForMulticast: (message: Record<string, unknown>) => Promise<MessagingResponse>;
  };
}

const RETRYABLE_ERROR_CODES = new Set([
  "messaging/quota-exceeded",
  "messaging/server-unavailable",
  "messaging/internal-error",
  "messaging/unknown-error",
  "messaging/message-rate-exceeded",
]);

function chunkTokens(tokens: string[]): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < tokens.length; index += MAX_TOKENS_PER_REQUEST) {
    chunks.push(tokens.slice(index, index + MAX_TOKENS_PER_REQUEST));
  }
  return chunks;
}

function toErrorLike(error: unknown): MessagingErrorLike {
  return typeof error === "object" && error !== null ? (error as MessagingErrorLike) : {};
}

/**
 * FCM asks senders to honor the `retry-after` header on 429 answers. It is
 * reported in seconds, so it is converted and clamped before sleeping.
 */
function readRetryAfterMs(error: MessagingErrorLike): number | null {
  const raw = error.httpResponse?.headers?.["retry-after"];
  if (!raw) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : null;
}

function isRetryable(error: unknown): boolean {
  const like = toErrorLike(error);
  if (like.code && RETRYABLE_ERROR_CODES.has(like.code)) return true;
  const status = like.httpResponse?.status;
  return status === 429 || (status !== undefined && status >= 500);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Jitter avoids retries from every worker landing on the same instant. */
function jitter(ms: number): number {
  return Math.round(ms * (0.9 + Math.random() * 0.2));
}

function buildMessage(tokens: string[], message: PushMessage): Record<string, unknown> {
  return {
    tokens,
    notification: { title: message.title, body: message.body },
    data: message.data ?? {},
    android: {
      priority: message.android?.priority ?? "high",
      notification: {
        channelId: message.android?.channelId ?? ANDROID_NOTIFICATION_CHANNEL_ID,
      },
    },
    apns: {
      headers: { "apns-priority": "10", ...message.apnsHeaders },
    },
  };
}

function collectInvalidTokens(tokens: string[], responses: MessagingResponse["responses"]): string[] {
  return tokens.filter((_, index) => {
    const code = responses[index]?.error?.code;
    return (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token"
    );
  });
}

async function sendChunk(
  client: MessagingClient,
  tokens: string[],
  message: PushMessage
): Promise<PushResult> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await client.messaging().sendEachForMulticast(buildMessage(tokens, message));

      if (result.failureCount > 0) {
        logger.warn("FirebasePush", "Some push notifications failed", {
          sent: result.successCount,
          failed: result.failureCount,
        });
      }

      return {
        sent: result.successCount,
        failed: result.failureCount,
        invalidTokens: collectInvalidTokens(tokens, result.responses),
      };
    } catch (error) {
      const retryAfterMs = readRetryAfterMs(toErrorLike(error));
      const lastAttempt = attempt === MAX_ATTEMPTS;

      if (!isRetryable(error) || lastAttempt) {
        logger.error("FirebasePush", "Push batch failed", {
          tokens: tokens.length,
          attempt,
          code: toErrorLike(error).code ?? null,
          error: error instanceof Error ? error.message : String(error),
        });
        return { sent: 0, failed: tokens.length, invalidTokens: [] };
      }

      if (retryAfterMs !== null && retryAfterMs > MAX_RETRY_WAIT_MS) {
        logger.error("FirebasePush", "FCM asked to wait longer than this run allows", {
          tokens: tokens.length,
          retryAfterMs,
        });
        return { sent: 0, failed: tokens.length, invalidTokens: [] };
      }

      const waitMs = jitter(retryAfterMs ?? BASE_BACKOFF_MS * 2 ** (attempt - 1));
      logger.warn("FirebasePush", "Retrying push batch", {
        tokens: tokens.length,
        attempt,
        waitMs,
      });
      await sleep(Math.min(waitMs, MAX_RETRY_WAIT_MS));
    }
  }

  return { sent: 0, failed: tokens.length, invalidTokens: [] };
}

/**
 * Sends an FCM notification to any number of device tokens, splitting the work
 * into batches of 500 and totaling the per-batch results. Tokens reported as
 * invalid are returned so callers can clean them up.
 */
export async function sendPushToTokens(
  tokens: string[],
  message: PushMessage
): Promise<PushResult> {
  const uniqueTokens = [...new Set(tokens.filter((token) => token.length > 0))];
  if (uniqueTokens.length === 0) return { sent: 0, failed: 0, invalidTokens: [] };

  const admin = getFirebaseAdmin();
  if (!admin) {
    logger.error("FirebasePush", "Firebase not configured, notification not delivered", {
      tokens: uniqueTokens.length,
    });
    return { sent: 0, failed: 0, invalidTokens: [] };
  }

  const client = admin as MessagingClient;
  const result: PushResult = { sent: 0, failed: 0, invalidTokens: [] };

  for (const chunk of chunkTokens(uniqueTokens)) {
    const batch = await sendChunk(client, chunk, message);
    result.sent += batch.sent;
    result.failed += batch.failed;
    result.invalidTokens.push(...batch.invalidTokens);
  }

  return result;
}
