/**
 * PLD BDU — Motor de Generación XML para SAT/UIF
 *
 * Genera archivos XML válidos según esquemas XSD oficiales del SAT/UIF
 * para las 15 actividades vulnerables (LFPIORPI Art. 17).
 *
 * ETAPA 3 — Mejoras:
 * - Sanitización SAT: MAYÚSCULAS sin acentos
 * - Agrupación por persona (persona_aviso con múltiples detalle_operaciones)
 * - Mapeo de códigos numéricos (tipo_operacion, moneda, instrumento_monetario)
 * - Nodo beneficiario_controlador cuando actua_nombre_propio = NO
 * - Informe en Ceros (sin operaciones)
 * - JUEGOS_APUESTAS → 2 XMLs: depósitos + retiros/premios
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
const JUEGOS_DEPOSITOS = ['compra', 'apuesta', 'deposito', 'carga'];
const JUEGOS_RETIROS = ['pago de premios', 'retiro', 'cobro', 'reembolso'];


// ============================================================================
// FUNCIONES DE FORMATEO Y SANITIZACIÓN SAT
// ============================================================================

/**
 * SAT Text Sanitization:
 * - Uppercase
 * - Remove accents (NFD decomposition)
 * - Remove control characters
 * - Trim + max length
 */
function sanitizeTextSAT(value, maxLength = 0) {
    if (!value) return '';
    let text = String(value)
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')  // Remove accent marks
        .replace(/[\x00-\x1F\x7F]/g, '') // Remove control chars
        .replace(/[&<>"']/g, '')          // Remove XML-unsafe chars
        .trim();
    if (maxLength > 0 && text.length > maxLength) {
        text = text.substring(0, maxLength);
    }
    return text;
}

/**
 * Sanitize RFC: uppercase, only valid chars, max 13
 */
function sanitizeRFC(value) {
    if (!value) return '';
    return String(value).toUpperCase().replace(/[^A-ZÑ&0-9]/g, '').slice(0, 13);
}

/**
 * Format date to YYYYMMDD (SAT strict format)
 */
function formatDateSAT(value) {
    if (!value) return '';
    let date;
    if (value?.toDate) {
        date = value.toDate();
    } else if (value instanceof Date) {
        date = value;
    } else if (typeof value === 'string') {
        // Handle YYYY-MM-DD format
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            const [y, m, d] = value.split('-');
            return `${y}${m}${d}`;
        }
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

/**
 * Format monetary amount: no commas, 2 decimal places
 */
function formatMonto(value) {
    const num = parseFloat(value);
    if (isNaN(num)) return '0.00';
    return num.toFixed(2);
}

/**
 * Extract numeric code from catalog value like "1-Efectivo" → "1"
 */
function extractCatalogCode(value) {
    if (!value) return '';
    const str = String(value).trim();
    const match = str.match(/^(\d+)/);
    return match ? match[1] : str;
}

/**
 * Extract moneda code: "1-MXN" → "MXN", "2-USD" → "USD"
 * Falls back to just the code if no label part
 */
function extractMonedaLabel(value) {
    if (!value) return 'MXN';
    const str = String(value).trim();
    const match = str.match(/^\d+-(.+)$/);
    return match ? match[1].toUpperCase().trim() : str.toUpperCase();
}

/**
 * Determine person type from catalog value or RFC length
 */
function getPersonTypeCode(tipoPersona, rfc) {
    if (tipoPersona) {
        const clean = String(tipoPersona).toLowerCase().trim();
        if (clean.includes('moral') || clean === '2' || clean.startsWith('2-')) return '2';
        if (clean.includes('física') || clean.includes('fisica') || clean === '1' || clean.startsWith('1-')) return '1';
    }
    // Fallback: RFC length
    if (rfc) {
        const cleanRfc = sanitizeRFC(rfc);
        return cleanRfc.length === 12 ? '2' : '1';
    }
    return '1';
}


// ============================================================================
// CLOUD FUNCTION: generateXML
// Supports both normal reports and "Informe en Ceros"
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

        const { activityType, periodYear, periodMonth, informeEnCeros = false } = request.data;

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

            // ── INFORME EN CEROS ──
            if (informeEnCeros) {
                const xmlContent = buildXMLEnCeros(schema, tenantData, periodYear, periodMonth);
                const fileName = `${sanitizeRFC(tenantData.rfc)}_${activityType}_CEROS_${periodYear}${String(periodMonth).padStart(2, '0')}.xml`;

                const genId = await saveGenerationHistory(
                    tenantId, userId, activityType, periodYear, periodMonth, 0, 1, true
                );

                logger.log('XML en ceros generated:', { tenantId, activityType });

                return {
                    success: true,
                    multipleReports: false,
                    informeEnCeros: true,
                    reports: [{
                        type: 'CEROS',
                        label: 'Informe en Ceros',
                        fileName,
                        xmlBase64: Buffer.from(xmlContent, 'utf-8').toString('base64'),
                        recordCount: 0,
                        operationIds: [],
                    }],
                    totalOperations: 0,
                    generationId: genId,
                };
            }

            // ── INFORME CON OPERACIONES ──
            const opsSnapshot = await db
                .collection('tenants').doc(tenantId)
                .collection('operations')
                .where('activityType', '==', activityType)
                .where('periodYear', '==', parseInt(periodYear))
                .where('periodMonth', '==', parseInt(periodMonth))
                .get();

            if (opsSnapshot.empty) {
                throw new HttpsError('not-found', 'No hay operaciones para el periodo seleccionado. Usa "Informe en Ceros" si no hubo operaciones.');
            }

            const allOperations = opsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Para JUEGOS_APUESTAS generar 2 reportes separados
            if (activityType === 'JUEGOS_APUESTAS') {
                const depositos = [];
                const retiros = [];

                for (const op of allOperations) {
                    const tipoOp = (op.tipoOperacion || '').toLowerCase();
                    if (JUEGOS_RETIROS.some(r => tipoOp.includes(r))) {
                        retiros.push(op);
                    } else {
                        depositos.push(op);
                    }
                }

                const results = [];

                if (depositos.length > 0) {
                    const xmlDepositos = buildXMLDocument(activityType, schema, tenantData, depositos, periodYear, periodMonth);
                    results.push({
                        type: 'DEPOSITOS',
                        label: 'Depositos / Apuestas',
                        fileName: `${sanitizeRFC(tenantData.rfc)}_JYS_DEPOSITOS_${periodYear}${String(periodMonth).padStart(2, '0')}.xml`,
                        xmlBase64: Buffer.from(xmlDepositos, 'utf-8').toString('base64'),
                        recordCount: depositos.length,
                        operationIds: depositos.map(o => o.id),
                    });
                }

                if (retiros.length > 0) {
                    const xmlRetiros = buildXMLDocument(activityType, schema, tenantData, retiros, periodYear, periodMonth);
                    results.push({
                        type: 'RETIROS',
                        label: 'Retiros / Premios',
                        fileName: `${sanitizeRFC(tenantData.rfc)}_JYS_RETIROS_${periodYear}${String(periodMonth).padStart(2, '0')}.xml`,
                        xmlBase64: Buffer.from(xmlRetiros, 'utf-8').toString('base64'),
                        recordCount: retiros.length,
                        operationIds: retiros.map(o => o.id),
                    });
                }

                await markOperationsReported(tenantId, allOperations.map(o => o.id));
                const genId = await saveGenerationHistory(tenantId, userId, activityType, periodYear, periodMonth, allOperations.length, results.length, false);

                logger.log('XML generated (JUEGOS - multi):', { tenantId, total: allOperations.length, reports: results.length });

                return {
                    success: true,
                    multipleReports: true,
                    informeEnCeros: false,
                    reports: results,
                    totalOperations: allOperations.length,
                    generationId: genId,
                };
            }

            // ── Actividades normales: 1 solo XML ──
            const xmlContent = buildXMLDocument(activityType, schema, tenantData, allOperations, periodYear, periodMonth);
            const fileName = `${sanitizeRFC(tenantData.rfc)}_${schema.sat_code}_${periodYear}${String(periodMonth).padStart(2, '0')}.xml`;

            await markOperationsReported(tenantId, allOperations.map(o => o.id));
            const genId = await saveGenerationHistory(tenantId, userId, activityType, periodYear, periodMonth, allOperations.length, 1, false);

            logger.log('XML generated:', { tenantId, activityType, records: allOperations.length });

            return {
                success: true,
                multipleReports: false,
                informeEnCeros: false,
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
// HELPERS: Mark operations + save history
// ============================================================================

async function markOperationsReported(tenantId, operationIds) {
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

async function saveGenerationHistory(tenantId, userId, activityType, periodYear, periodMonth, recordCount, reportCount, informeEnCeros) {
    const docRef = await db.collection('tenants').doc(tenantId).collection('xml_generations').add({
        activityType,
        periodYear: parseInt(periodYear),
        periodMonth: parseInt(periodMonth),
        recordCount,
        reportCount,
        informeEnCeros: !!informeEnCeros,
        generatedBy: userId,
        generatedAt: FieldValue.serverTimestamp(),
    });
    return docRef.id;
}


// ============================================================================
// XML BUILDER: Informe en Ceros
// Only header + sujeto_obligado, NO <avisos> node
// ============================================================================

function buildXMLEnCeros(schema, tenantData, periodYear, periodMonth) {
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
        .ele('archivo', {
            'xmlns': schema.namespace,
            'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
            'xsi:schemaLocation': `${schema.namespace} ${schema.schemaFile}`,
        });

    // Encabezado: Mes reportado
    const mesDoc = doc.ele('informe');
    const mesReportado = mesDoc.ele('mes_reportado');
    mesReportado.ele('mes').txt(String(periodMonth).padStart(2, '0'));
    mesReportado.ele('anio').txt(String(periodYear));

    // Sujeto obligado
    const sujetoDoc = mesDoc.ele('sujeto_obligado');
    sujetoDoc.ele('clave_sujeto_obligado').txt(sanitizeTextSAT(tenantData.claveSujetoObligado || tenantData.rfc || '', 20));
    sujetoDoc.ele('clave_actividad').txt(schema.sat_code);
    sujetoDoc.ele('rfc').txt(sanitizeRFC(tenantData.rfc));
    sujetoDoc.ele('razon_social').txt(sanitizeTextSAT(tenantData.razonSocial || tenantData.companyName || '', 150));

    // Flag de sin operaciones
    mesDoc.ele('sin_operaciones').txt('1');

    return doc.end({ prettyPrint: true, indent: '  ' });
}


// ============================================================================
// XML BUILDER: Informe con Operaciones
// Groups operations by person (RFC), one <aviso> per person with multiple
// <detalle_operaciones> nodes
// ============================================================================

function buildXMLDocument(activityType, schema, tenantData, operations, periodYear, periodMonth) {
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
        .ele('archivo', {
            'xmlns': schema.namespace,
            'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
            'xsi:schemaLocation': `${schema.namespace} ${schema.schemaFile}`,
        });

    // Encabezado: Mes reportado
    const informe = doc.ele('informe');
    const mesReportado = informe.ele('mes_reportado');
    mesReportado.ele('mes').txt(String(periodMonth).padStart(2, '0'));
    mesReportado.ele('anio').txt(String(periodYear));

    // Sujeto obligado
    const sujetoDoc = informe.ele('sujeto_obligado');
    sujetoDoc.ele('clave_sujeto_obligado').txt(sanitizeTextSAT(tenantData.claveSujetoObligado || tenantData.rfc || '', 20));
    sujetoDoc.ele('clave_actividad').txt(schema.sat_code);
    sujetoDoc.ele('rfc').txt(sanitizeRFC(tenantData.rfc));
    sujetoDoc.ele('razon_social').txt(sanitizeTextSAT(tenantData.razonSocial || tenantData.companyName || '', 150));

    // ── Group operations by person (RFC) ──
    const personGroups = groupOperationsByPerson(operations);

    // Avisos
    const avisosDoc = informe.ele('avisos');
    let folioCounter = 1;

    for (const [rfc, group] of Object.entries(personGroups)) {
        const avisoDoc = avisosDoc.ele('aviso');
        avisoDoc.ele('referencia_aviso').txt(String(folioCounter).padStart(6, '0'));

        // ── Persona del Aviso ──
        const firstOp = group.operations[0]; // Use first operation for person data
        buildPersonaAviso(avisoDoc, firstOp);

        // ── Multiple detalle_operaciones ──
        for (const op of group.operations) {
            buildDetalleOperacion(avisoDoc, activityType, op);
        }

        folioCounter++;
    }

    return doc.end({ prettyPrint: true, indent: '  ' });
}


// ============================================================================
// GROUP OPERATIONS BY PERSON (RFC)
// ============================================================================

function groupOperationsByPerson(operations) {
    const groups = {};

    for (const op of operations) {
        const rfc = sanitizeRFC(op.rfcCliente) || `UNKNOWN_${op.sourceRow || Math.random()}`;

        if (!groups[rfc]) {
            groups[rfc] = {
                rfc,
                operations: [],
            };
        }
        groups[rfc].operations.push(op);
    }

    return groups;
}


// ============================================================================
// PERSONA DEL AVISO (Client + optional Beneficiary Controller)
// ============================================================================

function buildPersonaAviso(avisoDoc, op) {
    const personaDoc = avisoDoc.ele('persona_aviso');

    const rfc = sanitizeRFC(op.rfcCliente);
    const tipoPersonaCode = getPersonTypeCode(op.tipoPersona, rfc);
    personaDoc.ele('tipo_persona').txt(tipoPersonaCode);

    if (tipoPersonaCode === '1') {
        // ── Persona Física ──
        if (op.apellidoPaterno || op.apellidoMaterno) {
            // Structured name fields from Excel
            personaDoc.ele('nombre').txt(sanitizeTextSAT(op.nombreCliente, 100));
            personaDoc.ele('apellido_paterno').txt(sanitizeTextSAT(op.apellidoPaterno, 100));
            if (op.apellidoMaterno) {
                personaDoc.ele('apellido_materno').txt(sanitizeTextSAT(op.apellidoMaterno, 100));
            }
        } else {
            // Fallback: split full name
            const parts = splitNombre(op.nombreCliente || '');
            personaDoc.ele('nombre').txt(sanitizeTextSAT(parts.nombre, 100));
            personaDoc.ele('apellido_paterno').txt(sanitizeTextSAT(parts.apellidoPaterno, 100));
            if (parts.apellidoMaterno) {
                personaDoc.ele('apellido_materno').txt(sanitizeTextSAT(parts.apellidoMaterno, 100));
            }
        }

        if (op.fechaNacimiento) {
            personaDoc.ele('fecha_nacimiento').txt(formatDateSAT(op.fechaNacimiento));
        }
        if (op.curp) {
            personaDoc.ele('curp').txt(sanitizeTextSAT(op.curp, 18));
        }
    } else {
        // ── Persona Moral ──
        personaDoc.ele('razon_social').txt(sanitizeTextSAT(op.nombreCliente, 150));
        if (op.fechaNacimiento) {
            personaDoc.ele('fecha_constitucion').txt(formatDateSAT(op.fechaNacimiento));
        }
    }

    personaDoc.ele('rfc').txt(rfc);

    if (op.telefono) {
        personaDoc.ele('telefono').txt(sanitizeTextSAT(op.telefono, 20));
    }
    if (op.actividadEconomica) {
        personaDoc.ele('actividad_economica').txt(sanitizeTextSAT(op.actividadEconomica, 200));
    }

    // Nacionalidad (default MX)
    personaDoc.ele('pais_nacionalidad').txt(extractCatalogCode(op.pais) || 'MX');

    // ── Domicilio ──
    if (op.calle || op.colonia || op.codigoPostal) {
        const domDoc = personaDoc.ele('domicilio');
        if (op.calle) domDoc.ele('calle').txt(sanitizeTextSAT(op.calle, 200));
        if (op.noExterior) domDoc.ele('numero_exterior').txt(sanitizeTextSAT(op.noExterior, 20));
        if (op.noInterior) domDoc.ele('numero_interior').txt(sanitizeTextSAT(op.noInterior, 20));
        if (op.colonia) domDoc.ele('colonia').txt(sanitizeTextSAT(op.colonia, 100));
        if (op.codigoPostal) domDoc.ele('codigo_postal').txt(sanitizeTextSAT(op.codigoPostal, 5));
        if (op.ciudad) domDoc.ele('ciudad_poblacion').txt(sanitizeTextSAT(op.ciudad, 100));
        if (op.estado) domDoc.ele('entidad_federativa').txt(sanitizeTextSAT(op.estado, 50));
        domDoc.ele('pais').txt(extractCatalogCode(op.pais) || 'MX');
    }

    // ── Beneficiario Controlador ──
    const actuaNombrePropio = String(op.actuaNombrePropio || '').toUpperCase().trim();
    if (actuaNombrePropio === 'NO') {
        const benefDoc = personaDoc.ele('beneficiario_controlador');
        if (op.nombreBeneficiario) {
            benefDoc.ele('nombre').txt(sanitizeTextSAT(op.nombreBeneficiario, 100));
        }
        if (op.apellidoPaternoBeneficiario) {
            benefDoc.ele('apellido_paterno').txt(sanitizeTextSAT(op.apellidoPaternoBeneficiario, 100));
        }
        if (op.apellidoMaternoBeneficiario) {
            benefDoc.ele('apellido_materno').txt(sanitizeTextSAT(op.apellidoMaternoBeneficiario, 100));
        }
        if (op.rfcBeneficiario) {
            benefDoc.ele('rfc').txt(sanitizeRFC(op.rfcBeneficiario));
        }
    }
}


// ============================================================================
// DETALLE DE OPERACIÓN POR ACTIVIDAD
// Maps catalog values to numeric codes for SAT
// ============================================================================

function buildDetalleOperacion(avisoDoc, activityType, op) {
    const detDoc = avisoDoc.ele('detalle_operaciones');

    // ── Common fields ──
    detDoc.ele('fecha_operacion').txt(formatDateSAT(op.fechaOperacion));
    detDoc.ele('tipo_operacion').txt(extractCatalogCode(op.tipoOperacion));
    detDoc.ele('monto_operacion').txt(formatMonto(op.monto));
    detDoc.ele('moneda').txt(extractMonedaLabel(op.moneda));
    detDoc.ele('instrumento_monetario').txt(extractCatalogCode(op.instrumentoMonetario));

    // ── Activity-specific fields ──
    switch (activityType) {
        case 'JUEGOS_APUESTAS':
            if (op.tipoJuego) detDoc.ele('tipo_juego').txt(sanitizeTextSAT(op.tipoJuego, 50));
            if (op.premioObtenido) detDoc.ele('premio_obtenido').txt(formatMonto(op.premioObtenido));
            break;

        case 'INMUEBLES':
            if (op.ubicacionInmueble) detDoc.ele('ubicacion_inmueble').txt(sanitizeTextSAT(op.ubicacionInmueble, 300));
            if (op.tipoInmueble) detDoc.ele('tipo_inmueble').txt(sanitizeTextSAT(op.tipoInmueble, 50));
            if (op.folioReal) detDoc.ele('folio_real').txt(sanitizeTextSAT(op.folioReal, 50));
            break;

        case 'VEHICULOS':
            if (op.serieNIV) detDoc.ele('serie_niv').txt(sanitizeTextSAT(op.serieNIV, 50));
            if (op.marca) detDoc.ele('marca').txt(sanitizeTextSAT(op.marca, 50));
            if (op.modelo) detDoc.ele('modelo').txt(sanitizeTextSAT(op.modelo, 50));
            if (op.anio) detDoc.ele('anio_vehiculo').txt(String(op.anio));
            break;

        case 'METALES_PIEDRAS':
            if (op.descripcionArticulo) detDoc.ele('descripcion_articulo').txt(sanitizeTextSAT(op.descripcionArticulo, 200));
            if (op.pesoQuilates) detDoc.ele('peso_quilates').txt(sanitizeTextSAT(op.pesoQuilates, 30));
            break;

        case 'OBRAS_ARTE':
            if (op.descripcionObra) detDoc.ele('descripcion_obra').txt(sanitizeTextSAT(op.descripcionObra, 200));
            if (op.autorArtista) detDoc.ele('autor_artista').txt(sanitizeTextSAT(op.autorArtista, 100));
            if (op.tecnicaMaterial) detDoc.ele('tecnica_material').txt(sanitizeTextSAT(op.tecnicaMaterial, 100));
            break;

        case 'ACTIVOS_VIRTUALES':
            if (op.tipoActivoVirtual) detDoc.ele('tipo_activo_virtual').txt(sanitizeTextSAT(op.tipoActivoVirtual, 50));
            if (op.cantidadTokens) detDoc.ele('cantidad_tokens').txt(String(op.cantidadTokens));
            break;

        case 'BLINDAJE':
            if (op.tipoBlindaje) detDoc.ele('tipo_blindaje').txt(sanitizeTextSAT(op.tipoBlindaje, 50));
            if (op.nivelBlindaje) detDoc.ele('nivel_blindaje').txt(sanitizeTextSAT(op.nivelBlindaje, 10));
            if (op.descripcionBienBlindado) detDoc.ele('descripcion_bien').txt(sanitizeTextSAT(op.descripcionBienBlindado, 200));
            break;

        case 'TARJETAS_PREPAGO':
            if (op.tipoTarjeta) detDoc.ele('tipo_tarjeta').txt(sanitizeTextSAT(op.tipoTarjeta, 30));
            if (op.numeroTarjeta) detDoc.ele('numero_tarjeta').txt(sanitizeTextSAT(op.numeroTarjeta, 20));
            break;

        case 'CHEQUES_VIAJERO':
            if (op.denominacionCheque) detDoc.ele('denominacion').txt(sanitizeTextSAT(op.denominacionCheque, 50));
            if (op.cantidadCheques) detDoc.ele('cantidad_cheques').txt(String(op.cantidadCheques));
            break;

        case 'OPERACIONES_MUTUO':
            if (op.plazo) detDoc.ele('plazo').txt(sanitizeTextSAT(op.plazo, 30));
            if (op.tasaInteres) detDoc.ele('tasa_interes').txt(String(parseFloat(op.tasaInteres).toFixed(2)));
            if (op.tipoGarantia) detDoc.ele('tipo_garantia').txt(sanitizeTextSAT(op.tipoGarantia, 50));
            break;

        case 'TRASLADO_VALORES':
            if (op.origen) detDoc.ele('origen').txt(sanitizeTextSAT(op.origen, 200));
            if (op.destino) detDoc.ele('destino').txt(sanitizeTextSAT(op.destino, 200));
            if (op.tipoValorTrasladado) detDoc.ele('tipo_valor').txt(sanitizeTextSAT(op.tipoValorTrasladado, 50));
            break;

        case 'SERVICIOS_FE_PUBLICA':
            if (op.numeroInstrumento) detDoc.ele('numero_instrumento').txt(sanitizeTextSAT(op.numeroInstrumento, 30));
            if (op.tipoActoJuridico) detDoc.ele('tipo_acto').txt(sanitizeTextSAT(op.tipoActoJuridico, 100));
            if (op.descripcionActo) detDoc.ele('descripcion_acto').txt(sanitizeTextSAT(op.descripcionActo, 300));
            break;

        case 'SERVICIOS_PROFESIONALES':
            if (op.tipoServicio) detDoc.ele('tipo_servicio').txt(sanitizeTextSAT(op.tipoServicio, 100));
            if (op.descripcionServicio) detDoc.ele('descripcion_servicio').txt(sanitizeTextSAT(op.descripcionServicio, 300));
            break;

        case 'ARRENDAMIENTO':
            if (op.ubicacionInmueble) detDoc.ele('ubicacion_inmueble').txt(sanitizeTextSAT(op.ubicacionInmueble, 300));
            if (op.tipoInmueble) detDoc.ele('tipo_inmueble').txt(sanitizeTextSAT(op.tipoInmueble, 50));
            if (op.plazoContrato) detDoc.ele('plazo_contrato').txt(sanitizeTextSAT(op.plazoContrato, 30));
            break;

        case 'CONSTITUCION_PERSONAS':
            if (op.denominacionRazonSocial) detDoc.ele('denominacion').txt(sanitizeTextSAT(op.denominacionRazonSocial, 150));
            if (op.tipoPersonaMoral) detDoc.ele('tipo_persona_moral').txt(sanitizeTextSAT(op.tipoPersonaMoral, 50));
            if (op.objetoSocial) detDoc.ele('objeto_social').txt(sanitizeTextSAT(op.objetoSocial, 300));
            if (op.capitalSocial) detDoc.ele('capital_social').txt(formatMonto(op.capitalSocial));
            break;

        default:
            if (op.descripcion) detDoc.ele('descripcion').txt(sanitizeTextSAT(op.descripcion, 300));
            break;
    }
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
