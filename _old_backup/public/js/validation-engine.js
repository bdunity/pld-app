/**
 * PLD BDU - Motor de Validación de Reglas de Negocio
 * 
 * Valida datos de operaciones antes de guardarlos en Firestore.
 * Implementa las reglas de la LFPIORPI y Reforma 2025.
 * 
 * Puede ejecutarse:
 * - En el Frontend (validación inmediata al cargar Excel)
 * - En Cloud Functions (validación de seguridad antes de guardar)
 * 
 * @author ACE - Auditor Senior de PLD
 * @version 2.0.0
 * @date 2026-01-25
 */

// ============================================================================
// CONFIGURACIÓN UMA 2026
// ============================================================================
const UMA_CONFIG = {
    year: 2026,
    daily_value: 117.31, // Valor UMA diario 2026

    // Umbrales por actividad (en UMAs)
    thresholds: {
        // Umbral de Aviso (genera aviso al SAT)
        AVISO: {
            INMUEBLES: 8025,       // Compraventa inmuebles
            VEHICULOS: 3210,       // Compraventa vehículos
            JOYAS: 3210,           // Joyas, relojes, metales
            ACTIVOS_VIRTUALES: 645, // Criptomonedas
            MUTUO_PRESTAMO: 8025,  // Préstamos
            JUEGOS: 325,           // Casinos, apuestas
            TARJETAS: 805,         // Tarjetas de servicio/crédito
            SERVICIOS_FE: 8025,    // Fe pública (notarios)
            DONATIVOS: 32100,      // Donativos
            DEFAULT: 8025,
        },

        // Límite de pago en EFECTIVO (restricción legal)
        EFECTIVO: {
            INMUEBLES: 8025,       // No se puede pagar >8025 UMA en efectivo
            VEHICULOS: 3210,
            JOYAS: 3210,
            ACTIVOS_VIRTUALES: 645,
            MUTUO_PRESTAMO: 8025,
            JUEGOS: 325,
            DEFAULT: 8025,
        },
    },
};

// ============================================================================
// CATÁLOGO DE ERRORES Y WARNINGS
// ============================================================================
const VALIDATION_MESSAGES = {
    // Errores de formato (sintaxis)
    E001: { code: 'E001', type: 'error', message: 'RFC con estructura inválida', field: 'rfc' },
    E002: { code: 'E002', type: 'error', message: 'CURP requerida para Personas Físicas', field: 'curp' },
    E003: { code: 'E003', type: 'error', message: 'CURP con estructura inválida', field: 'curp' },
    E004: { code: 'E004', type: 'error', message: 'Fecha de operación no puede ser futura', field: 'fecha_operacion' },
    E005: { code: 'E005', type: 'error', message: 'Formato de fecha inválido (usar YYYY-MM-DD)', field: 'fecha_operacion' },
    E006: { code: 'E006', type: 'error', message: 'Monto de operación inválido (debe ser número positivo)', field: 'monto' },
    E007: { code: 'E007', type: 'error', message: 'Tipo de persona inválido (usar PF o PM)', field: 'tipo_persona' },
    E008: { code: 'E008', type: 'error', message: 'Email con formato inválido', field: 'email' },
    E009: { code: 'E009', type: 'error', message: 'Código postal inválido (5 dígitos)', field: 'codigo_postal' },
    E010: { code: 'E010', type: 'error', message: 'Fecha de nacimiento no puede ser futura', field: 'fecha_nacimiento' },

    // Errores de umbral (LA REGLA DE ORO)
    E100: { code: 'E100', type: 'error', message: 'EXCEDE LÍMITE DE EFECTIVO PERMITIDO. Operación no puede registrarse.', field: 'monto_efectivo', blocking: true },
    E101: { code: 'E101', type: 'error', message: 'Monto en efectivo excede el límite legal para esta actividad', field: 'monto_efectivo', blocking: true },

    // Warnings de integridad (datos faltantes para aviso)
    W001: { code: 'W001', type: 'warning', message: 'Operación supera umbral de aviso - Faltan datos del Beneficiario Controlador', field: 'beneficiario_controlador' },
    W002: { code: 'W002', type: 'warning', message: 'Operación supera umbral de aviso - Falta CURP del cliente', field: 'curp' },
    W003: { code: 'W003', type: 'warning', message: 'Operación supera umbral de aviso - Falta domicilio completo', field: 'domicilio' },
    W004: { code: 'W004', type: 'warning', message: 'Operación supera umbral de aviso - Falta actividad económica', field: 'actividad_economica' },
    W005: { code: 'W005', type: 'warning', message: 'Cliente marcado como PEP - Requiere documentación adicional', field: 'pep' },
    W006: { code: 'W006', type: 'warning', message: 'Nacionalidad extranjera - Verificar documentación migratoria', field: 'nacionalidad' },
    W007: { code: 'W007', type: 'warning', message: 'Primera operación del cliente - Aplicar debida diligencia reforzada', field: 'cliente_nuevo' },

    // Información
    I001: { code: 'I001', type: 'info', message: 'Operación requiere Aviso al SAT (supera umbral)', field: 'umbral' },
    I002: { code: 'I002', type: 'info', message: 'Operación con pago en efectivo - Verificar límite', field: 'efectivo' },
};

