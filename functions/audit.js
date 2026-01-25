/**
 * PLD BDU - Audit Cloud Functions
 * 
 * Functions for logging usage events and maintaining audit trails.
 * Critical for billing and compliance requirements.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const db = admin.firestore();

// ============================================================================
// ERROR MESSAGES (Spanish - Mexico)
// ============================================================================
const ERRORS = {
    NOT_AUTHENTICATED: 'Error: Debes iniciar sesión para realizar esta acción.',
    MISSING_PARAMS: 'Error: Faltan parámetros requeridos.',
};

// ============================================================================
// FUNCTION: logUsageEvent
// ============================================================================

/**
 * Logs a usage event for billing and audit purposes.
 * These logs are IMMUTABLE (cannot be updated or deleted).
 * 
 * @param {Object} data - Event data
 * @param {string} data.event_type - Type of event
 * @param {string} data.tenant_id - Tenant ID
 * @param {string} data.workspace_id - Optional workspace ID
 * @param {Object} data.metadata - Additional event metadata
 */
exports.logUsageEvent = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', ERRORS.NOT_AUTHENTICATED);
    }

    const { event_type, tenant_id, workspace_id, metadata = {} } = data;

    if (!event_type || !tenant_id) {
        throw new functions.https.HttpsError('invalid-argument', ERRORS.MISSING_PARAMS);
    }

    // Create immutable log entry
    const logEntry = {
        event_type,
        tenant_id,
        workspace_id: workspace_id || null,
        user_id: context.auth.uid,
        user_email: context.auth.token.email || null,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        metadata: {
            ...metadata,
            ip_address: context.rawRequest?.ip || null,
            user_agent: context.rawRequest?.headers?.['user-agent'] || null,
        },
    };

    await db.collection('usage_logs').add(logEntry);

    console.log(`[logUsageEvent] Evento registrado: ${event_type} por ${context.auth.uid}`);

    return { success: true };
});
