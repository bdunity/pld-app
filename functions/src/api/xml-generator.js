/**
 * PLD BDU - Motor de Generación XML para SAT
 * Genera archivos XML válidos según esquemas XSD oficiales del SAT/UIF
 * para todas las 15 actividades vulnerables (LFPIORPI Art. 17)
 *
 * Soporta múltiples reportes por actividad:
 * - JUEGOS_APUESTAS → 2 XMLs: depósitos + retiros/premios
 * - Demás actividades → 1 XML por periodo
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { create } from 'xmlbuilder2';

// ============================================================================
// CONFIGURACIÓN DE SCHEMAS XSD POR ACTIVIDAD (SAT/UIF)
// ============================================================================

const XML_SCHEMAS = {
    INMUEBLES: {
        namespace: 'http://www.uif.shcp.gob.mx/recepcion/avi',
        schemaFile: 'AVI.xsd',
        sat_code: 'AV01',
    },
    TARJETAS_PREPAGO: {
        namespace: 'http://www.uif.shcp.gob.mx/recepcion/tdc',
        schemaFile: 'TDC.xsd',
        sat_code: 'AV02',
    },
    VEHICULOS: {
        namespace: 'http://www.uif.shcp.gob.mx/recepcion/aut',
        schemaFile: 'AUT.xsd',
        sat_code: 'AV03',
    },
    METALES_PIEDRAS: {
        namespace: 'http://www.uif.shcp.gob.mx/recepcion/joy',
        schemaFile: 'JOY.xsd',
        sat_code: 'AV04',
    },
    OBRAS_ARTE: {
        namespace: 'http://www.uif.shcp.gob.mx/recepcion/art',
        schemaFile: 'ART.xsd',
        sat_code: 'AV05',
    },
    OPERACIONES_MUTUO: {
        namespace: 'http://www.uif.shcp.gob.mx/recepcion/mpr',
        schemaFile: 'MPR.xsd',
        sat_code: 'AV06',
    },
    CHEQUES_VIAJERO: {
        namespace: 'http://www.uif.shcp.gob.mx/recepcion/chv',
        schemaFile: 'CHV.xsd',
        sat_code: 'AV07',
    },
    BLINDAJE: {
        namespace: 'http://www.uif.shcp.gob.mx/recepcion/bli',
        schemaFile: 'BLI.xsd',
        sat_code: 'AV08',
    },
    TRASLADO_VALORES: {
        namespace: 'http://www.uif.shcp.gob.mx/recepcion/tra',
        schemaFile: 'TRA.xsd',
        sat_code: 'AV09',
    },
    SERVICIOS_FE_PUBLICA: {
        namespace: 'http://www.uif.shcp.gob.mx/recepcion/fep',
        schemaFile: 'FEP.xsd',
        sat_code: 'AV10',
    },
    JUEGOS_APUESTAS: {
        namespace: 'http://www.uif.shcp.gob.mx/recepcion/jys',
        schemaFile: 'JYS.xsd',
        sat_code: 'AV11',
    },
    SERVICIOS_PROFESIONALES: {
        namespace: 'http://www.uif.shcp.gob.mx/recepcion/spr',
        schemaFile: 'SPR.xsd',
        sat_code: 'AV12',
    },
    ARRENDAMIENTO: {
        namespace: 'http://www.uif.shcp.gob.mx/recepcion/arr',
        schemaFile: 'ARR.xsd',
        sat_code: 'AV13',
    },
    CONSTITUCION_PERSONAS: {
        namespace: 'http://www.uif.shcp.gob.mx/recepcion/cpm',
        schemaFile: 'CPM.xsd',
        sat_code: 'AV14',
    },
    ACTIVOS_VIRTUALES: {
        namespace: 'http://www.uif.shcp.gob.mx/recepcion/vir',
        schemaFile: 'VIR.xsd',
        sat_code: 'AV17',
    },
};

// Tipos de operación para JUEGOS_APUESTAS (split en 2 reportes)
const JUEGOS_DEPOSITOS = ['deposito', 'compra', 'apuesta', 'ingreso', 'carga'];
const JUEGOS_RETIROS = ['retiro', 'premio', 'cobro', 'pago', 'devolucion'];

// ============================================================================
// FUNCIONES DE FORMATEO Y SANITIZACIÓN
// ============================================================================

function formatDateSAT(value) {
    if (!value) return '';
    let date;
    if (value?.toDate) {
        date = value.toDate();
    } else if (value instanceof Date) {
        date = value;
    } else if (typeof value === 'string') {
        date = new Date(value);
    } else {
        return '';
    }
    if (isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function formatMonto(value) {
    const num = parseFloat(value);
    if (isNaN(num)) return '0.00';
    return num.toFixed(2);
}

function sanitizeText(value, maxLength = 0) {
    if (!value) return '';
    let text = String(value)
        .replace(/[\x00-\x1F\x7F]/g, '')
        .trim();
    if (maxLength > 0 && text.length > maxLength) {
        text = text.substring(0, maxLength);
    }
    return text;
}

function sanitizeRFC(value) {
    if (!value) return '';
    return String(value).toUpperCase().replace(/[^A-ZÑ&0-9]/g, '').slice(0, 13);
}

// ============================================================================
// CLOUD FUNCTION: generateXML
// ============================================================================

export const generateXML = onCall(
    {
        region: 'us-central1',
        memory: '512MiB',
        timeoutSeconds: 120,
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Debes iniciar sesión');
        }

        const { activityType, periodYear, periodMonth } = request.data;

        if (!activityType || !periodYear || !periodMonth) {
            throw new HttpsError('invalid-argument', 'Actividad, año y mes son requeridos');
        }

        const schema = XML_SCHEMAS[activityType];
        if (!schema) {
            throw new HttpsError('invalid-argument', `Actividad no soportada: ${activityType}`);
        }

        try {
            const userId = request.auth.uid;
            const tenantId = request.auth.token.tenantId || userId;

            // Verificar tenant
            const tenantDoc = await db.collection('tenants').doc(tenantId).get();
            if (!tenantDoc.exists) {
                throw new HttpsError('permission-denied', 'No tienes un tenant asociado');
            }
            const tenantData = tenantDoc.data();

            // Consultar operaciones del periodo
            const opsSnapshot = await db
                .collection('tenants').doc(tenantId)
                .collection('operations')
                .where('activityType', '==', activityType)
                .where('periodYear', '==', parseInt(periodYear))
                .where('periodMonth', '==', parseInt(periodMonth))
                .get();

            if (opsSnapshot.empty) {
                throw new HttpsError('not-found', 'No hay operaciones para el periodo seleccionado');
            }

            const allOperations = opsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Para JUEGOS_APUESTAS generar 2 reportes
            if (activityType === 'JUEGOS_APUESTAS') {
                const depositos = allOperations.filter(op => {
                    const tipo = (op.tipoOperacion || '').toLowerCase();
                    return JUEGOS_DEPOSITOS.some(d => tipo.includes(d));
                });
                const retiros = allOperations.filter(op => {
                    const tipo = (op.tipoOperacion || '').toLowerCase();
                    return JUEGOS_RETIROS.some(r => tipo.includes(r));
                });
                // Operaciones sin clasificar van a depósitos
                const sinClasificar = allOperations.filter(op => {
                    const tipo = (op.tipoOperacion || '').toLowerCase();
                    return !JUEGOS_DEPOSITOS.some(d => tipo.includes(d)) &&
                           !JUEGOS_RETIROS.some(r => tipo.includes(r));
                });
                depositos.push(...sinClasificar);

                const results = [];

                if (depositos.length > 0) {
                    const xmlDepositos = buildXMLDocument(activityType, schema, tenantData, depositos, periodYear, periodMonth);
                    const fileNameDep = `${sanitizeRFC(tenantData.rfc)}_${activityType}_DEPOSITOS_${periodYear}${String(periodMonth).padStart(2, '0')}.xml`;
                    results.push({
                        type: 'DEPOSITOS',
                        label: 'Depósitos / Apuestas',
                        fileName: fileNameDep,
                        xmlBase64: Buffer.from(xmlDepositos, 'utf-8').toString('base64'),
                        recordCount: depositos.length,
                        operationIds: depositos.map(o => o.id),
                    });
                }

                if (retiros.length > 0) {
                    const xmlRetiros = buildXMLDocument(activityType, schema, tenantData, retiros, periodYear, periodMonth);
                    const fileNameRet = `${sanitizeRFC(tenantData.rfc)}_${activityType}_RETIROS_${periodYear}${String(periodMonth).padStart(2, '0')}.xml`;
                    results.push({
                        type: 'RETIROS',
                        label: 'Retiros / Premios',
                        fileName: fileNameRet,
                        xmlBase64: Buffer.from(xmlRetiros, 'utf-8').toString('base64'),
                        recordCount: retiros.length,
                        operationIds: retiros.map(o => o.id),
                    });
                }

                // Marcar operaciones como REPORTED
                await markOperationsReported(tenantId, allOperations.map(o => o.id));

                // Registrar en historial
                const genId = await saveGenerationHistory(tenantId, userId, activityType, periodYear, periodMonth, allOperations.length, results.length);

                logger.log('XML generated (JUEGOS - multi):', { tenantId, activityType, total: allOperations.length, reports: results.length });

                return {
                    success: true,
                    multipleReports: true,
                    reports: results,
                    totalOperations: allOperations.length,
                    generationId: genId,
                };
            }

            // Actividades normales: 1 solo XML
            const xmlContent = buildXMLDocument(activityType, schema, tenantData, allOperations, periodYear, periodMonth);
            const fileName = `${sanitizeRFC(tenantData.rfc)}_${activityType}_${periodYear}${String(periodMonth).padStart(2, '0')}.xml`;

            // Marcar operaciones como REPORTED
            await markOperationsReported(tenantId, allOperations.map(o => o.id));

            // Registrar en historial
            const genId = await saveGenerationHistory(tenantId, userId, activityType, periodYear, periodMonth, allOperations.length, 1);

            logger.log('XML generated:', { tenantId, activityType, records: allOperations.length });

            return {
                success: true,
                multipleReports: false,
                reports: [{
                    type: 'UNICO',
                    label: 'Reporte Completo',
                    fileName,
                    xmlBase64: Buffer.from(xmlContent, 'utf-8').toString('base64'),
                    recordCount: allOperations.length,
                    operationIds: allOperations.map(o => o.id),
                }],
                totalOperations: allOperations.length,
                generationId: genId,
            };

        } catch (error) {
            if (error instanceof HttpsError) throw error;
            logger.error('Error generating XML:', error);
            throw new HttpsError('internal', 'Error al generar XML: ' + error.message);
        }
    }
);

// ============================================================================
// CLOUD FUNCTION: getXMLHistory
// ============================================================================

export const getXMLHistory = onCall(
    {
        region: 'us-central1',
        memory: '256MiB',
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Debes iniciar sesión');
        }

        try {
            const userId = request.auth.uid;
            const tenantId = request.auth.token.tenantId || userId;

            const snapshot = await db
                .collection('tenants').doc(tenantId)
                .collection('xml_generations')
                .orderBy('generatedAt', 'desc')
                .limit(50)
                .get();

            const history = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                generatedAt: doc.data().generatedAt?.toDate?.()?.toISOString() || doc.data().generatedAt,
            }));

            return { success: true, history };
        } catch (error) {
            logger.error('Error fetching XML history:', error);
            throw new HttpsError('internal', 'Error al obtener historial');
        }
    }
);

// ============================================================================
// FUNCIÓN AUXILIAR: Marcar operaciones como REPORTED
// ============================================================================

async function markOperationsReported(tenantId, operationIds) {
    // Firestore batch limit is 500
    const chunks = [];
    for (let i = 0; i < operationIds.length; i += 400) {
        chunks.push(operationIds.slice(i, i + 400));
    }

    for (const chunk of chunks) {
        const batch = db.batch();
        for (const opId of chunk) {
            const ref = db.collection('tenants').doc(tenantId).collection('operations').doc(opId);
            batch.update(ref, {
                status: 'REPORTED',
                reportedAt: FieldValue.serverTimestamp(),
            });
        }
        await batch.commit();
    }
}

// ============================================================================
// FUNCIÓN AUXILIAR: Guardar en historial
// ============================================================================

async function saveGenerationHistory(tenantId, userId, activityType, periodYear, periodMonth, recordCount, reportCount) {
    const docRef = await db.collection('tenants').doc(tenantId).collection('xml_generations').add({
        activityType,
        periodYear: parseInt(periodYear),
        periodMonth: parseInt(periodMonth),
        recordCount,
        reportCount,
        generatedBy: userId,
        generatedAt: FieldValue.serverTimestamp(),
    });
    return docRef.id;
}

// ============================================================================
// CONSTRUCTOR XML PRINCIPAL
// ============================================================================

function buildXMLDocument(activityType, schema, tenantData, operations, periodYear, periodMonth) {
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
        .ele('archivo', {
            'xmlns': schema.namespace,
            'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
            'xsi:schemaLocation': `${schema.namespace} ${schema.schemaFile}`,
        });

    // Mes reporta
    const mesDoc = doc.ele('mes_reporta');
    mesDoc.ele('mes_reporta').txt(String(periodMonth).padStart(2, '0'));
    mesDoc.ele('anio_reporta').txt(String(periodYear));

    // Sujeto obligado
    const sujetoDoc = doc.ele('sujeto_obligado');
    sujetoDoc.ele('clave_sujeto_obligado').txt(sanitizeText(tenantData.claveSujetoObligado || tenantData.rfc || '', 20));
    sujetoDoc.ele('clave_actividad').txt(schema.sat_code);
    sujetoDoc.ele('rfc').txt(sanitizeRFC(tenantData.rfc));
    sujetoDoc.ele('razon_social').txt(sanitizeText(tenantData.razonSocial, 150));

    // Avisos
    const avisosDoc = doc.ele('avisos');

    for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        const avisoDoc = avisosDoc.ele('aviso');
        avisoDoc.ele('folio_aviso').txt(String(i + 1).padStart(6, '0'));

        // Detalle operación (específico por actividad)
        buildDetalleOperacion(avisoDoc, activityType, op);

        // Persona operación (cliente)
        buildPersonaOperacion(avisoDoc, op);
    }

    return doc.end({ prettyPrint: true, indent: '  ' });
}

// ============================================================================
// DETALLE DE OPERACIÓN POR ACTIVIDAD
// ============================================================================

function buildDetalleOperacion(avisoDoc, activityType, op) {
    const detDoc = avisoDoc.ele('detalle_operacion');

    // Campos comunes
    detDoc.ele('fecha_operacion').txt(formatDateSAT(op.fechaOperacion));
    detDoc.ele('tipo_operacion').txt(sanitizeText(op.tipoOperacion, 50));

    switch (activityType) {
        case 'INMUEBLES':
            detDoc.ele('monto_operacion').txt(formatMonto(op.monto));
            detDoc.ele('moneda').txt('MXN');
            if (op.ubicacionInmueble) detDoc.ele('ubicacion_inmueble').txt(sanitizeText(op.ubicacionInmueble, 300));
            if (op.tipoInmueble) detDoc.ele('tipo_inmueble').txt(sanitizeText(op.tipoInmueble, 50));
            if (op.folioReal) detDoc.ele('folio_real').txt(sanitizeText(op.folioReal, 50));
            break;

        case 'VEHICULOS':
            detDoc.ele('monto_operacion').txt(formatMonto(op.monto));
            detDoc.ele('moneda').txt('MXN');
            if (op.serieNIV) detDoc.ele('serie_niv').txt(sanitizeText(op.serieNIV, 50));
            if (op.marca) detDoc.ele('marca').txt(sanitizeText(op.marca, 50));
            if (op.modelo) detDoc.ele('modelo').txt(sanitizeText(op.modelo, 50));
            if (op.anio) detDoc.ele('anio_vehiculo').txt(String(op.anio));
            break;

        case 'METALES_PIEDRAS':
            detDoc.ele('monto_operacion').txt(formatMonto(op.monto));
            detDoc.ele('moneda').txt('MXN');
            if (op.descripcionArticulo) detDoc.ele('descripcion_articulo').txt(sanitizeText(op.descripcionArticulo, 200));
            if (op.pesoQuilates) detDoc.ele('peso_quilates').txt(sanitizeText(op.pesoQuilates, 30));
            break;

        case 'OBRAS_ARTE':
            detDoc.ele('monto_operacion').txt(formatMonto(op.monto));
            detDoc.ele('moneda').txt('MXN');
            if (op.descripcionObra) detDoc.ele('descripcion_obra').txt(sanitizeText(op.descripcionObra, 200));
            if (op.autorArtista) detDoc.ele('autor_artista').txt(sanitizeText(op.autorArtista, 100));
            if (op.tecnicaMaterial) detDoc.ele('tecnica_material').txt(sanitizeText(op.tecnicaMaterial, 100));
            break;

        case 'ACTIVOS_VIRTUALES':
            detDoc.ele('monto_operacion').txt(formatMonto(op.montoMXN || op.monto));
            detDoc.ele('moneda').txt('MXN');
            if (op.tipoActivoVirtual) detDoc.ele('tipo_activo_virtual').txt(sanitizeText(op.tipoActivoVirtual, 50));
            if (op.cantidadTokens) detDoc.ele('cantidad_tokens').txt(String(op.cantidadTokens));
            break;

        case 'JUEGOS_APUESTAS':
            detDoc.ele('monto_operacion').txt(formatMonto(op.monto));
            detDoc.ele('moneda').txt('MXN');
            if (op.tipoJuego) detDoc.ele('tipo_juego').txt(sanitizeText(op.tipoJuego, 50));
            if (op.premioObtenido) detDoc.ele('premio_obtenido').txt(formatMonto(op.premioObtenido));
            break;

        case 'BLINDAJE':
            detDoc.ele('monto_operacion').txt(formatMonto(op.monto));
            detDoc.ele('moneda').txt('MXN');
            if (op.tipoBlindaje) detDoc.ele('tipo_blindaje').txt(sanitizeText(op.tipoBlindaje, 50));
            if (op.nivelBlindaje) detDoc.ele('nivel_blindaje').txt(sanitizeText(op.nivelBlindaje, 10));
            if (op.descripcionBienBlindado) detDoc.ele('descripcion_bien').txt(sanitizeText(op.descripcionBienBlindado, 200));
            if (op.numeroSerieIdentificacion) detDoc.ele('numero_serie').txt(sanitizeText(op.numeroSerieIdentificacion, 50));
            break;

        case 'TARJETAS_PREPAGO':
            detDoc.ele('monto_operacion').txt(formatMonto(op.monto));
            detDoc.ele('moneda').txt('MXN');
            if (op.tipoTarjeta) detDoc.ele('tipo_tarjeta').txt(sanitizeText(op.tipoTarjeta, 30));
            if (op.numeroTarjeta) detDoc.ele('numero_tarjeta').txt(sanitizeText(op.numeroTarjeta, 20));
            if (op.montoCargaOperacion) detDoc.ele('monto_carga').txt(formatMonto(op.montoCargaOperacion));
            break;

        case 'CHEQUES_VIAJERO':
            detDoc.ele('monto_operacion').txt(formatMonto(op.monto));
            if (op.denominacionCheque) detDoc.ele('denominacion').txt(sanitizeText(op.denominacionCheque, 50));
            if (op.cantidadCheques) detDoc.ele('cantidad_cheques').txt(String(op.cantidadCheques));
            if (op.moneda) detDoc.ele('moneda').txt(sanitizeText(op.moneda, 10));
            break;

        case 'OPERACIONES_MUTUO':
            detDoc.ele('monto_operacion').txt(formatMonto(op.monto));
            detDoc.ele('moneda').txt('MXN');
            if (op.plazo) detDoc.ele('plazo').txt(sanitizeText(op.plazo, 30));
            if (op.tasaInteres) detDoc.ele('tasa_interes').txt(String(parseFloat(op.tasaInteres).toFixed(2)));
            if (op.tipoGarantia) detDoc.ele('tipo_garantia').txt(sanitizeText(op.tipoGarantia, 50));
            break;

        case 'TRASLADO_VALORES':
            detDoc.ele('monto_operacion').txt(formatMonto(op.monto));
            detDoc.ele('moneda').txt('MXN');
            if (op.origen) detDoc.ele('origen').txt(sanitizeText(op.origen, 200));
            if (op.destino) detDoc.ele('destino').txt(sanitizeText(op.destino, 200));
            if (op.tipoValorTrasladado) detDoc.ele('tipo_valor').txt(sanitizeText(op.tipoValorTrasladado, 50));
            break;

        case 'SERVICIOS_FE_PUBLICA':
            detDoc.ele('monto_operacion').txt(formatMonto(op.monto));
            detDoc.ele('moneda').txt('MXN');
            if (op.numeroInstrumento) detDoc.ele('numero_instrumento').txt(sanitizeText(op.numeroInstrumento, 30));
            if (op.tipoActoJuridico) detDoc.ele('tipo_acto').txt(sanitizeText(op.tipoActoJuridico, 100));
            if (op.descripcionActo) detDoc.ele('descripcion_acto').txt(sanitizeText(op.descripcionActo, 300));
            break;

        case 'SERVICIOS_PROFESIONALES':
            detDoc.ele('monto_operacion').txt(formatMonto(op.monto));
            detDoc.ele('moneda').txt('MXN');
            if (op.tipoServicio) detDoc.ele('tipo_servicio').txt(sanitizeText(op.tipoServicio, 100));
            if (op.descripcionServicio) detDoc.ele('descripcion_servicio').txt(sanitizeText(op.descripcionServicio, 300));
            break;

        case 'ARRENDAMIENTO':
            detDoc.ele('monto_operacion').txt(formatMonto(op.montoMensual || op.monto));
            detDoc.ele('moneda').txt('MXN');
            if (op.ubicacionInmueble) detDoc.ele('ubicacion_inmueble').txt(sanitizeText(op.ubicacionInmueble, 300));
            if (op.tipoInmueble) detDoc.ele('tipo_inmueble').txt(sanitizeText(op.tipoInmueble, 50));
            if (op.plazoContrato) detDoc.ele('plazo_contrato').txt(sanitizeText(op.plazoContrato, 30));
            break;

        case 'CONSTITUCION_PERSONAS':
            detDoc.ele('monto_operacion').txt(formatMonto(op.monto));
            detDoc.ele('moneda').txt('MXN');
            if (op.denominacionRazonSocial) detDoc.ele('denominacion').txt(sanitizeText(op.denominacionRazonSocial, 150));
            if (op.tipoPersonaMoral) detDoc.ele('tipo_persona_moral').txt(sanitizeText(op.tipoPersonaMoral, 50));
            if (op.objetoSocial) detDoc.ele('objeto_social').txt(sanitizeText(op.objetoSocial, 300));
            if (op.capitalSocial) detDoc.ele('capital_social').txt(formatMonto(op.capitalSocial));
            break;

        default:
            detDoc.ele('monto_operacion').txt(formatMonto(op.monto));
            detDoc.ele('moneda').txt('MXN');
            if (op.descripcion) detDoc.ele('descripcion').txt(sanitizeText(op.descripcion, 300));
            break;
    }
}

// ============================================================================
// PERSONA OPERACIÓN (CLIENTE)
// ============================================================================

function buildPersonaOperacion(avisoDoc, op) {
    const personaDoc = avisoDoc.ele('persona_operacion');

    // Determinar tipo de persona por longitud del RFC
    const rfc = sanitizeRFC(op.rfcCliente);
    const tipoPersona = rfc.length === 12 ? 'PM' : 'PF';
    personaDoc.ele('tipo_persona').txt(tipoPersona);

    if (tipoPersona === 'PF') {
        // Persona Física - separar nombre
        const nombreParts = splitNombre(op.nombreCliente || '');
        personaDoc.ele('nombre').txt(sanitizeText(nombreParts.nombre, 100));
        personaDoc.ele('apellido_paterno').txt(sanitizeText(nombreParts.apellidoPaterno, 100));
        if (nombreParts.apellidoMaterno) {
            personaDoc.ele('apellido_materno').txt(sanitizeText(nombreParts.apellidoMaterno, 100));
        }
    } else {
        // Persona Moral
        personaDoc.ele('razon_social').txt(sanitizeText(op.nombreCliente, 150));
    }

    personaDoc.ele('rfc').txt(rfc);
    personaDoc.ele('nacionalidad').txt('MX');
}

// ============================================================================
// UTILIDAD: Separar nombre completo en partes
// ============================================================================

function splitNombre(fullName) {
    const parts = fullName.trim().split(/\s+/);

    if (parts.length >= 3) {
        return {
            nombre: parts.slice(0, parts.length - 2).join(' '),
            apellidoPaterno: parts[parts.length - 2],
            apellidoMaterno: parts[parts.length - 1],
        };
    } else if (parts.length === 2) {
        return {
            nombre: parts[0],
            apellidoPaterno: parts[1],
            apellidoMaterno: '',
        };
    } else {
        return {
            nombre: fullName,
            apellidoPaterno: '',
            apellidoMaterno: '',
        };
    }
}
