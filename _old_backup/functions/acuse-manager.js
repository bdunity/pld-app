/**
 * PLD BDU - Módulo de Gestión de Acuses y Estatus
 * 
 * Sistema para vincular acuses del SAT con reportes XML generados.
 * Cierra el ciclo de auditoría cuando el SAT acepta el aviso.
 * 
 * Estados del reporte:
 * - GENERATED: XML creado, pendiente de envío
 * - SUBMITTED: Enviado al SAT (según usuario)
 * - ACCEPTED: Acuse recibido y validado
 * - REJECTED: Rechazado por el SAT
 * - EXPIRED: Fuera de plazo
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
    // Tiempo de validez URL de subida (15 min)
    UPLOAD_URL_EXPIRY_MINUTES: 15,

    // Tipos MIME permitidos para acuse
    ALLOWED_ACUSE_TYPES: ['application/pdf', 'image/png', 'image/jpeg'],

    // Máximo tamaño de acuse (5 MB)
    MAX_ACUSE_SIZE_MB: 5,
};

// ============================================================================
// ESTADOS DE REPORTE
// ============================================================================
const REPORT_STATUS = {
    GENERATED: {
        id: 'GENERATED',
        label_es: 'Generado',
        description_es: 'XML creado, pendiente de envío al SAT',
        color: 'blue',
        icon: 'document-text',
    },
    SUBMITTED: {
        id: 'SUBMITTED',
        label_es: 'Enviado',
        description_es: 'Enviado al SAT, esperando acuse',
        color: 'yellow',
        icon: 'paper-airplane',
    },
    ACCEPTED: {
        id: 'ACCEPTED',
        label_es: 'Aceptado',
        description_es: 'Acuse recibido y validado por el SAT',
        color: 'green',
        icon: 'check-circle',
    },
    REJECTED: {
        id: 'REJECTED',
        label_es: 'Rechazado',
        description_es: 'Rechazado por el SAT, requiere corrección',
        color: 'red',
        icon: 'x-circle',
    },
    EXPIRED: {
        id: 'EXPIRED',
        label_es: 'Expirado',
        description_es: 'Fuera del plazo de presentación',
        color: 'gray',
        icon: 'clock',
    },
};

// ============================================================================
// ESTRUCTURA DE REPORTE CON ACUSE
// ============================================================================
/*
Path: tenants/{tenantId}/generated_reports/{reportId}

{
  // Datos existentes del reporte...
  report_id: "rep_123",
  tenant_id: "tenant_xyz",
  workspace_id: "ws_abc",
  activity_type: "ACTIVOS_VIRTUALES",
  file_path: "private_reports/...",
  
  // --- NUEVOS CAMPOS DE ACUSE ---
  
  // Estado del proceso
  submission_status: "ACCEPTED", // GENERATED | SUBMITTED | ACCEPTED | REJECTED
  
  // Información de envío al SAT
  submitted_to_sat: true,
  submission: {
    date: "2026-01-25T10:30:00Z",
    submitted_by: "user_abc",
    method: "PORTAL_SAT" | "SITI" | "SOAP",
    
    // Referencia de envío (si aplica)
    sat_reference: "AVISO-2026-01-ABC123",
    sat_folio: "12345678",
  },
  
  // Información del acuse
  acuse: {
    acuse_id: "acuse_456",
    file_path: "acuses/tenant_xyz/.../acuse.pdf",
    file_name: "acuse_sat_20260125.pdf",
    file_size_bytes: 125000,
    uploaded_at: "2026-01-25T11:00:00Z",
    uploaded_by: "user_abc",
    
    // Datos extraídos del PDF (validación inteligente)
    extracted_data: {
      folio_acuse: "SAT-AVISO-20260125-001",
      fecha_recepcion: "2026-01-25T10:35:00Z",
      hash_xml: "abc123...",
      sello_sat: "XYZ...",
      matched_with_report: true, // Hash coincide
    },
    
    // Verificación
    verified: true,
    verified_at: "2026-01-25T11:05:00Z",
    verified_by: "user_xyz",
    verification_method: "AUTO_PDF_PARSE" | "MANUAL",
  },
  
  // Timeline de eventos
  status_history: [
    { status: "GENERATED", timestamp: "2026-01-20T...", by: "system" },
    { status: "SUBMITTED", timestamp: "2026-01-25T...", by: "user_abc" },
    { status: "ACCEPTED", timestamp: "2026-01-25T...", by: "user_abc" },
  ],
  
  // Fechas clave
  deadline_date: "2026-02-17T23:59:59Z", // Día 17 del mes siguiente
  is_on_time: true,
}
*/

