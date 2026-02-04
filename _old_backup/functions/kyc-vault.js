/**
 * PLD BDU - Módulo de Expediente Digital (KYC Vault)
 * 
 * Sistema de gestión de documentos KYC con conservación
 * obligatoria de 5 años según normativa LFPIORPI.
 * 
 * Estructura de Storage:
 * documents/{tenantId}/{workspaceId}/clients/{clientRFC}/{docType}/{filename}
 * 
 * @version 2.0.0
 * @date 2026-01-25
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');

const db = admin.firestore();
const storage = admin.storage();

// ============================================================================
// CONFIGURACIÓN
// ============================================================================
const CONFIG = {
    // Tiempo de validez para URLs de subida (15 minutos)
    UPLOAD_URL_EXPIRY_MINUTES: 15,

    // Tiempo de validez para URLs de visualización (1 hora)
    VIEW_URL_EXPIRY_MINUTES: 60,

    // Años de retención obligatoria
    RETENTION_YEARS: 5,

    // Tamaño máximo de archivo (10 MB)
    MAX_FILE_SIZE_MB: 10,

    // Tipos de archivo permitidos
    ALLOWED_MIME_TYPES: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf',
    ],

    // Extensiones permitidas
    ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp', '.pdf'],
};

// ============================================================================
// TIPOS DE DOCUMENTOS KYC
// ============================================================================
const DOCUMENT_TYPES = {
    // Identificación
    IDENTIFICACION_OFICIAL: {
        id: 'IDENTIFICACION_OFICIAL',
        name_es: 'Identificación Oficial',
        description_es: 'INE/IFE, Pasaporte o Cédula Profesional',
        required: true,
        max_files: 2, // Frente y reverso
        valid_for_days: 3650, // 10 años
        applies_to: ['PF', 'PM'], // Persona Física y Moral (representante)
    },

    CURP: {
        id: 'CURP',
        name_es: 'CURP',
        description_es: 'Clave Única de Registro de Población',
        required: true,
        max_files: 1,
        valid_for_days: null, // No expira
        applies_to: ['PF'],
    },

    COMPROBANTE_DOMICILIO: {
        id: 'COMPROBANTE_DOMICILIO',
        name_es: 'Comprobante de Domicilio',
        description_es: 'Recibo de luz, agua, teléfono (máximo 3 meses)',
        required: true,
        max_files: 1,
        valid_for_days: 90, // 3 meses
        applies_to: ['PF', 'PM'],
    },

    RFC: {
        id: 'RFC',
        name_es: 'Constancia de Situación Fiscal',
        description_es: 'Constancia de RFC con situación fiscal',
        required: true,
        max_files: 1,
        valid_for_days: 365, // 1 año
        applies_to: ['PF', 'PM'],
    },

    // Persona Moral
    ACTA_CONSTITUTIVA: {
        id: 'ACTA_CONSTITUTIVA',
        name_es: 'Acta Constitutiva',
        description_es: 'Acta constitutiva de la empresa',
        required: true,
        max_files: 1,
        valid_for_days: null,
        applies_to: ['PM'],
    },

    PODER_NOTARIAL: {
        id: 'PODER_NOTARIAL',
        name_es: 'Poder Notarial',
        description_es: 'Poder del representante legal',
        required: true,
        max_files: 1,
        valid_for_days: null,
        applies_to: ['PM'],
    },

    // Específicos por actividad
    ESCRITURA_PUBLICA: {
        id: 'ESCRITURA_PUBLICA',
        name_es: 'Escritura Pública',
        description_es: 'Escritura de la propiedad (Inmuebles)',
        required: false,
        max_files: 1,
        valid_for_days: null,
        applies_to: ['INMUEBLES'],
    },

    FACTURA_VEHICULO: {
        id: 'FACTURA_VEHICULO',
        name_es: 'Factura del Vehículo',
        description_es: 'Factura original o endosada',
        required: false,
        max_files: 1,
        valid_for_days: null,
        applies_to: ['VEHICULOS'],
    },

    CONTRATO_MUTUO: {
        id: 'CONTRATO_MUTUO',
        name_es: 'Contrato de Mutuo',
        description_es: 'Contrato firmado de préstamo',
        required: false,
        max_files: 1,
        valid_for_days: null,
        applies_to: ['MUTUO_PRESTAMO'],
    },

    // Beneficiario Controlador (Reforma 2025)
    BC_IDENTIFICACION: {
        id: 'BC_IDENTIFICACION',
        name_es: 'ID Beneficiario Controlador',
        description_es: 'Identificación del beneficiario controlador',
        required: false, // Requerido si PM
        max_files: 2,
        valid_for_days: 3650,
        applies_to: ['BC'],
    },

    BC_COMPROBANTE_DOMICILIO: {
        id: 'BC_COMPROBANTE_DOMICILIO',
        name_es: 'Comprobante Domicilio BC',
        description_es: 'Comprobante de domicilio del beneficiario',
        required: false,
        max_files: 1,
        valid_for_days: 90,
        applies_to: ['BC'],
    },

    // Otros
    OTRO: {
        id: 'OTRO',
        name_es: 'Otro Documento',
        description_es: 'Documento adicional',
        required: false,
        max_files: 10,
        valid_for_days: null,
        applies_to: ['PF', 'PM'],
    },
};

// ============================================================================
// REQUISITOS POR ACTIVIDAD
// ============================================================================
const ACTIVITY_REQUIREMENTS = {
    INMUEBLES: {
        PF: ['IDENTIFICACION_OFICIAL', 'CURP', 'COMPROBANTE_DOMICILIO', 'RFC'],
        PM: ['IDENTIFICACION_OFICIAL', 'COMPROBANTE_DOMICILIO', 'RFC', 'ACTA_CONSTITUTIVA', 'PODER_NOTARIAL'],
        BC: ['BC_IDENTIFICACION'],
        OPTIONAL: ['ESCRITURA_PUBLICA'],
    },

    VEHICULOS: {
        PF: ['IDENTIFICACION_OFICIAL', 'CURP', 'COMPROBANTE_DOMICILIO', 'RFC'],
        PM: ['IDENTIFICACION_OFICIAL', 'COMPROBANTE_DOMICILIO', 'RFC', 'ACTA_CONSTITUTIVA', 'PODER_NOTARIAL'],
        BC: ['BC_IDENTIFICACION'],
        OPTIONAL: ['FACTURA_VEHICULO'],
    },

    MUTUO_PRESTAMO: {
        PF: ['IDENTIFICACION_OFICIAL', 'CURP', 'COMPROBANTE_DOMICILIO', 'RFC'],
        PM: ['IDENTIFICACION_OFICIAL', 'COMPROBANTE_DOMICILIO', 'RFC', 'ACTA_CONSTITUTIVA', 'PODER_NOTARIAL'],
        BC: ['BC_IDENTIFICACION', 'BC_COMPROBANTE_DOMICILIO'],
        OPTIONAL: ['CONTRATO_MUTUO'],
    },

    ACTIVOS_VIRTUALES: {
        PF: ['IDENTIFICACION_OFICIAL', 'CURP', 'COMPROBANTE_DOMICILIO', 'RFC'],
        PM: ['IDENTIFICACION_OFICIAL', 'COMPROBANTE_DOMICILIO', 'RFC', 'ACTA_CONSTITUTIVA', 'PODER_NOTARIAL'],
        BC: ['BC_IDENTIFICACION'],
        OPTIONAL: [],
    },

    DEFAULT: {
        PF: ['IDENTIFICACION_OFICIAL', 'CURP', 'COMPROBANTE_DOMICILIO'],
        PM: ['IDENTIFICACION_OFICIAL', 'COMPROBANTE_DOMICILIO', 'ACTA_CONSTITUTIVA', 'PODER_NOTARIAL'],
        BC: ['BC_IDENTIFICACION'],
        OPTIONAL: [],
    },
};

// ============================================================================
// ESQUEMA DE client_profile
// ============================================================================
/*
Path: tenants/{tenantId}/client_profiles/{clientId}

{
  client_id: "client_abc123",
  tenant_id: "tenant_xyz",
  
  // Datos básicos
  tipo_persona: "PF" | "PM",
  rfc: "XAXX010101000",
  curp: "XAXX010101HDFXXX00",
  nombre_completo: "Juan Pérez García",
  razon_social: null, // Para PM
  
  // Estado KYC
  kyc_status: "COMPLETE" | "INCOMPLETE" | "PENDING_REVIEW" | "EXPIRED",
  kyc_completion_percent: 85,
  kyc_last_verified: Timestamp,
  kyc_verified_by: "user_id",
  
  // Documentos cargados
  documents: [
    {
      document_id: "doc_123",
      type: "IDENTIFICACION_OFICIAL",
      type_name_es: "Identificación Oficial",
      file_name: "INE_frente.pdf",
      file_path: "documents/tenant_xyz/.../IDENTIFICACION_OFICIAL/INE_frente.pdf",
      file_size_bytes: 245000,
      mime_type: "application/pdf",
      
      // Validez
      uploaded_at: "2026-01-15T10:00:00Z",
      uploaded_by: "user_abc",
      expires_at: "2036-01-15T10:00:00Z", // +10 años para INE
      is_expired: false,
      
      // Verificación
      verified: true,
      verified_at: "2026-01-15T10:30:00Z",
      verified_by: "user_xyz",
      verification_notes: "Documento legible y vigente",
      
      // Metadatos
      hash_md5: "abc123...",
      retention_until: "2031-01-15T10:00:00Z", // +5 años retención
    },
    // ... más documentos
  ],
  
  // Resumen de documentos
  documents_summary: {
    total: 4,
    verified: 3,
    pending: 1,
    expired: 0,
    required_complete: true,
  },
  
  // Beneficiario Controlador (si PM)
  has_beneficiario_controlador: true,
  beneficiario_controlador: {
    nombre: "María López",
    rfc: "LOMA850101XXX",
    documents: [ ... ]
  },
  
  // Auditoría
  created_at: Timestamp,
  updated_at: Timestamp,
  last_activity_at: Timestamp,
}
*/

