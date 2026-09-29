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
      // The FCM token itself is not logged: it is a delivery credential.
      logger.warn("PushNotification", "Token is no longer registered");
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
  prayerId: string
): Promise<boolean> {
  // The body stays generic on purpose: push payloads can surface on the lock
  // screen or in diagnostics, so the sensitive response text is only shown
  // inside the app, behind the prayer credential.
  return sendPushNotification(fcmToken, {
    title: "Tu peticion de oracion ha sido respondida",
    body: "Abre la app para leer la respuesta completa.",
    data: {
      type: "prayer_response",
      prayerId,
    },
  });
}
