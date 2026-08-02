import { getFirebaseAdmin } from "../../infrastructure/firebase/firebase-admin";
import { logger } from "../../shared/logger/logger";

interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendPushNotification(
  token: string,
  payload: NotificationPayload
): Promise<boolean> {
  const admin = getFirebaseAdmin();
  if (!admin) return false;

  try {
    const message = {
      token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data ?? {},
      android: {
        priority: "high" as const,
      },
    };

    await admin.messaging().send(message);
    logger.info("PushNotification", "Notification sent successfully");
    return true;
  } catch (err) {
    const error = err as { code?: string; message?: string };
    if (error.code === "messaging/registration-token-not-registered") {
      logger.warn("PushNotification", "Token is no longer registered", { token });
    } else {
      logger.error("PushNotification", "Failed to send notification", {
        error: error.message ?? String(err),
      });
    }
    return false;
  }
}

export async function sendPrayerResponseNotification(
  fcmToken: string,
  prayerId: string,
  responderName: string
): Promise<boolean> {
  return sendPushNotification(fcmToken, {
    title: "La Voz de la Verdad",
    body: "Tu peticion de oracion ha sido respondida.",
    data: {
      type: "prayer_response",
      prayerId,
    },
  });
}
