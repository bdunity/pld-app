/**
 * Email Service
 * Servicio centralizado de notificaciones por correo
 * Compatible con SendGrid y Postmark
 */

import { logger } from 'firebase-functions';

// Configuración del proveedor de email
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'sendgrid'; // 'sendgrid' | 'postmark'
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const POSTMARK_API_KEY = process.env.POSTMARK_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@pldbdu.com';
const FROM_NAME = process.env.FROM_NAME || 'PLD BDU';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@pldbdu.com';

// Templates de email
const EMAIL_TEMPLATES = {
  // Tickets
  TICKET_CREATED_USER: {
    subject: 'Recibimos tu solicitud - Ticket #{ticketId}',
    sendgridTemplateId: 'd-ticket-created-user',
    postmarkTemplateId: 'ticket-created-user',
  },
  TICKET_CREATED_ADMIN: {
    subject: 'Nuevo Ticket #{ticketId} - {category}',
    sendgridTemplateId: 'd-ticket-created-admin',
    postmarkTemplateId: 'ticket-created-admin',
  },
  TICKET_UPDATED: {
    subject: 'Actualización en tu Ticket #{ticketId}',
    sendgridTemplateId: 'd-ticket-updated',
    postmarkTemplateId: 'ticket-updated',
  },
  TICKET_CLOSED: {
    subject: 'Tu Ticket #{ticketId} ha sido cerrado',
    sendgridTemplateId: 'd-ticket-closed',
    postmarkTemplateId: 'ticket-closed',
  },

  // Pagos
  PAYMENT_SUCCESS: {
    subject: 'Pago confirmado - {planName}',
    sendgridTemplateId: 'd-payment-success',
    postmarkTemplateId: 'payment-success',
  },
  PAYMENT_FAILED: {
    subject: 'Problema con tu pago - Acción requerida',
    sendgridTemplateId: 'd-payment-failed',
    postmarkTemplateId: 'payment-failed',
  },
  SUBSCRIPTION_EXPIRING: {
    subject: 'Tu suscripción vence pronto',
    sendgridTemplateId: 'd-subscription-expiring',
    postmarkTemplateId: 'subscription-expiring',
  },

  // Operaciones
  REPORT_REMINDER: {
    subject: 'Recordatorio: Fecha límite de Avisos se acerca',
    sendgridTemplateId: 'd-report-reminder',
    postmarkTemplateId: 'report-reminder',
  },
  REPORT_SUBMITTED: {
    subject: 'Aviso enviado exitosamente - {period}',
    sendgridTemplateId: 'd-report-submitted',
    postmarkTemplateId: 'report-submitted',
  },

  // Bienvenida
  WELCOME: {
    subject: 'Bienvenido a PLD BDU',
    sendgridTemplateId: 'd-welcome',
    postmarkTemplateId: 'welcome',
  },
};

/**
 * Enviar notificación por email
 * @param {string} to - Email del destinatario
 * @param {string} templateId - ID del template (key de EMAIL_TEMPLATES)
 * @param {object} data - Datos dinámicos para el template
 */
export async function sendNotification(to, templateId, data = {}) {
  const template = EMAIL_TEMPLATES[templateId];

  if (!template) {
    logger.error('Email template not found:', templateId);
    throw new Error(`Template ${templateId} not found`);
  }

  // Reemplazar variables en subject
  let subject = template.subject;
  Object.keys(data).forEach((key) => {
    subject = subject.replace(`{${key}}`, data[key]);
  });

  const emailPayload = {
    to,
    from: {
      email: FROM_EMAIL,
      name: FROM_NAME,
    },
    subject,
    templateId: EMAIL_PROVIDER === 'sendgrid' ? template.sendgridTemplateId : template.postmarkTemplateId,
    dynamicData: data,
  };

  try {
    if (EMAIL_PROVIDER === 'sendgrid') {
      await sendWithSendGrid(emailPayload);
    } else if (EMAIL_PROVIDER === 'postmark') {
      await sendWithPostmark(emailPayload);
    } else {
      // Fallback: Solo log (para desarrollo)
      logger.log('Email would be sent:', emailPayload);
    }

    logger.log('Email sent successfully:', { to, templateId });
    return { success: true };
  } catch (error) {
    logger.error('Error sending email:', error);
    throw error;
  }
}

/**
 * Enviar email con SendGrid
 */
async function sendWithSendGrid(payload) {
  if (!SENDGRID_API_KEY) {
    logger.warn('SendGrid API key not configured, skipping email');
    return;
  }

  const sgMail = await import('@sendgrid/mail');
  sgMail.default.setApiKey(SENDGRID_API_KEY);

  const msg = {
    to: payload.to,
    from: payload.from,
    subject: payload.subject,
    templateId: payload.templateId,
    dynamicTemplateData: payload.dynamicData,
  };

  // Si no hay template, enviar HTML directo
  if (!payload.templateId || payload.templateId.startsWith('d-')) {
    // Template ID de SendGrid
    await sgMail.default.send(msg);
  } else {
    // HTML fallback
    msg.html = generateFallbackHTML(payload);
    delete msg.templateId;
    delete msg.dynamicTemplateData;
    await sgMail.default.send(msg);
  }
}