// ============================================================================
// CLOUD FUNCTION: generateUploadUrl
// Genera URL firmada para subir documento
// ============================================================================

exports.generateUploadUrl = functions.https.onCall(async (data, context) => {
    // Validar autenticación
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
    }

    const {
        tenantId,
        workspaceId,
        clientRFC,
        docType,
        fileName,
        mimeType,
        fileSize,
    } = data;

    // Validar parámetros
    if (!tenantId || !workspaceId || !clientRFC || !docType || !fileName) {
        throw new functions.https.HttpsError('invalid-argument',
            'Faltan parámetros requeridos');
    }

    // Validar acceso al tenant
    const callerTenantId = context.auth.token.tenantId;
    if (context.auth.token.role !== 'SUPER_ADMIN' && callerTenantId !== tenantId) {
        throw new functions.https.HttpsError('permission-denied', 'Sin acceso a este tenant');
    }

    // Validar tipo de documento
    if (!DOCUMENT_TYPES[docType]) {
        throw new functions.https.HttpsError('invalid-argument',
            `Tipo de documento inválido: ${docType}`);
    }

    // Validar tipo MIME
    if (!CONFIG.ALLOWED_MIME_TYPES.includes(mimeType)) {
        throw new functions.https.HttpsError('invalid-argument',
            `Tipo de archivo no permitido: ${mimeType}. Use: ${CONFIG.ALLOWED_MIME_TYPES.join(', ')}`);
    }

    // Validar tamaño
    if (fileSize > CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024) {
        throw new functions.https.HttpsError('invalid-argument',
            `Archivo muy grande. Máximo: ${CONFIG.MAX_FILE_SIZE_MB} MB`);
    }

    console.log(`[KYC] Generando upload URL para ${clientRFC}/${docType}`);

    // Sanitizar RFC
    const safeRFC = clientRFC.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Generar nombre único
    const timestamp = Date.now();
    const extension = fileName.split('.').pop().toLowerCase();
    const uniqueFileName = `${docType}_${timestamp}.${extension}`;

    // Construir path
    const filePath = `documents/${tenantId}/${workspaceId}/clients/${safeRFC}/${docType}/${uniqueFileName}`;

    // Obtener referencia al bucket
    const bucket = storage.bucket();
    const file = bucket.file(filePath);

    // Generar URL firmada para subida
    const expirationTime = Date.now() + (CONFIG.UPLOAD_URL_EXPIRY_MINUTES * 60 * 1000);

    const [uploadUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: expirationTime,
        contentType: mimeType,
        // Limitar tamaño
        extensionHeaders: {
            'x-goog-content-length-range': `0,${CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024}`,
        },
    });

    // Generar documento ID
    const documentId = `doc_${timestamp}_${crypto.randomBytes(4).toString('hex')}`;

    // Guardar registro pendiente
    await db.collection('pending_uploads').doc(documentId).set({
        document_id: documentId,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        client_rfc: safeRFC,
        doc_type: docType,
        file_name: uniqueFileName,
        original_file_name: fileName,
        file_path: filePath,
        mime_type: mimeType,
        expected_size: fileSize,

        upload_url_expires_at: new Date(expirationTime).toISOString(),
        uploaded_at: null,
        uploaded_by: context.auth.uid,
        status: 'pending',

        created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[KYC] ✅ URL generada: ${documentId}`);

    return {
        success: true,
        uploadUrl,
        documentId,
        filePath,
        expiresAt: new Date(expirationTime).toISOString(),
        expiresInMinutes: CONFIG.UPLOAD_URL_EXPIRY_MINUTES,

        instructions: [
            `1. Usa HTTP PUT para subir el archivo`,
            `2. Añade header: Content-Type: ${mimeType}`,
            `3. Confirma la subida llamando a confirmUpload`,
        ],
    };
});

// ============================================================================
// CLOUD FUNCTION: confirmUpload
// Confirma que un archivo se subió correctamente
// ============================================================================

exports.confirmUpload = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
    }

    const { documentId, clientId } = data;

    if (!documentId) {
        throw new functions.https.HttpsError('invalid-argument', 'Falta documentId');
    }

    // Obtener registro pendiente
    const pendingDoc = await db.collection('pending_uploads').doc(documentId).get();

    if (!pendingDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Registro de upload no encontrado');
    }

    const pending = pendingDoc.data();

    // Verificar que el archivo existe en Storage
    const bucket = storage.bucket();
    const file = bucket.file(pending.file_path);

    const [exists] = await file.exists();
    if (!exists) {
        throw new functions.https.HttpsError('not-found',
            'El archivo no se encontró. Reintente la subida.');
    }

    // Obtener metadata del archivo
    const [metadata] = await file.getMetadata();

    // Calcular hash MD5
    const hash = metadata.md5Hash;

    // Calcular fecha de expiración del documento
    const docTypeConfig = DOCUMENT_TYPES[pending.doc_type];
    const expiresAt = docTypeConfig.valid_for_days
        ? new Date(Date.now() + docTypeConfig.valid_for_days * 24 * 60 * 60 * 1000)
        : null;

    // Calcular fecha de retención obligatoria (5 años)
    const retentionUntil = new Date();
    retentionUntil.setFullYear(retentionUntil.getFullYear() + CONFIG.RETENTION_YEARS);

    // Crear documento en el perfil del cliente
    const documentData = {
        document_id: documentId,
        type: pending.doc_type,
        type_name_es: docTypeConfig.name_es,
        file_name: pending.file_name,
        original_file_name: pending.original_file_name,
        file_path: pending.file_path,
        file_size_bytes: parseInt(metadata.size),
        mime_type: pending.mime_type,

        uploaded_at: admin.firestore.FieldValue.serverTimestamp(),
        uploaded_by: context.auth.uid,
        expires_at: expiresAt?.toISOString() || null,
        is_expired: false,

        verified: false,
        verified_at: null,
        verified_by: null,
        verification_notes: null,

        hash_md5: hash,
        retention_until: retentionUntil.toISOString(),
    };

    // Actualizar o crear perfil de cliente
    const clientProfileRef = db
        .collection('tenants')
        .doc(pending.tenant_id)
        .collection('client_profiles')
        .doc(clientId || pending.client_rfc);

    const clientDoc = await clientProfileRef.get();

    if (clientDoc.exists) {
        // Agregar documento al array
        await clientProfileRef.update({
            documents: admin.firestore.FieldValue.arrayUnion(documentData),
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
            last_activity_at: admin.firestore.FieldValue.serverTimestamp(),
        });
    } else {
        // Crear perfil nuevo
        await clientProfileRef.set({
            client_id: clientId || pending.client_rfc,
            tenant_id: pending.tenant_id,
            rfc: pending.client_rfc,
            kyc_status: 'INCOMPLETE',
            documents: [documentData],
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
        });
    }

    // Marcar como completado
    await db.collection('pending_uploads').doc(documentId).update({
        status: 'completed',
        uploaded_at: admin.firestore.FieldValue.serverTimestamp(),
        file_size_actual: parseInt(metadata.size),
        hash_md5: hash,
    });

    console.log(`[KYC] ✅ Documento confirmado: ${documentId}`);

    // Disparar auditoría de completitud
    await auditClientCompleteness(pending.tenant_id, pending.workspace_id, clientId || pending.client_rfc);

    return {
        success: true,
        documentId,
        message: 'Documento registrado exitosamente',
    };
});

// ============================================================================
// CLOUD FUNCTION: auditFileCompleteness (También como función interna)
// Verifica completitud de documentos KYC
// ============================================================================

exports.auditFileCompleteness = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
    }

    const { tenantId, workspaceId, clientId } = data;

    return await auditClientCompleteness(tenantId, workspaceId, clientId);
});

/**
 * Audita la completitud de documentos de un cliente
 */
async function auditClientCompleteness(tenantId, workspaceId, clientId) {
    console.log(`[KYC] Auditando completitud: ${clientId}`);

    // Obtener perfil del cliente
    const clientRef = db
        .collection('tenants')
        .doc(tenantId)
        .collection('client_profiles')
        .doc(clientId);

    const clientDoc = await clientRef.get();

    if (!clientDoc.exists) {
        return { status: 'NOT_FOUND', message: 'Perfil de cliente no encontrado' };
    }

    const client = clientDoc.data();
    const documents = client.documents || [];
    const tipoPersona = client.tipo_persona || 'PF';

    // Obtener actividad del workspace
    const workspaceDoc = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('workspaces')
        .doc(workspaceId)
        .get();

    const activityType = workspaceDoc.exists
        ? workspaceDoc.data().activity_type
        : 'DEFAULT';

    // Obtener requisitos
    const requirements = ACTIVITY_REQUIREMENTS[activityType] || ACTIVITY_REQUIREMENTS.DEFAULT;
    const requiredDocs = requirements[tipoPersona] || [];

    // Verificar documentos cargados
    const uploadedTypes = documents.map(d => d.type);
    const missingDocs = [];
    const expiredDocs = [];
    const verifiedDocs = [];
    const pendingVerification = [];

    for (const reqType of requiredDocs) {
        if (!uploadedTypes.includes(reqType)) {
            missingDocs.push({
                type: reqType,
                name_es: DOCUMENT_TYPES[reqType]?.name_es || reqType,
            });
        }
    }

    // Verificar expiración y estado
    const today = new Date();

    for (const doc of documents) {
        if (doc.expires_at && new Date(doc.expires_at) < today) {
            expiredDocs.push(doc.type);
            doc.is_expired = true;
        }

        if (doc.verified) {
            verifiedDocs.push(doc.type);
        } else {
            pendingVerification.push(doc.type);
        }
    }

    // Calcular estado KYC
    const requiredComplete = missingDocs.length === 0 && expiredDocs.length === 0;
    const allVerified = pendingVerification.length === 0 && documents.length > 0;

    let kycStatus;
    if (requiredComplete && allVerified) {
        kycStatus = 'COMPLETE';
    } else if (expiredDocs.length > 0) {
        kycStatus = 'EXPIRED';
    } else if (pendingVerification.length > 0) {
        kycStatus = 'PENDING_REVIEW';
    } else {
        kycStatus = 'INCOMPLETE';
    }

    // Calcular porcentaje de completitud
    const totalRequired = requiredDocs.length;
    const totalUploaded = requiredDocs.filter(r => uploadedTypes.includes(r)).length;
    const completionPercent = totalRequired > 0
        ? Math.round((totalUploaded / totalRequired) * 100)
        : 0;

    // Actualizar perfil
    const summary = {
        total: documents.length,
        verified: verifiedDocs.length,
        pending: pendingVerification.length,
        expired: expiredDocs.length,
        required_complete: requiredComplete,
    };

    await clientRef.update({
        kyc_status: kycStatus,
        kyc_completion_percent: completionPercent,
        documents_summary: summary,
        documents: documents, // Actualizar con is_expired
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[KYC] ✅ Auditoría completa: ${kycStatus} (${completionPercent}%)`);

    return {
        status: kycStatus,
        completionPercent,
        summary,
        missingDocuments: missingDocs,
        expiredDocuments: expiredDocs,
        pendingVerification,
    };
}

