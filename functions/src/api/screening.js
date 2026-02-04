/**
 * Screening API
 * Cloud Functions para búsqueda en listas negras
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { searchBlacklists, screenClient, batchScreenTenant } from '../services/screening.js';
import { logAuditAction } from '../triggers/audit.js';

const db = getFirestore();

/**
 * Buscar en listas negras (consulta individual)
 */
export const checkBlacklists = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const { name, rfc } = request.data;

    if (!name && !rfc) {
      throw new HttpsError('invalid-argument', 'Se requiere nombre o RFC para la búsqueda');
    }

    try {
      const result = searchBlacklists(name, rfc);

      // Registrar en audit log
      await logAuditAction({
        tenantId: request.auth.uid,
        userId: request.auth.uid,
        userEmail: request.auth.token.email,
        action: 'SCREENING_SEARCH',
        details: {
          searchName: name,
          searchRfc: rfc,
          matchFound: result.matchFound,
          matchCount: result.matches.length,
        },
      });

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      logger.error('Error in checkBlacklists:', error);
      throw new HttpsError('internal', 'Error al realizar la búsqueda');
    }
  }
);

/**
 * Realizar screening de un cliente específico
 */
export const screenClientManual = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const { clientId, name, rfc, tipo } = request.data;
    const tenantId = request.auth.uid;

    if (!name) {
      throw new HttpsError('invalid-argument', 'Se requiere el nombre del cliente');
    }

    try {
      const result = await screenClient(tenantId, clientId || 'manual', {
        name,
        rfc,
        tipo,
      });

      // Registrar en audit log
      await logAuditAction({
        tenantId,
        userId: request.auth.uid,
        userEmail: request.auth.token.email,
        action: 'CLIENT_SCREENED',
        details: {
          clientId,
          clientName: name,
          matchFound: result.matchFound,
          matchCount: result.matches.length,
        },
      });

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      logger.error('Error in screenClientManual:', error);
      throw new HttpsError('internal', 'Error al realizar el screening');
    }
  }
);

/**
 * Obtener resultados de screening del tenant
 */
export const getScreeningResults = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const tenantId = request.auth.uid;
    const { status = 'all', limit = 50 } = request.data || {};

    try {
      let query = db
        .collection('screening_results')
        .where('tenantId', '==', tenantId)
        .orderBy('searchedAt', 'desc');

      if (status !== 'all') {
        query = query.where('status', '==', status);
      }

      query = query.limit(limit);

      const snapshot = await query.get();

      const results = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Contar por estado
      const allResultsSnapshot = await db
        .collection('screening_results')
        .where('tenantId', '==', tenantId)
        .get();

      const stats = {
        total: allResultsSnapshot.size,
        pendingReview: 0,
        cleared: 0,
        confirmed: 0,
        dismissed: 0,
      };

      allResultsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        switch (data.status) {
          case 'PENDING_REVIEW':
            stats.pendingReview++;
            break;
          case 'CLEARED':
            stats.cleared++;
            break;
          case 'CONFIRMED_RISK':
            stats.confirmed++;
            break;
          case 'DISMISSED':
            stats.dismissed++;
            break;
        }
      });

      return {
        success: true,
        results,
        stats,
      };
    } catch (error) {
      logger.error('Error getting screening results:', error);
      throw new HttpsError('internal', 'Error al obtener resultados');
    }
  }
);

/**
 * Revisar resultado de screening (confirmar o descartar)
 */
