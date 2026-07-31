import { config } from '../config';

let firebaseApp: unknown = null;
let initialized = false;

interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

function tryInitialize(): boolean {
  if (initialized) return !!firebaseApp;
  initialized = true;

  const jsonStr = config.firebase.serviceAccountJson;
  if (!jsonStr) {
    console.warn('[FCM] FIREBASE_SERVICE_ACCOUNT_JSON not configured. Push notifications disabled.');
    return false;
  }

  try {
    const serviceAccount = JSON.parse(jsonStr);
    const admin = require('firebase-admin');
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('[FCM] Firebase Admin initialized successfully');
    return true;
  } catch (err) {
    console.error('[FCM] Failed to initialize Firebase Admin:', err);
    return false;
  }
}

export async function sendPushNotification(
  token: string,
  payload: NotificationPayload
): Promise<boolean> {
  if (!tryInitialize()) return false;

  try {
    const admin = require('firebase-admin');
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
