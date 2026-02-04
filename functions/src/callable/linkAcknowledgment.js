/**
 * Callable Function: linkAcknowledgment
 * Vincula manualmente un PDF de acuse con un reporte específico
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';

const db = getFirestore();
const storage = getStorage();

export const linkAcknowledgment = onCall(
  {
    region: 'us-central1',
    enforceAppCheck: false, // Habilitar en producción
  },
  async (request) => {
    // Verificar autenticación
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const { reportId, pdfPath } = request.data;
    const tenantId = request.auth.token.tenantId || request.auth.uid;

    // Validar parámetros
    if (!reportId || !pdfPath) {
      throw new HttpsError(
        'invalid-argument',
        'Se requiere reportId y pdfPath'
      );
    }

    try {
      // Verificar que el reporte existe y pertenece al tenant
      const reportRef = db.collection('reports').doc(reportId);
      const reportDoc = await reportRef.get();

      if (!reportDoc.exists) {
        throw new HttpsError('not-found', 'Reporte no encontrado');
      }

      const reportData = reportDoc.data();
      if (reportData.tenantId !== tenantId) {
        throw new HttpsError(
          'permission-denied',
          'No tienes permiso para modificar este reporte'
        );
      }

      // Verificar que el archivo existe en Storage
      const bucket = storage.bucket();
      const file = bucket.file(pdfPath);
      const [exists] = await file.exists();

      if (!exists) {
        throw new HttpsError('not-found', 'Archivo PDF no encontrado');
      }

      // Obtener metadata del archivo
      const [metadata] = await file.getMetadata();

      // Generar URL de descarga firmada
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 días
      });

      // Actualizar el reporte
      await reportRef.update({
        status: 'COMPLETED',
        acknowledgment: {
          uploadedAt: new Date().toISOString(),
          filePath: pdfPath,
          downloadUrl: signedUrl,
          fileName: pdfPath.split('/').pop(),
          fileSize: metadata.size,
          linkedBy: request.auth.uid,
        },
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Registrar en audit log
      await db.collection('auditLog').add({
        tenantId: tenantId,
        userId: request.auth.uid,
        action: 'ACKNOWLEDGMENT_LINKED',
        resourceType: 'report',
        resourceId: reportId,
        details: {
          pdfPath: pdfPath,
        },
        timestamp: new Date().toISOString(),
      });

      logger.log('Successfully linked acknowledgment:', {
        reportId,
        pdfPath,
        tenantId,
      });

      return {
        success: true,
        reportId,
        downloadUrl: signedUrl,
      };

    } catch (error) {
      logger.error('Error linking acknowledgment:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError('internal', 'Error al vincular el acuse');
    }
  }
);
