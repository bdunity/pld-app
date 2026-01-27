/**
 * PLD BDU - Gestión Segura de Archivos XML
 * 
 * Sistema de almacenamiento y descarga segura para reportes XML.
 * Implementa:
 * - Almacenamiento en rutas privadas por tenant
 * - Hash MD5 para verificación de integridad
 * - URLs firmadas con expiración temporal
 * - Registro de auditoría completo
 * 
 * SEGURIDAD:
 * - Los archivos NO son accesibles públicamente
 * - Solo URLs firmadas con token temporal permiten descarga
 * - El token es generado por Cloud Functions (backend)
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
    // Tiempo de validez de URL firmada (en minutos)
    SIGNED_URL_EXPIRY_MINUTES: 15,

    // Máximo de descargas permitidas por archivo
    MAX_DOWNLOADS_PER_FILE: 10,

    // Bucket path para reportes privados
    PRIVATE_REPORTS_PATH: 'private_reports',

    // Content types permitidos
    ALLOWED_CONTENT_TYPES: ['application/xml', 'text/xml'],
};

// ============================================================================
// FUNCIÓN: saveXMLReport
// Guarda el XML de forma segura con metadatos y hash
// ============================================================================

/**
 * Guarda un reporte XML de forma segura.
 * 
 * @param {string} xmlContent - Contenido XML como string
 * @param {Object} options - Opciones de almacenamiento
 * @returns {Object} Información del archivo guardado
 */
async function saveXMLReport(xmlContent, options) {
    const {
        tenantId,
        workspaceId,
        activityType,
        reportType = 'AVISO',
        periodoMes,
        periodoAnio,
        recordCount,
        generatedBy,
    } = options;

    // -------------------------------------------------------------------------
    // Generar hash MD5 para integridad
    // -------------------------------------------------------------------------
    const contentHash = crypto
        .createHash('md5')
        .update(xmlContent)
        .digest('hex');

    console.log(`[saveXMLReport] Hash MD5: ${contentHash}`);

    // -------------------------------------------------------------------------
    // Construir ruta de almacenamiento
    // Path: private_reports/{tenantId}/{year}/{month}/{filename}
    // -------------------------------------------------------------------------
    const timestamp = Date.now();
    const fileName = `${activityType}_${reportType}_${periodoAnio}${periodoMes}_${timestamp}.xml`;
    const filePath = `${CONFIG.PRIVATE_REPORTS_PATH}/${tenantId}/${periodoAnio}/${periodoMes}/${fileName}`;

    console.log(`[saveXMLReport] Guardando en: ${filePath}`);

    // -------------------------------------------------------------------------
    // Guardar archivo en Storage con metadatos
    // -------------------------------------------------------------------------
    const bucket = storage.bucket();
    const file = bucket.file(filePath);

    // Metadatos del archivo
    const metadata = {
        contentType: 'application/xml',
        metadata: {
            tenantId,
            workspaceId,
            activityType,
            reportType,
            periodoMes,
            periodoAnio,
            recordCount: String(recordCount),
            contentHash,
            generatedBy,
            generatedAt: new Date().toISOString(),
            downloadCount: '0',
        },
    };

    await file.save(xmlContent, {
        contentType: 'application/xml',
        metadata: metadata.metadata,
        // Hacer el archivo privado (sin acceso público)
        private: true,
        // Evitar caché
        cacheControl: 'no-store',
    });

    // -------------------------------------------------------------------------
    // Crear registro en Firestore para auditoría
    // -------------------------------------------------------------------------
    const reportId = `rep_${timestamp}_${crypto.randomBytes(4).toString('hex')}`;

    const reportDoc = {
        report_id: reportId,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        activity_type: activityType,
        report_type: reportType,

        // Información del archivo
        file_path: filePath,
        file_name: fileName,
        file_size_bytes: Buffer.byteLength(xmlContent, 'utf8'),
        content_hash_md5: contentHash,

        // Periodo del reporte
        periodo: {
            mes: periodoMes,
            anio: periodoAnio,
        },

        // Estadísticas
        record_count: recordCount,

        // Auditoría
        generated_by: generatedBy,
        generated_at: admin.firestore.FieldValue.serverTimestamp(),

        // Control de descargas
        download_count: 0,
        downloads: [],

        // Estado
        status: 'generated',
        submitted_to_sat: false,
        submitted_at: null,
    };

    await db
        .collection('tenants')
        .doc(tenantId)
        .collection('generated_reports')
        .doc(reportId)
        .set(reportDoc);

    console.log(`[saveXMLReport] ✅ Reporte guardado: ${reportId}`);

    return {
        reportId,
        filePath,
        fileName,
        contentHash,
        fileSize: Buffer.byteLength(xmlContent, 'utf8'),
    };
}

// ============================================================================
// CLOUD FUNCTION: getSecureDownloadUrl
// Genera URL firmada para descarga segura
// ============================================================================