// ============================================================================
// REGEX PATTERNS (Oficiales)
// ============================================================================
const PATTERNS = {
    // RFC Persona Física: 4 letras + 6 dígitos (fecha) + 3 homoclave
    RFC_PF: /^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$/,

    // RFC Persona Moral: 3 letras + 6 dígitos (fecha) + 3 homoclave
    RFC_PM: /^[A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{3}$/,

    // RFC genérico (PF o PM)
    RFC: /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/,

    // CURP: 4 letras + 6 dígitos + H/M + 2 letras estado + 3 consonantes + 2 dígitos
    CURP: /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z]{2}$/,

    // Email
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

    // Código Postal México
    CODIGO_POSTAL: /^[0-9]{5}$/,

    // Fecha ISO (YYYY-MM-DD)
    FECHA_ISO: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,

    // Teléfono (flexible)
    TELEFONO: /^[\d\s\-\+\(\)]{10,20}$/,
};

// ============================================================================
// CAMPOS REQUERIDOS PARA AVISO XML
// ============================================================================
const REQUIRED_FOR_AVISO = {
    // Campos obligatorios siempre
    always: [
        'rfc_cliente',
        'nombre',
        'fecha_operacion',
        'monto_operacion',
        'tipo_operacion',
    ],

    // Campos obligatorios para Persona Física
    persona_fisica: [
        'curp_cliente',
        'fecha_nacimiento',
        'apellido_paterno',
        'nacionalidad',
        'actividad_economica',
    ],

    // Campos obligatorios para Persona Moral
    persona_moral: [
        'razon_social_cliente',
        'fecha_constitucion',
        // Beneficiario Controlador (Reforma 2025)
        'bc_nombre',
        'bc_apellido_paterno',
        'bc_rfc',
        'bc_porcentaje_participacion',
    ],

    // Campos de domicilio (obligatorios)
    domicilio: [
        'calle',
        'numero_exterior',
        'colonia',
        'municipio',
        'estado',
        'codigo_postal',
    ],
};

// ============================================================================
// CLASE PRINCIPAL: ValidationEngine
// ============================================================================
class ValidationEngine {
    constructor(activityType, umaConfig = UMA_CONFIG) {
        this.activityType = activityType;
        this.umaConfig = umaConfig;
        this.today = new Date();
        this.today.setHours(0, 0, 0, 0);

        // Calcular umbrales en pesos para esta actividad
        this.thresholdAviso = this.calculateThreshold('AVISO', activityType);
        this.thresholdEfectivo = this.calculateThreshold('EFECTIVO', activityType);
    }

    /**
     * Calcula el umbral en pesos mexicanos
     */
    calculateThreshold(type, activity) {
        const thresholds = this.umaConfig.thresholds[type];
        const umaCount = thresholds[activity] || thresholds.DEFAULT;
        return umaCount * this.umaConfig.daily_value;
    }

