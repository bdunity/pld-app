/**
 * Ingest API
 * Motor de carga de datos Excel para actividades vulnerables
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import * as XLSX from 'xlsx';


// ========================================
// DEFINICIÓN DE COLUMNAS POR ACTIVIDAD
// ========================================

const ACTIVITY_COLUMNS = {
    INMUEBLES: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'string' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'folioReal', label: 'Folio Real', required: false, type: 'string' },
        { key: 'ubicacionInmueble', label: 'Ubicación Inmueble', required: true, type: 'string' },
        { key: 'tipoInmueble', label: 'Tipo Inmueble', required: true, type: 'string' },
    ],
    VEHICULOS: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'string' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'serieNIV', label: 'Serie/NIV', required: true, type: 'string' },
        { key: 'marca', label: 'Marca', required: true, type: 'string' },
        { key: 'modelo', label: 'Modelo', required: true, type: 'string' },
        { key: 'anio', label: 'Año', required: true, type: 'number' },
    ],
    METALES_PIEDRAS: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'string' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'descripcionArticulo', label: 'Descripción Artículo', required: true, type: 'string' },
        { key: 'pesoQuilates', label: 'Peso/Quilates', required: false, type: 'string' },
    ],
    ACTIVOS_VIRTUALES: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'string' },
        { key: 'montoMXN', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'tipoActivoVirtual', label: 'Tipo Activo Virtual', required: true, type: 'string' },
        { key: 'cantidadTokens', label: 'Cantidad Tokens', required: true, type: 'number' },
    ],
    JUEGOS_APUESTAS: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'string' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'tipoJuego', label: 'Tipo Juego/Apuesta', required: true, type: 'string' },
        { key: 'premioObtenido', label: 'Premio Obtenido', required: false, type: 'number' },
    ],
    BLINDAJE: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'string' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'tipoBlindaje', label: 'Tipo Blindaje', required: true, type: 'string' },
        { key: 'nivelBlindaje', label: 'Nivel Blindaje', required: true, type: 'string' },
        { key: 'descripcionBienBlindado', label: 'Descripción Bien Blindado', required: true, type: 'string' },
        { key: 'numeroSerieIdentificacion', label: 'Número Serie/Identificación', required: false, type: 'string' },
    ],
    TARJETAS_PREPAGO: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'string' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'tipoTarjeta', label: 'Tipo Tarjeta', required: true, type: 'string' },
        { key: 'numeroTarjeta', label: 'Número Tarjeta', required: true, type: 'string' },
        { key: 'montoCargaOperacion', label: 'Monto Carga/Operación', required: true, type: 'number' },
    ],
    CHEQUES_VIAJERO: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'string' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'denominacionCheque', label: 'Denominación Cheque', required: true, type: 'string' },
        { key: 'cantidadCheques', label: 'Cantidad Cheques', required: true, type: 'number' },
        { key: 'moneda', label: 'Moneda', required: true, type: 'string' },
    ],
    OPERACIONES_MUTUO: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'string' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'tipoGarantia', label: 'Tipo Garantía', required: false, type: 'string' },
        { key: 'plazo', label: 'Plazo', required: true, type: 'string' },
        { key: 'tasaInteres', label: 'Tasa Interés', required: false, type: 'number' },
    ],
    OBRAS_ARTE: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'string' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'descripcionObra', label: 'Descripción Obra', required: true, type: 'string' },
        { key: 'autorArtista', label: 'Autor/Artista', required: false, type: 'string' },
        { key: 'tecnicaMaterial', label: 'Técnica/Material', required: false, type: 'string' },
    ],
    TRASLADO_VALORES: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'string' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'origen', label: 'Origen', required: true, type: 'string' },
        { key: 'destino', label: 'Destino', required: true, type: 'string' },
        { key: 'tipoValorTrasladado', label: 'Tipo Valor Trasladado', required: true, type: 'string' },
    ],
    SERVICIOS_FE_PUBLICA: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'string' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'numeroInstrumento', label: 'Número Instrumento', required: true, type: 'string' },
        { key: 'tipoActoJuridico', label: 'Tipo Acto Jurídico', required: true, type: 'string' },
        { key: 'descripcionActo', label: 'Descripción Acto', required: false, type: 'string' },
    ],
    SERVICIOS_PROFESIONALES: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'string' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'tipoServicio', label: 'Tipo Servicio', required: true, type: 'string' },
        { key: 'descripcionServicio', label: 'Descripción Servicio', required: true, type: 'string' },
    ],
    ARRENDAMIENTO: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'string' },
        { key: 'montoMensual', label: 'Monto Mensual (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'ubicacionInmueble', label: 'Ubicación Inmueble', required: true, type: 'string' },
        { key: 'tipoInmueble', label: 'Tipo Inmueble', required: true, type: 'string' },
        { key: 'plazoContrato', label: 'Plazo Contrato', required: false, type: 'string' },
    ],
    CONSTITUCION_PERSONAS: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'string' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'denominacionRazonSocial', label: 'Denominación/Razón Social', required: true, type: 'string' },
        { key: 'tipoPersonaMoral', label: 'Tipo Persona Moral', required: true, type: 'string' },
        { key: 'objetoSocial', label: 'Objeto Social', required: false, type: 'string' },
        { key: 'capitalSocial', label: 'Capital Social', required: false, type: 'number' },
    ],
    // Plantilla genérica para otras actividades
    DEFAULT: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'string' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'descripcion', label: 'Descripción', required: false, type: 'string' },
    ],
};

// ========================================
// VALIDADORES
// ========================================

const RFC_REGEX = /^([A-ZÑ&]{3,4})(\d{6})([A-Z\d]{3})$/;

function validateRFC(rfc) {
    if (!rfc || typeof rfc !== 'string') return false;
    const cleanRfc = rfc.toUpperCase().trim();
    return RFC_REGEX.test(cleanRfc) && (cleanRfc.length === 12 || cleanRfc.length === 13);
}

function validateDate(dateValue) {
    if (!dateValue) return false;

    // Si es un objeto Date de Excel (número de serie)
    if (typeof dateValue === 'number') {
        return dateValue > 0;
    }

    // Si es string, intentar parsear
    if (typeof dateValue === 'string') {
        const date = new Date(dateValue);
        return !isNaN(date.getTime());
    }

    return false;
}

function parseDate(dateValue) {
    if (typeof dateValue === 'number') {
        // Convertir Excel serial date a JS Date
        const excelEpoch = new Date(1899, 11, 30);
        return new Date(excelEpoch.getTime() + dateValue * 86400000).toISOString().split('T')[0];
    }

    if (typeof dateValue === 'string') {
        const date = new Date(dateValue);
        return date.toISOString().split('T')[0];
    }

    return null;
}

function validateNumber(value) {
    if (value === null || value === undefined || value === '') return false;
    const num = Number(value);
    return !isNaN(num) && num >= 0;
}

// ========================================
// FUNCIÓN: getTemplate
// Genera plantilla Excel dinámica según actividad
// ========================================

export const getTemplate = onCall(
    {
        region: 'us-central1',
        memory: '256MiB',
    },
    async (request) => {
        // Verificar autenticación
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Debes iniciar sesión para descargar plantillas');
        }

        const { activityType } = request.data;

        if (!activityType) {
            throw new HttpsError('invalid-argument', 'El tipo de actividad es requerido');
        }

        try {
            // Obtener columnas para esta actividad
            const columns = ACTIVITY_COLUMNS[activityType] || ACTIVITY_COLUMNS.DEFAULT;

            // Crear workbook
            const wb = XLSX.utils.book_new();

            // Crear hoja de datos con headers
            const headers = columns.map(col => col.label);
            const wsData = [headers];

            // Agregar 3 filas de ejemplo vacías
            for (let i = 0; i < 3; i++) {
                wsData.push(columns.map(() => ''));
            }

            const ws = XLSX.utils.aoa_to_sheet(wsData);

            // Ajustar anchos de columna
            ws['!cols'] = columns.map(() => ({ wch: 20 }));

            // Agregar hoja de instrucciones
            const instructionsData = [
                ['INSTRUCCIONES DE LLENADO'],
                [''],
                ['1. Complete todas las columnas marcadas como obligatorias'],
                ['2. Formato de fecha: DD/MM/YYYY o YYYY-MM-DD'],
                ['3. Formato de RFC: 12 caracteres (Persona Moral) o 13 caracteres (Persona Física)'],
                ['4. Los montos deben ser numéricos sin símbolos de moneda'],
                [''],
                ['COLUMNAS OBLIGATORIAS:'],
                ...columns.filter(c => c.required).map(c => [`- ${c.label}`]),
                [''],
                ['COLUMNAS OPCIONALES:'],
                ...columns.filter(c => !c.required).map(c => [`- ${c.label}`]),
            ];

            const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsData);
            wsInstructions['!cols'] = [{ wch: 60 }];

            // Agregar hojas al workbook
            XLSX.utils.book_append_sheet(wb, ws, 'Operaciones');
            XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instrucciones');

            // Generar archivo como buffer
            const buffer = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

            // Generar nombre de archivo
            const date = new Date().toISOString().split('T')[0];
            const fileName = `Plantilla_${activityType}_${date}.xlsx`;

            logger.log('Template generated:', { activityType, columns: columns.length, user: request.auth.uid });

            return {
                success: true,
                fileBase64: buffer,
                fileName,
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            };
        } catch (error) {
            logger.error('Error generating template:', error);
            throw new HttpsError('internal', 'Error al generar la plantilla');
        }
    }
);

// ========================================
// FUNCIÓN: processUpload
// Procesa archivo Excel cargado y guarda operaciones
// ========================================

export const processUpload = onCall(
    {
        region: 'us-central1',
        memory: '512MiB',
        timeoutSeconds: 120,
    },
    async (request) => {
        // Verificar autenticación
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Debes iniciar sesión para cargar archivos');
        }

        const { fileBase64, fileName, activityType, periodYear, periodMonth } = request.data;

        // Validaciones de entrada
        if (!fileBase64) {
            throw new HttpsError('invalid-argument', 'El archivo es requerido');
        }

        if (!activityType) {
            throw new HttpsError('invalid-argument', 'El tipo de actividad es requerido');
        }

        if (!periodYear || !periodMonth) {
            throw new HttpsError('invalid-argument', 'El periodo (año y mes) es requerido');
        }

        try {
            // Obtener tenantId del usuario autenticado
            const userId = request.auth.uid;

            // Buscar el tenantId del usuario
            // Por defecto usamos el uid como tenantId (según el patrón existente en AuthContext)
            let tenantId = request.auth.token.tenantId || userId;

            // Verificar que el tenant existe
            const tenantDoc = await db.collection('tenants').doc(tenantId).get();
            if (!tenantDoc.exists) {
                throw new HttpsError('permission-denied', 'No tienes un tenant asociado');
            }

            // Obtener definición de columnas
            const columns = ACTIVITY_COLUMNS[activityType] || ACTIVITY_COLUMNS.DEFAULT;
            const columnKeys = columns.map(c => c.key);
            const columnLabels = columns.map(c => c.label);

            // Parsear archivo Excel
            const buffer = Buffer.from(fileBase64, 'base64');
            const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

            // Tomar la primera hoja (asumiendo que es "Operaciones")
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            // Convertir a JSON
            const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (rawData.length < 2) {
                throw new HttpsError('invalid-argument', 'El archivo no contiene datos');
            }

            // Extraer headers y datos
            const headers = rawData[0].map(h => String(h || '').trim());
            const dataRows = rawData.slice(1).filter(row => row.some(cell => cell !== null && cell !== undefined && cell !== ''));

            // Mapear headers a keys
            const headerToKey = {};
            headers.forEach((header, index) => {
                const colDef = columns.find(c => c.label.toLowerCase() === header.toLowerCase());
                if (colDef) {
                    headerToKey[index] = colDef;
                }
            });

            // Procesar filas
            const validRows = [];
            const errors = [];
            const uploadBatchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const uploadDate = new Date().toISOString();

            dataRows.forEach((row, rowIndex) => {
                const rowNum = rowIndex + 2; // +2 porque empezamos en fila 2 (después del header)
                const rowErrors = [];
                const rowData = {
                    tenantId,
                    activityType,
                    periodYear: parseInt(periodYear),
                    periodMonth: parseInt(periodMonth),
                    uploadDate,
                    uploadBatchId,
                    status: 'PENDING',
                    sourceFile: fileName,
                    sourceRow: rowNum,
                };

                // Procesar cada celda
                headers.forEach((header, colIndex) => {
                    const colDef = headerToKey[colIndex];
                    if (!colDef) return; // Ignorar columnas no reconocidas

                    const value = row[colIndex];
                    const { key, label, required, type } = colDef;

                    // Validar campos requeridos
                    if (required && (value === null || value === undefined || value === '')) {
                        rowErrors.push(`Campo "${label}" es requerido`);
                        return;
                    }

                    // Si el valor está vacío y no es requerido, continuar
                    if (value === null || value === undefined || value === '') {
                        return;
                    }

                    // Validar por tipo
                    switch (type) {
                        case 'rfc':
                            if (!validateRFC(value)) {
                                rowErrors.push(`RFC inválido: "${value}". Debe tener 12-13 caracteres con formato válido`);
                            } else {
                                rowData[key] = String(value).toUpperCase().trim();
                            }
                            break;

                        case 'date':
                            if (!validateDate(value)) {
                                rowErrors.push(`Fecha inválida en "${label}": "${value}"`);
                            } else {
                                rowData[key] = parseDate(value);
                            }
                            break;

                        case 'number':
                            if (!validateNumber(value)) {
                                rowErrors.push(`Valor numérico inválido en "${label}": "${value}"`);
                            } else {
                                rowData[key] = Number(value);
                            }
                            break;

                        default:
                            rowData[key] = String(value).trim();
                    }
                });

                // Si hay errores en esta fila, agregar a la lista de errores
                if (rowErrors.length > 0) {
                    errors.push({
                        row: rowNum,
                        errors: rowErrors,
                    });
                } else {
                    // Verificar que tenga los campos mínimos requeridos
                    const missingRequired = columns
                        .filter(c => c.required)
                        .filter(c => !rowData[c.key]);

                    if (missingRequired.length > 0) {
                        errors.push({
                            row: rowNum,
                            errors: missingRequired.map(c => `Campo "${c.label}" es requerido`),
                        });
                    } else {
                        validRows.push(rowData);
                    }
                }
            });

            // Guardar filas válidas en Firestore
            const batch = db.batch();
            const savedIds = [];

            for (const rowData of validRows) {
                const docRef = db.collection('tenants').doc(tenantId).collection('operations').doc();
                batch.set(docRef, {
                    ...rowData,
                    createdAt: FieldValue.serverTimestamp(),
                });
                savedIds.push(docRef.id);
            }

            if (validRows.length > 0) {
                await batch.commit();
            }

            logger.log('Upload processed:', {
                tenantId,
                activityType,
                fileName,
                totalRows: dataRows.length,
                validRows: validRows.length,
                errors: errors.length,
                user: request.auth.uid,
            });

            return {
                success: true,
                recordsProcessed: validRows.length,
                recordsWithErrors: errors.length,
                totalRecords: dataRows.length,
                errors: errors.slice(0, 50), // Limitar a 50 errores para no sobrecargar la respuesta
                hasMoreErrors: errors.length > 50,
                uploadBatchId,
            };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            logger.error('Error processing upload:', error);
            throw new HttpsError('internal', 'Error al procesar el archivo: ' + error.message);
        }
    }
);
