/**
 * Trigger: onAcknowledgmentUpload
 * Se ejecuta cuando se sube un archivo PDF de acuse a Storage
 * Ruta esperada: tenants/{tenantId}/compliance/acuses/{reportId}.pdf
 */

import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';

const db = getFirestore();
const storage = getStorage();

export const onAcknowledgmentUpload = onObjectFinalized(
  {
    bucket: process.env.FIREBASE_STORAGE_BUCKET,
    region: 'us-central1',
  },
  async (event) => {
    const filePath = event.data.name;
    const contentType = event.data.contentType;

    // Solo procesar archivos en la ruta de acuses
    if (!filePath.includes('/compliance/acuses/')) {
      logger.log('File not in acuses path, skipping:', filePath);
      return null;
    }

    // Validar que sea un PDF
    if (contentType !== 'application/pdf') {
      logger.warn('Invalid content type for acuse:', contentType);
      return null;
    }

    try {
      // Extraer información de la ruta: tenants/{tenantId}/compliance/acuses/{reportId}.pdf
      const pathParts = filePath.split('/');
      const tenantId = pathParts[1];
      const fileName = pathParts[pathParts.length - 1];
      const reportId = fileName.replace('.pdf', '');

      logger.log('Processing acknowledgment upload:', {
        tenantId,
        reportId,
        filePath,
      });

      // Generar URL de descarga firmada (válida por 7 días)
      const bucket = storage.bucket();
      const file = bucket.file(filePath);

      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 días
      });

      // Actualizar el reporte en Firestore
      const reportRef = db.collection('reports').doc(reportId);
      const reportDoc = await reportRef.get();

      if (!reportDoc.exists) {
        logger.warn('Report not found:', reportId);
        return null;
      }

      // Verificar que el reporte pertenece al tenant correcto
      const reportData = reportDoc.data();
      if (reportData.tenantId !== tenantId) {
        logger.error('Tenant mismatch:', {
          reportTenant: reportData.tenantId,
          fileTenant: tenantId,
        });
        return null;
      }

      // Actualizar estado del reporte
      await reportRef.update({
        status: 'COMPLETED',
        acknowledgment: {
          uploadedAt: new Date().toISOString(),
          filePath: filePath,
          downloadUrl: signedUrl,
          fileName: fileName,
          fileSize: event.data.size,
        },
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Registrar en audit log
      await db.collection('auditLog').add({
        tenantId: tenantId,
        action: 'ACKNOWLEDGMENT_UPLOADED',
        resourceType: 'report',
        resourceId: reportId,
        details: {
          fileName: fileName,
          fileSize: event.data.size,
        },
        timestamp: new Date().toISOString(),
      });

      logger.log('Successfully processed acknowledgment for report:', reportId);
      return { success: true, reportId };

    } catch (error) {
      logger.error('Error processing acknowledgment upload:', error);
      throw error;
    }
  }
);