    /**
     * FUNCIÓN PRINCIPAL: Valida un lote completo de operaciones
     * 
     * @param {Array} records - Array de objetos con datos de operaciones
     * @returns {Object} Reporte de validación estructurado
     */
    validateBatch(records) {
        const startTime = Date.now();

        const report = {
            // Metadatos
            timestamp: new Date().toISOString(),
            activity_type: this.activityType,
            uma_year: this.umaConfig.year,
            uma_daily: this.umaConfig.daily_value,
            threshold_aviso_mxn: this.thresholdAviso,
            threshold_efectivo_mxn: this.thresholdEfectivo,

            // Contadores
            total_records: records.length,
            valid_records: 0,
            records_with_errors: 0,
            records_with_warnings: 0,
            blocked_records: 0,

            // Estadísticas
            total_errors: 0,
            total_warnings: 0,
            total_infos: 0,

            // Conteo por tipo de error
            error_summary: {},

            // Resultados detallados por fila
            results: [],

            // Registros que pasaron validación
            valid_data: [],

            // Tiempo de procesamiento
            processing_time_ms: 0,
        };

        // Procesar cada registro
        records.forEach((record, index) => {
            const rowNumber = index + 2; // +2 porque Excel empieza en 1 y tiene header
            const rowResult = this.validateRow(record, rowNumber);

            report.results.push(rowResult);

            // Actualizar contadores
            if (rowResult.is_valid) {
                report.valid_records++;
                report.valid_data.push({
                    row: rowNumber,
                    data: record,
                    requires_aviso: rowResult.requires_aviso,
                });
            } else {
                report.records_with_errors++;
            }

            if (rowResult.has_warnings) {
                report.records_with_warnings++;
            }

            if (rowResult.is_blocked) {
                report.blocked_records++;
            }

            // Contar errores/warnings
            report.total_errors += rowResult.errors.length;
            report.total_warnings += rowResult.warnings.length;
            report.total_infos += rowResult.infos.length;

            // Actualizar resumen de errores
            [...rowResult.errors, ...rowResult.warnings].forEach(issue => {
                if (!report.error_summary[issue.code]) {
                    report.error_summary[issue.code] = {
                        ...VALIDATION_MESSAGES[issue.code],
                        count: 0,
                        rows: [],
                    };
                }
                report.error_summary[issue.code].count++;
                report.error_summary[issue.code].rows.push(rowNumber);
            });
        });

        report.processing_time_ms = Date.now() - startTime;

        return report;
    }

    /**
     * Valida una fila individual
     */
    validateRow(record, rowNumber) {
        const result = {
            row: rowNumber,
            is_valid: true,
            is_blocked: false,
            has_warnings: false,
            requires_aviso: false,
            errors: [],
            warnings: [],
            infos: [],
        };

        // -------------------------------------------------------------------------
        // 1. VALIDACIÓN DE FORMATO (Sintaxis)
        // -------------------------------------------------------------------------
        this.validateFormat(record, result);

        // -------------------------------------------------------------------------
        // 2. VALIDACIÓN DE UMBRALES Y EFECTIVO (Regla de Oro)
        // -------------------------------------------------------------------------
        this.validateThresholds(record, result);

        // -------------------------------------------------------------------------
        // 3. VALIDACIÓN DE INTEGRIDAD (Datos para Aviso)
        // -------------------------------------------------------------------------
        if (result.requires_aviso) {
            this.validateIntegrity(record, result);
        }

        // Determinar estado final
        result.is_valid = result.errors.length === 0;
        result.has_warnings = result.warnings.length > 0;
        result.is_blocked = result.errors.some(e => e.blocking);

        return result;
    }

