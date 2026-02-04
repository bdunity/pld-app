/**
 * PLD BDU - Sistema de Suscripciones y Límites
 * 
 * Arquitectura de planes SaaS B2B con límites flexibles.
 * Los límites pueden definirse a nivel de plan o sobrescribirse
 * por cliente específico (custom_limits).
 * 
 * Estructura:
 * - global_config/plans/{plan_id}: Definición de planes
 * - tenants/{tenant_id}.subscription: Suscripción activa
 * - tenants/{tenant_id}/usage/{month}: Uso mensual
 * 
 * @version 2.0.0
 * @date 2026-01-25
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const db = admin.firestore();

// ============================================================================
// DEFINICIÓN DE PLANES (Para seed inicial en Firestore)
// Path: global_config/plans/{plan_id}
// ============================================================================

const SUBSCRIPTION_PLANS = {

    // ---------------------------------------------------------------------------
    // PLAN DEMO - Prueba gratuita 30 días
    // ---------------------------------------------------------------------------
    plan_demo: {
        plan_id: 'plan_demo',
        name_es: 'Demo',
        name_en: 'Demo',
        description_es: 'Prueba gratuita por 30 días. Ideal para conocer la plataforma.',

        // Tipo de plan
        type: 'TRIAL',
        is_free: true,

        // Precios (cuando aplique)
        pricing: {
            currency: 'MXN',
            monthly: 0,
            yearly: 0,
            setup_fee: 0,
        },

        // Duración del periodo de prueba
        trial_days: 30,

        // -------------------------------------------------------------------------
        // LÍMITES DEL PLAN
        // -1 = Sin límite (infinito)
        // -------------------------------------------------------------------------
        limits: {
            // Usuarios
            max_users: 1,              // Solo 1 usuario
            max_admins: 1,             // Solo 1 admin

            // Registros/Operaciones
            max_records_month: 100,    // 100 registros por mes
            max_records_total: 500,    // 500 registros totales en la prueba

            // XMLs/Reportes
            max_xmls_month: 5,         // 5 XMLs por mes
            max_xmls_total: 10,        // 10 XMLs totales

            // Workspaces
            max_workspaces: 1,         // Solo 1 espacio de trabajo

            // Storage (MB)
            max_storage_mb: 100,       // 100 MB de almacenamiento

            // API (si aplica)
            max_api_calls_day: 100,    // 100 llamadas API por día
        },

        // -------------------------------------------------------------------------
        // MÓDULOS PERMITIDOS (Actividades Vulnerables)
        // -------------------------------------------------------------------------
        allowed_modules: [
            'INMUEBLES',               // Solo inmuebles en demo
        ],

        // -------------------------------------------------------------------------
        // FEATURES/CAPACIDADES
        // -------------------------------------------------------------------------
        features: {
            xml_generation: true,
            xml_validation: true,
            risk_scoring: true,
            batch_import: false,       // Sin importación masiva en demo
            api_access: false,         // Sin acceso API
            priority_support: false,
            custom_branding: false,
            audit_logs: false,
            advanced_reports: false,
            multi_workspace: false,
        },

        // Orden de display
        display_order: 1,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-25T00:00:00Z',
    },

    // ---------------------------------------------------------------------------
    // PLAN PRO - Para PyMEs
    // ---------------------------------------------------------------------------
    plan_pro: {
        plan_id: 'plan_pro',
        name_es: 'Profesional',
        name_en: 'Pro',
        description_es: 'Para pequeñas y medianas empresas. Incluye todas las actividades vulnerables.',

        type: 'PAID',
        is_free: false,
        is_popular: true, // Marcar como "Más Popular"

        pricing: {
            currency: 'MXN',
            monthly: 2499,             // $2,499 MXN/mes
            yearly: 24990,             // $24,990 MXN/año (2 meses gratis)
            yearly_discount_percent: 17,
            setup_fee: 0,
            per_user_monthly: 0,       // Incluido en el precio
        },

        limits: {
            max_users: 5,
            max_admins: 2,
            max_records_month: 5000,
            max_records_total: -1,     // Sin límite total
            max_xmls_month: 50,
            max_xmls_total: -1,
            max_workspaces: 3,
            max_storage_mb: 5120,      // 5 GB
            max_api_calls_day: 1000,
        },

        allowed_modules: ['ALL'],    // Todas las actividades

        features: {
            xml_generation: true,
            xml_validation: true,
            risk_scoring: true,
            batch_import: true,
            api_access: false,
            priority_support: false,
            custom_branding: false,
            audit_logs: true,
            advanced_reports: true,
            multi_workspace: true,
        },

        display_order: 2,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-25T00:00:00Z',
    },

    // ---------------------------------------------------------------------------
    // PLAN ENTERPRISE - Para grandes empresas
    // ---------------------------------------------------------------------------
    plan_enterprise: {
        plan_id: 'plan_enterprise',
        name_es: 'Enterprise',
        name_en: 'Enterprise',
        description_es: 'Para grandes corporativos y grupos empresariales. Límites ilimitados y soporte VIP.',

        type: 'PAID',
        is_free: false,
        requires_contact: true,      // Requiere contactar a ventas

        pricing: {
            currency: 'MXN',
            monthly: null,             // Precio personalizado
            yearly: null,
            custom_pricing: true,
            starting_at: 9999,         // "Desde $9,999 MXN/mes"
        },

        limits: {
            max_users: -1,             // Sin límite
            max_admins: -1,
            max_records_month: -1,
            max_records_total: -1,
            max_xmls_month: -1,
            max_xmls_total: -1,
            max_workspaces: -1,
            max_storage_mb: -1,
            max_api_calls_day: -1,
        },

        allowed_modules: ['ALL'],

        features: {
            xml_generation: true,
            xml_validation: true,
            risk_scoring: true,
            batch_import: true,
            api_access: true,
            priority_support: true,
            custom_branding: true,
            audit_logs: true,
            advanced_reports: true,
            multi_workspace: true,
            dedicated_support: true,
            sla_guarantee: true,
            on_premise_option: true,
        },

        // SLA
        sla: {
            uptime_guarantee: 99.9,
            response_time_hours: 4,
            dedicated_account_manager: true,
        },

        display_order: 3,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-25T00:00:00Z',
    },
};

// ============================================================================
// EJEMPLO: SUSCRIPCIÓN DE UN TENANT (Custom Limits)
// Path: tenants/{tenant_id}
// ============================================================================

const EXAMPLE_TENANT_WITH_CUSTOM_LIMITS = {
    tenant_id: 'tenant_abc123',
    company_name: 'Inmobiliaria Premium SA de CV',
    rfc: 'IPR201025XY9',

    // ... otros campos del tenant ...

    // -------------------------------------------------------------------------
    // SUSCRIPCIÓN ACTIVA
    // -------------------------------------------------------------------------
    subscription: {
        // Plan base
        plan_id: 'plan_pro',

        // Estado de la suscripción
        status: 'ACTIVE', // ACTIVE | TRIAL | PAST_DUE | CANCELLED | EXPIRED

        // Fechas
        started_at: '2026-01-01T00:00:00Z',
        current_period_start: '2026-01-01T00:00:00Z',
        current_period_end: '2026-01-31T23:59:59Z',
        trial_end: null, // Solo para trials
        cancelled_at: null,

        // Facturación
        billing_cycle: 'MONTHLY', // MONTHLY | YEARLY
        next_billing_date: '2026-02-01T00:00:00Z',
        payment_method: 'STRIPE', // STRIPE | INVOICE | WIRE_TRANSFER
        stripe_customer_id: 'cus_xxx123',
        stripe_subscription_id: 'sub_xxx456',

        // -------------------------------------------------------------------------
        // LÍMITES PERSONALIZADOS (Sobrescriben el plan base)
        // Este cliente negoció más usuarios
        // -------------------------------------------------------------------------
        custom_limits: {
            max_users: 10,             // 10 en lugar de 5 del plan Pro
            max_workspaces: 5,         // 5 en lugar de 3 del plan Pro
            // Los demás límites se heredan del plan Pro
        },

        // Notas internas
        internal_notes: 'Cliente VIP - Aprobado por Dirección Comercial',
        approved_by: 'admin_user_id',
        approved_at: '2025-12-20T00:00:00Z',
    },

    // -------------------------------------------------------------------------
    // USO ACTUAL DEL PERIODO
    // -------------------------------------------------------------------------
    current_usage: {
        period: '2026-01',
        users_count: 7,
        records_count: 2340,
        xmls_generated: 12,
        storage_used_mb: 450,
        api_calls: 0,
        last_updated: '2026-01-25T13:00:00Z',
    },
};

// ============================================================================
// CLOUD FUNCTION: checkUsageLimits
// Verifica si un tenant puede realizar una acción según sus límites
// ============================================================================

/**
 * Verifica si el tenant tiene capacidad para realizar una acción.
 * 
 * @param {Object} data
 * @param {string} data.tenantId - ID del tenant
 * @param {string} data.action - Acción a verificar (CREATE_USER, CREATE_RECORD, GENERATE_XML, etc.)
 * @param {number} data.quantity - Cantidad a agregar (default: 1)
 */
