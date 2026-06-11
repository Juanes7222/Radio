import * as nodemailer from 'nodemailer';

interface EventDetails {
    title: string;
    eventDate: Date | string;
    location?: string;
    description?: string;
}

interface ContactDetails {
    name: string;
    email: string;
}

interface UserDetails {
    email: string;
    displayName?: string;
}

/**
 * Formats a given date to a localized Spanish string using the specified timezone.
 */
function formatDateEs(date: Date | string, timeZone: string = 'America/Bogota'): string {
    const targetDate = new Date(date);
    return new Intl.DateTimeFormat('es-CO', {
        timeZone,
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }).format(targetDate);
}

/**
 * Formats a given time to a 12-hour string format using the specified timezone.
 */
function formatTime12h(date: Date | string, timeZone: string = 'America/Bogota'): string {
    const targetDate = new Date(date);
    return new Intl.DateTimeFormat('es-CO', {
        timeZone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    }).format(targetDate);
}

/**
 * Sends an HTML email via SMTP using nodemailer.
 */
async function sendSmtpEmail(toEmail: string, subject: string, htmlBody: string, fromEmail: string): Promise<boolean> {
    const host = process.env.SMTP_HOST ?? 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT ?? '587', 10);
    const user = process.env.SMTP_USER ?? '';
    const pass = process.env.SMTP_PASSWORD ?? '';

    if (!user || !pass) {
        console.warn('SMTP credentials not configured.');
        return false;
    }

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass }
    });

    try {
        await transporter.sendMail({
            from: fromEmail || user,
            to: toEmail,
            subject,
            html: htmlBody
        });
        console.info(`Email sent successfully via SMTP to ${toEmail}`);
        return true;
    } catch (error) {
        console.error(`Failed to send email via SMTP: ${error}`);
        return false;
    }
}

/**
 * Sends an HTML email via Brevo REST API using native fetch.
 */
async function sendBrevoEmail(toEmail: string, subject: string, htmlBody: string, fromEmail: string, fromName: string): Promise<boolean> {
    const apiKey = process.env.BREVO_API_KEY ?? '';

    if (!apiKey) {
        console.warn('Brevo API key not configured.');
        return false;
    }

    const payload = {
        sender: { name: fromName, email: fromEmail },
        to: [{ email: toEmail }],
        subject,
        htmlContent: htmlBody
    };

    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Api-Key': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.info(`Email sent successfully via Brevo to ${toEmail}`);
            return true;
        }

        const errorText = await response.text();
        console.error(`Failed to send email via Brevo. Status: ${response.status}, Error: ${errorText}`);
        return false;
    } catch (error) {
        console.error(`Failed to send email via Brevo: ${error}`);
        return false;
    }
}

/**
 * Routes the email sending task to the configured provider.
 */
export async function sendEmail(toEmail: string, subject: string, htmlBody: string): Promise<boolean> {
    const provider = (process.env.EMAIL_PROVIDER ?? 'smtp').toLowerCase();
    const fromEmail = process.env.EMAIL_FROM ?? process.env.SMTP_USER ?? 'no-reply@gestordecitas.gov.co';
    const fromName = process.env.EMAIL_FROM_NAME ?? 'Gestor de Citas';

    if (provider === 'brevo') {
        return sendBrevoEmail(toEmail, subject, htmlBody, fromEmail, fromName);
    }
    
    return sendSmtpEmail(toEmail, subject, htmlBody, fromEmail);
}

/**
 * Builds the base HTML layout for notification emails.
 */