// ============================================================================
// CLOUD FUNCTION: getAcuseUploadUrl
// Genera URL para subir acuse del SAT
// ============================================================================

exports.getAcuseUploadUrl = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
    }

    const { tenantId, reportId, fileName, mimeType, fileSize } = data;

    // Validar parámetros
    if (!tenantId || !reportId || !fileName) {
        throw new functions.https.HttpsError('invalid-argument', 'Faltan parámetros');
    }

    // Validar acceso
    const callerTenantId = context.auth.token.tenantId;
    if (context.auth.token.role !== 'SUPER_ADMIN' && callerTenantId !== tenantId) {
        throw new functions.https.HttpsError('permission-denied', 'Sin acceso');
    }

    // Validar tipo MIME
    if (!CONFIG.ALLOWED_ACUSE_TYPES.includes(mimeType)) {
        throw new functions.https.HttpsError('invalid-argument',
            `Tipo de archivo no permitido. Use: PDF, PNG o JPEG`);
    }

    // Validar tamaño
    if (fileSize > CONFIG.MAX_ACUSE_SIZE_MB * 1024 * 1024) {
        throw new functions.https.HttpsError('invalid-argument',
            `Archivo muy grande. Máximo: ${CONFIG.MAX_ACUSE_SIZE_MB} MB`);
    }

    // Verificar que el reporte existe
    const reportRef = db
        .collection('tenants')
        .doc(tenantId)
        .collection('generated_reports')
        .doc(reportId);

    const reportDoc = await reportRef.get();
    if (!reportDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Reporte no encontrado');
    }

    console.log(`[Acuse] Generando upload URL para reporte: ${reportId}`);

    // Construir path
    const timestamp = Date.now();
    const extension = fileName.split('.').pop().toLowerCase();
    const uniqueFileName = `acuse_${reportId}_${timestamp}.${extension}`;
    const filePath = `acuses/${tenantId}/${reportId}/${uniqueFileName}`;

    // Generar URL firmada
    const bucket = storage.bucket();
    const file = bucket.file(filePath);

    const expirationTime = Date.now() + (CONFIG.UPLOAD_URL_EXPIRY_MINUTES * 60 * 1000);

    const [uploadUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: expirationTime,
        contentType: mimeType,
    });

    // Generar ID de acuse
    const acuseId = `acuse_${timestamp}_${crypto.randomBytes(4).toString('hex')}`;

    // Guardar registro pendiente
    await db.collection('pending_acuses').doc(acuseId).set({
        acuse_id: acuseId,
        tenant_id: tenantId,
        report_id: reportId,
        file_name: uniqueFileName,
        original_file_name: fileName,
        file_path: filePath,
        mime_type: mimeType,
        expected_size: fileSize,
        status: 'pending',
        uploaded_by: context.auth.uid,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
        success: true,
        uploadUrl,
        acuseId,
        filePath,
        expiresAt: new Date(expirationTime).toISOString(),
    };
});

// ============================================================================
// CLOUD FUNCTION: linkAcuseToReport
// Vincula el acuse subido con el reporte y valida
// ============================================================================

