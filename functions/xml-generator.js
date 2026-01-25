/**
 * PLD BDU - Motor de Generación XML (XML Builder)
 * 
 * Convierte registros JSON de Firestore en archivos XML válidos
 * según los esquemas XSD oficiales del SAT.
 * 
 * Características:
 * - Mapeo dinámico según tipo de actividad
 * - Namespaces y schemaLocation correctos
 * - Formateo de datos (fechas, montos, caracteres especiales)
 * - Generación batch o individual
 * 
 * Librería: xmlbuilder2 (https://oozcitak.github.io/xmlbuilder2/)
 * 
 * @version 2.0.0
 * @date 2026-01-25
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { create } = require('xmlbuilder2');

const db = admin.firestore();
const storage = admin.storage();
const { checkQuotaAvailability, consumeQuota } = require('./quota-gatekeeper');

// ============================================================================
// CONFIGURACIÓN DE SCHEMAS XSD POR ACTIVIDAD
// ============================================================================
const XML_SCHEMAS = {
    INMUEBLES: {
        namespace: 'http://www.uif.shcp.gob.mx/recepcion/avi',
        schemaLocation: 'http://www.uif.shcp.gob.mx/recepcion/avi AVI.xsd',
        rootElement: 'archivo',
        prefix: 'avi',
        sat_code: 'AV01',
    },

    ACTIVOS_VIRTUALES: {
        namespace: 'http://www.uif.shcp.gob.mx/recepcion/vir',
        schemaLocation: 'http://www.uif.shcp.gob.mx/recepcion/vir VIR.xsd',
        rootElement: 'archivo',
        prefix: 'vir',
        sat_code: 'AV17',
    },

    VEHICULOS: {
        namespace: 'http://www.uif.shcp.gob.mx/recepcion/aut',
        schemaLocation: 'http://www.uif.shcp.gob.mx/recepcion/aut AUT.xsd',
        rootElement: 'archivo',
        prefix: 'aut',
        sat_code: 'AV03',
    },

    JOYAS: {
        namespace: 'http://www.uif.shcp.gob.mx/recepcion/joy',
        schemaLocation: 'http://www.uif.shcp.gob.mx/recepcion/joy JOY.xsd',
        rootElement: 'archivo',
        prefix: 'joy',
        sat_code: 'AV04',
    },

    MUTUO_PRESTAMO: {
        namespace: 'http://www.uif.shcp.gob.mx/recepcion/mpr',
        schemaLocation: 'http://www.uif.shcp.gob.mx/recepcion/mpr MPR.xsd',
        rootElement: 'archivo',
        prefix: 'mpr',
        sat_code: 'AV06',
    },

    JUEGOS: {
        namespace: 'http://www.uif.shcp.gob.mx/recepcion/jys',
        schemaLocation: 'http://www.uif.shcp.gob.mx/recepcion/jys JYS.xsd',
        rootElement: 'archivo',
        prefix: 'jys',
        sat_code: 'AV11',
    },
};

// ============================================================================
// CLOUD FUNCTION: generateXMLBatch
// Genera XML para un lote de registros
// ============================================================================

/**
 * Genera archivo XML para un conjunto de registros.
 * 
 * @param {Object} data
 * @param {string} data.tenantId - ID del tenant
 * @param {string} data.workspaceId - ID del workspace
 * @param {string[]} data.recordIds - Array de IDs de registros a incluir
 * @param {string} data.periodoInicio - Fecha inicio (YYYY-MM-DD)
 * @param {string} data.periodoFin - Fecha fin (YYYY-MM-DD)
 */
