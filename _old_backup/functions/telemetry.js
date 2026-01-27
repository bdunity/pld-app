/**
 * PLD BDU - Sistema de Telemetría y Conteo de Uso
 * 
 * Firestore Triggers para actualizar contadores automáticamente.
 * Permite facturación precisa y auditoría de consumo por tenant.
 * 
 * Estructura de datos:
 * - tenants/{tenantId}/usage_stats/{YYYY-MM}: Uso mensual
 * - global_config/usage_summary/{YYYY-MM}: Resumen global (Super Admin)
 * - tenants/{tenantId}/usage_history/{YYYY-MM}: Archivo histórico
 * 
 * @version 2.0.0
 * @date 2026-01-25
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const db = admin.firestore();

// ============================================================================
// ESTRUCTURA DE usage_stats (Para referencia)
// Path: tenants/{tenantId}/usage_stats/{YYYY-MM}
// ============================================================================
/*
{
  // Identificadores
  tenant_id: "tenant_abc123",
  period: "2026-01",
  period_start: "2026-01-01T00:00:00Z",
  period_end: "2026-01-31T23:59:59Z",
  
  // Contadores principales
  records: {
    created: 4500,        // Registros nuevos creados
    updated: 1200,        // Registros actualizados
    deleted: 50,          // Registros eliminados
    imported: 3800,       // Registros vía importación batch
  },
  
  xmls: {
    generated: 12,        // XMLs generados
    downloaded: 8,        // XMLs descargados
    audited: 25,          // XMLs externos auditados
  },
  
  users: {
    active: 4,            // Usuarios activos en el periodo
    logins: 156,          // Total de inicios de sesión
    unique_logins: 45,    // Días únicos con login
  },
  
  storage: {
    uploads_count: 15,    // Archivos subidos
    uploads_mb: 125.5,    // MB subidos
    current_total_mb: 450 // Almacenamiento total actual
  },
  
  api: {
    calls: 0,             // Llamadas API (si aplica)
    errors: 0,            // Errores de API
  },
  
  // Metadatos
  plan_id: "plan_pro",
  billing_status: "current", // current | overdue | paid
  
  // Auditoría
  created_at: Timestamp,
  last_updated: Timestamp,
  last_activity_at: Timestamp,
  
  // Para gráficas (actividad diaria)
  daily_breakdown: {
    "2026-01-01": { records_created: 150, logins: 5 },
    "2026-01-02": { records_created: 200, logins: 4 },
    // ...
  }
}
*/

// ============================================================================
// TRIGGER 1: onRecordCreated
// Incrementa contadores cuando se crea un registro
// ============================================================================

exports.onRecordCreated = functions
    .runWith({ memory: '256MB' })
    .firestore.document('tenants/{tenantId}/workspaces/{workspaceId}/records/{recordId}')
    .onCreate(async (snapshot, context) => {
        const { tenantId, workspaceId, recordId } = context.params;
        const recordData = snapshot.data();

        console.log(`[Telemetry] Nuevo registro: ${recordId} en tenant ${tenantId}`);

        const currentMonth = new Date().toISOString().substring(0, 7);
        const today = new Date().toISOString().substring(0, 10);

        const usageRef = db
            .collection('tenants')
            .doc(tenantId)
            .collection('usage_stats')
            .doc(currentMonth);

        // Determinar si es importación batch o creación manual
        const isBatchImport = recordData.created_by === 'batch_import' ||
            recordData.batch_job_id != null;

        const updates = {
            tenant_id: tenantId,
            period: currentMonth,
            'records.created': admin.firestore.FieldValue.increment(1),
            last_updated: admin.firestore.FieldValue.serverTimestamp(),
            last_activity_at: admin.firestore.FieldValue.serverTimestamp(),
            [`daily_breakdown.${today}.records_created`]: admin.firestore.FieldValue.increment(1),
        };

        if (isBatchImport) {
            updates['records.imported'] = admin.firestore.FieldValue.increment(1);
        }

        await usageRef.set(updates, { merge: true });

        // Actualizar resumen global para Super Admin
        await updateGlobalSummary(tenantId, currentMonth, 'records_created', 1);

        console.log(`[Telemetry] ✅ Contador actualizado para ${tenantId}`);
    });

// ============================================================================
// TRIGGER 2: onRecordUpdated
// Registra actualizaciones de registros
// ============================================================================

