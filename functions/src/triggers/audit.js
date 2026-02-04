/**
 * Audit Log System
 * Registro inmutable de acciones de seguridad
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

const db = getFirestore();

// ============================================================
// TIPOS DE ACCIONES AUDITABLES
// ============================================================

export const AUDIT_ACTIONS = {
  // Autenticación
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  USER_LOGIN_FAILED: 'USER_LOGIN_FAILED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',

  // Gestión de datos
  CLIENT_CREATED: 'CLIENT_CREATED',
  CLIENT_UPDATED: 'CLIENT_UPDATED',
  CLIENT_DELETED: 'CLIENT_DELETED',
  OPERATION_CREATED: 'OPERATION_CREATED',
  OPERATION_DELETED: 'OPERATION_DELETED',

  // Reportes y documentos
  REPORT_GENERATED: 'REPORT_GENERATED',
  REPORT_DELETED: 'REPORT_DELETED',
  DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
  DOCUMENT_DELETED: 'DOCUMENT_DELETED',
  DOCUMENT_DOWNLOADED: 'DOCUMENT_DOWNLOADED',

  // Screening
  SCREENING_SEARCH: 'SCREENING_SEARCH',
  CLIENT_SCREENED: 'CLIENT_SCREENED',
  BATCH_SCREENING_RUN: 'BATCH_SCREENING_RUN',
  SCREENING_CONFIRMED: 'SCREENING_CONFIRMED',
  SCREENING_DISMISSED: 'SCREENING_DISMISSED',

  // LMS
  COURSE_STARTED: 'COURSE_STARTED',
  COURSE_COMPLETED: 'COURSE_COMPLETED',
  EXAM_SUBMITTED: 'EXAM_SUBMITTED',
  CERTIFICATE_GENERATED: 'CERTIFICATE_GENERATED',

  // Configuración
  SETTINGS_CHANGED: 'SETTINGS_CHANGED',
  PROFILE_UPDATED: 'PROFILE_UPDATED',
  SUBSCRIPTION_CHANGED: 'SUBSCRIPTION_CHANGED',

  // Admin
  TENANT_SUSPENDED: 'TENANT_SUSPENDED',
  TENANT_ACTIVATED: 'TENANT_ACTIVATED',
  SERVICE_DELIVERED: 'SERVICE_DELIVERED',
  UNAUTHORIZED_ACCESS: 'UNAUTHORIZED_ACCESS',
};

// ============================================================
// UTILITY FUNCTION - logAuditAction
// ============================================================

/**
 * Registrar acción en el audit log
 * Esta función es reutilizable desde cualquier parte del sistema
 *
 * @param {Object} params
 * @param {string} params.tenantId - ID del tenant
 * @param {string} params.userId - ID del usuario que realizó la acción
 * @param {string} params.userEmail - Email del usuario
 * @param {string} params.action - Tipo de acción (de AUDIT_ACTIONS)
 * @param {Object} params.details - Detalles adicionales de la acción
 * @param {string} params.ip - Dirección IP (opcional)
 * @param {string} params.userAgent - User agent del navegador (opcional)
 */
export const logAuditAction = async ({
  tenantId,
  userId,
  userEmail,
  action,
  details = {},
  ip = null,
  userAgent = null,
}) => {
  try {
    const auditEntry = {
      tenantId,
      userId,
      userEmail,
      action,
      details,
      ip,
      userAgent,
      timestamp: new Date().toISOString(),
      // Campos para integridad (no se pueden modificar)
      createdAt: new Date().toISOString(),
      immutable: true,
    };

    // Guardar en colección raíz audit_logs (inmutable por reglas Firestore)
    const docRef = await db.collection('audit_logs').add(auditEntry);

    // También guardar copia en la colección del tenant para consultas rápidas
    if (tenantId) {
      await db
        .collection('tenants')
        .doc(tenantId)
        .collection('audit_log')
        .add({
          ...auditEntry,
          rootLogId: docRef.id,
        });
    }

    logger.info('Audit log entry created:', { action, tenantId, userId });

    return docRef.id;
  } catch (error) {
    // Los errores de audit no deben bloquear la operación principal
    logger.error('Error creating audit log entry:', error);
    return null;
  }
};

// ============================================================
// CLOUD FUNCTIONS
// ============================================================

/**
 * Obtener audit log del tenant
 */
