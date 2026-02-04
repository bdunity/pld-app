/**
 * PLD BDU - Metering Gatekeeper (Control de Cuotas)
 * 
 * Función utilitaria para verificar disponibilidad de cuota
 * antes de permitir operaciones que consumen recursos.
 * 
 * Diseñado para ser llamado por otras Cloud Functions como:
 * - batch-processing.js (antes de procesar Excel)
 * - xml-generator.js (antes de generar XML)
 * - workspaces.js (antes de crear workspace)
 * 
 * @version 2.0.0
 * @date 2026-01-25
 */

const admin = require('firebase-admin');
const db = admin.firestore();

// ============================================================================
// CONFIGURACIÓN DE ACCIONES Y MÉTRICAS
// ============================================================================
const ACTION_CONFIG = {
    // Carga de registros
    UPLOAD_RECORDS: {
        metric: 'records_processed',
        limitField: 'max_records_month',
        errorMessage_es: 'Has alcanzado el límite de registros mensuales.',
        errorCode: 'QUOTA_RECORDS_EXCEEDED',
    },

    // Generación de XML
    GENERATE_XML: {
        metric: 'xmls_generated',
        limitField: 'max_xmls_month',
        errorMessage_es: 'Has alcanzado el límite de reportes XML mensuales.',
        errorCode: 'QUOTA_XMLS_EXCEEDED',
    },

    // Crear usuario
    CREATE_USER: {
        metric: 'users_count',
        limitField: 'max_users',
        errorMessage_es: 'Has alcanzado el límite de usuarios.',
        errorCode: 'QUOTA_USERS_EXCEEDED',
        isAbsolute: true, // No es mensual, es total
    },

    // Crear workspace
    CREATE_WORKSPACE: {
        metric: 'workspaces_count',
        limitField: 'max_workspaces',
        errorMessage_es: 'Has alcanzado el límite de espacios de trabajo.',
        errorCode: 'QUOTA_WORKSPACES_EXCEEDED',
        isAbsolute: true,
    },

    // Almacenamiento
    UPLOAD_FILE: {
        metric: 'storage_used_mb',
        limitField: 'max_storage_mb',
        errorMessage_es: 'Has alcanzado el límite de almacenamiento.',
        errorCode: 'QUOTA_STORAGE_EXCEEDED',
        isAbsolute: true,
    },

    // Llamadas API
    API_CALL: {
        metric: 'api_calls',
        limitField: 'max_api_calls_day',
        errorMessage_es: 'Has alcanzado el límite de llamadas API diarias.',
        errorCode: 'QUOTA_API_EXCEEDED',
        isDaily: true,
    },
};

// ============================================================================
// PLANES (Cache local para evitar lecturas excesivas)
// En producción, esto debería estar cacheado con TTL
// ============================================================================
const PLAN_LIMITS_CACHE = {
    plan_demo: {
        max_users: 1,
        max_records_month: 100,
        max_xmls_month: 5,
        max_workspaces: 1,
        max_storage_mb: 100,
        max_api_calls_day: 100,
    },
    plan_pro: {
        max_users: 5,
        max_records_month: 5000,
        max_xmls_month: 50,
        max_workspaces: 3,
        max_storage_mb: 5120,
        max_api_calls_day: 1000,
    },
    plan_enterprise: {
        max_users: -1,
        max_records_month: -1,
        max_xmls_month: -1,
        max_workspaces: -1,
        max_storage_mb: -1,
        max_api_calls_day: -1,
    },
};

// ============================================================================
// FUNCIÓN PRINCIPAL: checkQuotaAvailability
// ============================================================================

