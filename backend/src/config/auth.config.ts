import { envOr, listEnvOr, requiredEnv } from "./env";

export const authConfig = {
  jwt: {
    secret: requiredEnv("JWT_SECRET"),
    expiresIn: "12h" as const,
  },
  whitelist: listEnvOr("ADMIN_WHITELIST"),
  superadminEmail: envOr("SUPERADMIN_EMAIL", "").trim().toLowerCase(),
};