// ============================================================================
// CLOUD FUNCTION: getDocumentViewUrl
// Genera URL temporal para visualizar documento
// ============================================================================

exports.getDocumentViewUrl = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
    }

    const { tenantId, filePath } = data;

    // Validar acceso
    const callerTenantId = context.auth.token.tenantId;
    if (context.auth.token.role !== 'SUPER_ADMIN' && callerTenantId !== tenantId) {
        throw new functions.https.HttpsError('permission-denied', 'Sin acceso');
    }

    // Verificar que el path corresponde al tenant
    if (!filePath.includes(`/${tenantId}/`)) {
        throw new functions.https.HttpsError('permission-denied', 'Acceso no autorizado a este archivo');
    }

    const bucket = storage.bucket();
    const file = bucket.file(filePath);

    const [exists] = await file.exists();
    if (!exists) {
        throw new functions.https.HttpsError('not-found', 'Archivo no encontrado');
    }

    const expirationTime = Date.now() + (CONFIG.VIEW_URL_EXPIRY_MINUTES * 60 * 1000);

    const [viewUrl] = await file.getSignedUrl({
        action: 'read',
        expires: expirationTime,
    });

    // Log de acceso
    await db.collection('document_access_logs').add({
        tenant_id: tenantId,
        file_path: filePath,
        accessed_by: context.auth.uid,
        access_type: 'view',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
        success: true,
        viewUrl,
        expiresAt: new Date(expirationTime).toISOString(),
        expiresInMinutes: CONFIG.VIEW_URL_EXPIRY_MINUTES,
    };
});