    /**
     * Validación de formato (sintaxis)
     */
    validateFormat(record, result) {
        const tipoPersona = (record.tipo_persona || '').toUpperCase();

        // Tipo de persona
        if (tipoPersona && !['PF', 'PM'].includes(tipoPersona)) {
            result.errors.push({ ...VALIDATION_MESSAGES.E007, value: record.tipo_persona });
        }

        // RFC
        if (record.rfc_cliente) {
            const rfcClean = record.rfc_cliente.toUpperCase().trim();
            const rfcPattern = tipoPersona === 'PM' ? PATTERNS.RFC_PM : PATTERNS.RFC_PF;

            if (!PATTERNS.RFC.test(rfcClean)) {
                result.errors.push({
                    ...VALIDATION_MESSAGES.E001,
                    value: record.rfc_cliente,
                    detail: tipoPersona === 'PM'
                        ? 'Persona Moral debe tener 12 caracteres'
                        : 'Persona Física debe tener 13 caracteres',
                });
            }
        }

        // CURP (obligatorio para Persona Física)
        if (tipoPersona === 'PF') {
            if (!record.curp_cliente) {
                result.errors.push({ ...VALIDATION_MESSAGES.E002 });
            } else {
                const curpClean = record.curp_cliente.toUpperCase().trim();
                if (!PATTERNS.CURP.test(curpClean)) {
                    result.errors.push({
                        ...VALIDATION_MESSAGES.E003,
                        value: record.curp_cliente,
                    });
                }
            }
        }

        // Fecha de operación
        if (record.fecha_operacion) {
            const fechaOp = this.parseDate(record.fecha_operacion);

            if (!fechaOp) {
                result.errors.push({
                    ...VALIDATION_MESSAGES.E005,
                    value: record.fecha_operacion,
                });
            } else if (fechaOp > this.today) {
                result.errors.push({
                    ...VALIDATION_MESSAGES.E004,
                    value: record.fecha_operacion,
                });
            }
        }

        // Fecha de nacimiento (no futura)
        if (record.fecha_nacimiento) {
            const fechaNac = this.parseDate(record.fecha_nacimiento);

            if (fechaNac && fechaNac > this.today) {
                result.errors.push({
                    ...VALIDATION_MESSAGES.E010,
                    value: record.fecha_nacimiento,
                });
            }
        }

        // Monto de operación
        const monto = this.parseNumber(record.monto_operacion);
        if (record.monto_operacion !== undefined && record.monto_operacion !== '') {
            if (isNaN(monto) || monto <= 0) {
                result.errors.push({
                    ...VALIDATION_MESSAGES.E006,
                    value: record.monto_operacion,
                });
            }
        }

        // Email (si existe)
        if (record.email && !PATTERNS.EMAIL.test(record.email)) {
            result.errors.push({
                ...VALIDATION_MESSAGES.E008,
                value: record.email,
            });
        }

        // Código postal (si existe)
        if (record.codigo_postal && !PATTERNS.CODIGO_POSTAL.test(record.codigo_postal)) {
            result.errors.push({
                ...VALIDATION_MESSAGES.E009,
                value: record.codigo_postal,
            });
        }
    }

    /**
     * Validación de umbrales y efectivo (LA REGLA DE ORO)
     */
    validateThresholds(record, result) {
        const montoOperacion = this.parseNumber(record.monto_operacion) || 0;
        const montoEfectivo = this.parseNumber(record.monto_efectivo) || 0;
        const formaPago = (record.forma_pago || record.instrumento_pago || '').toUpperCase();

        // Determinar si la forma de pago incluye efectivo
        const incluyeEfectivo = montoEfectivo > 0 ||
            formaPago === 'EFECTIVO' ||
            formaPago === 'MIXTO';

        // -------------------------------------------------------------------------
        // Validar si supera umbral de AVISO
        // -------------------------------------------------------------------------
        if (montoOperacion >= this.thresholdAviso) {
            result.requires_aviso = true;
            result.infos.push({
                ...VALIDATION_MESSAGES.I001,
                value: montoOperacion,
                threshold: this.thresholdAviso,
                threshold_uma: this.umaConfig.thresholds.AVISO[this.activityType] || this.umaConfig.thresholds.AVISO.DEFAULT,
            });
        }

        // -------------------------------------------------------------------------
        // Validar límite de EFECTIVO (ERROR BLOQUEANTE)
        // -------------------------------------------------------------------------
        if (incluyeEfectivo) {
            result.infos.push({
                ...VALIDATION_MESSAGES.I002,
                monto_efectivo: montoEfectivo || montoOperacion,
            });

            // Determinar monto en efectivo
            // Si hay campo específico, usar ese. Si no, asumir todo el monto.
            const efectivoReal = montoEfectivo > 0 ? montoEfectivo :
                (formaPago === 'EFECTIVO' ? montoOperacion : 0);

            if (efectivoReal > this.thresholdEfectivo) {
                result.errors.push({
                    ...VALIDATION_MESSAGES.E100,
                    blocking: true, // Este error BLOQUEA la operación
                    value: efectivoReal,
                    threshold: this.thresholdEfectivo,
                    threshold_uma: this.umaConfig.thresholds.EFECTIVO[this.activityType] || this.umaConfig.thresholds.EFECTIVO.DEFAULT,
                    excede_por: efectivoReal - this.thresholdEfectivo,
                    detail: `El límite para ${this.activityType} es $${this.thresholdEfectivo.toLocaleString('es-MX')} MXN (${this.umaConfig.thresholds.EFECTIVO[this.activityType] || this.umaConfig.thresholds.EFECTIVO.DEFAULT} UMAs)`,
                });
            }
        }
    }

