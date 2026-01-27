/**
 * PLD BDU - Sistema de Alertas y Notificaciones
 * 
 * Triggers de Cloud Functions para notificar al Super Admin
 * sobre eventos críticos del negocio y técnicos.
 * 
 * Canales:
 * - Email: SendGrid (alertas de negocio)
 * - Slack: Webhook (alertas técnicas en tiempo real)
 * - In-App: Firestore (todas las alertas)
 * 
 * @version 2.0.0
 * @date 2026-01-25
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const db = admin.firestore();

// ============================================================================
// CONFIGURACIÓN
// ============================================================================
const CONFIG = {
    // SendGrid
    sendgrid: {
        api_key: functions.config().sendgrid?.api_key,
        from_email: 'alertas@bdunity.com',
        from_name: 'PLD BDU Alertas',
        admin_emails: ['admin@bdunity.com'], // Super Admins
    },

    // Slack Webhook
    slack: {
        webhook_url: functions.config().slack?.webhook_url,
        channel: '#pld-bdu-alerts',
        enabled: true,
    },

    // Umbrales
    thresholds: {
        quota_warning_percent: 90,        // Alertar al 90% de cuota
        validation_error_percent: 50,     // Alertar si >50% errores
        batch_timeout_count: 3,           // Alertar después de 3 timeouts
    },
};

// ============================================================================
// ESTRUCTURA DE NOTIFICACIÓN
// ============================================================================
/*
{
  notification_id: "notif_1706200000_abc123",
  
  // Tipo y categoría
  type: "NEW_TENANT" | "QUOTA_WARNING" | "PLAN_EXPIRED" | "SYSTEM_ERROR" | "VALIDATION_ERROR",
  category: "BUSINESS" | "TECHNICAL" | "SECURITY",
  severity: "INFO" | "WARNING" | "CRITICAL",
  
  // Contenido
  title: "Nuevo Cliente Registrado",
  message: "La empresa 'Inmobiliaria Premium' se registró con plan Pro.",
  details: {
    tenant_id: "tenant_abc123",
    company_name: "Inmobiliaria Premium",
    plan_id: "plan_pro"
  },
  
  // Acciones sugeridas
  actions: [
    { label: "Ver Empresa", url: "/admin/tenants/tenant_abc123" },
    { label: "Contactar", action: "sendWelcomeEmail" }
  ],
  
  // Canales de entrega
  channels: {
    in_app: true,
    email: true,
    slack: false
  },
  
  // Estado
  status: "pending" | "sent" | "read" | "dismissed",
  sent_at: null,
  read_at: null,
  read_by: null,
  
  // Metadatos
  created_at: Timestamp,
  source_function: "onTenantCreated",
  environment: "production"
}
*/

// ============================================================================
// TRIGGER 1: Nuevo Cliente (onTenantCreated)
// ============================================================================

exports.onTenantCreated_notify = functions
    .runWith({ memory: '256MB' })
    .firestore.document('tenants/{tenantId}')
    .onCreate(async (snapshot, context) => {
        const { tenantId } = context.params;
        const tenantData = snapshot.data();

        console.log(`[Notifications] Nuevo tenant: ${tenantId}`);

        const notification = {
            notification_id: generateNotificationId(),
            type: 'NEW_TENANT',
            category: 'BUSINESS',
            severity: 'INFO',

            title: '🎉 Nuevo Cliente Registrado',
            message: `La empresa "${tenantData.company_name}" se registró con el plan ${formatPlanName(tenantData.subscription?.plan_id)}.`,

            details: {
                tenant_id: tenantId,
                company_name: tenantData.company_name,
                rfc: tenantData.rfc,
                admin_email: tenantData.admin_email,
                plan_id: tenantData.subscription?.plan_id,
                is_trial: tenantData.subscription?.status === 'TRIAL',
            },

            actions: [
                { label: 'Ver Empresa', url: `/admin/tenants/${tenantId}` },
                { label: 'Enviar Bienvenida', action: 'sendWelcomeEmail', data: { tenantId } },
            ],

            channels: {
                in_app: true,
                email: tenantData.subscription?.plan_id !== 'plan_demo', // Email solo para clientes de pago
                slack: true,
            },
        };

        await createAndSendNotification(notification);
    });

// ============================================================================
// TRIGGER 2: Límite Alcanzado (Oportunidad de Upsell)
// ============================================================================

