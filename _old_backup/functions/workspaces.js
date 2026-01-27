/**
 * PLD BDU - Workspace Cloud Functions
 * 
 * Functions for managing tenant workspaces (activity silos).
 * Implements the "Workspace Factory" pattern for automatic provisioning.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const db = admin.firestore();

// ============================================================================
// ERROR MESSAGES (Spanish - Mexico)
// ============================================================================
const ERRORS = {
    NOT_AUTHENTICATED: 'Error: Debes iniciar sesión para realizar esta acción.',
    NOT_AUTHORIZED: 'Error: No tienes permisos para crear espacios de trabajo.',
    MISSING_PARAMS: 'Error: Faltan parámetros requeridos (activityType, tenantId).',
    INVALID_ACTIVITY: 'Error: El tipo de actividad especificado no existe en el catálogo.',
    PLAN_LIMIT_EXCEEDED: 'Error: Tu plan actual no permite agregar más actividades. Contacta a soporte para actualizar tu suscripción.',
    WORKSPACE_EXISTS: 'Error: Ya existe un espacio de trabajo para esta actividad.',
    TENANT_NOT_FOUND: 'Error: No se encontró la empresa especificada.',
    TEMPLATE_NOT_FOUND: 'Error: No se encontró la plantilla de configuración para esta actividad.',
    INTERNAL_ERROR: 'Error: Ocurrió un error interno. Por favor intenta de nuevo.',
};

const SUCCESS = {
    WORKSPACE_CREATED: 'Éxito: Espacio de trabajo creado correctamente.',
    WORKSPACE_ARCHIVED: 'Éxito: Espacio de trabajo archivado correctamente.',
};

// ============================================================================
// SUBSCRIPTION PLAN LIMITS
// ============================================================================
const PLAN_LIMITS = {
    'starter': { maxWorkspaces: 1, maxUsers: 3, maxRecordsPerMonth: 100 },
    'professional': { maxWorkspaces: 3, maxUsers: 10, maxRecordsPerMonth: 500 },
    'enterprise': { maxWorkspaces: 10, maxUsers: 50, maxRecordsPerMonth: 5000 },
    'unlimited': { maxWorkspaces: Infinity, maxUsers: Infinity, maxRecordsPerMonth: Infinity },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validates that the caller has permission to create workspaces.
 * Must be SUPER_ADMIN or COMPANY_ADMIN of the specified tenant.
 */
function validatePermissions(auth, tenantId) {
    if (!auth) {
        throw new functions.https.HttpsError('unauthenticated', ERRORS.NOT_AUTHENTICATED);
    }

    const { role, tenantId: userTenantId } = auth.token;

    // SUPER_ADMIN can create workspaces for any tenant
    if (role === 'SUPER_ADMIN') {
        return true;
    }

    // COMPANY_ADMIN can only create workspaces for their own tenant
    if (role === 'COMPANY_ADMIN' && userTenantId === tenantId) {
        return true;
    }

    throw new functions.https.HttpsError('permission-denied', ERRORS.NOT_AUTHORIZED);
}

/**
 * Checks if the tenant's subscription plan allows more workspaces.
 */
async function validateSubscriptionLimits(tenantId) {
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();

    if (!tenantDoc.exists) {
        throw new functions.https.HttpsError('not-found', ERRORS.TENANT_NOT_FOUND);
    }

    const tenantData = tenantDoc.data();
    const plan = tenantData.subscription_plan || 'starter';
    const planLimits = PLAN_LIMITS[plan] || PLAN_LIMITS.starter;

    // Count existing active workspaces
    const workspacesSnapshot = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('workspaces')
        .where('status', '==', 'active')
        .get();

    const currentCount = workspacesSnapshot.size;

    if (currentCount >= planLimits.maxWorkspaces) {
        throw new functions.https.HttpsError('resource-exhausted', ERRORS.PLAN_LIMIT_EXCEEDED);
    }

    return { tenantData, planLimits, currentCount };
}

/**
 * Fetches the master template for the specified activity type.
 */
