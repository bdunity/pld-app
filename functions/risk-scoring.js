/**
 * PLD BDU - Risk Scoring Cloud Functions
 * 
 * Calificación automática de riesgo (Scoring Trigger).
 * Se ejecuta cada vez que se crea o actualiza un registro en records.
 * 
 * IMPORTANTE: Implementa protección contra bucles infinitos usando:
 * 1. Campo `_risk_calculated_at` para detectar escrituras propias
 * 2. Comparación de hashes para detectar cambios reales
 * 
 * @version 2.0.0
 * @date 2026-01-25
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');

const db = admin.firestore();

// ============================================================================
// CONFIGURACIÓN
// ============================================================================
const CONFIG = {
    // Tiempo mínimo entre cálculos de riesgo (evita loops)
    MIN_RECALC_INTERVAL_MS: 5000, // 5 segundos

    // Campos que NO disparan recálculo si son los únicos modificados
    IGNORE_FIELDS: [
        'risk_score',
        'risk_level',
        'risk_factors',
        '_risk_calculated_at',
        '_risk_hash',
        'updated_at',
        'last_modified_by',
    ],

    // Score base para cada factor
    SCORE_WEIGHTS: {
        // Listas de control
        WATCHLIST_MATCH: 50,
        BLACKLIST_SAT_MATCH: 100,
        BLACKLIST_OFAC_MATCH: 100,

        // Umbrales
        ABOVE_THRESHOLD: 20,
        NEAR_THRESHOLD: 15,

        // Efectivo
        CASH_PAYMENT: 25,
        HIGH_CASH_AMOUNT: 35,

        // Geográficos
        HIGH_RISK_ZONE: 30,
        BORDER_ZONE: 15,

        // Cliente
        PEP_MATCH: 40,
        FIRST_OPERATION: 10,
        FOREIGN_NATIONAL: 15,

        // Patrones
        RAPID_TURNOVER: 35,
        STRUCTURED_OPERATIONS: 40,
    },

    // Niveles de riesgo (semáforo)
    RISK_LEVELS: {
        LOW: { min: 0, max: 30, label: 'low', label_es: 'Bajo', color: '#22c55e' },
        MEDIUM: { min: 31, max: 70, label: 'medium', label_es: 'Medio', color: '#f59e0b' },
        HIGH: { min: 71, max: 100, label: 'high', label_es: 'Alto', color: '#ef4444' },
    },

    // Estados de alto riesgo (ENR 2023)
    HIGH_RISK_STATES: [
        'Sinaloa', 'Chihuahua', 'Tamaulipas', 'Guerrero', 'Michoacán',
        'Baja California', 'Jalisco', 'Estado de México', 'Sonora', 'Quintana Roo',
    ],

    // Estados fronterizos
    BORDER_STATES: [
        'Baja California', 'Sonora', 'Chihuahua', 'Coahuila',
        'Nuevo León', 'Tamaulipas', 'Chiapas', 'Tabasco',
        'Campeche', 'Quintana Roo',
    ],
};

// ============================================================================
// CLOUD FUNCTION: onRecordWrite_calculateRisk
// Trigger: Firestore onWrite para documentos de records
// ============================================================================

/**
 * Trigger automático para calcular riesgo en cada escritura.
 * Path: tenants/{tenantId}/workspaces/{workspaceId}/records/{recordId}
 */