exports.generateXMLBatch = functions
    .runWith({
        memory: '1GB',
        timeoutSeconds: 300,
    })
    .https.onCall(async (data, context) => {
        // -------------------------------------------------------------------------
        // Validar autenticación
        // -------------------------------------------------------------------------
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
        }

        const callerRole = context.auth.token.role;
        const callerTenantId = context.auth.token.tenantId;

        // Solo COMPANY_ADMIN, COMPLIANCE_OFFICER o SUPER_ADMIN pueden generar XMLs
        if (!['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPLIANCE_OFFICER'].includes(callerRole)) {
            throw new functions.https.HttpsError('permission-denied',
                'No tienes permisos para generar archivos XML');
        }

        const { tenantId, workspaceId, recordIds, periodoInicio, periodoFin } = data;

        // Validar que el usuario pertenece al tenant
        if (callerRole !== 'SUPER_ADMIN' && callerTenantId !== tenantId) {
            throw new functions.https.HttpsError('permission-denied',
                'No puedes generar XMLs de otra empresa');
        }

        console.log(`[generateXMLBatch] Iniciando generación`);
        console.log(`  - Tenant: ${tenantId}`);
        console.log(`  - Workspace: ${workspaceId}`);
        console.log(`  - Registros: ${recordIds?.length || 'todos'}`);

        try {
            // -----------------------------------------------------------------------
            // Obtener datos del workspace y tenant
            // -----------------------------------------------------------------------
            const [tenantDoc, workspaceDoc] = await Promise.all([
                db.collection('tenants').doc(tenantId).get(),
                db.collection('tenants').doc(tenantId)
                    .collection('workspaces').doc(workspaceId).get(),
            ]);

            if (!tenantDoc.exists || !workspaceDoc.exists) {
                throw new functions.https.HttpsError('not-found',
                    'Empresa o espacio de trabajo no encontrado');
            }

            const tenantData = tenantDoc.data();
            const workspaceData = workspaceDoc.data();
            const activityType = workspaceData.activity_type;

            const schema = XML_SCHEMAS[activityType];
            if (!schema) {
                throw new functions.https.HttpsError('invalid-argument',
                    `Tipo de actividad no soportado: ${activityType}`);
            }

            // -----------------------------------------------------------------------
            // Obtener registros
            // -----------------------------------------------------------------------
            let recordsQuery = db
                .collection('tenants').doc(tenantId)
                .collection('workspaces').doc(workspaceId)
                .collection('records')
                .where('status', 'in', ['approved', 'pending_review'])
                .where('xml_status', '!=', 'generated');

            // Filtrar por IDs específicos si se proporcionan
            if (recordIds && recordIds.length > 0) {
                // Firestore no permite where + whereIn con arrays grandes
                // Obtener uno por uno
                const recordDocs = await Promise.all(
                    recordIds.map(id =>
                        db.collection('tenants').doc(tenantId)
                            .collection('workspaces').doc(workspaceId)
                            .collection('records').doc(id).get()
                    )
                );

                var records = recordDocs
                    .filter(doc => doc.exists)
                    .map(doc => ({ id: doc.id, ...doc.data() }));
            } else {
                const snapshot = await recordsQuery.limit(500).get();
                var records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }

            if (records.length === 0) {
                throw new functions.https.HttpsError('not-found',
                    'No hay registros válidos para generar XML');
            }

            console.log(`  - Registros a procesar: ${records.length}`);

            // -----------------------------------------------------------------------
            // VERIFICAR CUOTA DE XMLs
            // -----------------------------------------------------------------------
            const quotaCheck = await checkQuotaAvailability(tenantId, 'GENERATE_XML', 1);

            if (!quotaCheck.allowed) {
                throw new functions.https.HttpsError('resource-exhausted', quotaCheck.message);
            }

            // -----------------------------------------------------------------------
            // Construir XML
            // -----------------------------------------------------------------------
            const xmlContent = buildXML(activityType, schema, tenantData, workspaceData, records, {
                periodoInicio,
                periodoFin,
                generatedBy: context.auth.uid,
            });

            // -----------------------------------------------------------------------
            // Guardar XML en Storage
            // -----------------------------------------------------------------------
            const fileName = generateFileName(tenantData, activityType, periodoInicio, periodoFin);
            const filePath = `exports/${tenantId}/${workspaceId}/${fileName}`;

            const bucket = storage.bucket();
            const file = bucket.file(filePath);

            await file.save(xmlContent, {
                contentType: 'application/xml',
                metadata: {
                    tenantId,
                    workspaceId,
                    activityType,
                    recordCount: records.length,
                    generatedAt: new Date().toISOString(),
                    generatedBy: context.auth.uid,
                },
            });

            // Generar URL firmada para descarga (válida 1 hora)
            const [downloadUrl] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 3600 * 1000,
            });

            console.log(`  - XML guardado: ${filePath}`);

            // -----------------------------------------------------------------------
            // Actualizar registros como "generados"
            // -----------------------------------------------------------------------
            const batch = db.batch();

            for (const record of records) {
                const recordRef = db
                    .collection('tenants').doc(tenantId)
                    .collection('workspaces').doc(workspaceId)
                    .collection('records').doc(record.id);

                batch.update(recordRef, {
                    xml_status: 'generated',
                    xml_generated_at: admin.firestore.FieldValue.serverTimestamp(),
                    xml_file_path: filePath,
                    xml_generated_by: context.auth.uid,
                });
            }

            await batch.commit();

            // -----------------------------------------------------------------------
            // Registrar generación en historial
            // -----------------------------------------------------------------------
            await db.collection('tenants').doc(tenantId).collection('xml_generations').add({
                workspace_id: workspaceId,
                activity_type: activityType,
                file_path: filePath,
                file_name: fileName,
                record_count: records.length,
                record_ids: records.map(r => r.id),
                periodo_inicio: periodoInicio,
                periodo_fin: periodoFin,
                generated_by: context.auth.uid,
                generated_at: admin.firestore.FieldValue.serverTimestamp(),
                download_url: downloadUrl,
            });

            // -----------------------------------------------------------------------
            // CONSUMIR CUOTA
            // -----------------------------------------------------------------------
            await consumeQuota(tenantId, 'GENERATE_XML', 1);

            console.log(`[generateXMLBatch] ✅ Completado`);

            return {
                success: true,
                message: `Archivo XML generado exitosamente con ${records.length} registros`,
                file: {
                    name: fileName,
                    path: filePath,
                    downloadUrl,
                    recordCount: records.length,
                },
            };

        } catch (error) {
            console.error('[generateXMLBatch] Error:', error);
            throw new functions.https.HttpsError('internal', error.message);
        }
    });

