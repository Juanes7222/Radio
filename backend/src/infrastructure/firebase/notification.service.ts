import { getFirebaseAdmin } from "./firebase-admin";
import { logger } from "../../shared/logger/logger";

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushResult {
  sent: number;
  failed: number;
  invalidTokens: string[];
}

/**
 * Sends an FCM v1 notification to a batch of device tokens (max 500).
 * Tokens reported as invalid are returned so callers can clean them up.
 */
export async function sendPushToTokens(
  tokens: string[],
  message: PushMessage
): Promise<PushResult> {
  const emptyResult: PushResult = { sent: 0, failed: 0, invalidTokens: [] };
  if (tokens.length === 0) return emptyResult;

  const admin = getFirebaseAdmin();
  if (!admin) return emptyResult;

  try {
    const result = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title: message.title, body: message.body },
      data: message.data ?? {},
    });

    const invalidTokens = tokens.filter(
      (token, index) =>
        result.responses[index] &&
        (result.responses[index].error?.code === "messaging/registration-token-not-registered" ||
          result.responses[index].error?.code === "messaging/invalid-registration-token")
    );

    if (result.failureCount > 0) {
      logger.warn("FirebasePush", "Some push notifications failed", {
        sent: result.successCount,
        failed: result.failureCount,
        invalidTokens: invalidTokens.length,
      });
    }

    return {
      sent: result.successCount,
      failed: result.failureCount,
      invalidTokens,
    };
  } catch (err) {
    logger.error("FirebasePush", "Push notification batch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { sent: 0, failed: tokens.length, invalidTokens: [] };
  }
}