exports.checkUsageLimits = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
    }

    const { tenantId, action, quantity = 1 } = data;

    if (!tenantId || !action) {
        throw new functions.https.HttpsError('invalid-argument', 'Faltan parámetros');
    }

    // Obtener datos del tenant
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();

    if (!tenantDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Tenant no encontrado');
    }

    const tenant = tenantDoc.data();
    const subscription = tenant.subscription;

    // Verificar estado de suscripción
    if (!subscription || subscription.status !== 'ACTIVE') {
        if (subscription?.status === 'TRIAL') {
            // Verificar si el trial expiró
            const trialEnd = new Date(subscription.trial_end || subscription.current_period_end);
            if (trialEnd < new Date()) {
                return {
                    allowed: false,
                    reason: 'TRIAL_EXPIRED',
                    message: 'Tu periodo de prueba ha expirado. Por favor, selecciona un plan para continuar.',
                };
            }
        } else {
            return {
                allowed: false,
                reason: 'SUBSCRIPTION_INACTIVE',
                message: 'Tu suscripción no está activa. Contacta a soporte.',
            };
        }
    }

    // Obtener plan base
    const planDoc = await db
        .collection('global_config')
        .doc('plans')
        .collection('available')
        .doc(subscription.plan_id)
        .get();

    if (!planDoc.exists) {
        // Fallback: buscar en la estructura alternativa
        const altPlanDoc = await db
            .collection('global_config')
            .doc(subscription.plan_id)
            .get();

        if (!altPlanDoc.exists) {
            throw new functions.https.HttpsError('internal', 'Plan no encontrado');
        }

        var plan = altPlanDoc.data();
    } else {
        var plan = planDoc.data();
    }

    // Combinar límites del plan con límites personalizados
    const effectiveLimits = {
        ...plan.limits,
        ...(subscription.custom_limits || {}),
    };

    // Obtener uso actual
    const currentMonth = new Date().toISOString().substring(0, 7); // 2026-01
    const usageDoc = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('usage')
        .doc(currentMonth)
        .get();

    const currentUsage = usageDoc.exists ? usageDoc.data() : {
        users_count: 0,
        records_count: 0,
        xmls_generated: 0,
        storage_used_mb: 0,
        api_calls: 0,
    };

    // Verificar según la acción
    let result = { allowed: true, reason: null, message: null, remaining: null };

    switch (action) {
        case 'CREATE_USER':
            const maxUsers = effectiveLimits.max_users;
            if (maxUsers !== -1 && (currentUsage.users_count + quantity) > maxUsers) {
                result = {
                    allowed: false,
                    reason: 'LIMIT_USERS',
                    message: `Has alcanzado el límite de ${maxUsers} usuarios. Actualiza tu plan para agregar más.`,
                    current: currentUsage.users_count,
                    limit: maxUsers,
                    remaining: Math.max(0, maxUsers - currentUsage.users_count),
                };
            } else {
                result.remaining = maxUsers === -1 ? 'unlimited' : maxUsers - currentUsage.users_count - quantity;
            }
            break;

        case 'CREATE_RECORD':
            const maxRecords = effectiveLimits.max_records_month;
            if (maxRecords !== -1 && (currentUsage.records_count + quantity) > maxRecords) {
                result = {
                    allowed: false,
                    reason: 'LIMIT_RECORDS',
                    message: `Has alcanzado el límite de ${maxRecords.toLocaleString()} registros este mes. Actualiza tu plan o espera al próximo periodo.`,
                    current: currentUsage.records_count,
                    limit: maxRecords,
                    remaining: 0,
                };
            } else {
                result.remaining = maxRecords === -1 ? 'unlimited' : maxRecords - currentUsage.records_count - quantity;
            }
            break;

        case 'GENERATE_XML':
            const maxXmls = effectiveLimits.max_xmls_month;
            if (maxXmls !== -1 && (currentUsage.xmls_generated + quantity) > maxXmls) {
                result = {
                    allowed: false,
                    reason: 'LIMIT_XMLS',
                    message: `Has alcanzado el límite de ${maxXmls} reportes XML este mes.`,
                    current: currentUsage.xmls_generated,
                    limit: maxXmls,
                    remaining: 0,
                };
            } else {
                result.remaining = maxXmls === -1 ? 'unlimited' : maxXmls - currentUsage.xmls_generated - quantity;
            }
            break;

        case 'CREATE_WORKSPACE':
            const maxWorkspaces = effectiveLimits.max_workspaces;
            // Contar workspaces actuales
            const wsSnapshot = await db
                .collection('tenants')
                .doc(tenantId)
                .collection('workspaces')
                .where('status', '==', 'active')
                .count()
                .get();

            const wsCount = wsSnapshot.data().count;

            if (maxWorkspaces !== -1 && (wsCount + quantity) > maxWorkspaces) {
                result = {
                    allowed: false,
                    reason: 'LIMIT_WORKSPACES',
                    message: `Has alcanzado el límite de ${maxWorkspaces} espacios de trabajo.`,
                    current: wsCount,
                    limit: maxWorkspaces,
                    remaining: 0,
                };
            } else {
                result.remaining = maxWorkspaces === -1 ? 'unlimited' : maxWorkspaces - wsCount - quantity;
            }
            break;

        case 'CHECK_MODULE':
            const { module } = data;
            const allowedModules = plan.allowed_modules || [];

            if (!allowedModules.includes('ALL') && !allowedModules.includes(module)) {
                result = {
                    allowed: false,
                    reason: 'MODULE_NOT_ALLOWED',
                    message: `El módulo "${module}" no está incluido en tu plan. Actualiza a Pro o Enterprise.`,
                    allowed_modules: allowedModules,
                };
            }
            break;

        default:
            throw new functions.https.HttpsError('invalid-argument', `Acción desconocida: ${action}`);
    }

    return result;
});

