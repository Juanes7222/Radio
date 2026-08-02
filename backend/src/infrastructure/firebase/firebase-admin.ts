import { config } from "../../config";
import { logger } from "../../shared/logger/logger";

let firebaseApp: ReturnType<typeof importFirebaseAdmin> | null = null;
let initialized = false;

function importFirebaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const admin = require("firebase-admin");
  return admin;
}

function tryInitialize(): boolean {
  if (initialized) return !!firebaseApp;
  initialized = true;

  const jsonStr = config.notifications.firebase.serviceAccountJson;
  if (!jsonStr) {
    logger.warn("FirebaseAdmin", "FIREBASE_SERVICE_ACCOUNT_JSON not configured. Firebase Auth & FCM disabled.");
    return false;
  }

  try {
    const serviceAccount = JSON.parse(jsonStr);
    const admin = importFirebaseAdmin();

    if (admin.apps.length === 0) {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else {
      firebaseApp = admin.apps[0]!;
    }

    logger.info("FirebaseAdmin", "Initialized successfully");
    return true;
  } catch (err) {
    logger.error("FirebaseAdmin", "Failed to initialize", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export function getFirebaseAdmin() {
  if (!tryInitialize()) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("firebase-admin");
}