exports.onRecordWrite_calculateRisk = functions
    .runWith({
        memory: '512MB',
        timeoutSeconds: 60,
    })
    .firestore.document('tenants/{tenantId}/workspaces/{workspaceId}/records/{recordId}')
    .onWrite(async (change, context) => {
        const { tenantId, workspaceId, recordId } = context.params;

        // -------------------------------------------------------------------------
        // PASO 0: Manejar eliminación (no hay nada que calcular)
        // -------------------------------------------------------------------------
        if (!change.after.exists) {
            console.log(`[calculateRisk] Documento eliminado: ${recordId}`);
            return null;
        }

        const recordData = change.after.data();
        const previousData = change.before.exists ? change.before.data() : null;

        console.log(`[calculateRisk] Evaluando registro: ${recordId}`);
        console.log(`  - Tenant: ${tenantId}`);
        console.log(`  - Workspace: ${workspaceId}`);

        // -------------------------------------------------------------------------
        // PASO 1: PREVENCIÓN DE BUCLE INFINITO
        // Estrategia multi-capa para evitar escrituras cíclicas
        // -------------------------------------------------------------------------

        // Capa 1: Verificar si el recálculo ya se hizo recientemente
        const lastCalculated = recordData._risk_calculated_at?.toDate?.() ||
            recordData._risk_calculated_at;

        if (lastCalculated) {
            const timeSinceCalc = Date.now() - new Date(lastCalculated).getTime();
            if (timeSinceCalc < CONFIG.MIN_RECALC_INTERVAL_MS) {
                console.log(`[calculateRisk] ⏭️ Omitiendo: recálculo reciente (${timeSinceCalc}ms ago)`);
                return null;
            }
        }

        // Capa 2: Verificar si los únicos campos modificados son los ignorados
        if (previousData) {
            const changedFields = getChangedFields(previousData, recordData);
            const significantChanges = changedFields.filter(
                field => !CONFIG.IGNORE_FIELDS.includes(field)
            );

            if (significantChanges.length === 0) {
                console.log(`[calculateRisk] ⏭️ Omitiendo: solo campos de riesgo modificados`);
                return null;
            }

            console.log(`  - Campos modificados significativos: ${significantChanges.join(', ')}`);
        }

        // Capa 3: Verificar hash de datos relevantes
        const dataHash = calculateDataHash(recordData);
        if (previousData?._risk_hash === dataHash) {
            console.log(`[calculateRisk] ⏭️ Omitiendo: datos sin cambios (hash igual)`);
            return null;
        }

        // -------------------------------------------------------------------------
        // PASO 2: Obtener configuración del workspace
        // -------------------------------------------------------------------------
        const workspaceDoc = await db
            .collection('tenants')
            .doc(tenantId)
            .collection('workspaces')
            .doc(workspaceId)
            .get();

        if (!workspaceDoc.exists) {
            console.error(`[calculateRisk] Workspace no encontrado: ${workspaceId}`);
            return null;
        }

        const workspaceData = workspaceDoc.data();
        const activityType = workspaceData.activity_type || 'DEFAULT';
        const riskConfig = workspaceData.risk_config || {};

        console.log(`  - Actividad: ${activityType}`);

        // -------------------------------------------------------------------------
        // PASO 3: Ejecutar el Motor de Scoring
        // -------------------------------------------------------------------------
        const scoringResult = await calculateRiskScore(
            recordData,
            tenantId,
            activityType,
            riskConfig
        );

        console.log(`  - Score calculado: ${scoringResult.score}`);
        console.log(`  - Nivel: ${scoringResult.level_es}`);
        console.log(`  - Factores: ${scoringResult.factors.length}`);

        // -------------------------------------------------------------------------
        // PASO 4: Actualizar documento con resultado
        // -------------------------------------------------------------------------
        const updateData = {
            risk_score: scoringResult.score,
            risk_level: scoringResult.level,
            risk_level_es: scoringResult.level_es,
            risk_color: scoringResult.color,
            risk_factors: scoringResult.factors,
            risk_summary_es: scoringResult.summary_es,
            requires_review: scoringResult.score > 50,
            requires_escalation: scoringResult.score > 70,
            is_blocked: scoringResult.is_blocked,

            // Metadatos anti-loop
            _risk_calculated_at: admin.firestore.FieldValue.serverTimestamp(),
            _risk_hash: dataHash,
        };

        // Usar merge para no sobrescribir otros campos
        await change.after.ref.update(updateData);

        console.log(`[calculateRisk] ✅ Riesgo actualizado para ${recordId}`);

        // -------------------------------------------------------------------------
        // PASO 5: Si es alto riesgo, crear alerta
        // -------------------------------------------------------------------------
        if (scoringResult.score >= 70) {
            await createRiskAlert(tenantId, workspaceId, recordId, recordData, scoringResult);
        }

        return null;
    });