exports.onQuotaWarning_notify = functions
    .runWith({ memory: '256MB' })
    .firestore.document('tenants/{tenantId}/usage_stats/{month}')
    .onUpdate(async (change, context) => {
        const { tenantId, month } = context.params;
        const before = change.before.data();
        const after = change.after.data();

        // Obtener límites del tenant
        const tenantDoc = await db.collection('tenants').doc(tenantId).get();
        if (!tenantDoc.exists) return;

        const tenant = tenantDoc.data();
        const planId = tenant.subscription?.plan_id;

        // Límites por plan
        const planLimits = {
            plan_demo: 100,
            plan_pro: 5000,
            plan_enterprise: -1,
        };

        const limit = planLimits[planId] || 100;
        if (limit === -1) return; // Enterprise = ilimitado

        const currentRecords = after.records?.created || 0;
        const previousRecords = before.records?.created || 0;

        const currentPercent = (currentRecords / limit) * 100;
        const previousPercent = (previousRecords / limit) * 100;

        // Solo notificar cuando CRUZA el umbral del 90%
        if (previousPercent < CONFIG.thresholds.quota_warning_percent &&
            currentPercent >= CONFIG.thresholds.quota_warning_percent) {

            console.log(`[Notifications] Quota warning para tenant: ${tenantId}`);

            const notification = {
                notification_id: generateNotificationId(),
                type: 'QUOTA_WARNING',
                category: 'BUSINESS',
                severity: 'WARNING',

                title: '📈 Oportunidad de Upsell',
                message: `"${tenant.company_name}" alcanzó el ${Math.round(currentPercent)}% de su cuota mensual (${currentRecords.toLocaleString()}/${limit.toLocaleString()} registros).`,

                details: {
                    tenant_id: tenantId,
                    company_name: tenant.company_name,
                    plan_id: planId,
                    current_usage: currentRecords,
                    limit: limit,
                    percent_used: Math.round(currentPercent),
                    admin_email: tenant.admin_email,
                },

                actions: [
                    { label: 'Contactar para Upgrade', action: 'openContactModal', data: { tenantId } },
                    { label: 'Ver Consumo', url: `/admin/tenants/${tenantId}/usage` },
                ],

                channels: {
                    in_app: true,
                    email: true,
                    slack: true,
                },
            };

            await createAndSendNotification(notification);
        }
    });

// ============================================================================
// TRIGGER 3: Plan Expirado (Scheduled - Diario)
// ============================================================================

exports.checkExpiredPlans = functions.pubsub
    .schedule('0 8 * * *') // 8:00 AM todos los días
    .timeZone('America/Mexico_City')
    .onRun(async (context) => {
        console.log('[Notifications] Verificando planes expirados...');

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Buscar tenants con suscripción vencida
        const expiredSnapshot = await db.collection('tenants')
            .where('subscription.status', 'in', ['ACTIVE', 'TRIAL'])
            .get();

        const expiredTenants = [];
        const expiringTenants = [];

        for (const doc of expiredSnapshot.docs) {
            const tenant = doc.data();
            const periodEnd = tenant.subscription?.current_period_end;

            if (!periodEnd) continue;

            const endDate = new Date(periodEnd);
            const daysUntilExpiry = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));

            if (daysUntilExpiry <= 0) {
                expiredTenants.push({ id: doc.id, ...tenant, daysExpired: Math.abs(daysUntilExpiry) });
            } else if (daysUntilExpiry <= 7) {
                expiringTenants.push({ id: doc.id, ...tenant, daysRemaining: daysUntilExpiry });
            }
        }

        // Notificar planes expirados
        if (expiredTenants.length > 0) {
            const notification = {
                notification_id: generateNotificationId(),
                type: 'PLANS_EXPIRED',
                category: 'BUSINESS',
                severity: 'WARNING',

                title: '⚠️ Suscripciones Vencidas',
                message: `${expiredTenants.length} empresa(s) tienen su suscripción vencida.`,

                details: {
                    expired_count: expiredTenants.length,
                    tenants: expiredTenants.slice(0, 10).map(t => ({
                        id: t.id,
                        name: t.company_name,
                        days_expired: t.daysExpired,
                    })),
                },

                actions: [
                    { label: 'Ver Lista Completa', url: '/admin/tenants?filter=expired' },
                ],

                channels: {
                    in_app: true,
                    email: true,
                    slack: true,
                },
            };

            await createAndSendNotification(notification);

            // Marcar como expirados
            const batch = db.batch();
            expiredTenants.forEach(tenant => {
                batch.update(db.collection('tenants').doc(tenant.id), {
                    'subscription.status': 'EXPIRED',
                    'subscription.expired_at': admin.firestore.FieldValue.serverTimestamp(),
                });
            });
            await batch.commit();
        }

        // Notificar planes por expirar
        if (expiringTenants.length > 0) {
            const notification = {
                notification_id: generateNotificationId(),
                type: 'PLANS_EXPIRING',
                category: 'BUSINESS',
                severity: 'INFO',

                title: '📅 Suscripciones Por Vencer',
                message: `${expiringTenants.length} empresa(s) vencen en los próximos 7 días.`,

                details: {
                    expiring_count: expiringTenants.length,
                    tenants: expiringTenants.map(t => ({
                        id: t.id,
                        name: t.company_name,
                        days_remaining: t.daysRemaining,
                    })),
                },

                actions: [
                    { label: 'Ver Detalle', url: '/admin/tenants?filter=expiring' },
                ],

                channels: {
                    in_app: true,
                    email: false,
                    slack: true,
                },
            };

            await createAndSendNotification(notification);
        }

        console.log(`[Notifications] Expirados: ${expiredTenants.length}, Por vencer: ${expiringTenants.length}`);
    });

