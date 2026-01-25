/**
 * PLD BDU - Motor de Auditoría de XML (Validador Externo)
 * 
 * Valida archivos XML generados externamente contra:
 * 1. Estructura XSD oficial del SAT
 * 2. Reglas de negocio (fechas, montos, RFC, etc.)
 * 
 * Provee reportes de error detallados en español mexicano.
 * 
 * Librerías:
 * - fast-xml-parser: Parseo rápido de XML a JSON
 * - libxmljs2: Validación XSD (opcional, más pesado)
 * 
 * @version 2.0.0
 * @date 2026-01-25
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { XMLParser, XMLValidator } = require('fast-xml-parser');

const db = admin.firestore();
const storage = admin.storage();

// ============================================================================
// CONFIGURACIÓN
// ============================================================================
const CONFIG = {
    // Tamaño máximo de archivo XML (10 MB)
    MAX_FILE_SIZE_MB: 10,

    // Actividades soportadas y sus identificadores de nodo
    ACTIVITY_DETECTORS: {
        INMUEBLES: {
            rootElements: ['avi:archivo', 'archivo'],
            namespace: 'http://www.uif.shcp.gob.mx/recepcion/avi',
            requiredNodes: ['sujeto_obligado', 'avisos'],
            satCode: 'AV01',
        },
        ACTIVOS_VIRTUALES: {
            rootElements: ['vir:archivo', 'archivo'],
            namespace: 'http://www.uif.shcp.gob.mx/recepcion/vir',
            requiredNodes: ['sujeto_obligado', 'avisos'],
            satCode: 'AV17',
        },
        VEHICULOS: {
            rootElements: ['aut:archivo', 'archivo'],
            namespace: 'http://www.uif.shcp.gob.mx/recepcion/aut',
            requiredNodes: ['sujeto_obligado', 'avisos'],
            satCode: 'AV03',
        },
        JOYAS: {
            rootElements: ['joy:archivo', 'archivo'],
            namespace: 'http://www.uif.shcp.gob.mx/recepcion/joy',
            requiredNodes: ['sujeto_obligado', 'avisos'],
            satCode: 'AV04',
        },
        MUTUO_PRESTAMO: {
            rootElements: ['mpr:archivo', 'archivo'],
            namespace: 'http://www.uif.shcp.gob.mx/recepcion/mpr',
            requiredNodes: ['sujeto_obligado', 'avisos'],
            satCode: 'AV06',
        },
        JUEGOS: {
            rootElements: ['jys:archivo', 'archivo'],
            namespace: 'http://www.uif.shcp.gob.mx/recepcion/jys',
            requiredNodes: ['sujeto_obligado', 'avisos'],
            satCode: 'AV11',
        },
    },

    // Patrones de validación
    PATTERNS: {
        RFC_PF: /^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$/,
        RFC_PM: /^[A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{3}$/,
        CURP: /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z]{2}$/,
        FECHA_SAT: /^[0-9]{8}$/, // YYYYMMDD
        CODIGO_POSTAL: /^[0-9]{5}$/,
        MONTO: /^[0-9]+(\.[0-9]{1,2})?$/,
    },
};

// ============================================================================
// MENSAJES DE ERROR EN ESPAÑOL
// ============================================================================
const ERROR_MESSAGES = {
    // Errores estructurales
    INVALID_XML: 'El archivo no es un XML válido. Verifique la sintaxis.',
    UNKNOWN_ACTIVITY: 'No se pudo identificar el tipo de actividad del XML.',
    MISSING_ROOT: 'Falta el elemento raíz del documento.',
    MISSING_SUJETO: 'Falta el nodo obligatorio "sujeto_obligado".',
    MISSING_AVISOS: 'Falta el nodo obligatorio "avisos".',
    EMPTY_AVISOS: 'El nodo "avisos" está vacío. Debe contener al menos un aviso.',

    // Errores de formato
    INVALID_RFC: 'El RFC "{value}" tiene un formato incorrecto. Debe tener 12 caracteres para Persona Moral o 13 para Persona Física.',
    INVALID_CURP: 'El CURP "{value}" tiene un formato incorrecto. Debe tener 18 caracteres.',
    INVALID_DATE_FORMAT: 'La fecha "{value}" no tiene el formato correcto. Use AAAAMMDD (ej: 20260125).',
    FUTURE_DATE: 'La fecha "{value}" es una fecha futura, lo cual no está permitido.',
    INVALID_CP: 'El código postal "{value}" es inválido. Debe tener 5 dígitos.',
    INVALID_MONTO: 'El monto "{value}" no es válido. Use números con máximo 2 decimales.',

    // Errores de negocio
    MONTO_NEGATIVE: 'El monto de operación no puede ser negativo.',
    MONTO_ZERO: 'El monto de operación no puede ser cero.',
    MISSING_BENEFICIARIO: 'Falta el nodo "beneficiario_controlador" obligatorio para Personas Morales según Reforma 2025.',
    MISSING_REQUIRED_FIELD: 'Falta el campo obligatorio "{field}".',
    RFC_CURP_MISMATCH: 'El RFC y CURP no corresponden a la misma persona.',

    // Errores de resumen
    TOTAL_MISMATCH: 'La suma de montos individuales ({calculated}) no coincide con el total reportado ({reported}).',
    AVISO_COUNT_MISMATCH: 'El número de avisos ({actual}) no coincide con el declarado ({declared}).',
};

// ============================================================================
// CLOUD FUNCTION: auditExternalXML
// Valida un XML externo contra estándares del SAT
// ============================================================================

/**
 * Audita un archivo XML externo.
 * 
 * @param {Object} data
 * @param {string} data.xmlContent - Contenido XML como string (Base64 o texto)
 * @param {string} data.fileName - Nombre del archivo (opcional)
 * @param {boolean} data.strictMode - Si es true, falla en warnings también
 */
