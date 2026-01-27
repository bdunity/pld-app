/**
 * PLD BDU - Módulo de Entrega de Servicios (Admin Upload & Activation)
 * 
 * Funciones para que el Super Admin entregue servicios de consultoría
 * (Manual PLD, Capacitación) y actualice el estado de cumplimiento del cliente.
 * 
 * @version 2.0.0
 * @date 2026-01-25
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');

const db = admin.firestore();
const storage = admin.storage();

// ============================================================================
// CONFIGURACIÓN
// ============================================================================
const CONFIG = {
    UPLOAD_URL_EXPIRY_MINUTES: 30,
    MAX_FILE_SIZE_MB: 50,
    ALLOWED_MIME_TYPES: [
        'application/pdf',
        'application/zip',
        'image/png',
        'image/jpeg',
    ],
};

// ============================================================================
// TIPOS DE SERVICIO
// ============================================================================
const SERVICE_TYPES = {
    MANUAL_PLD: {
        id: 'MANUAL_PLD',
        name_es: 'Manual de Cumplimiento PLD',
        folder: 'manuales',
        compliance_field: 'has_manual',
        status_field: 'manual_status',
        date_field: 'manual_delivered_at',
        notification_title: 'Tu Manual de Cumplimiento está listo',
        notification_body: 'Ya puedes descargar tu Manual de Políticas PLD personalizado desde tu Bóveda Digital.',
    },
    CAPACITACION: {
        id: 'CAPACITACION',
        name_es: 'Capacitación Anual PLD',
        folder: 'capacitaciones',
        compliance_field: 'training_completed',
        status_field: 'training_status',
        date_field: 'training_delivered_at',
        notification_title: 'Constancias de Capacitación disponibles',
        notification_body: 'Las constancias de capacitación de tu equipo ya están disponibles para descarga.',
    },
    CONSTANCIAS_DC3: {
        id: 'CONSTANCIAS_DC3',
        name_es: 'Constancias DC-3',
        folder: 'constancias',
        compliance_field: 'dc3_completed',
        status_field: 'dc3_status',
        date_field: 'dc3_delivered_at',
        notification_title: 'Constancias DC-3 disponibles',
        notification_body: 'Las constancias DC-3 (STPS) de capacitación ya están disponibles.',
    },
};

// ============================================================================
// CLOUD FUNCTION: getDeliveryUploadUrl
// Genera URL para que el admin suba el archivo final
// ============================================================================

exports.getDeliveryUploadUrl = functions.https.onCall(async (data, context) => {
    // Solo Super Admin
    if (!context.auth || context.auth.token.role !== 'SUPER_ADMIN') {
        throw new functions.https.HttpsError('permission-denied', 'Solo Super Admin');
    }

    const { tenantId, serviceType, fileName, mimeType, fileSize, leadId } = data;

    // Validar parámetros
    if (!tenantId || !serviceType || !fileName) {
        throw new functions.https.HttpsError('invalid-argument', 'Faltan parámetros');
    }

    const serviceConfig = SERVICE_TYPES[serviceType];
    if (!serviceConfig) {
        throw new functions.https.HttpsError('invalid-argument', `Tipo de servicio inválido: ${serviceType}`);
    }

    // Validar tipo MIME
    if (!CONFIG.ALLOWED_MIME_TYPES.includes(mimeType)) {
        throw new functions.https.HttpsError('invalid-argument', 'Tipo de archivo no permitido');
    }

    // Verificar que el tenant existe
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Empresa no encontrada');
    }

    console.log(`[ServiceDelivery] Generando URL para ${serviceType} -> ${tenantId}`);

    // Construir path
    const timestamp = Date.now();
    const extension = fileName.split('.').pop().toLowerCase();
    const year = new Date().getFullYear();
    const uniqueFileName = `${serviceConfig.folder}_${timestamp}.${extension}`;
    const filePath = `tenants/${tenantId}/compliance_docs/${serviceConfig.folder}/${year}/${uniqueFileName}`;

    // Generar URL firmada
    const bucket = storage.bucket();
    const file = bucket.file(filePath);

    const expirationTime = Date.now() + (CONFIG.UPLOAD_URL_EXPIRY_MINUTES * 60 * 1000);

    const [uploadUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: expirationTime,
        contentType: mimeType,
    });

    // Generar ID de entrega
    const deliveryId = `del_${timestamp}_${crypto.randomBytes(4).toString('hex')}`;

    // Guardar registro pendiente
    await db.collection('pending_deliveries').doc(deliveryId).set({
        delivery_id: deliveryId,
        tenant_id: tenantId,
        service_type: serviceType,
        service_name: serviceConfig.name_es,
        lead_id: leadId || null,
        file_name: uniqueFileName,
        original_file_name: fileName,
        file_path: filePath,
        mime_type: mimeType,
        expected_size: fileSize,
        status: 'pending_upload',
        created_by: context.auth.uid,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
        success: true,
        uploadUrl,
        deliveryId,
        filePath,
        expiresAt: new Date(expirationTime).toISOString(),
    };
});

// ============================================================================
// CLOUD FUNCTION: deliverComplianceService
// Completa la entrega del servicio y actualiza estado del cliente
// ============================================================================

exports.deliverComplianceService = functions.https.onCall(async (data, context) => {
    // Solo Super Admin
    if (!context.auth || context.auth.token.role !== 'SUPER_ADMIN') {
        throw new functions.https.HttpsError('permission-denied', 'Solo Super Admin');
    }

    const {
        deliveryId,
        tenantId,
        serviceType,
        leadId,
        // Datos adicionales
        notes,
        validUntil,            // Fecha de vigencia (opcional)
        employeesCount,        // Para capacitación: cantidad de empleados capacitados
        sendNotification = true,
    } = data;

    console.log(`[ServiceDelivery] Procesando entrega ${deliveryId} -> ${tenantId}`);

    // Obtener registro de entrega pendiente
    const pendingDoc = await db.collection('pending_deliveries').doc(deliveryId).get();

    if (!pendingDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Registro de entrega no encontrado');
    }

    const pending = pendingDoc.data();

    // Verificar que el archivo existe en Storage
    const bucket = storage.bucket();
    const file = bucket.file(pending.file_path);

    const [exists] = await file.exists();
    if (!exists) {
        throw new functions.https.HttpsError('not-found', 'Archivo no encontrado. Suba el archivo primero.');
    }

    // Obtener metadata del archivo
    const [metadata] = await file.getMetadata();

    // Obtener tenant
    const tenantRef = db.collection('tenants').doc(tenantId);
    const tenantDoc = await tenantRef.get();

    if (!tenantDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Empresa no encontrada');
    }

    const tenant = tenantDoc.data();
    const serviceConfig = SERVICE_TYPES[serviceType];
    const currentYear = new Date().getFullYear();

    // =========================================================================
    // PASO 1: Actualizar estado de cumplimiento del tenant
    // =========================================================================

    const complianceUpdates = {
        // Campo principal de cumplimiento
        [`compliance_status.${serviceConfig.compliance_field}`]: true,
        [`compliance_status.${serviceConfig.status_field}`]: 'COMPLETED',
        [`compliance_status.${serviceConfig.date_field}`]: admin.firestore.FieldValue.serverTimestamp(),

        // Detalles del servicio entregado
        [`delivered_services.${serviceType}`]: {
            delivered: true,
            delivery_id: deliveryId,
            file_path: pending.file_path,
            file_name: pending.original_file_name,
            delivered_at: new Date().toISOString(),
            delivered_by: context.auth.uid,
            valid_until: validUntil || null,
            notes: notes || null,
        },

        // Timestamp de actualización
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Campos específicos por tipo de servicio
    if (serviceType === 'MANUAL_PLD') {
        complianceUpdates['has_manual'] = true;
        complianceUpdates['manual_date'] = new Date().toISOString();
        complianceUpdates['manual_version'] = `v${currentYear}`;
        complianceUpdates['manual_file_path'] = pending.file_path;
    }

    if (serviceType === 'CAPACITACION') {
        complianceUpdates[`training_${currentYear}_status`] = 'COMPLETE';
        complianceUpdates[`training_${currentYear}_date`] = new Date().toISOString();
        complianceUpdates[`training_${currentYear}_count`] = employeesCount || 0;
        complianceUpdates['training_completed'] = true;
    }

    await tenantRef.update(complianceUpdates);

    console.log(`[ServiceDelivery] ✅ Estado de cumplimiento actualizado para ${tenantId}`);

    // =========================================================================
    // PASO 2: Guardar documento de entrega
    // =========================================================================

    const deliveryRecord = {
        delivery_id: deliveryId,
        tenant_id: tenantId,
        service_type: serviceType,
        service_name: serviceConfig.name_es,

        file: {
            path: pending.file_path,
            name: pending.original_file_name,
            size_bytes: parseInt(metadata.size),
            mime_type: pending.mime_type,
        },

        delivery_details: {
            delivered_at: admin.firestore.FieldValue.serverTimestamp(),
            delivered_by: context.auth.uid,
            valid_until: validUntil || null,
            employees_trained: employeesCount || null,
            notes: notes || null,
        },

        status: 'DELIVERED',
    };

    await db.collection('tenants').doc(tenantId).collection('service_deliveries').doc(deliveryId).set(deliveryRecord);

    // =========================================================================
    // PASO 3: Cerrar el Lead (CLOSED_WON)
    // =========================================================================

    if (leadId) {
        const leadRef = db.collection('admin_leads').doc(leadId);
        const leadDoc = await leadRef.get();

        if (leadDoc.exists) {
            await leadRef.update({
                status: 'CLOSED_WON',
                pipeline_stage: 'DELIVERED',
                closed_at: admin.firestore.FieldValue.serverTimestamp(),
                closed_by: context.auth.uid,
                delivery_id: deliveryId,
                interactions: admin.firestore.FieldValue.arrayUnion({
                    type: 'DELIVERED',
                    timestamp: new Date().toISOString(),
                    by: context.auth.uid,
                    notes: `Servicio entregado: ${serviceConfig.name_es}`,
                }),
            });

            console.log(`[ServiceDelivery] ✅ Lead ${leadId} cerrado como WON`);
        }
    }

    // Actualizar registro pendiente
    await db.collection('pending_deliveries').doc(deliveryId).update({
        status: 'completed',
        completed_at: admin.firestore.FieldValue.serverTimestamp(),
        file_size_actual: parseInt(metadata.size),
    });

    // =========================================================================
    // PASO 4: Notificar al cliente
    // =========================================================================

    if (sendNotification) {
        await notifyClientDelivery(tenant, serviceConfig, pending.file_path, deliveryId);
    }

    // =========================================================================
    // PASO 5: Log de auditoría
    // =========================================================================

    await db.collection('admin_actions').add({
        action: 'DELIVER_SERVICE',
        admin_id: context.auth.uid,
        tenant_id: tenantId,
        service_type: serviceType,
        delivery_id: deliveryId,
        lead_id: leadId || null,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[ServiceDelivery] ✅ Entrega completada: ${deliveryId}`);

    return {
        success: true,
        deliveryId,
        message: `✅ ${serviceConfig.name_es} entregado exitosamente a ${tenant.company_name}`,
        updates: {
            compliance_field: serviceConfig.compliance_field,
            new_value: true,
            lead_status: leadId ? 'CLOSED_WON' : null,
            notification_sent: sendNotification,
        },
    };
});

// ============================================================================
// FUNCIÓN: notifyClientDelivery
// Envía email al cliente notificando la entrega
// ============================================================================

async function notifyClientDelivery(tenant, serviceConfig, filePath, deliveryId) {
    try {
        const sgMail = require('@sendgrid/mail');
        const apiKey = functions.config().sendgrid?.api_key;

        if (!apiKey) {
            console.warn('[ServiceDelivery] SendGrid no configurado');
            return;
        }

        sgMail.setApiKey(apiKey);

        const recipientEmail = tenant.admin_email || tenant.email;
        if (!recipientEmail) {
            console.warn('[ServiceDelivery] Sin email de contacto');
            return;
        }

        const emailContent = {
            to: recipientEmail,
            from: { email: 'hola@bdunity.com', name: 'PLD BDU' },
            subject: `🎉 ${serviceConfig.notification_title}`,
            html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #059669, #10b981); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">🎉 ¡Entrega Completada!</h1>
          </div>
          
          <div style="background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0;">
            <p style="font-size: 16px; color: #334155;">
              Estimado equipo de <strong>${tenant.company_name}</strong>,
            </p>
            
            <div style="background: white; border: 2px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
              <h2 style="margin: 0 0 10px 0; color: #059669;">
                ✅ ${serviceConfig.name_es}
              </h2>
              <p style="margin: 0; color: #64748b;">
                ${serviceConfig.notification_body}
              </p>
            </div>
            
            <div style="background: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 15px 0; color: #059669;">¿Qué significa esto?</h3>
              <ul style="color: #334155; margin: 0; padding-left: 20px; line-height: 1.8;">
                <li>Tu estado de cumplimiento ha sido <strong>actualizado</strong></li>
                <li>El indicador ahora aparace en <strong style="color: #10b981;">verde ✓</strong></li>
                <li>Puedes descargar el documento desde tu Bóveda Digital</li>
              </ul>
            </div>
            
            <p style="text-align: center; margin: 30px 0;">
              <a href="https://bdunity.com/boveda-digital" 
                 style="display: inline-block; background: #10b981; color: white; 
                        padding: 15px 30px; border-radius: 8px; text-decoration: none;
                        font-weight: bold; font-size: 16px;">
                📥 Ir a mi Bóveda Digital
              </a>
            </p>
            
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;">
            
            <p style="color: #64748b; font-size: 14px;">
              Si tienes alguna pregunta sobre tu documento, no dudes en contactarnos:
            </p>
            
            <p style="text-align: center;">
              <a href="mailto:soporte@bdunity.com" style="color: #3b82f6;">
                soporte@bdunity.com
              </a>
            </p>
          </div>
          
          <div style="background: #334155; color: #94a3b8; padding: 20px; border-radius: 0 0 8px 8px; text-align: center; font-size: 12px;">
            © 2026 PLD BDU by BDUnity<br>
            <a href="https://bdunity.com" style="color: #60a5fa;">www.bdunity.com</a>
          </div>
        </div>
      `,
        };

        await sgMail.send(emailContent);

        // Guardar notificación interna para el cliente
        await db.collection('tenants').doc(tenant.tenant_id).collection('notifications').add({
            type: 'SERVICE_DELIVERED',
            title: serviceConfig.notification_title,
            message: serviceConfig.notification_body,
            icon: 'check-circle',
            color: 'green',
            read: false,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`[ServiceDelivery] ✅ Notificación enviada a ${recipientEmail}`);

    } catch (error) {
        console.error('[notifyClientDelivery] Error:', error);
    }
}

// ============================================================================
// CLOUD FUNCTION: listPendingDeliveries
// Lista entregas pendientes para el admin
// ============================================================================

exports.listPendingDeliveries = functions.https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.role !== 'SUPER_ADMIN') {
        throw new functions.https.HttpsError('permission-denied', 'Solo Super Admin');
    }

    const { status = 'all' } = data;

    let query = db.collection('admin_leads')
        .where('status', 'in', ['PENDING_QUOTE', 'QUOTED', 'ACCEPTED'])
        .orderBy('created_at', 'desc')
        .limit(50);

    const snapshot = await query.get();

    const leads = await Promise.all(snapshot.docs.map(async (doc) => {
        const lead = doc.data();

        // Obtener datos del tenant
        const tenantDoc = await db.collection('tenants').doc(lead.tenant_id).get();
        const tenant = tenantDoc.exists ? tenantDoc.data() : {};

        return {
            lead_id: doc.id,
            ...lead,
            tenant: {
                company_name: tenant.company_name,
                rfc: tenant.rfc,
                has_manual: tenant.has_manual || false,
                training_status: tenant[`training_${new Date().getFullYear()}_status`] || 'PENDING',
            },
        };
    }));

    return {
        success: true,
        leads,
        count: leads.length,
    };
});

// ============================================================================
// CLOUD FUNCTION: getClientComplianceDashboard
// Obtiene datos para el dashboard del cliente (reflejo en tiempo real)
// ============================================================================

exports.getClientComplianceDashboard = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
    }

    const tenantId = context.auth.token.tenantId || data.tenantId;

    const tenantDoc = await db.collection('tenants').doc(tenantId).get();

    if (!tenantDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Empresa no encontrada');
    }

    const tenant = tenantDoc.data();
    const currentYear = new Date().getFullYear();

    // Construir estado de cumplimiento para UI
    const complianceItems = [
        {
            id: 'manual_pld',
            label: 'Manual de Cumplimiento PLD',
            description: 'Art. 18 LFPIORPI',
            required: true,
            // ESTADO: ¿Tiene manual?
            status: tenant.has_manual ? 'COMPLETE' : 'MISSING',
            statusLabel: tenant.has_manual ? 'Completado' : 'Pendiente',
            statusColor: tenant.has_manual ? 'green' : 'red',
            icon: tenant.has_manual ? 'check-circle' : 'exclamation-triangle',
            // Detalles si está completado
            completedAt: tenant.manual_date || null,
            filePath: tenant.manual_file_path || null,
            // CTA si no está completado
            ctaLabel: tenant.has_manual ? 'Ver Manual' : 'Solicitar Manual',
            ctaAction: tenant.has_manual ? 'viewDocument' : 'requestService',
        },
        {
            id: 'capacitacion',
            label: `Capacitación Anual ${currentYear}`,
            description: 'Art. 19 Fracción V LFPIORPI',
            required: true,
            status: tenant[`training_${currentYear}_status`] === 'COMPLETE' ? 'COMPLETE' :
                tenant[`training_${currentYear}_status`] === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'MISSING',
            statusLabel: tenant[`training_${currentYear}_status`] === 'COMPLETE' ? 'Completada' :
                tenant[`training_${currentYear}_status`] === 'IN_PROGRESS' ? 'En progreso' : 'Pendiente',
            statusColor: tenant[`training_${currentYear}_status`] === 'COMPLETE' ? 'green' :
                tenant[`training_${currentYear}_status`] === 'IN_PROGRESS' ? 'yellow' : 'red',
            icon: tenant[`training_${currentYear}_status`] === 'COMPLETE' ? 'check-circle' :
                tenant[`training_${currentYear}_status`] === 'IN_PROGRESS' ? 'clock' : 'exclamation-triangle',
            completedAt: tenant[`training_${currentYear}_date`] || null,
            trainedCount: tenant[`training_${currentYear}_count`] || 0,
            ctaLabel: tenant[`training_${currentYear}_status`] === 'COMPLETE' ? 'Ver Constancias' : 'Solicitar Capacitación',
            ctaAction: tenant[`training_${currentYear}_status`] === 'COMPLETE' ? 'viewDocument' : 'requestService',
        },
    ];

    // Calcular porcentaje de cumplimiento
    const completedItems = complianceItems.filter(item => item.status === 'COMPLETE').length;
    const totalRequired = complianceItems.filter(item => item.required).length;
    const compliancePercent = Math.round((completedItems / totalRequired) * 100);

    // Obtener documentos disponibles en bóveda
    const deliveriesSnapshot = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('service_deliveries')
        .where('status', '==', 'DELIVERED')
        .orderBy('delivery_details.delivered_at', 'desc')
        .get();

    const documents = deliveriesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
    }));

    return {
        success: true,
        compliance: {
            items: complianceItems,
            completedCount: completedItems,
            totalRequired,
            percent: compliancePercent,
            overallStatus: compliancePercent === 100 ? 'COMPLETE' : compliancePercent >= 50 ? 'PARTIAL' : 'AT_RISK',
        },
        documents,
        lastUpdated: tenant.updated_at,
    };
});

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    SERVICE_TYPES,
    getDeliveryUploadUrl: exports.getDeliveryUploadUrl,
    deliverComplianceService: exports.deliverComplianceService,
    listPendingDeliveries: exports.listPendingDeliveries,
    getClientComplianceDashboard: exports.getClientComplianceDashboard,
};