// ============================================================================
// TRIGGER 4: Fallo de Validación XSD Recurrente
// ============================================================================

exports.onXMLAudit_checkErrors = functions
    .runWith({ memory: '256MB' })
    .firestore.document('xml_audits/{auditId}')
    .onCreate(async (snapshot, context) => {
        const audit = snapshot.data();

        if (audit.status !== 'ERROR') return;

        const tenantId = audit.tenant_id;
        if (!tenantId) return;

        // Contar auditorías recientes de este tenant
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const auditsSnapshot = await db.collection('xml_audits')
            .where('tenant_id', '==', tenantId)
            .where('timestamp', '>=', oneWeekAgo)
            .get();

        const total = auditsSnapshot.size;
        const errors = auditsSnapshot.docs.filter(d => d.data().status === 'ERROR').length;
        const errorRate = (errors / total) * 100;

        if (errors >= 5 && errorRate >= CONFIG.thresholds.validation_error_percent) {
            console.log(`[Notifications] Alta tasa de errores para tenant: ${tenantId}`);

            const tenantDoc = await db.collection('tenants').doc(tenantId).get();
            const tenant = tenantDoc.exists ? tenantDoc.data() : {};

            const notification = {
                notification_id: generateNotificationId(),
                type: 'HIGH_VALIDATION_ERRORS',
                category: 'TECHNICAL',
                severity: 'WARNING',

                title: '🔴 Cliente con Errores de Validación',
                message: `"${tenant.company_name || tenantId}" tiene ${errorRate.toFixed(0)}% de errores en validaciones XML esta semana (${errors}/${total}). Puede requerir soporte.`,

                details: {
                    tenant_id: tenantId,
                    company_name: tenant.company_name,
                    total_audits: total,
                    error_count: errors,
                    error_rate: errorRate,
                    recent_errors: auditsSnapshot.docs
                        .filter(d => d.data().status === 'ERROR')
                        .slice(0, 5)
                        .map(d => ({
                            file_name: d.data().file_name,
                            error_count: d.data().error_count,
                            timestamp: d.data().timestamp,
                        })),
                },

                actions: [
                    { label: 'Contactar Soporte', action: 'openSupportTicket', data: { tenantId } },
                    { label: 'Ver Auditorías', url: `/admin/tenants/${tenantId}/audits` },
                ],

                channels: {
                    in_app: true,
                    email: false,
                    slack: true,
                },
            };

            await createAndSendNotification(notification);
        }
    });

// ============================================================================
// TRIGGER 5: Error de Sistema / Timeout de Carga
// ============================================================================

