import { envOr, intEnvOr, listEnvOr } from "./env";

export const notificationsConfig = {
  email: {
    provider: envOr("EMAIL_PROVIDER", "smtp"),
    host: envOr("SMTP_HOST", "smtp.gmail.com"),
    port: intEnvOr("SMTP_PORT", 587),
    user: envOr("SMTP_USER", ""),
    pass: envOr("SMTP_PASSWORD", ""),
    apiKey: envOr("BREVO_API_KEY", ""),
    from: envOr("EMAIL_FROM", process.env.SMTP_USER ?? "no-reply@gestordecitas.gov.co"),
    fromName: envOr("EMAIL_FROM_NAME", "Gestor de Citas"),
    recipients: listEnvOr("EMAIL_RECIPIENTS"),
  },
  prayer: {
    recipients: listEnvOr("PRAYER_EMAIL_RECIPIENTS"),
  },
  firebase: {
    serviceAccountJson: envOr("FIREBASE_SERVICE_ACCOUNT_JSON", ""),
  },
};
