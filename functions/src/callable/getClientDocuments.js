/**
 * Callable Function: getClientDocuments
 * Obtiene la lista de documentos KYC de un cliente
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';

const db = getFirestore();
const storage = getStorage();

// Tipos de documentos KYC requeridos
const DOCUMENT_TYPES = [
  { id: 'INE_FRONT', name: 'INE (Frente)', required: true },
  { id: 'INE_BACK', name: 'INE (Reverso)', required: true },
  { id: 'PROOF_OF_ADDRESS', name: 'Comprobante de Domicilio', required: true },
  { id: 'CURP', name: 'CURP', required: false },
  { id: 'TAX_ID', name: 'Cédula Fiscal (CSF)', required: false },
  { id: 'INCORPORATION', name: 'Acta Constitutiva', required: false },
  { id: 'POWER_OF_ATTORNEY', name: 'Poder Notarial', required: false },
  { id: 'OTHER', name: 'Otro Documento', required: false },
];

export const getClientDocuments = onCall(
  {
    region: 'us-central1',
    enforceAppCheck: false,
  },
  async (request) => {
    // Verificar autenticación
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const { clientRfc } = request.data;
    const tenantId = request.auth.token.tenantId || request.auth.uid;

    if (!clientRfc) {
      throw new HttpsError('invalid-argument', 'Se requiere el RFC del cliente');
    }

    try {
      // Buscar el cliente en Firestore
      const clientsQuery = await db
        .collection('clients')
        .where('tenantId', '==', tenantId)
        .where('rfc', '==', clientRfc.toUpperCase())
        .limit(1)
        .get();

      let clientData = null;
      let clientId = null;

      if (!clientsQuery.empty) {
        const clientDoc = clientsQuery.docs[0];
        clientId = clientDoc.id;
        clientData = clientDoc.data();
      }

      // Obtener documentos del Storage
      const bucket = storage.bucket();
      const basePath = `tenants/${tenantId}/clients/${clientRfc.toUpperCase()}/docs/`;

      const [files] = await bucket.getFiles({
        prefix: basePath,
      });

      // Mapear archivos a tipos de documento
      const uploadedDocs = {};
      for (const file of files) {
        const fileName = file.name.replace(basePath, '');
        const docType = fileName.split('_')[0]; // Ej: INE_FRONT_timestamp.pdf

        if (docType && DOCUMENT_TYPES.find(d => d.id === docType)) {
          const [metadata] = await file.getMetadata();
          const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 24 * 60 * 60 * 1000, // 24 horas
          });

          uploadedDocs[docType] = {
            fileName: fileName,
            filePath: file.name,
            downloadUrl: signedUrl,
            uploadedAt: metadata.timeCreated,
            size: metadata.size,
            contentType: metadata.contentType,
          };
        }
      }

      // Construir respuesta con checklist de documentos
      const documentChecklist = DOCUMENT_TYPES.map(docType => ({
        ...docType,
        uploaded: !!uploadedDocs[docType.id],
        file: uploadedDocs[docType.id] || null,
      }));

      // Calcular porcentaje de completitud
      const requiredDocs = DOCUMENT_TYPES.filter(d => d.required);
      const uploadedRequiredDocs = requiredDocs.filter(d => uploadedDocs[d.id]);
      const completionPercentage = Math.round(
        (uploadedRequiredDocs.length / requiredDocs.length) * 100
      );

      return {
        success: true,
        client: clientData
          ? {
              id: clientId,
              rfc: clientData.rfc,
              nombre: clientData.nombre || clientData.razonSocial,
              tipo: clientData.tipo, // 'FISICA' o 'MORAL'
            }
          : null,
        documents: documentChecklist,
        stats: {
          total: DOCUMENT_TYPES.length,
          uploaded: Object.keys(uploadedDocs).length,
          required: requiredDocs.length,
          requiredUploaded: uploadedRequiredDocs.length,
          completionPercentage,
        },
      };

    } catch (error) {
      logger.error('Error getting client documents:', error);
      throw new HttpsError('internal', 'Error al obtener documentos del cliente');
    }
  }
);
