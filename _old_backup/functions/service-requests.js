/**
 * PLD BDU - Cloud Function: Service Requests
 * 
 * Maneja las solicitudes de servicios premium (Manual PLD, Capacitación).
 * 
 * @version 2.0.0
 * @date 2026-01-25
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const db = admin.firestore();

// ============================================================================
// CLOUD FUNCTION: submitServiceRequest
// Recibe solicitudes de cotización de servicios premium
// ============================================================================

exports.submitServiceRequest = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const {
    serviceType,    // 'MANUAL' | 'CAPACITACION'
    serviceId,      // 'manual_pld' | 'capacitacion_anual'
    formData,       // Datos del formulario
  } = data;

  const tenantId = context.auth.token.tenantId;

  if (!serviceType || !formData) {
    throw new functions.https.HttpsError('invalid-argument', 'Faltan parámetros');
  }

  console.log(`[LeadGen] Nueva solicitud: ${serviceType} de tenant ${tenantId}`);

  // =========================================================================
  // PASO 1: Recopilar TODOS los datos de contacto
  // =========================================================================

  // Obtener datos del tenant
  const tenantDoc = await db.collection('tenants').doc(tenantId).get();
  const tenant = tenantDoc.exists ? tenantDoc.data() : {};

  // Obtener datos del usuario actual
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const user = userDoc.exists ? userDoc.data() : {};

  // Construir información de contacto completa
  const contactInfo = {
    // Datos del usuario que solicita
    user_id: context.auth.uid,
    user_email: context.auth.token.email || user.email,
    user_name: user.display_name || user.nombre_completo || formData.contact_name,
    user_phone: formData.phone || user.phone || user.telefono,
    user_role: context.auth.token.role || user.role,

    // Datos de la empresa
    company_name: tenant.company_name || formData.company_name,
    company_rfc: tenant.rfc || formData.rfc,
    company_phone: tenant.phone || formData.company_phone,
    company_email: tenant.admin_email || tenant.email,

    // Horario preferido de contacto
    preferred_contact_time: formData.preferred_contact_time || 'MORNING',
    preferred_contact_method: formData.preferred_contact_method || 'EMAIL',
  };

  // Generar ID único para el lead
  const leadId = `lead_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  // =========================================================================
  // PASO 2: Clasificar el servicio y calcular valor estimado
  // =========================================================================

  const serviceMetadata = getServiceMetadata(serviceType, formData);

  // =========================================================================
  // PASO 3: Crear documento en admin_leads
  // =========================================================================

  const leadData = {
    lead_id: leadId,
    tenant_id: tenantId,

    // Tipo de servicio
    service_type: serviceType,
    service_id: serviceId || serviceType.toLowerCase(),
    service_name: serviceMetadata.name,

    // Datos del contacto
    contact_info: contactInfo,

    // Detalles específicos del servicio
    details: {
      // Para Capacitación
      employee_count: formData.participants_count || formData.employee_count,
      modality: formData.modality,
      preferred_dates: formData.preferred_dates,
      location: formData.location,

      // Para Manual
      has_existing_manual: formData.has_existing_manual,
      activity_type: formData.activity_type || tenant.activity_type,

      // Urgencia
      urgency: formData.urgency || 'NORMAL',

      // Comentarios
      comments: formData.comments,
    },

    // Valor estimado del lead
    estimated_value: serviceMetadata.estimatedValue,
    lead_score: calculateLeadScore(tenant, formData),

    // Estado del proceso de ventas
    status: 'PENDING_QUOTE',
    pipeline_stage: 'NEW',

    // Asignación
    assigned_to: null,
    assigned_at: null,

    // Historial de interacciones
    interactions: [{
      type: 'CREATED',
      timestamp: new Date().toISOString(),
      by: 'system',
      notes: 'Lead creado desde portal de servicios premium',
    }],

    // Cotizaciones
    quotes: [],

    // Fechas
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: null,
    first_contact_at: null,
    quote_sent_at: null,
    closed_at: null,

    // Tracking de origen
    source: 'app_premium_services',
    source_page: formData.source_page || '/servicios-premium',
    utm_source: formData.utm_source,
    utm_campaign: formData.utm_campaign,
  };

  // Guardar lead
  await db.collection('admin_leads').doc(leadId).set(leadData);

  console.log(`[LeadGen] ✅ Lead creado: ${leadId}`);

  // =========================================================================
  // PASO 4: Notificar al Super Admin (Email + In-App)
  // =========================================================================

  await notifyAdminNewLead(leadData, serviceMetadata);

  // =========================================================================
  // PASO 5: Enviar confirmación al cliente
  // =========================================================================

  await sendClientConfirmation(contactInfo, serviceMetadata, leadId);

  // =========================================================================
  // PASO 6: Actualizar flags del tenant
  // =========================================================================

  await db.collection('tenants').doc(tenantId).update({
    [`compliance_flags.${serviceType.toLowerCase()}_requested`]: true,
    [`compliance_flags.${serviceType.toLowerCase()}_requested_at`]: admin.firestore.FieldValue.serverTimestamp(),
    'last_service_request': admin.firestore.FieldValue.serverTimestamp(),
  });

  // =========================================================================
  // RESPUESTA AL CLIENTE
  // =========================================================================

  return {
    success: true,
    leadId,
    message: '¡Solicitud enviada exitosamente!',
    confirmation: {
      title: 'Hemos recibido tu solicitud',
      message: 'Un experto en cumplimiento PLD te contactará en las próximas 24 horas hábiles.',
      email_sent: true,
      reference_number: leadId.split('_')[1],
    },
    next_steps: [
      'Revisa tu correo electrónico para la confirmación',
      'Un ejecutivo te contactará pronto',
      'Prepara cualquier documento o información adicional',
    ],
  };
});

// ============================================================================
// FUNCIÓN: getServiceMetadata
// ============================================================================

function getServiceMetadata(serviceType, formData) {
  const services = {
    MANUAL: {
      name: 'Manual de Cumplimiento PLD',
      description: 'Elaboración de Manual de Políticas Art. 18 LFPIORPI',
      basePrice: 15000,
      estimatedValue: calculateManualValue(formData),
      responseTime: formData.urgency === 'express' ? '24 horas' : '24-48 horas',
    },
    CAPACITACION: {
      name: 'Capacitación Anual PLD',
      description: 'Programa de capacitación Art. 19 Fracción V LFPIORPI',
      basePrice: 500,
      estimatedValue: calculateTrainingValue(formData),
      responseTime: '24-48 horas',
    },
  };

  return services[serviceType] || {
    name: serviceType,
    description: 'Servicio premium',
    basePrice: 0,
    estimatedValue: 0,
    responseTime: '24-48 horas',
  };
}

function calculateManualValue(formData) {
  let value = 15000; // Base

  if (formData.urgency === 'urgent') value *= 1.3;
  if (formData.urgency === 'express') value *= 1.5;
  if (formData.employee_count > 50) value *= 1.2;

  return Math.round(value);
}

function calculateTrainingValue(formData) {
  const participants = parseInt(formData.participants_count) || 5;
  const pricePerPerson = formData.modality === 'presencial' ? 1200 :
    formData.modality === 'virtual' ? 800 : 500;

  return participants * pricePerPerson;
}

function calculateLeadScore(tenant, formData) {
  let score = 50; // Base

  // +20 si ya es cliente de pago
  if (tenant.subscription?.plan_id !== 'plan_demo') score += 20;

  // +10 si es urgente
  if (formData.urgency === 'urgent' || formData.urgency === 'express') score += 10;

  // +15 si tiene muchos empleados
  const employees = parseInt(formData.participants_count || formData.employee_count) || 0;
  if (employees >= 20) score += 15;
  else if (employees >= 10) score += 10;

  // +5 si dejó teléfono
  if (formData.phone) score += 5;

  return Math.min(100, score);
}

// ============================================================================
// FUNCIÓN: notifyAdminNewLead
// Notifica al Super Admin por email y in-app
// ============================================================================

async function notifyAdminNewLead(lead, serviceMetadata) {
  try {
    // 1. Crear notificación in-app
    await db.collection('admin_notifications').add({
      type: 'NEW_SALES_LEAD',
      category: 'SALES',
      severity: lead.lead_score >= 80 ? 'WARNING' : 'INFO',

      title: `💰 Nueva Oportunidad: ${serviceMetadata.name}`,
      message: `${lead.contact_info.company_name} solicita cotización. Valor estimado: $${lead.estimated_value.toLocaleString()} MXN`,

      details: {
        lead_id: lead.lead_id,
        tenant_id: lead.tenant_id,
        service_type: lead.service_type,
        company_name: lead.contact_info.company_name,
        contact_name: lead.contact_info.user_name,
        contact_email: lead.contact_info.user_email,
        contact_phone: lead.contact_info.user_phone,
        employee_count: lead.details.employee_count,
        urgency: lead.details.urgency,
        estimated_value: lead.estimated_value,
        lead_score: lead.lead_score,
      },

      actions: [
        { label: 'Ver Lead', url: `/admin/leads/${lead.lead_id}` },
        { label: 'Llamar Ahora', action: 'initiateCall', data: { phone: lead.contact_info.user_phone } },
        { label: 'Enviar Cotización', action: 'openQuoteBuilder', data: { leadId: lead.lead_id } },
      ],

      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 2. Enviar email al equipo de ventas
    const sgMail = require('@sendgrid/mail');
    const apiKey = functions.config().sendgrid?.api_key;

    if (apiKey) {
      sgMail.setApiKey(apiKey);

      const emailContent = {
        to: 'ventas@bdunity.com',
        from: { email: 'leads@bdunity.com', name: 'PLD BDU Leads' },
        subject: `🔥 Nueva Oportunidad: ${lead.contact_info.company_name} - ${serviceMetadata.name}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px;">
            <div style="background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
              <h2 style="margin: 0;">💰 Nueva Oportunidad de Venta</h2>
            </div>
            
            <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0;">
              <h3 style="color: #1e40af; margin-top: 0;">Servicio Solicitado</h3>
              <p style="font-size: 18px; font-weight: bold; color: #334155;">
                ${serviceMetadata.name}
              </p>
              
              <h3 style="color: #1e40af;">Datos de la Empresa</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #64748b;">Empresa:</td>
                  <td style="padding: 8px 0; font-weight: bold;">${lead.contact_info.company_name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b;">RFC:</td>
                  <td style="padding: 8px 0;">${lead.contact_info.company_rfc}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b;">Contacto:</td>
                  <td style="padding: 8px 0;">${lead.contact_info.user_name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b;">Email:</td>
                  <td style="padding: 8px 0;"><a href="mailto:${lead.contact_info.user_email}">${lead.contact_info.user_email}</a></td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b;">Teléfono:</td>
                  <td style="padding: 8px 0; font-weight: bold; font-size: 16px;">
                    <a href="tel:${lead.contact_info.user_phone}">${lead.contact_info.user_phone || 'No proporcionado'}</a>
                  </td>
                </tr>
              </table>
              
              <h3 style="color: #1e40af;">Detalles del Lead</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #64748b;">Empleados:</td>
                  <td style="padding: 8px 0;">${lead.details.employee_count || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b;">Urgencia:</td>
                  <td style="padding: 8px 0;">${lead.details.urgency}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b;">Lead Score:</td>
                  <td style="padding: 8px 0;"><strong>${lead.lead_score}/100</strong></td>
                </tr>
              </table>
              
              <div style="background: #dbeafe; padding: 15px; border-radius: 8px; margin-top: 15px;">
                <span style="color: #1e40af; font-weight: bold;">💵 Valor Estimado:</span>
                <span style="font-size: 24px; font-weight: bold; color: #059669;">
                  $${lead.estimated_value.toLocaleString()} MXN
                </span>
              </div>
              
              ${lead.details.comments ? `
                <h3 style="color: #1e40af;">Comentarios del Cliente</h3>
                <p style="background: white; padding: 10px; border-left: 3px solid #3b82f6;">
                  "${lead.details.comments}"
                </p>
              ` : ''}
              
              <div style="margin-top: 20px; text-align: center;">
                <a href="https://bdunity.com/admin/leads/${lead.lead_id}" 
                   style="display: inline-block; background: #3b82f6; color: white; 
                          padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
                  Ver Lead en Dashboard
                </a>
              </div>
            </div>
            
            <div style="background: #334155; color: #94a3b8; padding: 15px; border-radius: 0 0 8px 8px; text-align: center; font-size: 12px;">
              PLD BDU - Sistema de Leads | ${new Date().toLocaleString('es-MX')}
            </div>
          </div>
        `,
      };

      await sgMail.send(emailContent);
      console.log('[LeadGen] ✅ Email enviado al equipo de ventas');
    }

  } catch (error) {
    console.error('[notifyAdminNewLead] Error:', error);
  }
}

// ============================================================================
// FUNCIÓN: sendClientConfirmation
// Envía email de confirmación al cliente
// ============================================================================

async function sendClientConfirmation(contactInfo, serviceMetadata, leadId) {
  try {
    const sgMail = require('@sendgrid/mail');
    const apiKey = functions.config().sendgrid?.api_key;

    if (!apiKey || !contactInfo.user_email) return;

    sgMail.setApiKey(apiKey);

    const referenceNumber = leadId.split('_')[1];

    const emailContent = {
      to: contactInfo.user_email,
      from: { email: 'hola@bdunity.com', name: 'PLD BDU' },
      subject: `✅ Recibimos tu solicitud - ${serviceMetadata.name}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #059669, #10b981); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">✅ ¡Solicitud Recibida!</h1>
          </div>
          
          <div style="background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0;">
            <p style="font-size: 16px; color: #334155;">
              Hola <strong>${contactInfo.user_name || 'estimado cliente'}</strong>,
            </p>
            
            <p style="color: #64748b;">
              Hemos recibido tu solicitud de cotización para:
            </p>
            
            <div style="background: white; border: 2px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #059669;">📄 ${serviceMetadata.name}</h3>
              <p style="margin: 0; color: #64748b; font-size: 14px;">
                ${serviceMetadata.description}
              </p>
            </div>
            
            <div style="background: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; font-size: 14px;">
                <strong>Número de referencia:</strong> ${referenceNumber}
              </p>
            </div>
            
            <h3 style="color: #334155;">¿Qué sigue?</h3>
            <ol style="color: #64748b; line-height: 1.8;">
              <li>Un experto en cumplimiento PLD revisará tu solicitud</li>
              <li>Te contactaremos en las próximas <strong>${serviceMetadata.responseTime}</strong></li>
              <li>Recibirás una cotización personalizada sin compromiso</li>
            </ol>
            
            <p style="color: #64748b; font-size: 14px;">
              Si tienes alguna pregunta urgente, puedes contactarnos directamente:
            </p>
            
            <p style="text-align: center; margin: 25px 0;">
              <a href="mailto:ventas@bdunity.com" 
                 style="display: inline-block; background: #3b82f6; color: white; 
                        padding: 12px 24px; border-radius: 6px; text-decoration: none;">
                📧 ventas@bdunity.com
              </a>
            </p>
            
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;">
            
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">
              Gracias por confiar en PLD BDU para tus necesidades de cumplimiento.
            </p>
          </div>
          
          <div style="background: #334155; color: #94a3b8; padding: 20px; border-radius: 0 0 8px 8px; text-align: center; font-size: 12px;">
            © 2026 PLD BDU - Sistema de Prevención de Lavado de Dinero<br>
            <a href="https://bdunity.com" style="color: #60a5fa;">www.bdunity.com</a>
          </div>
        </div>
      `,
    };

    await sgMail.send(emailContent);
    console.log('[LeadGen] ✅ Email de confirmación enviado al cliente');

  } catch (error) {
    console.error('[sendClientConfirmation] Error:', error);
  }
}

// ============================================================================
// CLOUD FUNCTION: getComplianceStatus
// Obtiene estado de cumplimiento para mostrar en UI de servicios
// ============================================================================

exports.getComplianceStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const tenantId = context.auth.token.tenantId || data.tenantId;

  const tenantDoc = await db.collection('tenants').doc(tenantId).get();

  if (!tenantDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Empresa no encontrada');
  }

  const tenant = tenantDoc.data();

  // Calcular días restantes para capacitación
  const currentYear = new Date().getFullYear();
  const trainingDeadline = `${currentYear}-12-31`;
  const today = new Date();
  const deadlineDate = new Date(trainingDeadline);
  const daysRemaining = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));

  return {
    success: true,

    // Estado del manual
    manual: {
      has_manual: tenant.has_manual || false,
      manual_date: tenant.manual_date || null,
      manual_version: tenant.manual_version || null,
      needs_update: tenant.manual_date
        ? (new Date() - new Date(tenant.manual_date)) > (365 * 24 * 60 * 60 * 1000)
        : true,
    },

    // Estado de capacitación
    training: {
      status: tenant[`training_${currentYear}_status`] || 'PENDING',
      trained_count: tenant[`training_${currentYear}_count`] || 0,
      total_employees: tenant.employee_count || 0,
      deadline: trainingDeadline,
      days_remaining: Math.max(0, daysRemaining),
      is_urgent: daysRemaining <= 30,
      is_critical: daysRemaining <= 7,
    },

    // Solicitudes pendientes
    pending_requests: {
      manual: tenant.compliance_flags?.manual_requested || false,
      training: tenant.compliance_flags?.training_requested || false,
    },
  };
});

// ============================================================================
// CLOUD FUNCTION: updateComplianceStatus (Admin)
// Actualiza estado de cumplimiento después de entregar servicio
// ============================================================================

exports.updateComplianceStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const callerRole = context.auth.token.role;
  if (callerRole !== 'SUPER_ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Solo Super Admin');
  }

  const { tenantId, type, updates } = data;

  const tenantRef = db.collection('tenants').doc(tenantId);

  if (type === 'manual') {
    await tenantRef.update({
      has_manual: true,
      manual_date: updates.date || new Date().toISOString(),
      manual_version: updates.version || '1.0',
      manual_file_path: updates.filePath || null,
      'compliance_flags.manual_delivered': true,
      'compliance_flags.manual_delivered_at': admin.firestore.FieldValue.serverTimestamp(),
    });
  } else if (type === 'training') {
    const currentYear = new Date().getFullYear();
    await tenantRef.update({
      [`training_${currentYear}_status`]: 'COMPLETE',
      [`training_${currentYear}_count`]: updates.trainedCount || 0,
      [`training_${currentYear}_date`]: updates.date || new Date().toISOString(),
      'compliance_flags.training_delivered': true,
      'compliance_flags.training_delivered_at': admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  return { success: true };
});

// ============================================================================
// HELPERS
// ============================================================================

function getServiceName(serviceId) {
  const names = {
    'manual_pld': 'Manual de Cumplimiento PLD',
    'capacitacion_anual': 'Capacitación Anual PLD',
  };
  return names[serviceId] || serviceId;
}

async function notifySalesTeam(request) {
  try {
    // Guardar notificación interna
    await db.collection('admin_notifications').add({
      type: 'NEW_SERVICE_REQUEST',
      category: 'SALES',
      severity: request.priority === 'HIGH' ? 'WARNING' : 'INFO',

      title: `💰 Nueva Solicitud: ${request.service_name}`,
      message: `${request.company.name} solicitó ${request.service_name}. ${request.form_data.participants_count || request.form_data.employee_count || ''} empleados.`,

      details: {
        request_id: request.request_id,
        tenant_id: request.tenant_id,
        service_id: request.service_id,
        priority: request.priority,
        contact_email: request.requester.email,
        contact_name: request.requester.name,
      },

      actions: [
        { label: 'Ver Solicitud', url: `/admin/service-requests/${request.request_id}` },
        { label: 'Contactar', action: 'callClient', data: { requestId: request.request_id } },
      ],

      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('[notifySalesTeam] Notificación enviada');
  } catch (error) {
    console.error('[notifySalesTeam] Error:', error);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  submitServiceRequest: exports.submitServiceRequest,
  getComplianceStatus: exports.getComplianceStatus,
  updateComplianceStatus: exports.updateComplianceStatus,
};