// ============================================================================
// CLOUD FUNCTION: incrementUsage
// Incrementa contadores de uso (llamado internamente)
// ============================================================================

/**
 * Incrementa contadores de uso del tenant.
 * Llamado automáticamente por otras funciones.
 */
exports.incrementUsage = functions.https.onCall(async (data, context) => {
    // Solo admin o funciones internas
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'No autorizado');
    }

    const { tenantId, metric, amount = 1 } = data;

    const currentMonth = new Date().toISOString().substring(0, 7);
    const usageRef = db
        .collection('tenants')
        .doc(tenantId)
        .collection('usage')
        .doc(currentMonth);

    const fieldMap = {
        users: 'users_count',
        records: 'records_count',
        xmls: 'xmls_generated',
        storage: 'storage_used_mb',
        api_calls: 'api_calls',
    };

    const fieldName = fieldMap[metric];
    if (!fieldName) {
        throw new functions.https.HttpsError('invalid-argument', `Métrica desconocida: ${metric}`);
    }

    await usageRef.set({
        [fieldName]: admin.firestore.FieldValue.increment(amount),
        last_updated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return { success: true };
});

// ============================================================================
// CLOUD FUNCTION: getSubscriptionStatus
// Obtiene estado completo de la suscripción
// ============================================================================

