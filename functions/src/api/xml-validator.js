/**
 * PLD BDU - Validador XML para CNMV/SAT
 * Valida archivos XML generados contra los parámetros del SAT
 * para actividades vulnerables en prevención de lavado de dinero.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

// ============================================================================
// PATRONES DE VALIDACIÓN SAT
// ============================================================================

const PATTERNS = {
    RFC_PF: /^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$/,
    RFC_PM: /^[A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{3}$/,
    CURP: /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z]{2}$/,
    FECHA_SAT: /^[0-9]{8}$/,
    CODIGO_POSTAL: /^[0-9]{5}$/,
    MONTO: /^[0-9]+(\.[0-9]{1,2})?$/,
};

// ============================================================================
// CLOUD FUNCTION: validateXML
// ============================================================================

export const validateXML = onCall(
    {
        region: 'us-central1',
        memory: '256MiB',
        timeoutSeconds: 60,
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Debes iniciar sesión');
        }

        const { xmlBase64, fileName = 'archivo.xml' } = request.data;

        if (!xmlBase64) {
            throw new HttpsError('invalid-argument', 'El contenido XML es requerido');
        }

        try {
            const xmlString = Buffer.from(xmlBase64, 'base64').toString('utf-8');

            const result = {
                fileName,
                isValid: false,
                status: 'PENDIENTE',
                errors: [],
                warnings: [],
                summary: {
                    totalErrors: 0,
                    totalWarnings: 0,
                    avisoCount: 0,
                },
                validatedAt: new Date().toISOString(),
            };

            // ---------------------------------------------------------------
            // PASO 1: Validar que es XML bien formado
            // ---------------------------------------------------------------
            if (!xmlString.includes('<?xml') || !xmlString.includes('<archivo')) {
                result.errors.push({
                    code: 'E001',
                    type: 'ESTRUCTURA',
                    message: 'El archivo no es un XML válido o no contiene el elemento raíz "archivo".',
                });
                result.status = 'ERROR';
                result.summary.totalErrors = result.errors.length;
                return { success: true, validation: result };
            }

            // ---------------------------------------------------------------
            // PASO 2: Validar estructura básica (nodos requeridos)
            // ---------------------------------------------------------------
            if (!xmlString.includes('<mes_reporta>')) {
                result.errors.push({
                    code: 'E002',
                    type: 'ESTRUCTURA',
                    message: 'Falta el nodo obligatorio "mes_reporta".',
                });
            }

            if (!xmlString.includes('<sujeto_obligado>')) {
                result.errors.push({
                    code: 'E003',
                    type: 'ESTRUCTURA',
                    message: 'Falta el nodo obligatorio "sujeto_obligado".',
                });
            }

            if (!xmlString.includes('<avisos>')) {
                result.errors.push({
                    code: 'E004',
                    type: 'ESTRUCTURA',
                    message: 'Falta el nodo obligatorio "avisos".',
                });
            }

            if (!xmlString.includes('<aviso>')) {
                result.errors.push({
                    code: 'E005',
                    type: 'ESTRUCTURA',
                    message: 'El nodo "avisos" no contiene ningún "aviso". Debe tener al menos uno.',
                });
            }

            // ---------------------------------------------------------------
            // PASO 3: Validar sujeto obligado
            // ---------------------------------------------------------------
            const rfcSujeto = extractTag(xmlString, 'sujeto_obligado', 'rfc');
            if (!rfcSujeto) {
                result.errors.push({
                    code: 'E010',
                    type: 'CAMPO',
                    message: 'Falta el RFC del sujeto obligado.',
                });
            } else if (!PATTERNS.RFC_PM.test(rfcSujeto) && !PATTERNS.RFC_PF.test(rfcSujeto)) {
                result.errors.push({
                    code: 'E011',
                    type: 'FORMATO',
                    message: `RFC del sujeto obligado inválido: "${rfcSujeto}". Debe tener 12 (PM) o 13 (PF) caracteres con formato SAT.`,
                    value: rfcSujeto,
                });
            }

            const razonSocial = extractTag(xmlString, 'sujeto_obligado', 'razon_social');
            if (!razonSocial) {
                result.errors.push({
                    code: 'E012',
                    type: 'CAMPO',
                    message: 'Falta la razón social del sujeto obligado.',
                });
            }

            const claveActividad = extractTag(xmlString, 'sujeto_obligado', 'clave_actividad');
            if (!claveActividad) {
                result.errors.push({
                    code: 'E013',
                    type: 'CAMPO',
                    message: 'Falta la clave de actividad del sujeto obligado.',
                });
            } else if (!/^AV\d{2}$/.test(claveActividad)) {
                result.errors.push({
                    code: 'E014',
                    type: 'FORMATO',
                    message: `Clave de actividad inválida: "${claveActividad}". Formato esperado: AVXX (ej: AV01, AV11).`,
                    value: claveActividad,
                });
            }

            // ---------------------------------------------------------------
            // PASO 4: Validar namespace y schemaLocation
            // ---------------------------------------------------------------
            if (!xmlString.includes('xmlns=')) {
                result.warnings.push({
                    code: 'W001',
                    type: 'ESTRUCTURA',
                    message: 'No se encontró declaración de namespace (xmlns). El SAT requiere el namespace oficial de la UIF.',
                });
            }

            if (!xmlString.includes('xsi:schemaLocation')) {
                result.warnings.push({
                    code: 'W002',
                    type: 'ESTRUCTURA',
                    message: 'No se encontró schemaLocation. Se recomienda incluirlo para validación XSD.',
                });
            }

            // ---------------------------------------------------------------
            // PASO 5: Validar avisos individuales
            // ---------------------------------------------------------------
            const avisos = xmlString.match(/<aviso>[\s\S]*?<\/aviso>/g) || [];
            result.summary.avisoCount = avisos.length;

            avisos.forEach((aviso, index) => {
                const avisoNum = index + 1;
                const prefix = `Aviso #${avisoNum}`;

                // Fecha operación
                const fechaOp = extractSimpleTag(aviso, 'fecha_operacion');
                if (!fechaOp) {
                    result.errors.push({
                        code: 'E100',
                        type: 'CAMPO',
                        aviso: avisoNum,
                        message: `${prefix}: Falta la fecha de operación.`,
                    });
                } else if (!PATTERNS.FECHA_SAT.test(fechaOp)) {
                    result.errors.push({
                        code: 'E101',
                        type: 'FORMATO',
                        aviso: avisoNum,
                        message: `${prefix}: Fecha inválida "${fechaOp}". Formato requerido: AAAAMMDD (ej: 20260115).`,
                        value: fechaOp,
                    });
                } else {
                    // Validar fecha futura
                    const year = parseInt(fechaOp.substring(0, 4));
                    const month = parseInt(fechaOp.substring(4, 6));
                    const day = parseInt(fechaOp.substring(6, 8));
                    const fecha = new Date(year, month - 1, day);
                    const hoy = new Date();
                    hoy.setHours(0, 0, 0, 0);
                    if (fecha > hoy) {
                        result.errors.push({
                            code: 'E102',
                            type: 'NEGOCIO',
                            aviso: avisoNum,
                            message: `${prefix}: La fecha "${fechaOp}" es una fecha futura, lo cual no está permitido.`,
                            value: fechaOp,
                        });
                    }
                }

                // Monto
                const monto = extractSimpleTag(aviso, 'monto_operacion');
                if (!monto) {
                    result.errors.push({
                        code: 'E110',
                        type: 'CAMPO',
                        aviso: avisoNum,
                        message: `${prefix}: Falta el monto de operación.`,
                    });
                } else {
                    const montoNum = parseFloat(monto);
                    if (isNaN(montoNum)) {
                        result.errors.push({
                            code: 'E111',
                            type: 'FORMATO',
                            aviso: avisoNum,
                            message: `${prefix}: Monto inválido "${monto}". Debe ser un número con máximo 2 decimales.`,
                            value: monto,
                        });
                    } else if (montoNum < 0) {
                        result.errors.push({
                            code: 'E112',
                            type: 'NEGOCIO',
                            aviso: avisoNum,
                            message: `${prefix}: El monto no puede ser negativo.`,
                            value: monto,
                        });
                    } else if (montoNum === 0) {
                        result.warnings.push({
                            code: 'W100',
                            type: 'NEGOCIO',
                            aviso: avisoNum,
                            message: `${prefix}: El monto es cero. Verifique que sea correcto.`,
                        });
                    }
                }

                // Tipo operación
                const tipoOp = extractSimpleTag(aviso, 'tipo_operacion');
                if (!tipoOp) {
                    result.errors.push({
                        code: 'E120',
                        type: 'CAMPO',
                        aviso: avisoNum,
                        message: `${prefix}: Falta el tipo de operación.`,
                    });
                }

                // Persona operación
                if (!aviso.includes('<persona_operacion>')) {
                    result.errors.push({
                        code: 'E130',
                        type: 'ESTRUCTURA',
                        aviso: avisoNum,
                        message: `${prefix}: Falta el nodo "persona_operacion" (datos del cliente).`,
                    });
                } else {
                    const personaBlock = aviso.match(/<persona_operacion>[\s\S]*?<\/persona_operacion>/)?.[0] || '';

                    // RFC del cliente
                    const rfcCliente = extractSimpleTag(personaBlock, 'rfc');
                    if (!rfcCliente) {
                        result.errors.push({
                            code: 'E131',
                            type: 'CAMPO',
                            aviso: avisoNum,
                            message: `${prefix}: Falta el RFC del cliente.`,
                        });
                    } else if (!PATTERNS.RFC_PF.test(rfcCliente) && !PATTERNS.RFC_PM.test(rfcCliente)) {
                        result.errors.push({
                            code: 'E132',
                            type: 'FORMATO',
                            aviso: avisoNum,
                            message: `${prefix}: RFC del cliente inválido: "${rfcCliente}".`,
                            value: rfcCliente,
                        });
                    }

                    // Tipo persona
                    const tipoPersona = extractSimpleTag(personaBlock, 'tipo_persona');
                    if (!tipoPersona) {
                        result.warnings.push({
                            code: 'W110',
                            type: 'CAMPO',
                            aviso: avisoNum,
                            message: `${prefix}: Falta el tipo de persona (PF/PM).`,
                        });
                    }

                    // Nombre o razón social
                    const nombre = extractSimpleTag(personaBlock, 'nombre');
                    const razonSocCliente = extractSimpleTag(personaBlock, 'razon_social');
                    if (!nombre && !razonSocCliente) {
                        result.errors.push({
                            code: 'E133',
                            type: 'CAMPO',
                            aviso: avisoNum,
                            message: `${prefix}: Falta el nombre o razón social del cliente.`,
                        });
                    }
                }

                // Folio aviso
                const folio = extractSimpleTag(aviso, 'folio_aviso');
                if (!folio) {
                    result.warnings.push({
                        code: 'W120',
                        type: 'CAMPO',
                        aviso: avisoNum,
                        message: `${prefix}: Falta el folio de aviso.`,
                    });
                }
            });

            // ---------------------------------------------------------------
            // PASO 6: Resultado final
            // ---------------------------------------------------------------
            result.summary.totalErrors = result.errors.length;
            result.summary.totalWarnings = result.warnings.length;

            if (result.errors.length === 0) {
                if (result.warnings.length === 0) {
                    result.status = 'VALIDO';
                    result.isValid = true;
                } else {
                    result.status = 'VALIDO_CON_ADVERTENCIAS';
                    result.isValid = true;
                }
            } else {
                result.status = 'ERROR';
                result.isValid = false;
            }

            logger.log('XML validation complete:', {
                fileName,
                status: result.status,
                errors: result.errors.length,
                warnings: result.warnings.length,
                avisos: result.summary.avisoCount,
            });

            return { success: true, validation: result };

        } catch (error) {
            logger.error('Error validating XML:', error);
            throw new HttpsError('internal', 'Error al validar XML: ' + error.message);
        }
    }
);

// ============================================================================
// UTILIDADES DE EXTRACCIÓN
// ============================================================================

function extractSimpleTag(xml, tagName) {
    const regex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`);
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
}

function extractTag(xml, parentTag, childTag) {
    const parentRegex = new RegExp(`<${parentTag}>[\\s\\S]*?</${parentTag}>`);
    const parentMatch = xml.match(parentRegex);
    if (!parentMatch) return null;
    return extractSimpleTag(parentMatch[0], childTag);
}