// ============================================================================
// FUNCIÓN PRINCIPAL: calculateRiskScore
// El "Motor" de calificación de riesgo
// ============================================================================

/**
 * Calcula el score de riesgo para un registro.
 * 
 * @param {Object} record - Datos del registro
 * @param {string} tenantId - ID del tenant
 * @param {string} activityType - Tipo de actividad
 * @param {Object} riskConfig - Configuración de riesgo del workspace
 * @returns {Object} Resultado del scoring
 */
async function calculateRiskScore(record, tenantId, activityType, riskConfig) {
    let totalScore = 0;
    const triggeredFactors = [];
    let isBlocked = false;

    // Extraer datos relevantes del registro
    const clientData = record.client_data || {};
    const operationData = record.operation_details || {};
    const bcData = record.beneficiario_controlador || {};

    const rfc = clientData.rfc?.toUpperCase() || '';
    const nombre = `${clientData.nombre || ''} ${clientData.apellido_paterno || ''}`.trim();
    const estado = clientData.estado || operationData.ubicacion_estado || '';
    const monto = parseFloat(operationData.monto_operacion) || 0;
    const formaPago = (operationData.forma_pago || '').toUpperCase();
    const montoEfectivo = parseFloat(operationData.monto_efectivo) || 0;

    // Umbrales según actividad
    const thresholds = riskConfig.thresholds || getDefaultThresholds(activityType);

    // -------------------------------------------------------------------------
    // PASO 1: Verificar Listas de Control (Watchlists)
    // -------------------------------------------------------------------------
    const watchlistResult = await checkWatchlists(rfc, nombre, tenantId);

    if (watchlistResult.sat_69b) {
        totalScore += CONFIG.SCORE_WEIGHTS.BLACKLIST_SAT_MATCH;
        isBlocked = true;
        triggeredFactors.push({
            id: 'blacklist_sat',
            name_es: 'Lista Negra SAT (69-B)',
            score: CONFIG.SCORE_WEIGHTS.BLACKLIST_SAT_MATCH,
            level: 'CRITICAL',
            alert_es: '🚫 CLIENTE EN LISTA 69-B DEL SAT. OPERACIÓN DEBE SER RECHAZADA.',
            blocking: true,
        });
    }

    if (watchlistResult.ofac) {
        totalScore += CONFIG.SCORE_WEIGHTS.BLACKLIST_OFAC_MATCH;
        isBlocked = true;
        triggeredFactors.push({
            id: 'blacklist_ofac',
            name_es: 'Lista OFAC/Sanciones Internacionales',
            score: CONFIG.SCORE_WEIGHTS.BLACKLIST_OFAC_MATCH,
            level: 'CRITICAL',
            alert_es: '🚫 CLIENTE EN LISTA DE SANCIONES INTERNACIONALES.',
            blocking: true,
        });
    }

    if (watchlistResult.pep) {
        totalScore += CONFIG.SCORE_WEIGHTS.PEP_MATCH;
        triggeredFactors.push({
            id: 'pep_match',
            name_es: 'Persona Políticamente Expuesta (PEP)',
            score: CONFIG.SCORE_WEIGHTS.PEP_MATCH,
            level: 'HIGH',
            alert_es: '⚠️ Cliente identificado como PEP. Aplicar Debida Diligencia Reforzada.',
        });
    }

    if (watchlistResult.internal) {
        totalScore += CONFIG.SCORE_WEIGHTS.WATCHLIST_MATCH;
        triggeredFactors.push({
            id: 'internal_watchlist',
            name_es: 'Lista de Vigilancia Interna',
            score: CONFIG.SCORE_WEIGHTS.WATCHLIST_MATCH,
            level: 'HIGH',
            alert_es: `⚠️ Cliente en lista interna: ${watchlistResult.internal_reason}`,
        });
    }

    // -------------------------------------------------------------------------
    // PASO 2: Verificar Umbrales
    // -------------------------------------------------------------------------
    const thresholdMXN = thresholds.aviso_mxn || 941513;

    if (monto >= thresholdMXN) {
        totalScore += CONFIG.SCORE_WEIGHTS.ABOVE_THRESHOLD;
        triggeredFactors.push({
            id: 'above_threshold',
            name_es: 'Supera Umbral de Aviso',
            score: CONFIG.SCORE_WEIGHTS.ABOVE_THRESHOLD,
            level: 'MEDIUM',
            alert_es: `ℹ️ Operación supera umbral de aviso ($${thresholdMXN.toLocaleString('es-MX')} MXN).`,
            requires_aviso: true,
        });
    } else if (monto >= thresholdMXN * 0.8) {
        // Entre 80% y 100% del umbral
        totalScore += CONFIG.SCORE_WEIGHTS.NEAR_THRESHOLD;
        triggeredFactors.push({
            id: 'near_threshold',
            name_es: 'Cercano al Umbral',
            score: CONFIG.SCORE_WEIGHTS.NEAR_THRESHOLD,
            level: 'MEDIUM',
            alert_es: '⚠️ Monto cercano al umbral de aviso. Posible estructuración.',
        });
    }

    // -------------------------------------------------------------------------
    // PASO 3: Verificar Pagos en Efectivo
    // -------------------------------------------------------------------------
    const incluyeEfectivo = montoEfectivo > 0 || formaPago === 'EFECTIVO' || formaPago === 'MIXTO';

    if (incluyeEfectivo) {
        totalScore += CONFIG.SCORE_WEIGHTS.CASH_PAYMENT;
        triggeredFactors.push({
            id: 'cash_payment',
            name_es: 'Pago en Efectivo',
            score: CONFIG.SCORE_WEIGHTS.CASH_PAYMENT,
            level: 'MEDIUM',
            alert_es: '💵 Operación incluye pago en efectivo.',
        });

        const cashLimit = thresholds.cash_limit_mxn || thresholdMXN;
        const efectivoReal = montoEfectivo > 0 ? montoEfectivo : monto;

        if (efectivoReal > cashLimit) {
            totalScore += CONFIG.SCORE_WEIGHTS.HIGH_CASH_AMOUNT;
            isBlocked = true;
            triggeredFactors.push({
                id: 'cash_limit_exceeded',
                name_es: 'Excede Límite de Efectivo',
                score: CONFIG.SCORE_WEIGHTS.HIGH_CASH_AMOUNT,
                level: 'CRITICAL',
                alert_es: '🚫 EFECTIVO EXCEDE LÍMITE LEGAL. OPERACIÓN NO PERMITIDA.',
                blocking: true,
            });
        }
    }

    // -------------------------------------------------------------------------
    // PASO 4: Verificar Zona Geográfica
    // -------------------------------------------------------------------------
    if (CONFIG.HIGH_RISK_STATES.includes(estado)) {
        totalScore += CONFIG.SCORE_WEIGHTS.HIGH_RISK_ZONE;
        triggeredFactors.push({
            id: 'high_risk_zone',
            name_es: 'Zona de Alto Riesgo',
            score: CONFIG.SCORE_WEIGHTS.HIGH_RISK_ZONE,
            level: 'HIGH',
            alert_es: `⚠️ Operación en zona de alto riesgo: ${estado}`,
        });

        // Si además es pago en efectivo en zona de riesgo, agregar score extra
        if (incluyeEfectivo) {
            totalScore += 10; // Bonus por combinación
            triggeredFactors.push({
                id: 'cash_high_risk_combo',
                name_es: 'Efectivo en Zona de Riesgo',
                score: 10,
                level: 'HIGH',
                alert_es: '🚨 Pago en efectivo en zona de alto riesgo.',
            });
        }
    }

    if (CONFIG.BORDER_STATES.includes(estado)) {
        totalScore += CONFIG.SCORE_WEIGHTS.BORDER_ZONE;
        triggeredFactors.push({
            id: 'border_zone',
            name_es: 'Zona Fronteriza',
            score: CONFIG.SCORE_WEIGHTS.BORDER_ZONE,
            level: 'MEDIUM',
            alert_es: `ℹ️ Operación en zona fronteriza: ${estado}`,
        });
    }

    // -------------------------------------------------------------------------
    // PASO 5: Verificar datos del cliente
    // -------------------------------------------------------------------------
    // Primera operación
    if (record._validation?.is_first_operation) {
        totalScore += CONFIG.SCORE_WEIGHTS.FIRST_OPERATION;
        triggeredFactors.push({
            id: 'first_operation',
            name_es: 'Primera Operación',
            score: CONFIG.SCORE_WEIGHTS.FIRST_OPERATION,
            level: 'LOW',
            alert_es: 'ℹ️ Primera operación del cliente.',
        });
    }

    // Nacionalidad extranjera
    if (clientData.nacionalidad && clientData.nacionalidad.toUpperCase() !== 'MX' &&
        clientData.nacionalidad.toUpperCase() !== 'MEXICANA') {
        totalScore += CONFIG.SCORE_WEIGHTS.FOREIGN_NATIONAL;
        triggeredFactors.push({
            id: 'foreign_national',
            name_es: 'Cliente Extranjero',
            score: CONFIG.SCORE_WEIGHTS.FOREIGN_NATIONAL,
            level: 'MEDIUM',
            alert_es: `ℹ️ Cliente con nacionalidad extranjera: ${clientData.nacionalidad}`,
        });
    }

    // PEP declarado
    if (clientData.es_pep === true) {
        if (!triggeredFactors.some(f => f.id === 'pep_match')) {
            totalScore += CONFIG.SCORE_WEIGHTS.PEP_MATCH;
            triggeredFactors.push({
                id: 'pep_declared',
                name_es: 'PEP Declarado',
                score: CONFIG.SCORE_WEIGHTS.PEP_MATCH,
                level: 'HIGH',
                alert_es: '⚠️ Cliente declara ser Persona Políticamente Expuesta.',
            });
        }
    }

    // -------------------------------------------------------------------------
    // PASO 6: Calcular nivel final
    // -------------------------------------------------------------------------
    const normalizedScore = Math.min(totalScore, 100);
    const riskLevel = getRiskLevel(normalizedScore);

    // Generar resumen en español
    const summaryParts = [];
    if (isBlocked) summaryParts.push('🚫 OPERACIÓN BLOQUEADA');
    if (triggeredFactors.length === 0) {
        summaryParts.push('Sin factores de riesgo detectados');
    } else {
        summaryParts.push(`${triggeredFactors.length} factor(es) de riesgo detectado(s)`);
        const highFactors = triggeredFactors.filter(f => f.level === 'HIGH' || f.level === 'CRITICAL');
        if (highFactors.length > 0) {
            summaryParts.push(`${highFactors.length} de alto riesgo`);
        }
    }

    return {
        score: normalizedScore,
        level: riskLevel.label,
        level_es: riskLevel.label_es,
        color: riskLevel.color,
        factors: triggeredFactors,
        summary_es: summaryParts.join('. '),
        is_blocked: isBlocked,
        calculated_at: new Date().toISOString(),
    };
}