    /**
     * Validación de integridad (datos obligatorios para generar Aviso XML)
     */
    validateIntegrity(record, result) {
        const tipoPersona = (record.tipo_persona || '').toUpperCase();

        // Verificar campos siempre requeridos
        REQUIRED_FOR_AVISO.always.forEach(field => {
            if (!record[field] || record[field] === '') {
                result.warnings.push({
                    code: 'W_MISSING',
                    type: 'warning',
                    message: `Campo requerido para Aviso: ${field}`,
                    field: field,
                });
            }
        });

        // Verificar campos según tipo de persona
        if (tipoPersona === 'PF') {
            REQUIRED_FOR_AVISO.persona_fisica.forEach(field => {
                if (!record[field] || record[field] === '') {
                    if (field === 'curp_cliente') {
                        result.warnings.push({ ...VALIDATION_MESSAGES.W002 });
                    } else if (field === 'actividad_economica') {
                        result.warnings.push({ ...VALIDATION_MESSAGES.W004 });
                    }
                }
            });
        } else if (tipoPersona === 'PM') {
            // Reforma 2025: Beneficiario Controlador obligatorio
            const bcFields = ['bc_nombre', 'bc_apellido_paterno', 'bc_rfc', 'bc_porcentaje_participacion'];
            const missingBC = bcFields.some(f => !record[f] || record[f] === '');

            if (missingBC) {
                result.warnings.push({ ...VALIDATION_MESSAGES.W001 });
            }
        }

        // Verificar domicilio completo
        const domicilioCompleto = REQUIRED_FOR_AVISO.domicilio.every(
            field => record[field] && record[field] !== ''
        );

        if (!domicilioCompleto) {
            result.warnings.push({ ...VALIDATION_MESSAGES.W003 });
        }

        // Verificar PEP
        if (record.es_pep === true || record.es_pep === 'SI' || record.es_pep === '1') {
            result.warnings.push({ ...VALIDATION_MESSAGES.W005 });
        }

        // Verificar nacionalidad extranjera
        if (record.nacionalidad && record.nacionalidad.toUpperCase() !== 'MX' &&
            record.nacionalidad.toUpperCase() !== 'MEXICANA') {
            result.warnings.push({ ...VALIDATION_MESSAGES.W006 });
        }
    }

    /**
     * Helpers
     */
    parseDate(value) {
        if (!value) return null;

        // Si es string ISO
        if (typeof value === 'string') {
            // Limpiar y normalizar
            const cleaned = value.trim().split('T')[0];

            // Intentar parsear como YYYY-MM-DD
            if (PATTERNS.FECHA_ISO.test(cleaned)) {
                const date = new Date(cleaned + 'T00:00:00');
                return isNaN(date.getTime()) ? null : date;
            }

            // Intentar parsear como DD/MM/YYYY
            const parts = cleaned.split(/[\/\-]/);
            if (parts.length === 3) {
                // Determinar formato
                if (parts[0].length === 4) {
                    // YYYY-MM-DD
                    return new Date(parts[0], parts[1] - 1, parts[2]);
                } else if (parts[2].length === 4) {
                    // DD/MM/YYYY
                    return new Date(parts[2], parts[1] - 1, parts[0]);
                }
            }
        }

        // Si es objeto Date
        if (value instanceof Date) {
            return isNaN(value.getTime()) ? null : value;
        }

        // Si es número (Excel date serial)
        if (typeof value === 'number') {
            const excelEpoch = new Date(1899, 11, 30);
            const date = new Date(excelEpoch.getTime() + value * 86400000);
            return isNaN(date.getTime()) ? null : date;
        }

        return null;
    }