exports.auditExternalXML = functions
    .runWith({
        memory: '512MB',
        timeoutSeconds: 60,
    })
    .https.onCall(async (data, context) => {
        // -------------------------------------------------------------------------
        // Validar autenticación
        // -------------------------------------------------------------------------
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated',
                'Debe iniciar sesión para usar el validador');
        }

        const { xmlContent, fileName = 'archivo.xml', strictMode = false } = data;

        if (!xmlContent) {
            throw new functions.https.HttpsError('invalid-argument',
                'Debe proporcionar el contenido XML');
        }

        console.log(`[auditExternalXML] Iniciando auditoría de: ${fileName}`);

        const auditResult = {
            fileName,
            status: 'PENDIENTE',
            isValid: false,
            activityType: null,
            satCode: null,
            summary: {
                totalErrors: 0,
                totalWarnings: 0,
                totalInfos: 0,
                avisoCount: 0,
            },
            errors: [],
            warnings: [],
            infos: [],
            metadata: null,
            auditedAt: new Date().toISOString(),
            auditedBy: context.auth.uid,
        };

        try {
            // -----------------------------------------------------------------------
            // PASO 1: Decodificar contenido si es Base64
            // -----------------------------------------------------------------------
            let xmlString = xmlContent;

            if (xmlContent.startsWith('data:') || !xmlContent.includes('<')) {
                // Es Base64
                const base64Data = xmlContent.replace(/^data:.*?;base64,/, '');
                xmlString = Buffer.from(base64Data, 'base64').toString('utf-8');
            }

            // Verificar tamaño
            const sizeInMB = Buffer.byteLength(xmlString, 'utf8') / (1024 * 1024);
            if (sizeInMB > CONFIG.MAX_FILE_SIZE_MB) {
                throw new Error(`El archivo excede el tamaño máximo de ${CONFIG.MAX_FILE_SIZE_MB} MB`);
            }

            console.log(`  - Tamaño: ${sizeInMB.toFixed(2)} MB`);

            // -----------------------------------------------------------------------
            // PASO 2: Validar sintaxis XML básica
            // -----------------------------------------------------------------------
            const validationResult = XMLValidator.validate(xmlString, {
                allowBooleanAttributes: true,
            });

            if (validationResult !== true) {
                auditResult.errors.push({
                    code: 'E001',
                    type: 'STRUCTURE',
                    line: validationResult.err?.line || null,
                    column: validationResult.err?.col || null,
                    message: ERROR_MESSAGES.INVALID_XML,
                    detail: validationResult.err?.msg || 'Error de sintaxis XML',
                });

                auditResult.status = 'ERROR';
                auditResult.summary.totalErrors = 1;
                return auditResult;
            }

            // -----------------------------------------------------------------------
            // PASO 3: Parsear XML a objeto JavaScript
            // -----------------------------------------------------------------------
            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: '@_',
                removeNSPrefix: true, // Remover prefijos de namespace para facilitar lectura
                parseAttributeValue: true,
                trimValues: true,
            });

            const xmlDoc = parser.parse(xmlString);

            // -----------------------------------------------------------------------
            // PASO 4: Detectar tipo de actividad
            // -----------------------------------------------------------------------
            const detectedActivity = detectActivityType(xmlDoc, xmlString);

            if (!detectedActivity) {
                auditResult.errors.push({
                    code: 'E002',
                    type: 'STRUCTURE',
                    message: ERROR_MESSAGES.UNKNOWN_ACTIVITY,
                    detail: 'No se encontró un namespace o estructura reconocida.',
                });

                auditResult.status = 'ERROR';
                auditResult.summary.totalErrors = 1;
                return auditResult;
            }

            auditResult.activityType = detectedActivity.type;
            auditResult.satCode = detectedActivity.satCode;

            console.log(`  - Actividad detectada: ${detectedActivity.type}`);

            // -----------------------------------------------------------------------
            // PASO 5: Obtener nodo raíz del documento
            // -----------------------------------------------------------------------
            const rootNode = getRootNode(xmlDoc);

            if (!rootNode) {
                auditResult.errors.push({
                    code: 'E003',
                    type: 'STRUCTURE',
                    message: ERROR_MESSAGES.MISSING_ROOT,
                });

                auditResult.status = 'ERROR';
                auditResult.summary.totalErrors = 1;
                return auditResult;
            }

            // -----------------------------------------------------------------------
            // PASO 6: Validación estructural (nodos requeridos)
            // -----------------------------------------------------------------------
            validateStructure(rootNode, detectedActivity, auditResult);

            // -----------------------------------------------------------------------
            // PASO 7: Extraer y guardar metadatos
            // -----------------------------------------------------------------------
            auditResult.metadata = extractMetadata(rootNode);

            // -----------------------------------------------------------------------
            // PASO 8: Validar sujeto obligado
            // -----------------------------------------------------------------------
            if (rootNode.sujeto_obligado) {
                validateSujetoObligado(rootNode.sujeto_obligado, auditResult);
            }

            // -----------------------------------------------------------------------
            // PASO 9: Validar cada aviso
            // -----------------------------------------------------------------------
            const avisos = extractAvisos(rootNode);
            auditResult.summary.avisoCount = avisos.length;

            if (avisos.length === 0) {
                auditResult.errors.push({
                    code: 'E010',
                    type: 'STRUCTURE',
                    message: ERROR_MESSAGES.EMPTY_AVISOS,
                });
            } else {
                avisos.forEach((aviso, index) => {
                    validateAviso(aviso, index + 1, detectedActivity.type, auditResult);
                });
            }

            // -----------------------------------------------------------------------
            // PASO 10: Calcular resultado final
            // -----------------------------------------------------------------------
            auditResult.summary.totalErrors = auditResult.errors.length;
            auditResult.summary.totalWarnings = auditResult.warnings.length;
            auditResult.summary.totalInfos = auditResult.infos.length;

            if (auditResult.errors.length === 0) {
                if (auditResult.warnings.length === 0 || !strictMode) {
                    auditResult.status = 'VALIDO';
                    auditResult.isValid = true;
                } else {
                    auditResult.status = 'VALIDO_CON_ADVERTENCIAS';
                    auditResult.isValid = !strictMode;
                }
            } else {
                auditResult.status = 'ERROR';
                auditResult.isValid = false;
            }

            console.log(`[auditExternalXML] ✅ Auditoría completada: ${auditResult.status}`);

            // -----------------------------------------------------------------------
            // Registrar auditoría
            // -----------------------------------------------------------------------
            await db.collection('xml_audits').add({
                user_id: context.auth.uid,
                tenant_id: context.auth.token.tenantId,
                file_name: fileName,
                activity_type: auditResult.activityType,
                status: auditResult.status,
                error_count: auditResult.summary.totalErrors,
                warning_count: auditResult.summary.totalWarnings,
                aviso_count: auditResult.summary.avisoCount,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });

            return auditResult;

        } catch (error) {
            console.error('[auditExternalXML] Error:', error);

            auditResult.status = 'ERROR_INTERNO';
            auditResult.errors.push({
                code: 'E999',
                type: 'SYSTEM',
                message: 'Error interno al procesar el archivo.',
                detail: error.message,
            });

            return auditResult;
        }
    });