/**
 * Enviar email con Postmark
 */
async function sendWithPostmark(payload) {
  if (!POSTMARK_API_KEY) {
    logger.warn('Postmark API key not configured, skipping email');
    return;
  }

  const postmark = await import('postmark');
  const client = new postmark.ServerClient(POSTMARK_API_KEY);

  await client.sendEmailWithTemplate({
    From: `${payload.from.name} <${payload.from.email}>`,
    To: payload.to,
    TemplateId: payload.templateId,
    TemplateModel: payload.dynamicData,
  });
}

/**
 * Generar HTML de fallback para emails sin template
 */
function generateFallbackHTML(payload) {
  const { subject, dynamicData } = payload;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
        .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
        .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none; }
        .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0; }
        h1 { margin: 0; font-size: 24px; }
        .logo { font-size: 28px; font-weight: bold; margin-bottom: 10px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">PLD BDU</div>
        <h1>${subject}</h1>
      </div>
      <div class="content">
        ${dynamicData.message || dynamicData.body || '<p>Gracias por usar PLD BDU.</p>'}
        ${dynamicData.actionUrl ? `<a href="${dynamicData.actionUrl}" class="button">${dynamicData.actionText || 'Ver más'}</a>` : ''}
      </div>
      <div class="footer">
        <p>Este correo fue enviado por PLD BDU</p>
        <p>Si no solicitaste este correo, puedes ignorarlo.</p>
      </div>
    </body>
    </html>
  `;
}

/**
 * Enviar email simple (sin template)
 */
export async function sendSimpleEmail(to, subject, htmlContent) {
  try {
    if (EMAIL_PROVIDER === 'sendgrid' && SENDGRID_API_KEY) {
      const sgMail = await import('@sendgrid/mail');
      sgMail.default.setApiKey(SENDGRID_API_KEY);

      await sgMail.default.send({
        to,
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject,
        html: htmlContent,
      });
    } else {
      logger.log('Simple email would be sent:', { to, subject });
    }

    return { success: true };
  } catch (error) {
    logger.error('Error sending simple email:', error);
    throw error;
  }
}

/**
 * Enviar notificación de nuevo ticket
 */
export async function sendTicketCreatedNotifications(ticket, userEmail) {
  // Enviar al usuario
  await sendNotification(userEmail, 'TICKET_CREATED_USER', {
    ticketId: ticket.id,
    subject: ticket.subject,
    category: ticket.category,
    message: `<p>Hemos recibido tu solicitud de soporte.</p>
              <p><strong>Asunto:</strong> ${ticket.subject}</p>
              <p><strong>Categoría:</strong> ${ticket.category}</p>
              <p>Te responderemos a la brevedad posible.</p>`,
  });

  // Enviar al admin
  await sendNotification(ADMIN_EMAIL, 'TICKET_CREATED_ADMIN', {
    ticketId: ticket.id,
    subject: ticket.subject,
    category: ticket.category,
    userEmail: userEmail,
    message: `<p>Se ha creado un nuevo ticket de soporte.</p>
              <p><strong>Usuario:</strong> ${userEmail}</p>
              <p><strong>Asunto:</strong> ${ticket.subject}</p>
              <p><strong>Categoría:</strong> ${ticket.category}</p>
              <p><strong>Mensaje:</strong></p>
              <p>${ticket.message}</p>`,
  });
}

/**
 * Enviar notificación de ticket actualizado
 */
export async function sendTicketUpdatedNotification(ticket, userEmail, update) {
  await sendNotification(userEmail, 'TICKET_UPDATED', {
    ticketId: ticket.id,
    subject: ticket.subject,
    update: update,
    message: `<p>Hay una actualización en tu ticket.</p>
              <p><strong>Respuesta:</strong></p>
              <p>${update}</p>`,
  });
}

/**
 * Enviar notificación de ticket cerrado
 */
export async function sendTicketClosedNotification(ticket, userEmail) {
  await sendNotification(userEmail, 'TICKET_CLOSED', {
    ticketId: ticket.id,
    subject: ticket.subject,
    message: `<p>Tu ticket ha sido marcado como resuelto.</p>
              <p>Si necesitas más ayuda, puedes abrir un nuevo ticket.</p>`,
  });
}

export default {
  sendNotification,
  sendSimpleEmail,
  sendTicketCreatedNotifications,
  sendTicketUpdatedNotification,
  sendTicketClosedNotification,
};