// ============================================================================
// FUNCIÓN: buildXML
// Construye el documento XML completo
// ============================================================================

function buildXML(activityType, schema, tenantData, workspaceData, records, options) {
    // Crear documento con namespaces
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
        .ele(schema.rootElement, {
            'xmlns': schema.namespace,
            'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
            'xsi:schemaLocation': `${schema.namespace} ${schema.schemaLocation}`,
        });

    // -------------------------------------------------------------------------
    // ENCABEZADO: Datos del mes/periodo
    // -------------------------------------------------------------------------
    const mesDoc = doc.ele('mes_reporta');
    mesDoc.ele('mes_reporta').txt(extractMonth(options.periodoInicio));
    mesDoc.ele('anio_reporta').txt(extractYear(options.periodoInicio));

    // -------------------------------------------------------------------------
    // SUJETO OBLIGADO: Datos de la empresa que reporta
    // -------------------------------------------------------------------------
    const sujetoDoc = doc.ele('sujeto_obligado');

    sujetoDoc.ele('clave_sujeto_obligado').txt(sanitizeText(tenantData.clave_sujeto_obligado || ''));
    sujetoDoc.ele('clave_actividad').txt(schema.sat_code);
    sujetoDoc.ele('rfc').txt(sanitizeRFC(tenantData.rfc));
    sujetoDoc.ele('razon_social').txt(sanitizeText(tenantData.razon_social, 150));

    // Domicilio del sujeto obligado
    const domDoc = sujetoDoc.ele('domicilio');
    domDoc.ele('calle').txt(sanitizeText(tenantData.domicilio?.calle || '', 80));
    domDoc.ele('numero_exterior').txt(sanitizeText(tenantData.domicilio?.numero_exterior || '', 10));
    if (tenantData.domicilio?.numero_interior) {
        domDoc.ele('numero_interior').txt(sanitizeText(tenantData.domicilio.numero_interior, 10));
    }
    domDoc.ele('colonia').txt(sanitizeText(tenantData.domicilio?.colonia || '', 80));
    domDoc.ele('codigo_postal').txt(formatCP(tenantData.domicilio?.codigo_postal));

    // -------------------------------------------------------------------------
    // AVISOS: Iterar sobre cada registro
    // -------------------------------------------------------------------------
    const avisosDoc = doc.ele('avisos');

    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const avisoDoc = avisosDoc.ele('aviso');

        // Número consecutivo
        avisoDoc.ele('folio_aviso').txt(String(i + 1).padStart(6, '0'));

        // Generar aviso según tipo de actividad
        switch (activityType) {
            case 'ACTIVOS_VIRTUALES':
                buildAvisoActivosVirtuales(avisoDoc, record);
                break;
            case 'INMUEBLES':
                buildAvisoInmuebles(avisoDoc, record);
                break;
            case 'MUTUO_PRESTAMO':
                buildAvisoMutuo(avisoDoc, record);
                break;
            default:
                buildAvisoGenerico(avisoDoc, record);
        }
    }

    // Convertir a string XML con formato
    return doc.end({ prettyPrint: true, indent: '  ' });
}