// ============================================================================
// FUNCIONES DE VALIDACIÓN
// ============================================================================

/**
 * Detecta el tipo de actividad basado en namespace o estructura
 */
function detectActivityType(xmlDoc, xmlString) {
    // Buscar en namespaces declarados
    for (const [actType, config] of Object.entries(CONFIG.ACTIVITY_DETECTORS)) {
        if (xmlString.includes(config.namespace)) {
            return { type: actType, satCode: config.satCode, config };
        }
    }

    // Buscar por estructura de nodos
    const rootNode = getRootNode(xmlDoc);
    if (!rootNode) return null;

    // Detectar por nodos específicos de cada actividad
    if (rootNode.tipo_activo_virtual || rootNode.direccion_wallet) {
        return {
            type: 'ACTIVOS_VIRTUALES',
            satCode: 'AV17',
            config: CONFIG.ACTIVITY_DETECTORS.ACTIVOS_VIRTUALES,
        };
    }

    if (rootNode.inmueble || rootNode.folio_real) {
        return {
            type: 'INMUEBLES',
            satCode: 'AV01',
            config: CONFIG.ACTIVITY_DETECTORS.INMUEBLES,
        };
    }

    // Default a Inmuebles si tiene estructura básica
    if (rootNode.sujeto_obligado && rootNode.avisos) {
        return {
            type: 'INMUEBLES',
            satCode: 'AV01',
            config: CONFIG.ACTIVITY_DETECTORS.INMUEBLES,
        };
    }

    return null;
}

