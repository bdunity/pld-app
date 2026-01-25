/**
 * PLD BDU - Cloud Functions para Super Admin
 * 
 * Funciones exclusivas del panel de administración.
 * 
 * @version 2.0.0
 * @date 2026-01-25
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const db = admin.firestore();

// ============================================================================
// FUNCIÓN: getAdminDashboardData
// Obtiene todos los KPIs para el dashboard
// ============================================================================

exports.getAdminDashboardData = functions.https.onCall(async (data, context) => {
    // Validar Super Admin
    if (!context.auth || context.auth.token.role !== 'SUPER_ADMIN') {
        throw new functions.https.HttpsError('permission-denied', 'Solo Super Admin');
    }

    console.log('[AdminDashboard] Obteniendo KPIs...');

    const currentMonth = new Date().toISOString().substring(0, 7);

    // Ejecutar queries en paralelo
    const [
        activeTenantsSnapshot,
        trialTenantsSnapshot,
        expiredTenantsSnapshot,
        totalUsersSnapshot,
        alertsSnapshot,
        usageSummaryDoc,
        tenantsForMRR,
    ] = await Promise.all([
        // Tenants activos
        db.collection('tenants')
            .where('status', '==', 'active')
            .count().get(),

        // Tenants en trial
        db.collection('tenants')
            .where('subscription.status', '==', 'TRIAL')
            .count().get(),

        // Tenants expirados
        db.collection('tenants')
            .where('subscription.status', '==', 'EXPIRED')
            .count().get(),

        // Total usuarios
        db.collection('users')
            .where('status', '==', 'active')
            .count().get(),

        // Alertas pendientes
        db.collection('admin_notifications')
            .where('status', '==', 'pending')
            .count().get(),

        // Resumen de uso del mes
        db.collection('global_config')
            .doc('usage_summary')
            .collection('monthly')
            .doc(currentMonth)
            .get(),

        // Tenants para calcular MRR
        db.collection('tenants')
            .where('subscription.status', '==', 'ACTIVE')
            .select('subscription.plan_id', 'subscription.billing_cycle')
            .get(),
    ]);

    // Calcular MRR
    let mrr = 0;
    const planPrices = {
        plan_demo: 0,
        plan_pro: 2499,
        plan_enterprise: 9999, // Promedio estimado
    };

    tenantsForMRR.docs.forEach(doc => {
        const sub = doc.data().subscription;
        const price = planPrices[sub?.plan_id] || 0;

        if (sub?.billing_cycle === 'YEARLY') {
            mrr += price * 0.83; // Descuento anual = 17%
        } else {
            mrr += price;
        }
    });

    // Obtener datos de uso
    const usageData = usageSummaryDoc.exists ? usageSummaryDoc.data() : {};

    return {
        period: currentMonth,

        kpis: {
            active_tenants: activeTenantsSnapshot.data().count,
            trial_tenants: trialTenantsSnapshot.data().count,
            expired_tenants: expiredTenantsSnapshot.data().count,
            total_users: totalUsersSnapshot.data().count,
            system_alerts: alertsSnapshot.data().count,
            mrr: Math.round(mrr),

            records_created: usageData.totals?.total_records_created || 0,
            xmls_generated: usageData.totals?.total_xmls_generated || 0,
            total_logins: usageData.totals?.total_logins || 0,
        },

        top_consumers: usageData.top_consumers || {},
        plan_distribution: usageData.plan_distribution || {},

        last_updated: new Date().toISOString(),
    };
});

// ============================================================================
// FUNCIÓN: listTenantsForAdmin
// Lista todos los tenants con datos para la tabla
// ============================================================================

exports.listTenantsForAdmin = functions.https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.role !== 'SUPER_ADMIN') {
        throw new functions.https.HttpsError('permission-denied', 'Solo Super Admin');
    }

    const {
        limit = 50,
        startAfter,
        orderBy = 'created_at',
        orderDir = 'desc',
        filters = {},
    } = data;

    let query = db.collection('tenants');

    // Aplicar filtros
    if (filters.status && filters.status !== 'all') {
        query = query.where('status', '==', filters.status);
    }

    if (filters.plan && filters.plan !== 'all') {
        query = query.where('subscription.plan_id', '==', filters.plan);
    }

    // Ordenar
    query = query.orderBy(orderBy, orderDir);

    // Paginación
    if (startAfter) {
        const startDoc = await db.collection('tenants').doc(startAfter).get();
        if (startDoc.exists) {
            query = query.startAfter(startDoc);
        }
    }

    query = query.limit(limit);

    const snapshot = await query.get();

    const tenants = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data();

        // Obtener uso actual
        const currentMonth = new Date().toISOString().substring(0, 7);
        const usageDoc = await db
            .collection('tenants')
            .doc(doc.id)
            .collection('usage_stats')
            .doc(currentMonth)
            .get();

        const usage = usageDoc.exists ? usageDoc.data() : {};

        return {
            id: doc.id,
            company_name: data.company_name,
            rfc: data.rfc,
            email: data.admin_email,
            status: data.status,
            subscription: {
                plan_id: data.subscription?.plan_id,
                status: data.subscription?.status,
                current_period_end: data.subscription?.current_period_end,
                billing_cycle: data.subscription?.billing_cycle,
            },
            current_usage: {
                records_count: usage.records?.created || 0,
                xmls_count: usage.xmls?.generated || 0,
            },
            created_at: data.created_at,
        };
    }));

    return {
        tenants,
        hasMore: tenants.length === limit,
        nextCursor: tenants.length > 0 ? tenants[tenants.length - 1].id : null,
    };
});

// ============================================================================
// FUNCIÓN: suspendTenant
// Suspende un tenant inmediatamente
// ============================================================================

exports.suspendTenant = functions.https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.role !== 'SUPER_ADMIN') {
        throw new functions.https.HttpsError('permission-denied', 'Solo Super Admin');
    }

    const { tenantId, reason } = data;

    if (!tenantId) {
        throw new functions.https.HttpsError('invalid-argument', 'Falta tenantId');
    }

    console.log(`[Admin] Suspendiendo tenant: ${tenantId}`);

    // Actualizar tenant
    await db.collection('tenants').doc(tenantId).update({
        status: 'suspended',
        'subscription.status': 'SUSPENDED',
        suspended_at: admin.firestore.FieldValue.serverTimestamp(),
        suspended_by: context.auth.uid,
        suspension_reason: reason || 'Suspendido por administrador',
    });

    // Desactivar todos los usuarios del tenant
    const usersSnapshot = await db
        .collection('users')
        .where('tenant_id', '==', tenantId)
        .get();

    const batch = db.batch();
    usersSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { status: 'suspended' });
    });
    await batch.commit();

    // Log
    await db.collection('admin_actions').add({
        action: 'SUSPEND_TENANT',
        tenant_id: tenantId,
        admin_id: context.auth.uid,
        reason,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
        success: true,
        message: `Tenant suspendido. ${usersSnapshot.size} usuarios desactivados.`,
    };
});

// ============================================================================
// FUNCIÓN: reactivateTenant
// Reactiva un tenant suspendido
// ============================================================================

exports.reactivateTenant = functions.https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.role !== 'SUPER_ADMIN') {
        throw new functions.https.HttpsError('permission-denied', 'Solo Super Admin');
    }

    const { tenantId, extendDays = 0 } = data;

    const tenantRef = db.collection('tenants').doc(tenantId);
    const tenantDoc = await tenantRef.get();

    if (!tenantDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Tenant no encontrado');
    }

    // Calcular nueva fecha de vencimiento
    let newPeriodEnd = new Date();
    if (extendDays > 0) {
        newPeriodEnd.setDate(newPeriodEnd.getDate() + extendDays);
    } else {
        newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
    }

    await tenantRef.update({
        status: 'active',
        'subscription.status': 'ACTIVE',
        'subscription.current_period_end': newPeriodEnd.toISOString(),
        reactivated_at: admin.firestore.FieldValue.serverTimestamp(),
        reactivated_by: context.auth.uid,
    });

    // Reactivar usuarios
    const usersSnapshot = await db
        .collection('users')
        .where('tenant_id', '==', tenantId)
        .where('status', '==', 'suspended')
        .get();

    const batch = db.batch();
    usersSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { status: 'active' });
    });
    await batch.commit();

    return {
        success: true,
        message: `Tenant reactivado hasta ${newPeriodEnd.toLocaleDateString('es-MX')}.`,
    };
});

// ============================================================================
// FUNCIÓN: updatePlan
// Actualiza configuración de un plan
// ============================================================================

exports.updatePlan = functions.https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.role !== 'SUPER_ADMIN') {
        throw new functions.https.HttpsError('permission-denied', 'Solo Super Admin');
    }

    const { planId, updates } = data;

    if (!planId || !updates) {
        throw new functions.https.HttpsError('invalid-argument', 'Faltan parámetros');
    }

    console.log(`[Admin] Actualizando plan: ${planId}`);

    // Validar que el plan existe
    const planRef = db.collection('global_config').doc(planId);
    const planDoc = await planRef.get();

    if (!planDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Plan no encontrado');
    }

    // Guardar versión anterior
    const previousData = planDoc.data();
    await db.collection('global_config').doc(planId).collection('history').add({
        ...previousData,
        archived_at: admin.firestore.FieldValue.serverTimestamp(),
        archived_by: context.auth.uid,
    });

    // Aplicar actualizaciones
    await planRef.update({
        ...updates,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_by: context.auth.uid,
    });

    // Log
    await db.collection('admin_actions').add({
        action: 'UPDATE_PLAN',
        plan_id: planId,
        changes: updates,
        admin_id: context.auth.uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
        success: true,
        message: `Plan ${planId} actualizado exitosamente.`,
    };
});

// ============================================================================
// FUNCIÓN: createTenant
// Crea un nuevo tenant con su configuración inicial
// ============================================================================

exports.createTenant = functions.https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.role !== 'SUPER_ADMIN') {
        throw new functions.https.HttpsError('permission-denied', 'Solo Super Admin');
    }

    const {
        company_name,
        rfc,
        admin_email,
        admin_name,
        plan_id = 'plan_demo',
        trial_days = 30,
    } = data;

    // Validar RFC único
    const existingRFC = await db
        .collection('tenants')
        .where('rfc', '==', rfc.toUpperCase())
        .limit(1)
        .get();

    if (!existingRFC.empty) {
        throw new functions.https.HttpsError('already-exists', 'Ya existe una empresa con ese RFC');
    }

    // Generar ID
    const tenantId = `tenant_${Date.now()}`;

    // Calcular fecha de trial
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + trial_days);

    // Crear tenant
    const tenantData = {
        tenant_id: tenantId,
        company_name,
        rfc: rfc.toUpperCase(),
        admin_email,
        status: 'active',

        subscription: {
            plan_id,
            status: plan_id === 'plan_demo' ? 'TRIAL' : 'ACTIVE',
            trial_end: trialEnd.toISOString(),
            current_period_start: new Date().toISOString(),
            current_period_end: trialEnd.toISOString(),
            billing_cycle: 'MONTHLY',
        },

        settings: {
            timezone: 'America/Mexico_City',
            language: 'es-MX',
        },

        created_at: admin.firestore.FieldValue.serverTimestamp(),
        created_by: context.auth.uid,
        onboarded_by: 'admin_manual',
    };

    await db.collection('tenants').doc(tenantId).set(tenantData);

    console.log(`[Admin] Tenant creado: ${tenantId}`);

    return {
        success: true,
        tenant_id: tenantId,
        message: `Empresa "${company_name}" creada exitosamente.`,
        nextSteps: [
            `1. Crear usuario admin: ${admin_email}`,
            `2. El trial vence: ${trialEnd.toLocaleDateString('es-MX')}`,
        ],
    };
});

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    getAdminDashboardData: exports.getAdminDashboardData,
    listTenantsForAdmin: exports.listTenantsForAdmin,
    suspendTenant: exports.suspendTenant,
    reactivateTenant: exports.reactivateTenant,
    updatePlan: exports.updatePlan,
    createTenant: exports.createTenant,
};