    parseNumber(value) {
        if (value === null || value === undefined || value === '') return NaN;
        if (typeof value === 'number') return value;

        // Limpiar string
        const cleaned = String(value)
            .replace(/[$,]/g, '')
            .replace(/\s/g, '')
            .trim();

        return parseFloat(cleaned);
    }
}

// ============================================================================
// FUNCIÓN DE EXPORTACIÓN: validateBatchData
// ============================================================================

/**
 * Función principal para validar un lote de datos.
 * 
 * @param {Array} records - Array de objetos (filas del Excel)
 * @param {string} activityType - Tipo de actividad (INMUEBLES, VEHICULOS, etc.)
 * @param {Object} options - Opciones adicionales
 * @returns {Object} Reporte de validación
 * 
 * @example
 * const report = validateBatchData(excelRows, 'INMUEBLES');
 * console.log(report.valid_records); // 950
 * console.log(report.records_with_errors); // 50
 * console.log(report.results.filter(r => !r.is_valid)); // Filas con errores
 */
function validateBatchData(records, activityType, options = {}) {
    const engine = new ValidationEngine(activityType, options.umaConfig || UMA_CONFIG);
    return engine.validateBatch(records);
}

/**
 * Valida un registro individual (útil para validación en tiempo real)
 */
function validateSingleRecord(record, activityType, rowNumber = 1) {
    const engine = new ValidationEngine(activityType);
    return engine.validateRow(record, rowNumber);
}

/**
 * Formatea el reporte para mostrar en consola o log
 */
function formatValidationReport(report) {
    const lines = [
        '═══════════════════════════════════════════════════════════════',
        '  REPORTE DE VALIDACIÓN - PLD BDU',
        '═══════════════════════════════════════════════════════════════',
        '',
        `📅 Fecha: ${report.timestamp}`,
        `🏢 Actividad: ${report.activity_type}`,
        `💰 UMA ${report.uma_year}: $${report.uma_daily}`,
        `📊 Umbral Aviso: $${report.threshold_aviso_mxn.toLocaleString('es-MX')}`,
        `💵 Límite Efectivo: $${report.threshold_efectivo_mxn.toLocaleString('es-MX')}`,
        '',
        '───────────────────────────────────────────────────────────────',
        '  RESUMEN',
        '───────────────────────────────────────────────────────────────',
        '',
        `📝 Total registros:     ${report.total_records}`,
        `✅ Registros válidos:   ${report.valid_records}`,
        `❌ Con errores:         ${report.records_with_errors}`,
        `⚠️  Con advertencias:   ${report.records_with_warnings}`,
        `🚫 Bloqueados:          ${report.blocked_records}`,
        '',
        `Total errores:          ${report.total_errors}`,
        `Total advertencias:     ${report.total_warnings}`,
        `Tiempo de proceso:      ${report.processing_time_ms}ms`,
        '',
    ];

    if (Object.keys(report.error_summary).length > 0) {
        lines.push('───────────────────────────────────────────────────────────────');
        lines.push('  ERRORES MÁS COMUNES');
        lines.push('───────────────────────────────────────────────────────────────');
        lines.push('');

        Object.values(report.error_summary)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)
            .forEach(err => {
                const icon = err.type === 'error' ? '❌' : '⚠️';
                lines.push(`${icon} [${err.code}] ${err.message}`);
                lines.push(`   Ocurrencias: ${err.count} | Filas: ${err.rows.slice(0, 5).join(', ')}${err.rows.length > 5 ? '...' : ''}`);
                lines.push('');
            });
    }

    lines.push('═══════════════════════════════════════════════════════════════');

    return lines.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ValidationEngine,
        validateBatchData,
        validateSingleRecord,
        formatValidationReport,
        UMA_CONFIG,
        VALIDATION_MESSAGES,
        PATTERNS,
        REQUIRED_FOR_AVISO,
    };
}

// Para uso en browser
if (typeof window !== 'undefined') {
    window.ValidationEngine = ValidationEngine;
    window.validateBatchData = validateBatchData;
    window.validateSingleRecord = validateSingleRecord;
    window.formatValidationReport = formatValidationReport;
}