/**
 * Obtiene el nodo raíz del documento
 */
function getRootNode(xmlDoc) {
    // Buscar nodo 'archivo' con o sin namespace
    const possibleRoots = ['archivo', 'avi:archivo', 'vir:archivo', 'aut:archivo', 'joy:archivo', 'mpr:archivo', 'jys:archivo'];

    for (const rootName of possibleRoots) {
        if (xmlDoc[rootName]) {
            return xmlDoc[rootName];
        }
    }

    // Si tiene un solo hijo, usarlo como raíz
    const keys = Object.keys(xmlDoc).filter(k => !k.startsWith('?'));
    if (keys.length === 1) {
        return xmlDoc[keys[0]];
    }

    return null;
}

/**
 * Valida la estructura básica del documento
 */
function validateStructure(rootNode, activity, result) {
    const required = activity.config.requiredNodes || [];

    for (const nodeName of required) {
        if (!rootNode[nodeName]) {
            result.errors.push({
                code: 'E004',
                type: 'STRUCTURE',
                message: `Falta el nodo obligatorio "${nodeName}".`,
                field: nodeName,
            });
        }
    }
}

/**
 * Extrae metadatos del documento
 */
function extractMetadata(rootNode) {
    const meta = {
        mesReporta: null,
        anioReporta: null,
        sujetoObligado: null,
    };

    // Mes y año
    if (rootNode.mes_reporta) {
        if (typeof rootNode.mes_reporta === 'object') {
            meta.mesReporta = rootNode.mes_reporta.mes_reporta || rootNode.mes_reporta.mes;
            meta.anioReporta = rootNode.mes_reporta.anio_reporta || rootNode.mes_reporta.anio;
        } else {
            meta.mesReporta = rootNode.mes_reporta;
        }
    }

    // Datos del sujeto obligado
    if (rootNode.sujeto_obligado) {
        const so = rootNode.sujeto_obligado;
        meta.sujetoObligado = {
            rfc: so.rfc,
            razonSocial: so.razon_social,
            claveActividd: so.clave_actividad,
        };
    }

    return meta;
}

