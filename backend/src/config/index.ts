import "dotenv/config";
import { appConfig } from "./app.config";
import { authConfig } from "./auth.config";
import { azuracastConfig } from "./azuracast.config";
import { locutorConfig } from "./locutor.config";
import { notificationsConfig } from "./notifications.config";
import { processingConfig } from "./processing.config";
import { webhookConfig } from "./webhook.config";
import { workersConfig } from "./workers.config";
import { youtubeConfig } from "./youtube.config";

export const config = {
  ...appConfig,
  ...authConfig,
  azuracast: azuracastConfig,
  locutor: locutorConfig,
  youtube: youtubeConfig,
  worker: workersConfig,
  processing: processingConfig,
  notifications: notificationsConfig,
  webhook: webhookConfig,
};
