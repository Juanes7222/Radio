import { intEnvOr, listEnvOr, normalizeHttpUrl, requiredEnv } from "./env";

export const appConfig = {
  port: intEnvOr("PORT", 3001),
  publicUrl: normalizeHttpUrl(requiredEnv("PUBLIC_URL")),
  panelSecret: requiredEnv("PANEL_SECRET"),
  whitelist: listEnvOr("ADMIN_WHITELIST").map((email) => email.toLowerCase()),
};