exports.getSubscriptionStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
    }

    const tenantId = data.tenantId || context.auth.token.tenantId;

    if (!tenantId) {
        throw new functions.https.HttpsError('invalid-argument', 'Falta tenantId');
    }

    const tenantDoc = await db.collection('tenants').doc(tenantId).get();

    if (!tenantDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Tenant no encontrado');
    }

    const tenant = tenantDoc.data();
    const subscription = tenant.subscription || {};

    // Obtener plan
    let plan = null;
    if (subscription.plan_id && SUBSCRIPTION_PLANS[subscription.plan_id]) {
        plan = SUBSCRIPTION_PLANS[subscription.plan_id];
    }

    // Obtener uso actual
    const currentMonth = new Date().toISOString().substring(0, 7);
    const usageDoc = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('usage')
        .doc(currentMonth)
        .get();

    const usage = usageDoc.exists ? usageDoc.data() : {};

    // Calcular límites efectivos
    const effectiveLimits = {
        ...(plan?.limits || {}),
        ...(subscription.custom_limits || {}),
    };

    // Calcular porcentajes de uso
    const usagePercentages = {};
    if (plan?.limits) {
        for (const [key, limit] of Object.entries(effectiveLimits)) {
            if (limit === -1) {
                usagePercentages[key] = 0;
            } else {
                const usageKey = key.replace('max_', '').replace('_month', '_count').replace('_total', '_count');
                const current = usage[usageKey] || usage[key.replace('max_', '')] || 0;
                usagePercentages[key] = Math.round((current / limit) * 100);
            }
        }
    }

    return {
        subscription: {
            plan_id: subscription.plan_id,
            plan_name: plan?.name_es,
            status: subscription.status,
            billing_cycle: subscription.billing_cycle,
            current_period_end: subscription.current_period_end,
            days_remaining: subscription.current_period_end
                ? Math.ceil((new Date(subscription.current_period_end) - new Date()) / (1000 * 60 * 60 * 24))
                : null,
        },
        limits: effectiveLimits,
        usage,
        usagePercentages,
        features: plan?.features || {},
        allowed_modules: plan?.allowed_modules || [],
    };
});

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    SUBSCRIPTION_PLANS,
    checkUsageLimits: exports.checkUsageLimits,
    incrementUsage: exports.incrementUsage,
    getSubscriptionStatus: exports.getSubscriptionStatus,
};