// ============================================================================
// GENERADORES ESPECÍFICOS POR ACTIVIDAD
// ============================================================================

/**
 * Genera nodo de aviso para Activos Virtuales
 */
function buildAvisoActivosVirtuales(avisoDoc, record) {
    const client = record.client_data || {};
    const op = record.operation_details || {};
    const bc = record.beneficiario_controlador || {};

    // -------------------------------------------------------------------------
    // Datos de la operación
    // -------------------------------------------------------------------------
    const opDoc = avisoDoc.ele('detalle_operacion');

    opDoc.ele('fecha_operacion').txt(formatDate(op.fecha_operacion));
    opDoc.ele('tipo_operacion').txt(sanitizeText(op.tipo_operacion, 50));
    opDoc.ele('tipo_activo_virtual').txt(sanitizeText(op.tipo_activo || 'BTC', 20));
    opDoc.ele('cantidad').txt(formatDecimal(op.cantidad, 8));
    opDoc.ele('valor_unitario').txt(formatMonto(op.valor_unitario_mxn));
    opDoc.ele('monto_operacion').txt(formatMonto(op.monto_operacion));
    opDoc.ele('moneda').txt(op.moneda || 'MXN');

    if (op.wallet_origen) {
        opDoc.ele('direccion_origen').txt(sanitizeText(op.wallet_origen, 100));
    }
    if (op.wallet_destino) {
        opDoc.ele('direccion_destino').txt(sanitizeText(op.wallet_destino, 100));
    }
    if (op.plataforma) {
        opDoc.ele('plataforma').txt(sanitizeText(op.plataforma, 50));
    }
    if (op.tx_hash) {
        opDoc.ele('hash_transaccion').txt(sanitizeText(op.tx_hash, 100));
    }

    // -------------------------------------------------------------------------
    // Datos del cliente
    // -------------------------------------------------------------------------
    buildClienteNode(avisoDoc, client);

    // -------------------------------------------------------------------------
    // Beneficiario Controlador (si aplica)
    // -------------------------------------------------------------------------
    if (bc && bc.nombre) {
        buildBeneficiarioControladorNode(avisoDoc, bc);
    }
}

/**
 * Genera nodo de aviso para Inmuebles
 */