async function getActivityTemplate(activityType) {
    const templateDoc = await db
        .collection('global_config')
        .doc('activity_templates')
        .get();

    if (!templateDoc.exists) {
        throw new functions.https.HttpsError('internal', ERRORS.TEMPLATE_NOT_FOUND);
    }

    const templates = templateDoc.data().templates || {};
    const template = templates[activityType];

    if (!template) {
        throw new functions.https.HttpsError('invalid-argument', ERRORS.INVALID_ACTIVITY);
    }

    return template;
}

/**
 * Fetches current UMA values for threshold calculation.
 */
async function getUMAValues() {
    const umaDoc = await db.collection('global_config').doc('uma_values').get();

    if (!umaDoc.exists) {
        // Fallback to default 2026 values
        return {
            daily: 113.14,
            monthly: 3439.46,
            annual: 41273.52,
            year: 2026,
        };
    }

    const umaData = umaDoc.data();
    const currentYear = umaData.current_year || 2026;
    return {
        ...umaData.history[currentYear],
        year: currentYear,
    };
}

/**
 * Fetches risk factors for the specified activity.
 */
async function getRiskFactors(activityType) {
    const riskDoc = await db.collection('global_config').doc('risk_factors').get();

    if (!riskDoc.exists) {
        return getDefaultRiskFactors();
    }

    return riskDoc.data();
}

/**
 * Returns default risk factors based on ENR 2023.
 */
function getDefaultRiskFactors() {
    return {
        geographic_risk: {
            high: ['Sinaloa', 'Chihuahua', 'Tamaulipas', 'Guerrero', 'Michoacán', 'Baja California'],
            medium: ['Jalisco', 'Estado de México', 'Quintana Roo', 'Morelos', 'Colima'],
            low: ['Yucatán', 'Aguascalientes', 'Querétaro', 'Tlaxcala', 'Campeche'],
        },
        client_type_weights: {
            PEP: 40,
            FIRST_OPERATION: 15,
            FOREIGN_NATIONAL: 20,
            HIGH_RISK_OCCUPATION: 25,
        },
        transaction_weights: {
            CASH_PAYMENT: 30,
            STRUCTURED_TRANSACTIONS: 35,
            UNUSUAL_PATTERN: 25,
            THRESHOLD_PROXIMITY: 20,
        },
    };
}

// ============================================================================
// MAIN FUNCTION: createActivityWorkspace
// ============================================================================

/**
 * Creates a new activity workspace for a tenant.
 * 
 * This is the "Workspace Factory" - it provisions a complete workspace
 * with pre-configured thresholds, risk matrices, and required documents
 * based on the selected activity type.
 * 
 * @param {Object} data - Function parameters
 * @param {string} data.activityType - Activity type code (e.g., 'INMUEBLES_V')
 * @param {string} data.tenantId - Target tenant ID
 * @param {string} data.displayName - Optional custom name for the workspace
 * @param {Object} context - Firebase callable context
 * @returns {Object} Created workspace data
 */