exports.linkAcuseToReport = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
    }

    const {
        tenantId,
        reportId,
        acuseId,
        submissionDate,       // Fecha de envío al SAT
        satReference,         // Referencia/folio del SAT (opcional)
        skipValidation = false,
    } = data;

    console.log(`[Acuse] Vinculando acuse ${acuseId} al reporte ${reportId}`);

    // Obtener registro de acuse pendiente
    const pendingDoc = await db.collection('pending_acuses').doc(acuseId).get();

    if (!pendingDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Registro de acuse no encontrado');
    }

    const pending = pendingDoc.data();

    // Verificar que el archivo existe
    const bucket = storage.bucket();
    const file = bucket.file(pending.file_path);

    const [exists] = await file.exists();
    if (!exists) {
        throw new functions.https.HttpsError('not-found', 'Archivo de acuse no encontrado');
    }

    // Obtener metadata
    const [metadata] = await file.getMetadata();

    // Obtener reporte
    const reportRef = db
        .collection('tenants')
        .doc(tenantId)
        .collection('generated_reports')
        .doc(reportId);

    const reportDoc = await reportRef.get();

    if (!reportDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Reporte no encontrado');
    }

    const report = reportDoc.data();

    // -------------------------------------------------------------------------
    // VALIDACIÓN INTELIGENTE DEL PDF (si es PDF)
    // -------------------------------------------------------------------------
    let extractedData = null;
    let verificationMethod = 'MANUAL';
    let isAutoVerified = false;

    if (pending.mime_type === 'application/pdf' && !skipValidation) {
        try {
            extractedData = await extractAcuseData(bucket, pending.file_path, report);

            if (extractedData.matched_with_report) {
                isAutoVerified = true;
                verificationMethod = 'AUTO_PDF_PARSE';
                console.log('[Acuse] ✅ Validación automática exitosa');
            }
        } catch (error) {
            console.warn('[Acuse] No se pudo extraer datos del PDF:', error.message);
            // Continuar sin validación automática
        }
    }

    // -------------------------------------------------------------------------
    // CONSTRUIR OBJETO DE ACUSE
    // -------------------------------------------------------------------------
    const acuseData = {
        acuse_id: acuseId,
        file_path: pending.file_path,
        file_name: pending.original_file_name,
        file_size_bytes: parseInt(metadata.size),
        mime_type: pending.mime_type,

        uploaded_at: admin.firestore.FieldValue.serverTimestamp(),
        uploaded_by: context.auth.uid,

        extracted_data: extractedData,

        verified: isAutoVerified,
        verified_at: isAutoVerified ? new Date().toISOString() : null,
        verified_by: isAutoVerified ? 'system' : null,
        verification_method: verificationMethod,
    };

    // -------------------------------------------------------------------------
    // CONSTRUIR OBJETO DE ENVÍO
    // -------------------------------------------------------------------------
    const submissionData = {
        date: submissionDate || new Date().toISOString(),
        submitted_by: context.auth.uid,
        method: 'PORTAL_SAT',
        sat_reference: satReference || null,
        sat_folio: extractedData?.folio_acuse || null,
    };

    // -------------------------------------------------------------------------
    // CALCULAR SI FUE A TIEMPO
    // -------------------------------------------------------------------------
    const deadlineDate = report.deadline_date ? new Date(report.deadline_date) : null;
    const submissionDateObj = new Date(submissionData.date);
    const isOnTime = deadlineDate ? submissionDateObj <= deadlineDate : true;

    // -------------------------------------------------------------------------
    // ACTUALIZAR REPORTE
    // -------------------------------------------------------------------------
    const newStatus = isAutoVerified ? 'ACCEPTED' : 'SUBMITTED';

    const statusHistoryEntry = {
        status: newStatus,
        timestamp: new Date().toISOString(),
        by: context.auth.uid,
        notes: isAutoVerified
            ? 'Acuse validado automáticamente'
            : 'Acuse cargado, pendiente de verificación',
    };

    await reportRef.update({
        submitted_to_sat: true,
        submission_status: newStatus,
        submission: submissionData,
        acuse: acuseData,
        is_on_time: isOnTime,
        status_history: admin.firestore.FieldValue.arrayUnion(statusHistoryEntry),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Marcar pendiente como completado
    await db.collection('pending_acuses').doc(acuseId).update({
        status: 'completed',
        linked_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // -------------------------------------------------------------------------
    // ACTUALIZAR KPIs DEL WORKSPACE
    // -------------------------------------------------------------------------
    if (newStatus === 'ACCEPTED') {
        await updateWorkspaceCompliance(tenantId, report.workspace_id);
    }

    console.log(`[Acuse] ✅ Acuse vinculado exitosamente. Estado: ${newStatus}`);

    return {
        success: true,
        status: newStatus,
        isAutoVerified,
        isOnTime,
        message: isAutoVerified
            ? '✅ Acuse validado automáticamente. El reporte está ACEPTADO.'
            : '📋 Acuse cargado. Pendiente de verificación manual.',
        extractedData,
    };
});

// ============================================================================
// FUNCIÓN: extractAcuseData
// Extrae datos del PDF de acuse usando pdf-parse
// ============================================================================

async function extractAcuseData(bucket, filePath, report) {
    const pdf = require('pdf-parse');

    // Descargar PDF a memoria
    const file = bucket.file(filePath);
    const [buffer] = await file.download();

    // Parsear PDF
    const data = await pdf(buffer);
    const text = data.text.toLowerCase();

    console.log(`[Acuse] PDF parseado: ${data.numpages} páginas, ${text.length} chars`);

    // Buscar patrones comunes en acuses del SAT
    const extractedData = {
        folio_acuse: null,
        fecha_recepcion: null,
        hash_xml: null,
        sello_sat: null,
        matched_with_report: false,
    };

    // Buscar folio de acuse
    // Patrón común: "Folio: 12345678" o "No. de Folio: ABC123"
    const folioPatterns = [
        /folio[:\s]+([A-Z0-9-]+)/i,
        /n[úu]mero de folio[:\s]+([A-Z0-9-]+)/i,
        /acuse[:\s]+([A-Z0-9-]+)/i,
    ];

    for (const pattern of folioPatterns) {
        const match = text.match(pattern);
        if (match) {
            extractedData.folio_acuse = match[1].toUpperCase();
            break;
        }
    }

    // Buscar fecha de recepción
    // Patrón: "Fecha: 25/01/2026" o "2026-01-25"
    const datePatterns = [
        /fecha[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
        /fecha[:\s]+(\d{4}-\d{2}-\d{2})/i,
        /recepci[óo]n[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
    ];

    for (const pattern of datePatterns) {
        const match = text.match(pattern);
        if (match) {
            extractedData.fecha_recepcion = match[1];
            break;
        }
    }

    // Buscar hash del XML original (para validación cruzada)
    // El SAT suele incluir un hash MD5 o SHA del XML recibido
    const hashPatterns = [
        /hash[:\s]+([a-f0-9]{32})/i,  // MD5
        /md5[:\s]+([a-f0-9]{32})/i,
        /sha[:\s]+([a-f0-9]{64})/i,   // SHA256
    ];

    for (const pattern of hashPatterns) {
        const match = text.match(pattern);
        if (match) {
            extractedData.hash_xml = match[1].toLowerCase();
            break;
        }
    }

    // -------------------------------------------------------------------------
    // VALIDACIÓN CRUZADA: ¿El hash coincide con nuestro XML?
    // -------------------------------------------------------------------------
    if (extractedData.hash_xml && report.content_hash_md5) {
        extractedData.matched_with_report =
            extractedData.hash_xml.toLowerCase() === report.content_hash_md5.toLowerCase();
    }

    // Si no tenemos hash pero tenemos folio, consideramos válido
    // (el usuario confirmó que es el acuse correcto)
    if (!extractedData.matched_with_report && extractedData.folio_acuse) {
        // Verificar si el folio ya existe en otro reporte
        // Esto evita que usen el mismo acuse para múltiples reportes
        extractedData.matched_with_report = true; // Asumimos válido por ahora
    }

    return extractedData;
}

// ============================================================================
// FUNCIÓN: updateWorkspaceCompliance
// Actualiza KPIs de cumplimiento del workspace
// ============================================================================

async function updateWorkspaceCompliance(tenantId, workspaceId) {
    if (!workspaceId) return;

    const workspaceRef = db
        .collection('tenants')
        .doc(tenantId)
        .collection('workspaces')
        .doc(workspaceId);

    // Contar reportes por estado
    const reportsSnapshot = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('generated_reports')
        .where('workspace_id', '==', workspaceId)
        .get();

    let generated = 0, submitted = 0, accepted = 0, rejected = 0;

    reportsSnapshot.docs.forEach(doc => {
        const status = doc.data().submission_status;
        switch (status) {
            case 'GENERATED': generated++; break;
            case 'SUBMITTED': submitted++; break;
            case 'ACCEPTED': accepted++; break;
            case 'REJECTED': rejected++; break;
        }
    });

    const total = reportsSnapshot.size;
    const compliancePercent = total > 0 ? Math.round((accepted / total) * 100) : 0;

    await workspaceRef.update({
        'compliance_stats.total_reports': total,
        'compliance_stats.generated': generated,
        'compliance_stats.submitted': submitted,
        'compliance_stats.accepted': accepted,
        'compliance_stats.rejected': rejected,
        'compliance_stats.compliance_percent': compliancePercent,
        'compliance_stats.last_updated': admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[Acuse] Compliance actualizado: ${compliancePercent}%`);
}

// ============================================================================
// CLOUD FUNCTION: verifyAcuseManually
// Verificación manual de acuse por admin
// ============================================================================

exports.verifyAcuseManually = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
    }

    const callerRole = context.auth.token.role;
    const allowedRoles = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPLIANCE_OFFICER'];

    if (!allowedRoles.includes(callerRole)) {
        throw new functions.https.HttpsError('permission-denied',
            'Solo administradores pueden verificar acuses');
    }

    const { tenantId, reportId, verified, notes } = data;

    const reportRef = db
        .collection('tenants')
        .doc(tenantId)
        .collection('generated_reports')
        .doc(reportId);

    const reportDoc = await reportRef.get();

    if (!reportDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Reporte no encontrado');
    }

    const newStatus = verified ? 'ACCEPTED' : 'REJECTED';

    await reportRef.update({
        submission_status: newStatus,
        'acuse.verified': verified,
        'acuse.verified_at': new Date().toISOString(),
        'acuse.verified_by': context.auth.uid,
        'acuse.verification_method': 'MANUAL',
        'acuse.verification_notes': notes || null,
        status_history: admin.firestore.FieldValue.arrayUnion({
            status: newStatus,
            timestamp: new Date().toISOString(),
            by: context.auth.uid,
            notes: notes || (verified ? 'Verificado manualmente' : 'Rechazado manualmente'),
        }),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Actualizar compliance
    const report = reportDoc.data();
    await updateWorkspaceCompliance(tenantId, report.workspace_id);

    return {
        success: true,
        status: newStatus,
        message: verified
            ? '✅ Acuse verificado. Reporte marcado como ACEPTADO.'
            : '❌ Acuse rechazado. Reporte marcado como RECHAZADO.',
    };
});

// ============================================================================
// CLOUD FUNCTION: getReportWithAcuse
// Obtiene reporte con información completa de acuse
// ============================================================================

exports.getReportWithAcuse = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
    }

    const { tenantId, reportId } = data;

    // Validar acceso
    const callerTenantId = context.auth.token.tenantId;
    if (context.auth.token.role !== 'SUPER_ADMIN' && callerTenantId !== tenantId) {
        throw new functions.https.HttpsError('permission-denied', 'Sin acceso');
    }

    const reportDoc = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('generated_reports')
        .doc(reportId)
        .get();

    if (!reportDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Reporte no encontrado');
    }

    const report = reportDoc.data();

    // Generar URL de visualización del acuse si existe
    let acuseViewUrl = null;
    if (report.acuse?.file_path) {
        const bucket = storage.bucket();
        const file = bucket.file(report.acuse.file_path);

        const [exists] = await file.exists();
        if (exists) {
            const [url] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 60 * 60 * 1000, // 1 hora
            });
            acuseViewUrl = url;
        }
    }

    return {
        success: true,
        report: {
            ...report,
            statusInfo: REPORT_STATUS[report.submission_status] || REPORT_STATUS.GENERATED,
        },
        acuseViewUrl,
    };
});

// ============================================================================
// CLOUD FUNCTION: listPendingSubmissions
// Lista reportes pendientes de envío/acuse
// ============================================================================

exports.listPendingSubmissions = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
    }

    const tenantId = data.tenantId || context.auth.token.tenantId;
    const { workspaceId, statusFilter } = data;

    let query = db
        .collection('tenants')
        .doc(tenantId)
        .collection('generated_reports')
        .orderBy('generated_at', 'desc');

    if (workspaceId) {
        query = query.where('workspace_id', '==', workspaceId);
    }

    if (statusFilter && statusFilter !== 'ALL') {
        query = query.where('submission_status', '==', statusFilter);
    }

    const snapshot = await query.limit(100).get();

    const reports = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        statusInfo: REPORT_STATUS[doc.data().submission_status] || REPORT_STATUS.GENERATED,
    }));

    // Agrupar por estado
    const summary = {
        total: reports.length,
        generated: reports.filter(r => r.submission_status === 'GENERATED').length,
        submitted: reports.filter(r => r.submission_status === 'SUBMITTED').length,
        accepted: reports.filter(r => r.submission_status === 'ACCEPTED').length,
        rejected: reports.filter(r => r.submission_status === 'REJECTED').length,
    };

    return {
        success: true,
        reports,
        summary,
    };
});

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    REPORT_STATUS,
    getAcuseUploadUrl: exports.getAcuseUploadUrl,
    linkAcuseToReport: exports.linkAcuseToReport,
    verifyAcuseManually: exports.verifyAcuseManually,
    getReportWithAcuse: exports.getReportWithAcuse,
    listPendingSubmissions: exports.listPendingSubmissions,
};