function buildAvisoInmuebles(avisoDoc, record) {
    const client = record.client_data || {};
    const op = record.operation_details || {};
    const bc = record.beneficiario_controlador || {};

    // -------------------------------------------------------------------------
    // Datos de la operación
    // -------------------------------------------------------------------------
    const opDoc = avisoDoc.ele('detalle_operacion');

    opDoc.ele('fecha_operacion').txt(formatDate(op.fecha_operacion));
    opDoc.ele('tipo_operacion').txt(sanitizeText(op.tipo_operacion, 50));
    opDoc.ele('valor_operacion').txt(formatMonto(op.monto_operacion));
    opDoc.ele('moneda').txt(op.moneda || 'MXN');
    opDoc.ele('forma_pago').txt(sanitizeText(op.forma_pago, 30));

    if (op.monto_efectivo && parseFloat(op.monto_efectivo) > 0) {
        opDoc.ele('monto_efectivo').txt(formatMonto(op.monto_efectivo));
    }

    // -------------------------------------------------------------------------
    // Datos del inmueble
    // -------------------------------------------------------------------------
    const inmDoc = avisoDoc.ele('inmueble');

    inmDoc.ele('tipo_inmueble').txt(sanitizeText(op.tipo_inmueble || 'CASA_HABITACION', 30));
    inmDoc.ele('ubicacion').txt(sanitizeText(op.ubicacion_inmueble || '', 300));
    if (op.folio_real) {
        inmDoc.ele('folio_real').txt(sanitizeText(op.folio_real, 50));
    }
    if (op.superficie_m2) {
        inmDoc.ele('superficie_m2').txt(formatDecimal(op.superficie_m2, 2));
    }

    // Datos notariales
    if (op.escritura_numero) {
        const notDoc = inmDoc.ele('datos_notariales');
        notDoc.ele('numero_escritura').txt(sanitizeText(op.escritura_numero, 30));
        notDoc.ele('fecha_escritura').txt(formatDate(op.fecha_escritura));
        notDoc.ele('numero_notaria').txt(sanitizeText(op.notaria_numero, 10));
        notDoc.ele('entidad_notaria').txt(sanitizeText(op.notaria_estado, 50));
    }

    // -------------------------------------------------------------------------
    // Datos del cliente
    // -------------------------------------------------------------------------
    buildClienteNode(avisoDoc, client);

    // -------------------------------------------------------------------------
    // Beneficiario Controlador
    // -------------------------------------------------------------------------
    if (bc && bc.nombre) {
        buildBeneficiarioControladorNode(avisoDoc, bc);
    }
}

/**
 * Genera nodo de aviso para Mutuo/Préstamo
 */
function buildAvisoMutuo(avisoDoc, record) {
    const client = record.client_data || {};
    const op = record.operation_details || {};
    const bc = record.beneficiario_controlador || {};

    // -------------------------------------------------------------------------
    // Datos del crédito
    // -------------------------------------------------------------------------
    const opDoc = avisoDoc.ele('detalle_operacion');

    opDoc.ele('fecha_otorgamiento').txt(formatDate(op.fecha_operacion || op.fecha_otorgamiento));
    opDoc.ele('tipo_credito').txt(sanitizeText(op.tipo_credito || 'PERSONAL', 30));
    opDoc.ele('monto_credito').txt(formatMonto(op.monto_operacion || op.monto_credito));
    opDoc.ele('moneda').txt(op.moneda || 'MXN');
    opDoc.ele('plazo_meses').txt(String(op.plazo_meses || 12));
    opDoc.ele('tasa_interes').txt(formatDecimal(op.tasa_interes, 2));
    opDoc.ele('instrumento_pago').txt(sanitizeText(op.instrumento_pago || op.forma_pago, 30));

    if (op.destino_recursos) {
        opDoc.ele('destino_recursos').txt(sanitizeText(op.destino_recursos, 200));
    }

    // Garantía
    if (op.tipo_garantia && op.tipo_garantia !== 'SIN_GARANTIA') {
        const garDoc = opDoc.ele('garantia');
        garDoc.ele('tipo_garantia').txt(sanitizeText(op.tipo_garantia, 30));
        if (op.descripcion_garantia) {
            garDoc.ele('descripcion').txt(sanitizeText(op.descripcion_garantia, 300));
        }
        if (op.valor_garantia) {
            garDoc.ele('valor_garantia').txt(formatMonto(op.valor_garantia));
        }
    }

    // -------------------------------------------------------------------------
    // Datos del cliente
    // -------------------------------------------------------------------------
    buildClienteNode(avisoDoc, client);

    // -------------------------------------------------------------------------
    // Beneficiario Controlador
    // -------------------------------------------------------------------------
    if (bc && bc.nombre) {
        buildBeneficiarioControladorNode(avisoDoc, bc);
    }
}