// ============================================================================
// FUNCIÓN: checkWatchlists
// Verifica RFC/Nombre contra listas de control
// ============================================================================

async function checkWatchlists(rfc, nombre, tenantId) {
    const result = {
        sat_69b: false,
        ofac: false,
        pep: false,
        internal: false,
        internal_reason: null,
    };

    if (!rfc && !nombre) return result;

    try {
        // Verificar lista global (SAT, OFAC)
        if (rfc) {
            const globalQuery = await db
                .collection('global_config')
                .doc('watchlists')
                .collection('entries')
                .where('identifier', '==', rfc)
                .limit(1)
                .get();

            if (!globalQuery.empty) {
                const entry = globalQuery.docs[0].data();
                if (entry.list_type === 'SAT_69B') result.sat_69b = true;
                if (entry.list_type === 'OFAC') result.ofac = true;
                if (entry.list_type === 'PEP') result.pep = true;
            }
        }

        // Verificar lista interna del tenant
        const internalQuery = await db
            .collection('tenants')
            .doc(tenantId)
            .collection('watchlists')
            .where('active', '==', true)
            .get();

        for (const doc of internalQuery.docs) {
            const entry = doc.data();
            const matches = (entry.rfc && entry.rfc === rfc) ||
                (entry.nombre && nombre.includes(entry.nombre));

            if (matches) {
                result.internal = true;
                result.internal_reason = entry.reason || 'Sin motivo especificado';
                break;
            }
        }

    } catch (error) {
        console.error('[checkWatchlists] Error:', error);
    }

    return result;
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Obtiene los campos que cambiaron entre dos versiones del documento
 */
function getChangedFields(before, after) {
    const changedFields = [];
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of allKeys) {
        const beforeVal = JSON.stringify(before[key]);
        const afterVal = JSON.stringify(after[key]);

        if (beforeVal !== afterVal) {
            changedFields.push(key);
        }
    }

    return changedFields;
}

