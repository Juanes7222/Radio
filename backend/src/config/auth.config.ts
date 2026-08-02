import { listEnvOr, requiredEnv } from "./env";

export const authConfig = {
  jwt: {
    secret: requiredEnv("JWT_SECRET"),
    expiresIn: "24h" as const,
  },
  whitelist: listEnvOr("ADMIN_WHITELIST"),
};