export const reviewScreeningResult = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const { screeningId, action, notes } = request.data;
    const tenantId = request.auth.uid;

    if (!screeningId || !action) {
      throw new HttpsError('invalid-argument', 'Se requiere screeningId y action');
    }

    if (!['CONFIRM_RISK', 'DISMISS'].includes(action)) {
      throw new HttpsError('invalid-argument', 'Acción no válida');
    }

    try {
      const screeningRef = db.collection('screening_results').doc(screeningId);
      const screeningDoc = await screeningRef.get();

      if (!screeningDoc.exists) {
        throw new HttpsError('not-found', 'Resultado de screening no encontrado');
      }

      const screeningData = screeningDoc.data();

      if (screeningData.tenantId !== tenantId) {
        throw new HttpsError('permission-denied', 'No tienes acceso a este resultado');
      }

      const newStatus = action === 'CONFIRM_RISK' ? 'CONFIRMED_RISK' : 'DISMISSED';

      // Actualizar resultado de screening
      await screeningRef.update({
        status: newStatus,
        reviewedAt: new Date().toISOString(),
        reviewedBy: request.auth.uid,
        reviewerEmail: request.auth.token.email,
        reviewNotes: notes || '',
      });

      // Si se confirma el riesgo, actualizar el cliente
      if (action === 'CONFIRM_RISK' && screeningData.clientId) {
        await db
          .collection('tenants')
          .doc(tenantId)
          .collection('clients')
          .doc(screeningData.clientId)
          .update({
            riskLevel: 'CRITICAL',
            screeningStatus: 'CONFIRMED_RISK',
            riskNotes: `Confirmado en lista negra: ${screeningData.matches?.[0]?.sourceLabel || 'Lista negra'}`,
            updatedAt: new Date().toISOString(),
          });

        // Cerrar alerta relacionada
        const alertsSnapshot = await db
          .collection('tenants')
          .doc(tenantId)
          .collection('alerts')
          .where('screeningId', '==', screeningId)
          .get();

        for (const alertDoc of alertsSnapshot.docs) {
          await alertDoc.ref.update({
            status: 'RESOLVED',
            resolution: action === 'CONFIRM_RISK' ? 'RISK_CONFIRMED' : 'FALSE_POSITIVE',
            resolvedAt: new Date().toISOString(),
            resolvedBy: request.auth.uid,
          });
        }
      }

      // Registrar en audit log
      await logAuditAction({
        tenantId,
        userId: request.auth.uid,
        userEmail: request.auth.token.email,
        action: action === 'CONFIRM_RISK' ? 'SCREENING_CONFIRMED' : 'SCREENING_DISMISSED',
        details: {
          screeningId,
          clientName: screeningData.clientName,
          notes,
        },
      });

      return {
        success: true,
        newStatus,
        message:
          action === 'CONFIRM_RISK'
            ? 'Riesgo confirmado. El cliente ha sido marcado como alto riesgo.'
            : 'Falso positivo descartado.',
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error('Error reviewing screening result:', error);
      throw new HttpsError('internal', 'Error al revisar el resultado');
    }
  }
);

/**
 * Batch Screening - Ejecución programada diaria
 * Procesa nuevos clientes de todos los tenants
 */
export const scheduledBatchScreening = onSchedule(
  {
    schedule: '0 3 * * *', // Todos los días a las 3 AM
    region: 'us-central1',
    timeZone: 'America/Mexico_City',
  },
  async (event) => {
    logger.info('Starting scheduled batch screening');

    try {
      // Obtener todos los tenants activos
      const tenantsSnapshot = await db
        .collection('tenants')
        .where('status', '!=', 'SUSPENDED')
        .get();

      let totalProcessed = 0;
      let totalFlagged = 0;

      for (const tenantDoc of tenantsSnapshot.docs) {
        try {
          const result = await batchScreenTenant(tenantDoc.id);
          totalProcessed += result.processed;
          totalFlagged += result.flagged;

          // Si hay coincidencias, notificar al admin del tenant
          if (result.flagged > 0) {
            const tenantData = tenantDoc.data();
            const adminEmail = tenantData.oficialCumplimiento?.email || tenantData.email;

            // Crear notificación en la app
            await db.collection('tenants').doc(tenantDoc.id).collection('notifications').add({
              type: 'SCREENING_ALERT',
              title: 'Coincidencias detectadas en screening',
              message: `Se encontraron ${result.flagged} nuevas coincidencias en listas negras. Revisa el módulo de Screening.`,
              read: false,
              createdAt: new Date().toISOString(),
            });
          }
        } catch (error) {
          logger.error(`Error processing tenant ${tenantDoc.id}:`, error);
        }
      }

      logger.info('Batch screening completed', {
        tenantsProcessed: tenantsSnapshot.size,
        totalClientsProcessed: totalProcessed,
        totalFlagged,
      });
    } catch (error) {
      logger.error('Error in scheduled batch screening:', error);
    }
  }
);

/**
 * Ejecutar batch screening manual para un tenant (Admin)
 */
export const runBatchScreening = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const tenantId = request.auth.uid;

    try {
      const result = await batchScreenTenant(tenantId);

      // Registrar en audit log
      await logAuditAction({
        tenantId,
        userId: request.auth.uid,
        userEmail: request.auth.token.email,
        action: 'BATCH_SCREENING_RUN',
        details: {
          processed: result.processed,
          flagged: result.flagged,
          cleared: result.cleared,
        },
      });

      return {
        success: true,
        ...result,
        message: `Screening completado. ${result.processed} clientes procesados, ${result.flagged} coincidencias encontradas.`,
      };
    } catch (error) {
      logger.error('Error in runBatchScreening:', error);
      throw new HttpsError('internal', 'Error al ejecutar el screening masivo');
    }
  }
);

export default {
  checkBlacklists,
  screenClientManual,
  getScreeningResults,
  reviewScreeningResult,
  scheduledBatchScreening,
  runBatchScreening,
};