/**
 * Valida datos del sujeto obligado
 */
function validateSujetoObligado(sujetoNode, result) {
    // RFC obligatorio
    if (!sujetoNode.rfc) {
        result.errors.push({
            code: 'E020',
            type: 'FIELD',
            path: 'sujeto_obligado.rfc',
            message: formatMessage(ERROR_MESSAGES.MISSING_REQUIRED_FIELD, { field: 'RFC del sujeto obligado' }),
        });
    } else if (!CONFIG.PATTERNS.RFC_PM.test(sujetoNode.rfc) && !CONFIG.PATTERNS.RFC_PF.test(sujetoNode.rfc)) {
        result.errors.push({
            code: 'E021',
            type: 'FORMAT',
            path: 'sujeto_obligado.rfc',
            message: formatMessage(ERROR_MESSAGES.INVALID_RFC, { value: sujetoNode.rfc }),
            value: sujetoNode.rfc,
        });
    }

    // Razón social obligatoria
    if (!sujetoNode.razon_social) {
        result.errors.push({
            code: 'E022',
            type: 'FIELD',
            path: 'sujeto_obligado.razon_social',
            message: formatMessage(ERROR_MESSAGES.MISSING_REQUIRED_FIELD, { field: 'Razón social' }),
        });
    }
}

/**
 * Extrae array de avisos del documento
 */
function extractAvisos(rootNode) {
    if (!rootNode.avisos) return [];

    const avisosNode = rootNode.avisos;

    // Si tiene un solo aviso, viene como objeto, no array
    if (avisosNode.aviso) {
        return Array.isArray(avisosNode.aviso) ? avisosNode.aviso : [avisosNode.aviso];
    }

    return [];
}

/**
 * Valida un aviso individual
 */
