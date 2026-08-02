import * as nodemailer from "nodemailer";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";

/**
 * Sends an HTML email via SMTP using nodemailer.
 */
async function sendSmtpEmail(toEmail: string, subject: string, htmlBody: string, fromEmail: string): Promise<boolean> {
  const { host, port, user, pass } = config.notifications.email;

  if (!user || !pass) {
    logger.warn("Email", "SMTP credentials not configured");
    return false;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from: fromEmail || user,
      to: toEmail,
      subject,
      html: htmlBody,
    });
    logger.info("Email", `Email sent successfully via SMTP to ${toEmail}`);
    return true;
  } catch (error) {
    logger.error("Email", "Failed to send email via SMTP", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Sends an HTML email via Brevo REST API using native fetch.
 */
async function sendBrevoEmail(toEmail: string, subject: string, htmlBody: string, fromEmail: string, fromName: string): Promise<boolean> {
  const { apiKey } = config.notifications.email;

  if (!apiKey) {
    logger.warn("Email", "Brevo API key not configured");
    return false;
  }

  const payload = {
    sender: { name: fromName, email: fromEmail },
    to: [{ email: toEmail }],
    subject,
    htmlContent: htmlBody,
  };

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      logger.info("Email", `Email sent successfully via Brevo to ${toEmail}`);
      return true;
    }

    const errorText = await response.text();
    logger.error("Email", "Failed to send email via Brevo", {
      status: response.status,
      error: errorText,
    });
    return false;
  } catch (error) {
    logger.error("Email", "Failed to send email via Brevo", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Routes the email sending task to the configured provider.
 */
export async function sendEmail(toEmail: string, subject: string, htmlBody: string): Promise<boolean> {
  const { provider, from, fromName } = config.notifications.email;

  if (provider === "brevo") {
    return sendBrevoEmail(toEmail, subject, htmlBody, from, fromName);
  }

  return sendSmtpEmail(toEmail, subject, htmlBody, from);
}