/**
 * Calcula un hash de los datos relevantes para detección de cambios
 */
function calculateDataHash(record) {
    const relevantData = {
        client_data: record.client_data,
        operation_details: record.operation_details,
        beneficiario_controlador: record.beneficiario_controlador,
    };

    return crypto
        .createHash('md5')
        .update(JSON.stringify(relevantData))
        .digest('hex');
}

/**
 * Determina el nivel de riesgo basado en el score
 */
function getRiskLevel(score) {
    for (const [key, config] of Object.entries(CONFIG.RISK_LEVELS)) {
        if (score >= config.min && score <= config.max) {
            return config;
        }
    }
    return CONFIG.RISK_LEVELS.LOW;
}

/**
 * Obtiene umbrales por defecto según la actividad
 */
function getDefaultThresholds(activityType) {
    const uma = 117.31;

    const THRESHOLDS = {
        INMUEBLES: { aviso_mxn: 8025 * uma, cash_limit_mxn: 8025 * uma },
        VEHICULOS: { aviso_mxn: 3210 * uma, cash_limit_mxn: 3210 * uma },
        JOYAS: { aviso_mxn: 3210 * uma, cash_limit_mxn: 3210 * uma },
        ACTIVOS_VIRTUALES: { aviso_mxn: 645 * uma, cash_limit_mxn: 645 * uma },
        MUTUO_PRESTAMO: { aviso_mxn: 8025 * uma, cash_limit_mxn: 8025 * uma },
        JUEGOS: { aviso_mxn: 325 * uma, cash_limit_mxn: 325 * uma },
        DEFAULT: { aviso_mxn: 8025 * uma, cash_limit_mxn: 8025 * uma },
    };

    return THRESHOLDS[activityType] || THRESHOLDS.DEFAULT;
}