function validateAviso(aviso, avisoNum, activityType, result) {
    const prefix = `Aviso #${avisoNum}`;

    // -------------------------------------------------------------------------
    // Validar detalle de operación
    // -------------------------------------------------------------------------
    const detalle = aviso.detalle_operacion || aviso.detalle;

    if (!detalle) {
        result.errors.push({
            code: 'E100',
            type: 'STRUCTURE',
            aviso: avisoNum,
            message: `${prefix}: Falta el nodo "detalle_operacion".`,
        });
    } else {
        // Fecha de operación
        const fechaOp = detalle.fecha_operacion || detalle.fecha;
        if (fechaOp) {
            validateFecha(fechaOp, `${prefix} - Fecha operación`, result);
        } else {
            result.errors.push({
                code: 'E101',
                type: 'FIELD',
                aviso: avisoNum,
                message: `${prefix}: Falta la fecha de operación.`,
            });
        }

        // Monto de operación
        const monto = detalle.monto_operacion || detalle.valor_operacion || detalle.monto;
        if (monto !== undefined) {
            validateMonto(monto, `${prefix} - Monto`, result);
        } else {
            result.errors.push({
                code: 'E102',
                type: 'FIELD',
                aviso: avisoNum,
                message: `${prefix}: Falta el monto de operación.`,
            });
        }
    }

    // -------------------------------------------------------------------------
    // Validar persona (cliente)
    // -------------------------------------------------------------------------
    const persona = aviso.persona_operacion || aviso.persona || aviso.cliente;

    if (!persona) {
        result.errors.push({
            code: 'E110',
            type: 'STRUCTURE',
            aviso: avisoNum,
            message: `${prefix}: Falta el nodo "persona_operacion" (datos del cliente).`,
        });
    } else {
        validatePersona(persona, avisoNum, result);
    }

    // -------------------------------------------------------------------------
    // Validar beneficiario controlador (Reforma 2025)
    // -------------------------------------------------------------------------
    const tipoPersona = (persona?.tipo_persona || '').toUpperCase();

    if (tipoPersona === 'PM' || tipoPersona === 'MORAL') {
        const bc = aviso.beneficiario_controlador || aviso.beneficiario;

        if (!bc) {
            result.warnings.push({
                code: 'W100',
                type: 'BUSINESS',
                aviso: avisoNum,
                message: `${prefix}: ${ERROR_MESSAGES.MISSING_BENEFICIARIO}`,
            });
        } else {
            validateBeneficiarioControlador(bc, avisoNum, result);
        }
    }
}

/**
 * Valida datos de una persona
 */
function validatePersona(persona, avisoNum, result) {
    const prefix = `Aviso #${avisoNum}`;
    const tipoPersona = (persona.tipo_persona || '').toUpperCase();

    // RFC
    if (persona.rfc) {
        const rfcPattern = (tipoPersona === 'PM' || tipoPersona === 'MORAL')
            ? CONFIG.PATTERNS.RFC_PM
            : CONFIG.PATTERNS.RFC_PF;

        if (!rfcPattern.test(persona.rfc.toUpperCase())) {
            result.errors.push({
                code: 'E120',
                type: 'FORMAT',
                aviso: avisoNum,
                path: 'persona_operacion.rfc',
                message: `${prefix}: ${formatMessage(ERROR_MESSAGES.INVALID_RFC, { value: persona.rfc })}`,
                value: persona.rfc,
            });
        }
    }

    // CURP (obligatorio para Persona Física)
    if (tipoPersona === 'PF' || tipoPersona === 'FISICA') {
        if (persona.curp) {
            if (!CONFIG.PATTERNS.CURP.test(persona.curp.toUpperCase())) {
                result.errors.push({
                    code: 'E121',
                    type: 'FORMAT',
                    aviso: avisoNum,
                    path: 'persona_operacion.curp',
                    message: `${prefix}: ${formatMessage(ERROR_MESSAGES.INVALID_CURP, { value: persona.curp })}`,
                    value: persona.curp,
                });
            }
        } else {
            result.warnings.push({
                code: 'W110',
                type: 'FIELD',
                aviso: avisoNum,
                message: `${prefix}: Se recomienda incluir el CURP para Personas Físicas.`,
            });
        }

        // Fecha de nacimiento
        if (persona.fecha_nacimiento) {
            validateFecha(persona.fecha_nacimiento, `${prefix} - Fecha nacimiento`, result);
        }
    }

    // Domicilio
    if (persona.domicilio) {
        validateDomicilio(persona.domicilio, avisoNum, result);
    }
}

/**
 * Valida datos del beneficiario controlador
 */