/**
 * Genera nodo genérico para actividades no específicas
 */
function buildAvisoGenerico(avisoDoc, record) {
    const client = record.client_data || {};
    const op = record.operation_details || {};
    const bc = record.beneficiario_controlador || {};

    const opDoc = avisoDoc.ele('detalle_operacion');

    opDoc.ele('fecha_operacion').txt(formatDate(op.fecha_operacion));
    opDoc.ele('tipo_operacion').txt(sanitizeText(op.tipo_operacion, 50));
    opDoc.ele('monto_operacion').txt(formatMonto(op.monto_operacion));
    opDoc.ele('moneda').txt(op.moneda || 'MXN');
    opDoc.ele('forma_pago').txt(sanitizeText(op.forma_pago, 30));

    buildClienteNode(avisoDoc, client);

    if (bc && bc.nombre) {
        buildBeneficiarioControladorNode(avisoDoc, bc);
    }
}

// ============================================================================
// NODOS REUTILIZABLES
// ============================================================================

/**
 * Construye el nodo de datos del cliente
 */
function buildClienteNode(parentDoc, client) {
    const clientDoc = parentDoc.ele('persona_operacion');

    const tipoPersona = (client.tipo_persona || 'PF').toUpperCase();
    clientDoc.ele('tipo_persona').txt(tipoPersona);

    if (tipoPersona === 'PF') {
        // Persona Física
        clientDoc.ele('nombre').txt(sanitizeText(client.nombre, 100));
        clientDoc.ele('apellido_paterno').txt(sanitizeText(client.apellido_paterno, 100));
        if (client.apellido_materno) {
            clientDoc.ele('apellido_materno').txt(sanitizeText(client.apellido_materno, 100));
        }
        clientDoc.ele('rfc').txt(sanitizeRFC(client.rfc));
        if (client.curp) {
            clientDoc.ele('curp').txt(sanitizeCURP(client.curp));
        }
        if (client.fecha_nacimiento) {
            clientDoc.ele('fecha_nacimiento').txt(formatDate(client.fecha_nacimiento));
        }
    } else {
        // Persona Moral
        clientDoc.ele('razon_social').txt(sanitizeText(client.razon_social, 150));
        clientDoc.ele('rfc').txt(sanitizeRFC(client.rfc));
        if (client.fecha_constitucion) {
            clientDoc.ele('fecha_constitucion').txt(formatDate(client.fecha_constitucion));
        }
    }

    // Nacionalidad
    clientDoc.ele('nacionalidad').txt(client.nacionalidad || 'MX');

    // Domicilio
    if (client.calle || client.estado) {
        const domDoc = clientDoc.ele('domicilio');
        domDoc.ele('pais').txt(client.pais || 'MX');
        domDoc.ele('entidad_federativa').txt(sanitizeText(client.estado, 50));
        domDoc.ele('municipio').txt(sanitizeText(client.municipio, 100));
        domDoc.ele('colonia').txt(sanitizeText(client.colonia, 80));
        domDoc.ele('calle').txt(sanitizeText(client.calle, 80));
        domDoc.ele('numero_exterior').txt(sanitizeText(client.numero_exterior, 10));
        if (client.numero_interior) {
            domDoc.ele('numero_interior').txt(sanitizeText(client.numero_interior, 10));
        }
        domDoc.ele('codigo_postal').txt(formatCP(client.codigo_postal));
    }

    // Actividad económica
    if (client.actividad_economica) {
        clientDoc.ele('actividad_economica').txt(sanitizeText(client.actividad_economica, 100));
    }

    return clientDoc;
}

/**
 * Construye el nodo de Beneficiario Controlador (Reforma 2025)
 */