function buildEmailLayout(content: string, headerText: string, themeColor: string = '#2563eb'): string {
    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', system-ui, sans-serif; line-height: 1.6; color: #1f2937; background-color: #f3f4f6; }
            .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
            .header { background-color: ${themeColor}; padding: 30px; text-align: center; }
            .header h1 { color: #ffffff; font-size: 24px; font-weight: 600; margin: 0; letter-spacing: -0.5px; }
            .content { padding: 40px 30px; }
            .event-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 25px; margin: 25px 0; }
            .event-title { color: #0f172a; font-size: 20px; font-weight: 600; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #e2e8f0; }
            .detail-row { display: flex; align-items: flex-start; margin-bottom: 15px; }
            .detail-icon { width: 24px; height: 24px; color: ${themeColor}; margin-right: 15px; flex-shrink: 0; }
            .detail-content { flex: 1; }
            .detail-label { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; margin-bottom: 2px; }
            .detail-value { color: #1e293b; font-size: 15px; font-weight: 500; }
            .description-box { margin-top: 20px; padding: 15px; background: #ffffff; border-radius: 6px; border-left: 4px solid ${themeColor}; }
            .footer { background: #f8fafc; padding: 25px 30px; text-align: center; border-top: 1px solid #e2e8f0; }
            .footer p { color: #64748b; font-size: 12px; margin: 0; }
            .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 15px; }
        </style>
    </head>
    <body>
        <table width="100%" cellpadding="0" cellspacing="0" style="background: #f3f4f6; padding: 20px;">
            <tr>
                <td align="center">
                    <div class="container">
                        <div class="header">
                            <h1>${headerText}</h1>
                        </div>
                        <div class="content">
                            ${content}
                        </div>
                        <div class="footer">
                            <p>Este es un mensaje automático generado por el Sistema de Gestión de Citas.</p>
                            <p style="margin-top: 8px;">Por favor, no responda a este correo.</p>
                        </div>
                    </div>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;
}

/**
 * Renders an SVG icon based on the requested type.
 */
function getIconSvg(type: 'date' | 'time' | 'location' | 'info'): string {
    const icons = {
        date: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
        time: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
        location: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
    };
    return icons[type];
}

/**
 * Generates an appointment reminder email payload.
 */
export function generateReminderEmail(event: EventDetails, contact: ContactDetails, userTimeZone: string = 'America/Bogota'): { subject: string; body: string } {
    const formattedDate = formatDateEs(event.eventDate, userTimeZone);
    const formattedTime = formatTime12h(event.eventDate, userTimeZone);

    const subject = `Recordatorio de Cita Asignada: ${event.title}`;
    
    let eventDetailsHtml = `
        <div class="detail-row">
            <div class="detail-icon">${getIconSvg('date')}</div>
            <div class="detail-content">
                <div class="detail-label">Fecha de citación</div>
                <div class="detail-value">${formattedDate}</div>
            </div>
        </div>
        <div class="detail-row">
            <div class="detail-icon">${getIconSvg('time')}</div>
            <div class="detail-content">
                <div class="detail-label">Hora asignada</div>
                <div class="detail-value">${formattedTime}</div>
            </div>
        </div>
    `;

    if (event.location) {
        eventDetailsHtml += `
            <div class="detail-row">
                <div class="detail-icon">${getIconSvg('location')}</div>
                <div class="detail-content">
                    <div class="detail-label">Punto de atención</div>
                    <div class="detail-value">${event.location}</div>
                </div>
            </div>
        `;
    }

    if (event.description) {
        eventDetailsHtml += `
            <div class="description-box">
                <div class="detail-label">Información adicional sobre su trámite</div>
                <div style="color: #334155; font-size: 14px; margin-top: 8px;">${event.description}</div>
            </div>
        `;
    }

    const contentHtml = `
        <p style="color: #334155; font-size: 16px; margin-bottom: 20px;">Estimado/a <strong>${contact.name}</strong>,</p>
        <p style="color: #475569; font-size: 15px; margin-bottom: 25px;">El presente correo tiene como finalidad notificarle sobre los detalles de su petición programada en nuestro sistema.</p>
        <div class="event-card">
            <div class="event-title">${event.title}</div>
            ${eventDetailsHtml}
        </div>
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 15px; text-align: center;">
            <p style="color: #1e40af; font-size: 14px; margin: 0; font-weight: 500;">Es indispensable presentar su documento de identidad original al momento de asistir.</p>
        </div>
    `;

    return {
        subject,
        body: buildEmailLayout(contentHtml, 'Notificación de Trámite', '#1e40af')
    };
}

/**
 * Generates a test reminder email payload with distinct visual indicators.
 */
export function generateTestReminderEmail(event: EventDetails, contact: ContactDetails, userTimeZone: string = 'America/Bogota'): { subject: string; body: string } {
    const formattedDate = formatDateEs(event.eventDate, userTimeZone);
    const formattedTime = formatTime12h(event.eventDate, userTimeZone);

    const subject = `[PRUEBA DEL SISTEMA] Cita: ${event.title}`;
    
    let eventDetailsHtml = `
        <div class="detail-row">
            <div class="detail-icon">${getIconSvg('date')}</div>
            <div class="detail-content">
                <div class="detail-label">Fecha</div>
                <div class="detail-value">${formattedDate}</div>
            </div>
        </div>
        <div class="detail-row">
            <div class="detail-icon">${getIconSvg('time')}</div>
            <div class="detail-content">
                <div class="detail-label">Hora</div>
                <div class="detail-value">${formattedTime}</div>
            </div>
        </div>
    `;

    if (event.location) {
        eventDetailsHtml += `
            <div class="detail-row">
                <div class="detail-icon">${getIconSvg('location')}</div>
                <div class="detail-content">
                    <div class="detail-label">Ubicación de prueba</div>
                    <div class="detail-value">${event.location}</div>
                </div>
            </div>
        `;
    }

    if (event.description) {
        eventDetailsHtml += `
            <div class="description-box" style="border-left-color: #d97706;">
                <div class="detail-label">Descripción de prueba</div>
                <div style="color: #334155; font-size: 14px; margin-top: 8px;">${event.description}</div>
            </div>
        `;
    }

    const contentHtml = `
        <div style="text-align: center;">
            <span class="badge" style="background-color: #fef3c7; color: #b45309; border: 1px solid #fde68a;">Entorno de Pruebas</span>
        </div>
        <p style="color: #334155; font-size: 16px; margin-bottom: 20px;">Hola <strong>${contact.name}</strong>,</p>
        <p style="color: #475569; font-size: 15px; margin-bottom: 25px;">Este es un mensaje generado manualmente para verificar el correcto funcionamiento del sistema de notificaciones.</p>
        <div class="event-card" style="border-color: #fcd34d; background: #fffbeb;">
            <div class="event-title" style="color: #92400e; border-bottom-color: #fde68a;">${event.title}</div>
            ${eventDetailsHtml}
        </div>
    `;

    return {
        subject,
        body: buildEmailLayout(contentHtml, 'Diagnóstico de Sistema', '#d97706')
    };
}

/**
 * Generates an SMTP configuration test email payload.
 */
export function generateTestSmtpEmail(user: UserDetails): { subject: string; body: string } {
    const subject = "Verificación de Enlace SMTP - Sistema de Citas";
    const currentUtcTime = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    
    const contentHtml = `
        <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 20px; margin-bottom: 30px;">
            <div style="display: flex; align-items: center; margin-bottom: 10px; color: #166534;">
                <div style="width: 20px; height: 20px; margin-right: 10px;">${getIconSvg('info')}</div>
                <h2 style="font-size: 18px; margin: 0;">Enlace Establecido</h2>
            </div>
            <p style="color: #15803d; font-size: 14px; margin: 0;">El motor de correos está transmitiendo correctamente hacia los servidores de salida. Los flujos automáticos pueden operar sin interrupciones.</p>
        </div>
        <h3 style="color: #475569; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Parámetros del Diagnóstico</h3>
        <table width="100%" style="border-collapse: collapse; margin-bottom: 20px;">
            <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 14px; width: 140px;">Operador</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: 500;">${user.displayName ?? 'Administrador del Sistema'}</td>
            </tr>
            <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 14px;">Destino de prueba</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: 500;">${user.email}</td>
            </tr>
            <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 14px;">Marca temporal</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: 500;">${currentUtcTime}</td>
            </tr>
        </table>
    `;

    return {
        subject,
        body: buildEmailLayout(contentHtml, 'Estado de Conexión', '#0f766e')
    };
}