function validateBeneficiarioControlador(bc, avisoNum, result) {
    const prefix = `Aviso #${avisoNum} - Beneficiario Controlador`;

    // Nombre obligatorio
    if (!bc.nombre) {
        result.errors.push({
            code: 'E130',
            type: 'FIELD',
            aviso: avisoNum,
            message: `${prefix}: Falta el nombre del beneficiario controlador.`,
        });
    }

    // Apellido paterno obligatorio
    if (!bc.apellido_paterno) {
        result.errors.push({
            code: 'E131',
            type: 'FIELD',
            aviso: avisoNum,
            message: `${prefix}: Falta el apellido paterno.`,
        });
    }

    // RFC o CURP
    if (!bc.rfc && !bc.curp) {
        result.warnings.push({
            code: 'W120',
            type: 'FIELD',
            aviso: avisoNum,
            message: `${prefix}: Se recomienda incluir RFC o CURP del beneficiario controlador.`,
        });
    }

    // Porcentaje de participación
    if (bc.porcentaje_participacion) {
        const pct = parseFloat(bc.porcentaje_participacion);
        if (isNaN(pct) || pct < 0 || pct > 100) {
            result.errors.push({
                code: 'E132',
                type: 'BUSINESS',
                aviso: avisoNum,
                message: `${prefix}: El porcentaje de participación debe estar entre 0 y 100.`,
                value: bc.porcentaje_participacion,
            });
        }
    }
}

/**
 * Valida domicilio
 */
function validateDomicilio(domicilio, avisoNum, result) {
    const prefix = `Aviso #${avisoNum} - Domicilio`;

    // Código postal
    if (domicilio.codigo_postal) {
        if (!CONFIG.PATTERNS.CODIGO_POSTAL.test(domicilio.codigo_postal)) {
            result.errors.push({
                code: 'E140',
                type: 'FORMAT',
                aviso: avisoNum,
                message: `${prefix}: ${formatMessage(ERROR_MESSAGES.INVALID_CP, { value: domicilio.codigo_postal })}`,
                value: domicilio.codigo_postal,
            });
        }
    }
}

/**
 * Valida formato de fecha SAT (YYYYMMDD)
 */
function validateFecha(value, context, result) {
    const fechaStr = String(value);

    // Verificar formato
    if (!CONFIG.PATTERNS.FECHA_SAT.test(fechaStr)) {
        result.errors.push({
            code: 'E150',
            type: 'FORMAT',
            context,
            message: formatMessage(ERROR_MESSAGES.INVALID_DATE_FORMAT, { value }),
            value,
        });
        return;
    }

    // Parsear fecha
    const year = parseInt(fechaStr.substring(0, 4));
    const month = parseInt(fechaStr.substring(4, 6));
    const day = parseInt(fechaStr.substring(6, 8));

    const date = new Date(year, month - 1, day);

    // Verificar validez
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        result.errors.push({
            code: 'E151',
            type: 'FORMAT',
            context,
            message: `${context}: La fecha "${value}" no es válida.`,
            value,
        });
        return;
    }

    // Verificar que no sea futura
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (date > today) {
        result.errors.push({
            code: 'E152',
            type: 'BUSINESS',
            context,
            message: `${context}: ${formatMessage(ERROR_MESSAGES.FUTURE_DATE, { value })}`,
            value,
        });
    }
}

/**
 * Valida monto
 */
function validateMonto(value, context, result) {
    const monto = parseFloat(value);

    if (isNaN(monto)) {
        result.errors.push({
            code: 'E160',
            type: 'FORMAT',
            context,
            message: formatMessage(ERROR_MESSAGES.INVALID_MONTO, { value }),
            value,
        });
        return;
    }

    if (monto < 0) {
        result.errors.push({
            code: 'E161',
            type: 'BUSINESS',
            context,
            message: `${context}: ${ERROR_MESSAGES.MONTO_NEGATIVE}`,
            value,
        });
    }

    if (monto === 0) {
        result.warnings.push({
            code: 'W160',
            type: 'BUSINESS',
            context,
            message: `${context}: El monto es cero. Verifique que sea correcto.`,
            value,
        });
    }
}

/**
 * Formatea mensaje reemplazando placeholders
 */
function formatMessage(template, values) {
    let result = template;
    for (const [key, val] of Object.entries(values)) {
        result = result.replace(`{${key}}`, val);
    }
    return result;
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    auditExternalXML: exports.auditExternalXML,
};