exports.onBatchJobFailed = functions
    .runWith({ memory: '256MB' })
    .firestore.document('batch_jobs/{jobId}')
    .onUpdate(async (change, context) => {
        const { jobId } = context.params;
        const before = change.before.data();
        const after = change.after.data();

        // Solo notificar si cambió a estado de error
        if (before.status === after.status) return;
        if (after.status !== 'FAILED' && after.status !== 'TIMEOUT') return;

        console.log(`[Notifications] Batch job fallido: ${jobId}`);

        const tenantId = after.tenant_id;
        const tenantDoc = await db.collection('tenants').doc(tenantId).get();
        const tenant = tenantDoc.exists ? tenantDoc.data() : {};

        const notification = {
            notification_id: generateNotificationId(),
            type: after.status === 'TIMEOUT' ? 'BATCH_TIMEOUT' : 'BATCH_FAILED',
            category: 'TECHNICAL',
            severity: 'CRITICAL',

            title: after.status === 'TIMEOUT'
                ? '⏱️ Timeout en Carga Masiva'
                : '❌ Error en Carga Masiva',

            message: `Job ${jobId.substring(0, 8)} para "${tenant.company_name || tenantId}" falló: ${after.error_message || 'Error desconocido'}`,

            details: {
                job_id: jobId,
                tenant_id: tenantId,
                company_name: tenant.company_name,
                file_name: after.original_file_name,
                total_rows: after.total_rows,
                processed_rows: after.processed_rows,
                error_message: after.error_message,
                started_at: after.started_at,
                failed_at: after.completed_at,
                duration_seconds: after.duration_seconds,
            },

            actions: [
                { label: 'Ver Logs', url: `/admin/functions/logs?job=${jobId}` },
                { label: 'Reintentar', action: 'retryBatchJob', data: { jobId } },
            ],

            channels: {
                in_app: true,
                email: after.status === 'TIMEOUT',
                slack: true,
            },
        };

        await createAndSendNotification(notification);
    });

// ============================================================================
// FUNCIÓN CENTRAL: createAndSendNotification
// Crea la notificación en Firestore y envía a canales configurados
// ============================================================================

async function createAndSendNotification(notification) {
    try {
        // Agregar campos de sistema
        const fullNotification = {
            ...notification,
            status: 'pending',
            sent_at: null,
            read_at: null,
            read_by: null,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            source_function: notification.source_function || 'unknown',
            environment: process.env.FUNCTIONS_EMULATOR ? 'development' : 'production',
        };

        // Guardar en Firestore (In-App)
        if (notification.channels?.in_app !== false) {
            await db.collection('admin_notifications').add(fullNotification);
            console.log(`[Notifications] In-App guardada: ${notification.type}`);
        }

        // Enviar Email (SendGrid)
        if (notification.channels?.email && CONFIG.sendgrid.api_key) {
            await sendEmailNotification(notification);
        }

        // Enviar a Slack
        if (notification.channels?.slack && CONFIG.slack.enabled && CONFIG.slack.webhook_url) {
            await sendSlackNotification(notification);
        }

        return true;

    } catch (error) {
        console.error('[Notifications] Error:', error);
        return false;
    }
}

// ============================================================================
// FUNCIÓN: sendEmailNotification (SendGrid)
// ============================================================================