/**
 * Crea una alerta para operaciones de alto riesgo
 */
async function createRiskAlert(tenantId, workspaceId, recordId, recordData, scoringResult) {
    const clientData = recordData.client_data || {};

    await db.collection('tenants').doc(tenantId).collection('alerts').add({
        type: 'HIGH_RISK_OPERATION',
        severity: scoringResult.score >= 90 ? 'critical' : 'high',
        workspace_id: workspaceId,
        record_id: recordId,

        title_es: scoringResult.is_blocked
            ? '🚫 Operación Bloqueada - Requiere Atención Inmediata'
            : '⚠️ Operación de Alto Riesgo Detectada',

        description_es: scoringResult.summary_es,

        client_info: {
            nombre: `${clientData.nombre || ''} ${clientData.apellido_paterno || ''}`.trim(),
            rfc: clientData.rfc,
        },

        risk_score: scoringResult.score,
        risk_level: scoringResult.level,
        risk_factors: scoringResult.factors.map(f => ({
            id: f.id,
            name_es: f.name_es,
            alert_es: f.alert_es,
        })),

        status: 'pending',
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        acknowledged_at: null,
        acknowledged_by: null,
    });

    console.log(`[createRiskAlert] Alerta creada para registro: ${recordId}`);
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    onRecordWrite_calculateRisk: exports.onRecordWrite_calculateRisk,
    calculateRiskScore,
    checkWatchlists,
};