/**
 * Genera una URL firmada temporal para descargar un reporte.
 * 
 * SEGURIDAD:
 * - Solo usuarios autenticados del tenant pueden solicitar URL
 * - URL expira después de 15 minutos
 * - Se registra cada descarga para auditoría
 * - Límite de descargas por archivo
 */
exports.getSecureDownloadUrl = functions.https.onCall(async (data, context) => {
    // -------------------------------------------------------------------------
    // Validar autenticación
    // -------------------------------------------------------------------------
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated',
            'Debe iniciar sesión para descargar reportes');
    }

    const callerUid = context.auth.uid;
    const callerRole = context.auth.token.role;
    const callerTenantId = context.auth.token.tenantId;

    const { reportId, tenantId } = data;

    if (!reportId || !tenantId) {
        throw new functions.https.HttpsError('invalid-argument',
            'Faltan parámetros requeridos (reportId, tenantId)');
    }

    // -------------------------------------------------------------------------
    // Validar permisos
    // -------------------------------------------------------------------------
    // Solo usuarios del mismo tenant o SUPER_ADMIN pueden descargar
    if (callerRole !== 'SUPER_ADMIN' && callerTenantId !== tenantId) {
        // Log de intento no autorizado
        await db.collection('security_logs').add({
            event_type: 'UNAUTHORIZED_DOWNLOAD_ATTEMPT',
            user_id: callerUid,
            tenant_id: tenantId,
            report_id: reportId,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        throw new functions.https.HttpsError('permission-denied',
            'No tienes acceso a este reporte');
    }

    // Verificar rol mínimo
    const allowedRoles = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPLIANCE_OFFICER'];
    if (!allowedRoles.includes(callerRole)) {
        throw new functions.https.HttpsError('permission-denied',
            'Tu rol no permite descargar reportes');
    }

    console.log(`[getSecureDownloadUrl] Solicitud de descarga`);
    console.log(`  - Usuario: ${callerUid}`);
    console.log(`  - Reporte: ${reportId}`);

    // -------------------------------------------------------------------------
    // Obtener información del reporte
    // -------------------------------------------------------------------------
    const reportRef = db
        .collection('tenants')
        .doc(tenantId)
        .collection('generated_reports')
        .doc(reportId);

    const reportDoc = await reportRef.get();

    if (!reportDoc.exists) {
        throw new functions.https.HttpsError('not-found',
            'Reporte no encontrado');
    }

    const reportData = reportDoc.data();

    // Verificar límite de descargas
    if (reportData.download_count >= CONFIG.MAX_DOWNLOADS_PER_FILE) {
        throw new functions.https.HttpsError('resource-exhausted',
            `Se alcanzó el límite de descargas (${CONFIG.MAX_DOWNLOADS_PER_FILE}). Contacte al administrador.`);
    }

    // -------------------------------------------------------------------------
    // Verificar que el archivo existe en Storage
    // -------------------------------------------------------------------------
    const bucket = storage.bucket();
    const file = bucket.file(reportData.file_path);

    const [exists] = await file.exists();
    if (!exists) {
        throw new functions.https.HttpsError('not-found',
            'El archivo no se encuentra en el sistema. Puede haber sido eliminado.');
    }

    // -------------------------------------------------------------------------
    // Generar URL firmada
    // -------------------------------------------------------------------------
    const expirationTime = Date.now() + (CONFIG.SIGNED_URL_EXPIRY_MINUTES * 60 * 1000);

    const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: expirationTime,
        // Forzar descarga con nombre legible
        responseDisposition: `attachment; filename="${reportData.file_name}"`,
        // Headers de seguridad
        responseType: 'application/xml',
    });

    console.log(`  - URL generada, expira en ${CONFIG.SIGNED_URL_EXPIRY_MINUTES} minutos`);

    // -------------------------------------------------------------------------
    // Registrar descarga
    // -------------------------------------------------------------------------
    const downloadRecord = {
        user_id: callerUid,
        user_email: context.auth.token.email,
        timestamp: new Date().toISOString(),
        ip_address: context.rawRequest?.ip || 'unknown',
        expires_at: new Date(expirationTime).toISOString(),
    };

    await reportRef.update({
        download_count: admin.firestore.FieldValue.increment(1),
        downloads: admin.firestore.FieldValue.arrayUnion(downloadRecord),
        last_downloaded_at: admin.firestore.FieldValue.serverTimestamp(),
        last_downloaded_by: callerUid,
    });

    // -------------------------------------------------------------------------
    // Log de auditoría
    // -------------------------------------------------------------------------
    await db.collection('usage_logs').add({
        event_type: 'REPORT_DOWNLOADED',
        tenant_id: tenantId,
        report_id: reportId,
        user_id: callerUid,
        file_name: reportData.file_name,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[getSecureDownloadUrl] ✅ URL generada exitosamente`);

    return {
        success: true,
        downloadUrl: signedUrl,
        fileName: reportData.file_name,
        fileSize: reportData.file_size_bytes,
        contentHash: reportData.content_hash_md5,
        expiresAt: new Date(expirationTime).toISOString(),
        expiresInMinutes: CONFIG.SIGNED_URL_EXPIRY_MINUTES,
        downloadNumber: reportData.download_count + 1,
        maxDownloads: CONFIG.MAX_DOWNLOADS_PER_FILE,
    };
});

// ============================================================================
// CLOUD FUNCTION: verifyReportIntegrity
// Verifica la integridad de un reporte descargado
// ============================================================================

/**
 * Verifica que un archivo no haya sido alterado comparando hashes.
 */
exports.verifyReportIntegrity = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
    }

    const { reportId, tenantId, clientHash } = data;

    if (!reportId || !tenantId || !clientHash) {
        throw new functions.https.HttpsError('invalid-argument',
            'Faltan parámetros (reportId, tenantId, clientHash)');
    }

    // Obtener hash original
    const reportDoc = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('generated_reports')
        .doc(reportId)
        .get();

    if (!reportDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Reporte no encontrado');
    }

    const originalHash = reportDoc.data().content_hash_md5;
    const isValid = originalHash.toLowerCase() === clientHash.toLowerCase();

    // Log de verificación
    await db.collection('usage_logs').add({
        event_type: 'REPORT_INTEGRITY_CHECK',
        tenant_id: tenantId,
        report_id: reportId,
        user_id: context.auth.uid,
        result: isValid ? 'VALID' : 'CORRUPTED',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
        success: true,
        isValid,
        message: isValid
            ? '✅ El archivo es íntegro y no ha sido modificado.'
            : '⚠️ ADVERTENCIA: El hash no coincide. El archivo puede haber sido alterado.',
        originalHash,
        providedHash: clientHash,
    };
});

// ============================================================================
// CLOUD FUNCTION: listTenantReports
// Lista todos los reportes de un tenant
// ============================================================================

exports.listTenantReports = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
    }

    const callerTenantId = context.auth.token.tenantId;
    const callerRole = context.auth.token.role;
    const { tenantId, workspaceId, limit = 50, startAfter } = data;

    // Validar acceso
    if (callerRole !== 'SUPER_ADMIN' && callerTenantId !== tenantId) {
        throw new functions.https.HttpsError('permission-denied', 'Sin acceso');
    }

    // Construir query
    let query = db
        .collection('tenants')
        .doc(tenantId)
        .collection('generated_reports')
        .orderBy('generated_at', 'desc')
        .limit(limit);

    if (workspaceId) {
        query = query.where('workspace_id', '==', workspaceId);
    }

    if (startAfter) {
        const startDoc = await db
            .collection('tenants')
            .doc(tenantId)
            .collection('generated_reports')
            .doc(startAfter)
            .get();

        if (startDoc.exists) {
            query = query.startAfter(startDoc);
        }
    }

    const snapshot = await query.get();

    const reports = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // No exponer ruta completa del archivo
        file_path: undefined,
    }));

    return {
        success: true,
        reports,
        hasMore: reports.length === limit,
        nextCursor: reports.length > 0 ? reports[reports.length - 1].id : null,
    };
});

// ============================================================================
// CLOUD FUNCTION: deleteReport
// Elimina un reporte (solo admin)
// ============================================================================

exports.deleteReport = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
    }

    const callerRole = context.auth.token.role;
    const callerTenantId = context.auth.token.tenantId;

    // Solo COMPANY_ADMIN o SUPER_ADMIN pueden eliminar
    if (!['SUPER_ADMIN', 'COMPANY_ADMIN'].includes(callerRole)) {
        throw new functions.https.HttpsError('permission-denied',
            'Solo administradores pueden eliminar reportes');
    }

    const { reportId, tenantId } = data;

    if (callerRole !== 'SUPER_ADMIN' && callerTenantId !== tenantId) {
        throw new functions.https.HttpsError('permission-denied', 'Sin acceso');
    }

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

    const reportData = reportDoc.data();

    // No permitir eliminar reportes enviados al SAT
    if (reportData.submitted_to_sat) {
        throw new functions.https.HttpsError('failed-precondition',
            'No se pueden eliminar reportes ya enviados al SAT');
    }

    // Eliminar archivo de Storage
    try {
        const bucket = storage.bucket();
        await bucket.file(reportData.file_path).delete();
    } catch (error) {
        console.warn(`[deleteReport] Error eliminando archivo:`, error);
    }

    // Marcar como eliminado (soft delete)
    await reportRef.update({
        status: 'deleted',
        deleted_at: admin.firestore.FieldValue.serverTimestamp(),
        deleted_by: context.auth.uid,
    });

    // Log
    await db.collection('usage_logs').add({
        event_type: 'REPORT_DELETED',
        tenant_id: tenantId,
        report_id: reportId,
        user_id: context.auth.uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
        success: true,
        message: 'Reporte eliminado correctamente',
    };
});

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    saveXMLReport,
    getSecureDownloadUrl: exports.getSecureDownloadUrl,
    verifyReportIntegrity: exports.verifyReportIntegrity,
    listTenantReports: exports.listTenantReports,
    deleteReport: exports.deleteReport,
};