function buildBeneficiarioControladorNode(parentDoc, bc) {
    const bcDoc = parentDoc.ele('beneficiario_controlador');

    bcDoc.ele('nombre').txt(sanitizeText(bc.nombre, 100));
    bcDoc.ele('apellido_paterno').txt(sanitizeText(bc.apellido_paterno, 100));
    if (bc.apellido_materno) {
        bcDoc.ele('apellido_materno').txt(sanitizeText(bc.apellido_materno, 100));
    }

    if (bc.rfc) {
        bcDoc.ele('rfc').txt(sanitizeRFC(bc.rfc));
    }
    if (bc.curp) {
        bcDoc.ele('curp').txt(sanitizeCURP(bc.curp));
    }
    if (bc.fecha_nacimiento) {
        bcDoc.ele('fecha_nacimiento').txt(formatDate(bc.fecha_nacimiento));
    }

    bcDoc.ele('nacionalidad').txt(bc.nacionalidad || 'MX');

    if (bc.porcentaje_participacion) {
        bcDoc.ele('porcentaje_participacion').txt(formatDecimal(bc.porcentaje_participacion, 2));
    }

    if (bc.tipo_control) {
        bcDoc.ele('tipo_control').txt(sanitizeText(bc.tipo_control, 30));
    }

    return bcDoc;
}

// ============================================================================
// FUNCIONES DE FORMATEO Y SANITIZACIÓN
// ============================================================================

/**
 * Formatea fecha a YYYYMMDD (formato SAT)
 */
function formatDate(value) {
    if (!value) return '';

    let date;

    // Manejar Timestamp de Firebase
    if (value?.toDate) {
        date = value.toDate();
    } else if (value instanceof Date) {
        date = value;
    } else if (typeof value === 'string') {
        // Parse ISO string
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
 * Formatea monto a 2 decimales sin comas
 */
function formatMonto(value) {
    const num = parseFloat(value);
    if (isNaN(num)) return '0.00';
    return num.toFixed(2);
}

/**
 * Formatea número decimal con precisión específica
 */
function formatDecimal(value, decimals = 2) {
    const num = parseFloat(value);
    if (isNaN(num)) return '0';
    return num.toFixed(decimals);
}

/**
 * Formatea código postal a 5 dígitos
 */
function formatCP(value) {
    if (!value) return '00000';
    return String(value).padStart(5, '0').slice(0, 5);
}

/**
 * Sanitiza texto removiendo caracteres prohibidos en XML
 */
function sanitizeText(value, maxLength = 0) {
    if (!value) return '';

    let text = String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
        .replace(/[\x00-\x1F\x7F]/g, '') // Caracteres de control
        .trim();

    if (maxLength > 0 && text.length > maxLength) {
        text = text.substring(0, maxLength);
    }

    return text;
}

/**
 * Sanitiza y valida RFC
 */
function sanitizeRFC(value) {
    if (!value) return '';
    return String(value).toUpperCase().replace(/[^A-ZÑ&0-9]/g, '').slice(0, 13);
}

/**
 * Sanitiza y valida CURP
 */
function sanitizeCURP(value) {
    if (!value) return '';
    return String(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 18);
}

/**
 * Extrae mes de una fecha (01-12)
 */
function extractMonth(dateStr) {
    if (!dateStr) return String(new Date().getMonth() + 1).padStart(2, '0');
    const date = new Date(dateStr);
    return String(date.getMonth() + 1).padStart(2, '0');
}

/**
 * Extrae año de una fecha
 */
function extractYear(dateStr) {
    if (!dateStr) return String(new Date().getFullYear());
    const date = new Date(dateStr);
    return String(date.getFullYear());
}

/**
 * Genera nombre de archivo estandarizado
 */
function generateFileName(tenantData, activityType, periodoInicio, periodoFin) {
    const rfc = tenantData.rfc || 'RFC';
    const mes = extractMonth(periodoInicio);
    const anio = extractYear(periodoInicio);
    const timestamp = Date.now();

    // Formato: RFC_ACTIVIDAD_AAAAMM_timestamp.xml
    return `${rfc}_${activityType}_${anio}${mes}_${timestamp}.xml`;
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    generateXMLBatch: exports.generateXMLBatch,
    buildXML,
    formatDate,
    formatMonto,
    sanitizeText,
};