exports.onRecordUpdated = functions
    .runWith({ memory: '256MB' })
    .firestore.document('tenants/{tenantId}/workspaces/{workspaceId}/records/{recordId}')
    .onUpdate(async (change, context) => {
        const { tenantId } = context.params;

        const currentMonth = new Date().toISOString().substring(0, 7);

        const usageRef = db
            .collection('tenants')
            .doc(tenantId)
            .collection('usage_stats')
            .doc(currentMonth);

        await usageRef.set({
            tenant_id: tenantId,
            period: currentMonth,
            'records.updated': admin.firestore.FieldValue.increment(1),
            last_updated: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    });

// ============================================================================
// TRIGGER 3: onRecordDeleted
// Registra eliminaciones
// ============================================================================

exports.onRecordDeleted = functions
    .runWith({ memory: '256MB' })
    .firestore.document('tenants/{tenantId}/workspaces/{workspaceId}/records/{recordId}')
    .onDelete(async (snapshot, context) => {
        const { tenantId } = context.params;

        const currentMonth = new Date().toISOString().substring(0, 7);

        const usageRef = db
            .collection('tenants')
            .doc(tenantId)
            .collection('usage_stats')
            .doc(currentMonth);

        await usageRef.set({
            tenant_id: tenantId,
            period: currentMonth,
            'records.deleted': admin.firestore.FieldValue.increment(1),
            last_updated: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    });

// ============================================================================
// TRIGGER 4: onXMLGenerated
// Incrementa contador cuando se genera un reporte XML
// ============================================================================

exports.onXMLGenerated = functions
    .runWith({ memory: '256MB' })
    .firestore.document('tenants/{tenantId}/generated_reports/{reportId}')
    .onCreate(async (snapshot, context) => {
        const { tenantId, reportId } = context.params;
        const reportData = snapshot.data();

        console.log(`[Telemetry] Nuevo XML: ${reportId} en tenant ${tenantId}`);

        const currentMonth = new Date().toISOString().substring(0, 7);
        const today = new Date().toISOString().substring(0, 10);

        const usageRef = db
            .collection('tenants')
            .doc(tenantId)
            .collection('usage_stats')
            .doc(currentMonth);

        await usageRef.set({
            tenant_id: tenantId,
            period: currentMonth,
            'xmls.generated': admin.firestore.FieldValue.increment(1),
            last_updated: admin.firestore.FieldValue.serverTimestamp(),
            last_activity_at: admin.firestore.FieldValue.serverTimestamp(),
            [`daily_breakdown.${today}.xmls_generated`]: admin.firestore.FieldValue.increment(1),
        }, { merge: true });

        // Actualizar resumen global
        await updateGlobalSummary(tenantId, currentMonth, 'xmls_generated', 1);

        console.log(`[Telemetry] ✅ XML contabilizado para ${tenantId}`);
    });

// ============================================================================
// TRIGGER 5: onXMLDownloaded
// Registra descargas de XMLs
// ============================================================================

exports.onXMLDownloaded = functions
    .runWith({ memory: '256MB' })
    .firestore.document('tenants/{tenantId}/generated_reports/{reportId}')
    .onUpdate(async (change, context) => {
        const { tenantId } = context.params;
        const before = change.before.data();
        const after = change.after.data();

        // Solo contar si cambió el download_count
        if (after.download_count > before.download_count) {
            const currentMonth = new Date().toISOString().substring(0, 7);

            const usageRef = db
                .collection('tenants')
                .doc(tenantId)
                .collection('usage_stats')
                .doc(currentMonth);

            await usageRef.set({
                tenant_id: tenantId,
                period: currentMonth,
                'xmls.downloaded': admin.firestore.FieldValue.increment(1),
                last_updated: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
    });

// ============================================================================
// TRIGGER 6: onUserLogin
// Registra inicios de sesión (llamado desde auth.js del cliente)
// ============================================================================

exports.trackUserLogin = functions.https.onCall(async (data, context) => {
    if (!context.auth) return { success: false };

    const tenantId = context.auth.token.tenantId;
    if (!tenantId) return { success: false };

    const currentMonth = new Date().toISOString().substring(0, 7);
    const today = new Date().toISOString().substring(0, 10);

    const usageRef = db
        .collection('tenants')
        .doc(tenantId)
        .collection('usage_stats')
        .doc(currentMonth);

    await usageRef.set({
        tenant_id: tenantId,
        period: currentMonth,
        'users.logins': admin.firestore.FieldValue.increment(1),
        last_activity_at: admin.firestore.FieldValue.serverTimestamp(),
        [`daily_breakdown.${today}.logins`]: admin.firestore.FieldValue.increment(1),
        [`users.active_users.${context.auth.uid}`]: true,
    }, { merge: true });

    return { success: true };
});

// ============================================================================
// SCHEDULED FUNCTION: Monthly Reset
// Corre el día 1 de cada mes a las 00:05
// ============================================================================

exports.monthlyUsageReset = functions.pubsub
    .schedule('5 0 1 * *') // Cron: 00:05 del día 1 de cada mes
    .timeZone('America/Mexico_City')
    .onRun(async (context) => {
        console.log('[MonthlyReset] Iniciando reset mensual de contadores...');

        const now = new Date();
        const currentMonth = now.toISOString().substring(0, 7);

        // Calcular mes anterior
        const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const previousMonthStr = previousMonth.toISOString().substring(0, 7);

        console.log(`[MonthlyReset] Archivando: ${previousMonthStr}, Iniciando: ${currentMonth}`);

        try {
            // Obtener todos los tenants activos
            const tenantsSnapshot = await db
                .collection('tenants')
                .where('status', '==', 'active')
                .get();

            let processed = 0;
            let errors = 0;

            for (const tenantDoc of tenantsSnapshot.docs) {
                const tenantId = tenantDoc.id;

                try {
                    await processMonthlyReset(tenantId, previousMonthStr, currentMonth);
                    processed++;
                } catch (error) {
                    console.error(`[MonthlyReset] Error en tenant ${tenantId}:`, error);
                    errors++;
                }
            }

            // Generar resumen global del mes
            await generateGlobalMonthlyReport(previousMonthStr);

            console.log(`[MonthlyReset] ✅ Completado: ${processed} tenants, ${errors} errores`);

            // Notificar a Super Admins
            await db.collection('admin_notifications').add({
                type: 'MONTHLY_RESET_COMPLETE',
                title: 'Reset Mensual Completado',
                message: `Se procesaron ${processed} empresas para el periodo ${previousMonthStr}`,
                created_at: admin.firestore.FieldValue.serverTimestamp(),
            });

        } catch (error) {
            console.error('[MonthlyReset] Error general:', error);
        }

        return null;
    });

/**
 * Procesa el reset mensual para un tenant específico
 */
async function processMonthlyReset(tenantId, previousMonth, currentMonth) {
    const previousUsageRef = db
        .collection('tenants')
        .doc(tenantId)
        .collection('usage_stats')
        .doc(previousMonth);

    const previousDoc = await previousUsageRef.get();

    if (previousDoc.exists) {
        const previousData = previousDoc.data();

        // Archivar en historial
        await db
            .collection('tenants')
            .doc(tenantId)
            .collection('usage_history')
            .doc(previousMonth)
            .set({
                ...previousData,
                archived_at: admin.firestore.FieldValue.serverTimestamp(),
                billing_period_closed: true,
            });

        // Marcar como cerrado
        await previousUsageRef.update({
            billing_status: 'closed',
            closed_at: admin.firestore.FieldValue.serverTimestamp(),
        });
    }

    // Obtener datos del tenant para el nuevo periodo
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    const tenantData = tenantDoc.data();

    // Crear documento del nuevo mes
    const newMonthRef = db
        .collection('tenants')
        .doc(tenantId)
        .collection('usage_stats')
        .doc(currentMonth);

    await newMonthRef.set({
        tenant_id: tenantId,
        period: currentMonth,
        period_start: `${currentMonth}-01T00:00:00Z`,
        period_end: getMonthEnd(currentMonth),

        records: { created: 0, updated: 0, deleted: 0, imported: 0 },
        xmls: { generated: 0, downloaded: 0, audited: 0 },
        users: { active: 0, logins: 0, unique_logins: 0, active_users: {} },
        storage: { uploads_count: 0, uploads_mb: 0, current_total_mb: tenantData.storage_used_mb || 0 },
        api: { calls: 0, errors: 0 },

        plan_id: tenantData.subscription?.plan_id,
        billing_status: 'current',
        daily_breakdown: {},

        created_at: admin.firestore.FieldValue.serverTimestamp(),
        last_updated: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[MonthlyReset] Tenant ${tenantId} reseteado`);
}

/**
 * Genera reporte global del mes para Super Admin
 */
async function generateGlobalMonthlyReport(month) {
    const summary = {
        period: month,

        totals: {
            active_tenants: 0,
            total_records_created: 0,
            total_xmls_generated: 0,
            total_logins: 0,
        },

        top_consumers: {
            by_records: [],
            by_xmls: [],
            by_logins: [],
        },

        plan_distribution: {
            plan_demo: 0,
            plan_pro: 0,
            plan_enterprise: 0,
        },

        generated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Recolectar datos de todos los tenants
    const tenantsSnapshot = await db.collection('tenants').get();
    const tenantUsage = [];

    for (const tenantDoc of tenantsSnapshot.docs) {
        const tenantId = tenantDoc.id;
        const tenantData = tenantDoc.data();

        if (tenantData.status !== 'active') continue;

        summary.totals.active_tenants++;

        // Contar por plan
        const planId = tenantData.subscription?.plan_id || 'plan_demo';
        if (summary.plan_distribution[planId] !== undefined) {
            summary.plan_distribution[planId]++;
        }

        // Obtener uso del mes
        const usageDoc = await db
            .collection('tenants')
            .doc(tenantId)
            .collection('usage_stats')
            .doc(month)
            .get();

        if (usageDoc.exists) {
            const usage = usageDoc.data();

            const recordsCreated = usage.records?.created || 0;
            const xmlsGenerated = usage.xmls?.generated || 0;
            const logins = usage.users?.logins || 0;

            summary.totals.total_records_created += recordsCreated;
            summary.totals.total_xmls_generated += xmlsGenerated;
            summary.totals.total_logins += logins;

            tenantUsage.push({
                tenant_id: tenantId,
                company_name: tenantData.company_name,
                plan_id: planId,
                records_created: recordsCreated,
                xmls_generated: xmlsGenerated,
                logins: logins,
            });
        }
    }

    // Top consumers
    summary.top_consumers.by_records = [...tenantUsage]
        .sort((a, b) => b.records_created - a.records_created)
        .slice(0, 10);

    summary.top_consumers.by_xmls = [...tenantUsage]
        .sort((a, b) => b.xmls_generated - a.xmls_generated)
        .slice(0, 10);

    summary.top_consumers.by_logins = [...tenantUsage]
        .sort((a, b) => b.logins - a.logins)
        .slice(0, 10);

    // Guardar resumen global
    await db
        .collection('global_config')
        .doc('usage_summary')
        .collection('monthly')
        .doc(month)
        .set(summary);

    console.log(`[generateGlobalMonthlyReport] Reporte global generado para ${month}`);
}

/**
 * Actualiza resumen global en tiempo real
 */
async function updateGlobalSummary(tenantId, month, metric, amount) {
    const summaryRef = db
        .collection('global_config')
        .doc('usage_summary')
        .collection('monthly')
        .doc(month);

    await summaryRef.set({
        period: month,
        [`totals.${metric}`]: admin.firestore.FieldValue.increment(amount),
        last_updated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
}

/**
 * Obtiene el último día del mes
 */
function getMonthEnd(month) {
    const [year, monthNum] = month.split('-').map(Number);
    const lastDay = new Date(year, monthNum, 0).getDate();
    return `${month}-${String(lastDay).padStart(2, '0')}T23:59:59Z`;
}

// ============================================================================
// FUNCIÓN AUXILIAR: getUsageStatsForAdmin
// Para dashboard de Super Admin
// ============================================================================

exports.getUsageStatsForAdmin = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
    }

    const callerRole = context.auth.token.role;
    if (callerRole !== 'SUPER_ADMIN') {
        throw new functions.https.HttpsError('permission-denied', 'Solo Super Admin');
    }

    const { month } = data;
    const targetMonth = month || new Date().toISOString().substring(0, 7);

    // Obtener resumen global
    const summaryDoc = await db
        .collection('global_config')
        .doc('usage_summary')
        .collection('monthly')
        .doc(targetMonth)
        .get();

    if (!summaryDoc.exists) {
        return { period: targetMonth, data: null, message: 'No hay datos para este periodo' };
    }

    return {
        period: targetMonth,
        data: summaryDoc.data(),
    };
});

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    // Triggers
    onRecordCreated: exports.onRecordCreated,
    onRecordUpdated: exports.onRecordUpdated,
    onRecordDeleted: exports.onRecordDeleted,
    onXMLGenerated: exports.onXMLGenerated,
    onXMLDownloaded: exports.onXMLDownloaded,
    trackUserLogin: exports.trackUserLogin,

    // Scheduled
    monthlyUsageReset: exports.monthlyUsageReset,

    // Admin
    getUsageStatsForAdmin: exports.getUsageStatsForAdmin,
};