// ============================================================================
// CLOUD FUNCTION: verifyDocument
// Marca un documento como verificado
// ============================================================================

exports.verifyDocument = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
    }

    const callerRole = context.auth.token.role;
    const allowedRoles = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPLIANCE_OFFICER'];

    if (!allowedRoles.includes(callerRole)) {
        throw new functions.https.HttpsError('permission-denied',
            'Solo administradores o compliance pueden verificar documentos');
    }

    const { tenantId, clientId, documentId, verified, notes } = data;

    const clientRef = db
        .collection('tenants')
        .doc(tenantId)
        .collection('client_profiles')
        .doc(clientId);

    const clientDoc = await clientRef.get();

    if (!clientDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Cliente no encontrado');
    }

    const documents = clientDoc.data().documents || [];
    const docIndex = documents.findIndex(d => d.document_id === documentId);

    if (docIndex === -1) {
        throw new functions.https.HttpsError('not-found', 'Documento no encontrado');
    }

    // Actualizar documento
    documents[docIndex].verified = verified;
    documents[docIndex].verified_at = new Date().toISOString();
    documents[docIndex].verified_by = context.auth.uid;
    documents[docIndex].verification_notes = notes || null;

    await clientRef.update({
        documents,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Re-auditar completitud
    await auditClientCompleteness(tenantId, data.workspaceId, clientId);

    return {
        success: true,
        message: verified ? 'Documento verificado' : 'Documento marcado como no verificado',
    };
});

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    DOCUMENT_TYPES,
    ACTIVITY_REQUIREMENTS,
    generateUploadUrl: exports.generateUploadUrl,
    confirmUpload: exports.confirmUpload,
    auditFileCompleteness: exports.auditFileCompleteness,
    getDocumentViewUrl: exports.getDocumentViewUrl,
    verifyDocument: exports.verifyDocument,
};
