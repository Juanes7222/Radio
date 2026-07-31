import { getFirebaseAdmin } from '../lib/firebase-admin';

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
        priority: 'high' as const,
      },
    };

    const response = await admin.messaging().send(message);
    console.log('[FCM] Notification sent successfully:', response);
    return true;
  } catch (err: any) {
    if (err.code === 'messaging/registration-token-not-registered') {
      console.warn('[FCM] Token is no longer registered:', token);
    } else {
      console.error('[FCM] Failed to send notification:', err);
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
    title: 'La Voz de la Verdad',
    body: `Tu peticion de oracion ha sido respondida.`,
    data: {
      type: 'prayer_response',
      prayerId,
    },
  });
}