exports.createActivityWorkspace = functions.https.onCall(async (data, context) => {
    // -------------------------------------------------------------------------
    // STEP 1: Validate Input Parameters
    // -------------------------------------------------------------------------
    const { activityType, tenantId, displayName } = data;

    if (!activityType || !tenantId) {
        throw new functions.https.HttpsError('invalid-argument', ERRORS.MISSING_PARAMS);
    }

    console.log(`[createActivityWorkspace] Iniciando creación de workspace...`);
    console.log(`  - Tenant: ${tenantId}`);
    console.log(`  - Actividad: ${activityType}`);

    // -------------------------------------------------------------------------
    // STEP 2: Validate User Permissions
    // -------------------------------------------------------------------------
    validatePermissions(context.auth, tenantId);
    console.log(`[createActivityWorkspace] Permisos validados para usuario: ${context.auth.uid}`);

    // -------------------------------------------------------------------------
    // STEP 3: Validate Subscription Plan Limits
    // -------------------------------------------------------------------------
    const { tenantData, planLimits, currentCount } = await validateSubscriptionLimits(tenantId);
    console.log(`[createActivityWorkspace] Plan: ${tenantData.subscription_plan}, Workspaces: ${currentCount}/${planLimits.maxWorkspaces}`);

    // -------------------------------------------------------------------------
    // STEP 4: Check for Duplicate Workspace
    // -------------------------------------------------------------------------
    const existingWorkspace = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('workspaces')
        .where('activity_type', '==', activityType)
        .where('status', '==', 'active')
        .get();

    if (!existingWorkspace.empty) {
        throw new functions.https.HttpsError('already-exists', ERRORS.WORKSPACE_EXISTS);
    }

    // -------------------------------------------------------------------------
    // STEP 5: Fetch Master Template from global_config
    // -------------------------------------------------------------------------
    const template = await getActivityTemplate(activityType);
    console.log(`[createActivityWorkspace] Plantilla cargada: ${template.name}`);

    // -------------------------------------------------------------------------
    // STEP 6: Fetch Current UMA Values
    // -------------------------------------------------------------------------
    const uma = await getUMAValues();
    console.log(`[createActivityWorkspace] UMA ${uma.year}: $${uma.daily}/día`);

    // -------------------------------------------------------------------------
    // STEP 7: Calculate Thresholds Based on UMA
    // -------------------------------------------------------------------------
    const thresholds = {
        // Standard thresholds (8,025 UMA for most activities)
        umbral_aviso: template.uma_threshold_aviso
            ? template.uma_threshold_aviso * uma.daily
            : 8025 * uma.daily,

        // Cash limit (typically same as aviso threshold)
        cash_limit: template.uma_threshold_cash
            ? template.uma_threshold_cash * uma.daily
            : 8025 * uma.daily,

        // Structured transactions threshold (if applicable)
        structured_threshold: template.uma_threshold_structured
            ? template.uma_threshold_structured * uma.daily
            : null,

        uma_reference_year: uma.year,
        uma_daily_value: uma.daily,
    };

    console.log(`[createActivityWorkspace] Umbrales calculados:`);
    console.log(`  - Umbral Aviso: $${thresholds.umbral_aviso.toLocaleString('es-MX')}`);
    console.log(`  - Límite Efectivo: $${thresholds.cash_limit.toLocaleString('es-MX')}`);

    // -------------------------------------------------------------------------
    // STEP 8: Fetch Risk Factors for EBR (Enfoque Basado en Riesgos)
    // -------------------------------------------------------------------------
    const riskFactors = await getRiskFactors(activityType);

    // -------------------------------------------------------------------------
    // STEP 9: Build Workspace Document
    // -------------------------------------------------------------------------
    const now = admin.firestore.FieldValue.serverTimestamp();
    const workspaceId = `ws_${activityType.toLowerCase()}_${Date.now()}`;

    const workspaceData = {
        // Identification
        id: workspaceId,
        activity_type: activityType,
        activity_name: displayName || template.name,
        status: 'active',

        // Timestamps
        created_at: now,
        updated_at: now,
        created_by: context.auth.uid,

        // Configuration (from template)
        config: {
            ...thresholds,
            currency: 'MXN',
            auto_alert_generation: true,
            require_dual_approval: template.require_dual_approval || false,
            xml_schema: template.xml_schema || activityType,
        },

        // Required Documents (from template)
        required_documents: template.required_documents || [
            'Identificación oficial vigente',
            'Comprobante de domicilio',
            'RFC con homoclave',
        ],

        // Risk Matrix Reference
        risk_matrix_ref: `/global_config/risk_matrices/${activityType}`,

        // Statistics (initialized)
        statistics: {
            total_records: 0,
            pending_alerts: 0,
            generated_xmls: 0,
            last_activity: null,
        },

        // Assigned Officers (empty, to be filled by admin)
        assigned_officers: [],
    };

    // -------------------------------------------------------------------------
    // STEP 10: Create Workspace Document
    // -------------------------------------------------------------------------
    const workspaceRef = db
        .collection('tenants')
        .doc(tenantId)
        .collection('workspaces')
        .doc(workspaceId);

    await workspaceRef.set(workspaceData);
    console.log(`[createActivityWorkspace] Workspace creado: ${workspaceId}`);

    // -------------------------------------------------------------------------
    // STEP 11: Initialize Risk Configuration Sub-Collection
    // -------------------------------------------------------------------------
    const riskConfigRef = workspaceRef.collection('risk_config').doc('default');

    await riskConfigRef.set({
        version: '1.0',
        based_on: 'ENR_2023',
        created_at: now,

        // Geographic Risk Weights
        geographic_risk: riskFactors.geographic_risk,

        // Client Risk Weights
        client_weights: {
            pep: riskFactors.client_type_weights?.PEP || 40,
            first_operation: riskFactors.client_type_weights?.FIRST_OPERATION || 15,
            foreign_national: riskFactors.client_type_weights?.FOREIGN_NATIONAL || 20,
            high_risk_occupation: riskFactors.client_type_weights?.HIGH_RISK_OCCUPATION || 25,
        },

        // Transaction Risk Weights
        transaction_weights: {
            cash_payment: riskFactors.transaction_weights?.CASH_PAYMENT || 30,
            structured_transactions: riskFactors.transaction_weights?.STRUCTURED_TRANSACTIONS || 35,
            unusual_pattern: riskFactors.transaction_weights?.UNUSUAL_PATTERN || 25,
            threshold_proximity: riskFactors.transaction_weights?.THRESHOLD_PROXIMITY || 20,
        },

        // Risk Score Thresholds
        score_thresholds: {
            low: { min: 0, max: 30 },
            medium: { min: 31, max: 60 },
            high: { min: 61, max: 100 },
        },
    });

    console.log(`[createActivityWorkspace] Configuración de riesgo inicializada`);

    // -------------------------------------------------------------------------
    // STEP 12: Log Usage Event (for billing/audit)
    // -------------------------------------------------------------------------
    await db.collection('usage_logs').add({
        event_type: 'WORKSPACE_CREATED',
        tenant_id: tenantId,
        workspace_id: workspaceId,
        activity_type: activityType,
        user_id: context.auth.uid,
        timestamp: now,
        metadata: {
            subscription_plan: tenantData.subscription_plan,
            workspace_count_after: currentCount + 1,
        },
    });

    console.log(`[createActivityWorkspace] Evento de uso registrado`);

    // -------------------------------------------------------------------------
    // STEP 13: Return Success Response
    // -------------------------------------------------------------------------
    console.log(`[createActivityWorkspace] ✅ ${SUCCESS.WORKSPACE_CREATED}`);

    return {
        success: true,
        message: SUCCESS.WORKSPACE_CREATED,
        workspace: {
            id: workspaceId,
            activity_type: activityType,
            activity_name: workspaceData.activity_name,
            thresholds: {
                umbral_aviso: thresholds.umbral_aviso,
                cash_limit: thresholds.cash_limit,
                uma_year: thresholds.uma_reference_year,
            },
        },
    };
});

