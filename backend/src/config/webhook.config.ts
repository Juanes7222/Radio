import { envOr, requiredEnv } from "./env";

export const webhookConfig = {
  secret: requiredEnv("WEBHOOK_SECRET"),
  panelSecret: envOr("PANEL_SECRET", ""),
  facebookVerifyToken: envOr("FB_VERIFY_TOKEN", ""),
};