export const getTenantAuditLog = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const tenantId = request.auth.uid;
    const {
      action = 'all',
      userId = 'all',
      startDate,
      endDate,
      limit = 100,
    } = request.data || {};

    try {
      let query = db
        .collection('tenants')
        .doc(tenantId)
        .collection('audit_log')
        .orderBy('timestamp', 'desc');

      // Filtro por acción
      if (action !== 'all') {
        query = query.where('action', '==', action);
      }

      // Filtro por usuario
      if (userId !== 'all') {
        query = query.where('userId', '==', userId);
      }

      // Filtro por fecha
      if (startDate) {
        query = query.where('timestamp', '>=', startDate);
      }
      if (endDate) {
        query = query.where('timestamp', '<=', endDate);
      }

      query = query.limit(limit);

      const snapshot = await query.get();

      const logs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Obtener resumen de acciones
      const summarySnapshot = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('audit_log')
        .get();

      const actionSummary = {};
      summarySnapshot.docs.forEach((doc) => {
        const data = doc.data();
        actionSummary[data.action] = (actionSummary[data.action] || 0) + 1;
      });

      return {
        success: true,
        logs,
        summary: {
          total: summarySnapshot.size,
          byAction: actionSummary,
        },
      };
    } catch (error) {
      logger.error('Error getting audit log:', error);
      throw new HttpsError('internal', 'Error al obtener el registro de auditoría');
    }
  }
);

/**
 * Obtener audit log global (ADMIN ONLY)
 */
export const getGlobalAuditLog = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    // Verificar rol de admin
    if (request.auth.token.role !== 'admin') {
      // Registrar intento de acceso no autorizado
      await logAuditAction({
        tenantId: request.auth.uid,
        userId: request.auth.uid,
        userEmail: request.auth.token.email,
        action: AUDIT_ACTIONS.UNAUTHORIZED_ACCESS,
        details: {
          attemptedAction: 'getGlobalAuditLog',
        },
      });

      throw new HttpsError('permission-denied', 'Acceso no autorizado');
    }

    const { action = 'all', limit = 100 } = request.data || {};

    try {
      let query = db.collection('audit_logs').orderBy('timestamp', 'desc');

      if (action !== 'all') {
        query = query.where('action', '==', action);
      }

      query = query.limit(limit);

      const snapshot = await query.get();

      const logs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return {
        success: true,
        logs,
      };
    } catch (error) {
      logger.error('Error getting global audit log:', error);
      throw new HttpsError('internal', 'Error al obtener el registro de auditoría');
    }
  }
);

/**
 * Trigger: Log cuando se crea una operación
 */
export const onOperationCreated = onDocumentCreated(
  {
    document: 'tenants/{tenantId}/operations/{operationId}',
    region: 'us-central1',
  },
  async (event) => {
    const data = event.data?.data();
    const tenantId = event.params.tenantId;
    const operationId = event.params.operationId;

    if (!data) return;

    await logAuditAction({
      tenantId,
      userId: data.createdBy || tenantId,
      userEmail: data.createdByEmail || 'system',
      action: AUDIT_ACTIONS.OPERATION_CREATED,
      details: {
        operationId,
        operationType: data.tipo,
        clientName: data.cliente?.nombre,
        amount: data.monto,
      },
    });
  }
);

/**
 * Trigger: Log cuando se sube un documento a la bóveda
 */
export const onVaultDocumentCreated = onDocumentCreated(
  {
    document: 'tenants/{tenantId}/compliance_vault/{docId}',
    region: 'us-central1',
  },
  async (event) => {
    const data = event.data?.data();
    const tenantId = event.params.tenantId;
    const docId = event.params.docId;

    if (!data) return;

    await logAuditAction({
      tenantId,
      userId: data.uploadedBy || tenantId,
      userEmail: data.uploadedByEmail || 'system',
      action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
      details: {
        documentId: docId,
        documentName: data.name,
        documentType: data.type,
      },
    });
  }
);

/**
 * Exportar acciones de audit para usar en reglas de seguridad
 */
export const getAuditActions = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    return {
      success: true,
      actions: Object.keys(AUDIT_ACTIONS),
    };
  }
);

export default {
  AUDIT_ACTIONS,
  logAuditAction,
  getTenantAuditLog,
  getGlobalAuditLog,
  onOperationCreated,
  onVaultDocumentCreated,
  getAuditActions,
};