// ============================================================================
// FUNCTION: archiveWorkspace
// ============================================================================

/**
 * Archives a workspace (soft delete).
 * Records are preserved but workspace becomes inactive.
 */
exports.archiveWorkspace = functions.https.onCall(async (data, context) => {
    const { workspaceId, tenantId } = data;

    if (!workspaceId || !tenantId) {
        throw new functions.https.HttpsError('invalid-argument', ERRORS.MISSING_PARAMS);
    }

    // Validate permissions
    validatePermissions(context.auth, tenantId);

    // Update workspace status
    const workspaceRef = db
        .collection('tenants')
        .doc(tenantId)
        .collection('workspaces')
        .doc(workspaceId);

    const workspaceDoc = await workspaceRef.get();

    if (!workspaceDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Error: Espacio de trabajo no encontrado.');
    }

    await workspaceRef.update({
        status: 'archived',
        archived_at: admin.firestore.FieldValue.serverTimestamp(),
        archived_by: context.auth.uid,
    });

    // Log the event
    await db.collection('usage_logs').add({
        event_type: 'WORKSPACE_ARCHIVED',
        tenant_id: tenantId,
        workspace_id: workspaceId,
        user_id: context.auth.uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[archiveWorkspace] ✅ ${SUCCESS.WORKSPACE_ARCHIVED}`);

    return {
        success: true,
        message: SUCCESS.WORKSPACE_ARCHIVED,
    };
});