/**
 * Verifica si un tenant tiene cuota disponible para realizar una acción.
 * 
 * @param {string} tenantId - ID del tenant
 * @param {string} actionType - Tipo de acción (UPLOAD_RECORDS, GENERATE_XML, etc.)
 * @param {number} amount - Cantidad a consumir (default: 1)
 * @returns {Object} Resultado de la verificación
 * 
 * @example
 * // Antes de procesar un batch de 500 registros:
 * const result = await checkQuotaAvailability('tenant_123', 'UPLOAD_RECORDS', 500);
 * if (!result.allowed) {
 *   throw new Error(result.message);
 * }
 */
async function checkQuotaAvailability(tenantId, actionType, amount = 1) {
    const startTime = Date.now();

    console.log(`[QuotaGatekeeper] Verificando: ${actionType} x${amount} para tenant: ${tenantId}`);

    // Estructura de respuesta
    const response = {
        allowed: false,
        tenantId,
        actionType,
        requestedAmount: amount,

        // Info de vigencia
        subscriptionStatus: null,
        isExpired: false,

        // Info de cuota
        currentUsage: 0,
        limit: 0,
        remaining: 0,
        usagePercent: 0,

        // En caso de rechazo
        errorCode: null,
        message: null,

        // Meta
        checkDurationMs: 0,
    };

    try {
        // -------------------------------------------------------------------------
        // PASO 1: Obtener datos del tenant y suscripción
        // -------------------------------------------------------------------------
        const tenantDoc = await db.collection('tenants').doc(tenantId).get();

        if (!tenantDoc.exists) {
            response.errorCode = 'TENANT_NOT_FOUND';
            response.message = 'La empresa no existe en el sistema.';
            return response;
        }

        const tenantData = tenantDoc.data();
        const subscription = tenantData.subscription;

        if (!subscription) {
            response.errorCode = 'NO_SUBSCRIPTION';
            response.message = 'La empresa no tiene una suscripción activa. Contacte a ventas.';
            return response;
        }

        response.subscriptionStatus = subscription.status;

        // -------------------------------------------------------------------------
        // PASO 2: Verificar vigencia de la suscripción
        // -------------------------------------------------------------------------
        const validStatuses = ['ACTIVE', 'TRIAL'];

        if (!validStatuses.includes(subscription.status)) {
            response.isExpired = true;
            response.errorCode = 'SUBSCRIPTION_INACTIVE';
            response.message = getStatusMessage(subscription.status);
            return response;
        }

        // Verificar fecha de expiración
        const periodEnd = subscription.current_period_end
            ? new Date(subscription.current_period_end)
            : subscription.trial_end
                ? new Date(subscription.trial_end)
                : null;

        const today = new Date();

        if (periodEnd && today > periodEnd) {
            response.isExpired = true;
            response.errorCode = 'SUBSCRIPTION_EXPIRED';
            response.message = 'Su plan ha expirado. Por favor, renueve su suscripción para continuar.';

            // Actualizar estado en Firestore
            await db.collection('tenants').doc(tenantId).update({
                'subscription.status': 'EXPIRED',
                'subscription.expired_at': admin.firestore.FieldValue.serverTimestamp(),
            });

            return response;
        }

        // -------------------------------------------------------------------------
        // PASO 3: Obtener límites del plan (con custom_limits)
        // -------------------------------------------------------------------------
        const planId = subscription.plan_id;
        const baseLimits = PLAN_LIMITS_CACHE[planId] || PLAN_LIMITS_CACHE.plan_demo;

        // Combinar con límites personalizados
        const effectiveLimits = {
            ...baseLimits,
            ...(subscription.custom_limits || {}),
        };

        // -------------------------------------------------------------------------
        // PASO 4: Obtener configuración de la acción
        // -------------------------------------------------------------------------
        const actionConfig = ACTION_CONFIG[actionType];

        if (!actionConfig) {
            response.errorCode = 'UNKNOWN_ACTION';
            response.message = `Tipo de acción desconocida: ${actionType}`;
            return response;
        }

        const limitValue = effectiveLimits[actionConfig.limitField];
        response.limit = limitValue;

        // -------------------------------------------------------------------------
        // PASO 5: Manejar límite ILIMITADO (-1)
        // Clientes Enterprise tienen -1 en sus límites
        // -------------------------------------------------------------------------
        if (limitValue === -1) {
            response.allowed = true;
            response.remaining = Infinity;
            response.usagePercent = 0;
            response.message = 'Sin límite (Plan Enterprise)';
            response.checkDurationMs = Date.now() - startTime;

            console.log(`[QuotaGatekeeper] ✅ APROBADO (Ilimitado)`);
            return response;
        }

        // -------------------------------------------------------------------------
        // PASO 6: Calcular consumo actual
        // -------------------------------------------------------------------------
        let currentUsage = 0;

        if (actionConfig.isAbsolute) {
            // Métricas absolutas (usuarios, workspaces)
            currentUsage = await getAbsoluteCount(tenantId, actionConfig.metric);
        } else if (actionConfig.isDaily) {
            // Métricas diarias (API calls)
            currentUsage = await getDailyUsage(tenantId, actionConfig.metric);
        } else {
            // Métricas mensuales (registros, XMLs)
            currentUsage = await getMonthlyUsage(tenantId, actionConfig.metric);
        }

        response.currentUsage = currentUsage;

        // -------------------------------------------------------------------------
        // PASO 7: Comparar consumo vs límite
        // -------------------------------------------------------------------------
        const projectedUsage = currentUsage + amount;
        const remaining = limitValue - currentUsage;
        const usagePercent = Math.round((currentUsage / limitValue) * 100);

        response.remaining = Math.max(0, remaining);
        response.usagePercent = Math.min(100, usagePercent);

        if (projectedUsage > limitValue) {
            // ⛔ BLOQUEAR - Límite excedido
            response.allowed = false;
            response.errorCode = actionConfig.errorCode;
            response.message = formatQuotaMessage(actionConfig, currentUsage, limitValue, amount);

            console.log(`[QuotaGatekeeper] ❌ BLOQUEADO: ${response.errorCode}`);
            console.log(`  - Uso actual: ${currentUsage}`);
            console.log(`  - Límite: ${limitValue}`);
            console.log(`  - Solicitado: ${amount}`);

            // Registrar intento bloqueado
            await logQuotaEvent(tenantId, actionType, 'BLOCKED', {
                currentUsage,
                limit: limitValue,
                requested: amount,
            });

        } else {
            // ✅ APROBAR - Hay cuota disponible
            response.allowed = true;
            response.remaining = remaining - amount;
            response.message = 'Cuota disponible';

            console.log(`[QuotaGatekeeper] ✅ APROBADO`);
            console.log(`  - Uso actual: ${currentUsage}`);
            console.log(`  - Después de acción: ${projectedUsage}`);
            console.log(`  - Límite: ${limitValue}`);
            console.log(`  - Restante: ${remaining - amount}`);

            // Advertencia si está cerca del límite (>80%)
            if (usagePercent >= 80) {
                response.warning = {
                    type: 'APPROACHING_LIMIT',
                    message: `Atención: Has consumido el ${usagePercent}% de tu cuota.`,
                    usagePercent,
                };
            }
        }

        response.checkDurationMs = Date.now() - startTime;
        return response;

    } catch (error) {
        console.error('[QuotaGatekeeper] Error:', error);

        response.errorCode = 'INTERNAL_ERROR';
        response.message = 'Error al verificar cuota. Intente de nuevo.';
        response.checkDurationMs = Date.now() - startTime;

        return response;
    }
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Obtiene el uso mensual actual
 */
async function getMonthlyUsage(tenantId, metric) {
    const currentMonth = new Date().toISOString().substring(0, 7); // 2026-01

    const usageDoc = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('usage_stats')
        .doc(currentMonth)
        .get();

    if (!usageDoc.exists) return 0;

    const data = usageDoc.data();
    return data[metric] || data[`${metric}_this_month`] || 0;
}

/**
 * Obtiene el uso diario actual
 */
async function getDailyUsage(tenantId, metric) {
    const today = new Date().toISOString().substring(0, 10); // 2026-01-25

    const usageDoc = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('usage_stats')
        .doc(`daily_${today}`)
        .get();

    if (!usageDoc.exists) return 0;

    return usageDoc.data()[metric] || 0;
}

/**
 * Obtiene conteo absoluto (usuarios, workspaces)
 */
async function getAbsoluteCount(tenantId, metric) {
    switch (metric) {
        case 'users_count':
            const usersSnapshot = await db
                .collection('users')
                .where('tenant_id', '==', tenantId)
                .where('status', '==', 'active')
                .count()
                .get();
            return usersSnapshot.data().count;

        case 'workspaces_count':
            const wsSnapshot = await db
                .collection('tenants')
                .doc(tenantId)
                .collection('workspaces')
                .where('status', '==', 'active')
                .count()
                .get();
            return wsSnapshot.data().count;

        case 'storage_used_mb':
            const tenantDoc = await db.collection('tenants').doc(tenantId).get();
            return tenantDoc.data()?.storage_used_mb || 0;

        default:
            return 0;
    }
}

/**
 * Formatea mensaje de error de cuota
 */
function formatQuotaMessage(config, current, limit, requested) {
    const templates = {
        QUOTA_RECORDS_EXCEEDED:
            `Límite mensual excedido. Has procesado ${current.toLocaleString()} de ${limit.toLocaleString()} registros. ` +
            `Intentaste agregar ${requested.toLocaleString()} más. Contacta a ventas para ampliar tu plan.`,

        QUOTA_XMLS_EXCEEDED:
            `Has generado ${current} de ${limit} reportes XML este mes. ` +
            `Actualiza tu plan para generar más reportes.`,

        QUOTA_USERS_EXCEEDED:
            `Has alcanzado el límite de ${limit} usuarios. ` +
            `Actualiza tu plan para agregar más usuarios.`,

        QUOTA_WORKSPACES_EXCEEDED:
            `Has alcanzado el límite de ${limit} espacios de trabajo. ` +
            `Actualiza tu plan para crear más.`,

        QUOTA_STORAGE_EXCEEDED:
            `Has usado ${current} MB de ${limit} MB de almacenamiento. ` +
            `Actualiza tu plan para más espacio.`,

        QUOTA_API_EXCEEDED:
            `Has realizado ${current} de ${limit} llamadas API hoy. ` +
            `Espera hasta mañana o actualiza tu plan.`,
    };

    return templates[config.errorCode] || config.errorMessage_es;
}

/**
 * Obtiene mensaje según estado de suscripción
 */
function getStatusMessage(status) {
    const messages = {
        EXPIRED: 'Su suscripción ha expirado. Por favor, renuévela para continuar.',
        CANCELLED: 'Su suscripción fue cancelada. Contacte a soporte si fue un error.',
        PAST_DUE: 'Su pago está pendiente. Actualice su método de pago para continuar.',
        SUSPENDED: 'Su cuenta está suspendida. Contacte a soporte.',
    };

    return messages[status] || `Estado de suscripción inválido: ${status}`;
}

/**
 * Registra evento de cuota para auditoría
 */
async function logQuotaEvent(tenantId, action, result, details) {
    try {
        await db.collection('quota_events').add({
            tenant_id: tenantId,
            action,
            result,
            details,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) {
        console.error('[logQuotaEvent] Error:', error);
    }
}

// ============================================================================
// FUNCIÓN: consumeQuota
// Registra consumo después de una acción exitosa
// ============================================================================

/**
 * Registra el consumo de cuota después de una acción exitosa.
 * Debe llamarse DESPUÉS de completar la acción.
 * 
 * @param {string} tenantId 
 * @param {string} actionType 
 * @param {number} amount 
 */
async function consumeQuota(tenantId, actionType, amount = 1) {
    const actionConfig = ACTION_CONFIG[actionType];
    if (!actionConfig) return;

    const metric = actionConfig.metric;

    if (actionConfig.isDaily) {
        const today = new Date().toISOString().substring(0, 10);
        const docId = `daily_${today}`;

        await db
            .collection('tenants')
            .doc(tenantId)
            .collection('usage_stats')
            .doc(docId)
            .set({
                [metric]: admin.firestore.FieldValue.increment(amount),
                last_updated: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

    } else if (!actionConfig.isAbsolute) {
        const currentMonth = new Date().toISOString().substring(0, 7);

        await db
            .collection('tenants')
            .doc(tenantId)
            .collection('usage_stats')
            .doc(currentMonth)
            .set({
                [metric]: admin.firestore.FieldValue.increment(amount),
                last_updated: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
    }

    console.log(`[consumeQuota] Registrado: ${actionType} +${amount} para tenant ${tenantId}`);
}

// ============================================================================
// FUNCIÓN: getQuotaStatus
// Obtiene resumen de cuotas para dashboard
// ============================================================================

/**
 * Obtiene el estado completo de cuotas de un tenant.
 */
async function getQuotaStatus(tenantId) {
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();

    if (!tenantDoc.exists) {
        throw new Error('Tenant no encontrado');
    }

    const subscription = tenantDoc.data().subscription || {};
    const planId = subscription.plan_id || 'plan_demo';
    const baseLimits = PLAN_LIMITS_CACHE[planId] || PLAN_LIMITS_CACHE.plan_demo;
    const effectiveLimits = { ...baseLimits, ...(subscription.custom_limits || {}) };

    // Obtener uso actual
    const currentMonth = new Date().toISOString().substring(0, 7);
    const today = new Date().toISOString().substring(0, 10);

    const [monthlyDoc, dailyDoc] = await Promise.all([
        db.collection('tenants').doc(tenantId).collection('usage_stats').doc(currentMonth).get(),
        db.collection('tenants').doc(tenantId).collection('usage_stats').doc(`daily_${today}`).get(),
    ]);

    const monthlyUsage = monthlyDoc.exists ? monthlyDoc.data() : {};
    const dailyUsage = dailyDoc.exists ? dailyDoc.data() : {};

    // Construir resumen
    const quotas = {};

    for (const [action, config] of Object.entries(ACTION_CONFIG)) {
        const limit = effectiveLimits[config.limitField];
        let current = 0;

        if (config.isDaily) {
            current = dailyUsage[config.metric] || 0;
        } else if (config.isAbsolute) {
            current = await getAbsoluteCount(tenantId, config.metric);
        } else {
            current = monthlyUsage[config.metric] || 0;
        }

        quotas[action] = {
            metric: config.metric,
            current,
            limit: limit === -1 ? 'Ilimitado' : limit,
            remaining: limit === -1 ? 'Ilimitado' : Math.max(0, limit - current),
            percent: limit === -1 ? 0 : Math.min(100, Math.round((current / limit) * 100)),
            isUnlimited: limit === -1,
            status: limit === -1 ? 'unlimited' : (current / limit >= 1 ? 'exceeded' : current / limit >= 0.8 ? 'warning' : 'ok'),
        };
    }

    return {
        planId,
        planName: getPlanName(planId),
        subscriptionStatus: subscription.status,
        periodEnd: subscription.current_period_end,
        quotas,
    };
}

function getPlanName(planId) {
    const names = {
        plan_demo: 'Demo',
        plan_pro: 'Profesional',
        plan_enterprise: 'Enterprise',
    };
    return names[planId] || planId;
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    checkQuotaAvailability,
    consumeQuota,
    getQuotaStatus,
    ACTION_CONFIG,
    PLAN_LIMITS_CACHE,
};