async function sendEmailNotification(notification) {
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(CONFIG.sendgrid.api_key);

    const severityColors = {
        INFO: '#3b82f6',
        WARNING: '#f59e0b',
        CRITICAL: '#ef4444',
    };

    const emailContent = {
        to: CONFIG.sendgrid.admin_emails,
        from: {
            email: CONFIG.sendgrid.from_email,
            name: CONFIG.sendgrid.from_name,
        },
        subject: `[PLD BDU] ${notification.title}`,
        html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${severityColors[notification.severity]}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">${notification.title}</h2>
          <span style="font-size: 12px; opacity: 0.8;">${notification.category} | ${notification.severity}</span>
        </div>
        
        <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0;">
          <p style="font-size: 16px; color: #334155;">${notification.message}</p>
          
          ${notification.details ? `
            <div style="background: white; padding: 15px; border-radius: 4px; margin: 15px 0;">
              <h4 style="margin: 0 0 10px 0; color: #64748b;">Detalles:</h4>
              <pre style="font-size: 12px; background: #f1f5f9; padding: 10px; border-radius: 4px; overflow-x: auto;">
${JSON.stringify(notification.details, null, 2)}
              </pre>
            </div>
          ` : ''}
          
          ${notification.actions?.length ? `
            <div style="margin-top: 20px;">
              ${notification.actions.map(a => `
                <a href="https://bdunity.com${a.url || '#'}" 
                   style="display: inline-block; background: #3b82f6; color: white; 
                          padding: 10px 20px; border-radius: 4px; text-decoration: none; 
                          margin-right: 10px;">
                  ${a.label}
                </a>
              `).join('')}
            </div>
          ` : ''}
        </div>
        
        <div style="background: #334155; color: #94a3b8; padding: 15px; 
                    border-radius: 0 0 8px 8px; font-size: 12px; text-align: center;">
          PLD BDU - Sistema de Alertas | ${new Date().toLocaleString('es-MX')}
        </div>
      </div>
    `,
    };

    try {
        await sgMail.send(emailContent);
        console.log(`[Notifications] Email enviado: ${notification.type}`);
    } catch (error) {
        console.error('[Notifications] Error SendGrid:', error);
    }
}

// ============================================================================
// FUNCIÓN: sendSlackNotification (Webhook)
// ============================================================================

async function sendSlackNotification(notification) {
    const fetch = require('node-fetch');

    const severityEmoji = {
        INFO: 'ℹ️',
        WARNING: '⚠️',
        CRITICAL: '🚨',
    };

    const severityColor = {
        INFO: '#3b82f6',
        WARNING: '#f59e0b',
        CRITICAL: '#ef4444',
    };

    const slackMessage = {
        channel: CONFIG.slack.channel,
        username: 'PLD BDU Bot',
        icon_emoji: ':shield:',
        attachments: [
            {
                color: severityColor[notification.severity],
                blocks: [
                    {
                        type: 'header',
                        text: {
                            type: 'plain_text',
                            text: `${severityEmoji[notification.severity]} ${notification.title}`,
                            emoji: true,
                        },
                    },
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: notification.message,
                        },
                    },
                    {
                        type: 'context',
                        elements: [
                            {
                                type: 'mrkdwn',
                                text: `*Tipo:* ${notification.type} | *Categoría:* ${notification.category} | *Severidad:* ${notification.severity}`,
                            },
                        ],
                    },
                ],
            },
        ],
    };

    // Agregar detalles si existen
    if (notification.details) {
        slackMessage.attachments[0].blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: '```' + JSON.stringify(notification.details, null, 2).substring(0, 2900) + '```',
            },
        });
    }

    // Agregar botones de acción
    if (notification.actions?.length) {
        slackMessage.attachments[0].blocks.push({
            type: 'actions',
            elements: notification.actions.slice(0, 3).map(action => ({
                type: 'button',
                text: {
                    type: 'plain_text',
                    text: action.label,
                    emoji: true,
                },
                url: action.url ? `https://bdunity.com${action.url}` : undefined,
                action_id: action.action || action.label.toLowerCase().replace(/\s/g, '_'),
            })),
        });
    }

    try {
        const response = await fetch(CONFIG.slack.webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(slackMessage),
        });

        if (response.ok) {
            console.log(`[Notifications] Slack enviado: ${notification.type}`);
        } else {
            console.error('[Notifications] Error Slack:', await response.text());
        }
    } catch (error) {
        console.error('[Notifications] Error Slack fetch:', error);
    }
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

function generateNotificationId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `notif_${timestamp}_${random}`;
}

function formatPlanName(planId) {
    const names = {
        plan_demo: 'Demo (Prueba)',
        plan_pro: 'Profesional',
        plan_enterprise: 'Enterprise',
    };
    return names[planId] || planId;
}

// ============================================================================
// FUNCIÓN: markNotificationRead
// ============================================================================

exports.markNotificationRead = functions.https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.role !== 'SUPER_ADMIN') {
        throw new functions.https.HttpsError('permission-denied', 'Solo Super Admin');
    }

    const { notificationId } = data;

    await db.collection('admin_notifications').doc(notificationId).update({
        status: 'read',
        read_at: admin.firestore.FieldValue.serverTimestamp(),
        read_by: context.auth.uid,
    });

    return { success: true };
});

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    // Triggers de negocio
    onTenantCreated_notify: exports.onTenantCreated_notify,
    onQuotaWarning_notify: exports.onQuotaWarning_notify,
    checkExpiredPlans: exports.checkExpiredPlans,

    // Triggers técnicos
    onXMLAudit_checkErrors: exports.onXMLAudit_checkErrors,
    onBatchJobFailed: exports.onBatchJobFailed,

    // Acciones
    markNotificationRead: exports.markNotificationRead,
};
