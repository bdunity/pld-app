/**
 * PLD BDU - Server-Side Validation Engine
 * 
 * Versión para Cloud Functions del motor de validación.
 * Replica la lógica del cliente pero optimizada para Node.js.
 */

// ============================================================================
// CONFIGURACIÓN UMA 2026
// ============================================================================
const UMA_CONFIG = {
    year: 2026,
    daily_value: 117.31,

    thresholds: {
        AVISO: {
            INMUEBLES: 8025,
            VEHICULOS: 3210,
            JOYAS: 3210,
            ACTIVOS_VIRTUALES: 645,
            MUTUO_PRESTAMO: 8025,
            JUEGOS: 325,
            DEFAULT: 8025,
        },
        EFECTIVO: {
            INMUEBLES: 8025,
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
// VALIDATION MESSAGES
// ============================================================================
const VALIDATION_MESSAGES = {
    E001: { code: 'E001', type: 'error', message: 'RFC con estructura inválida', field: 'rfc' },
    E002: { code: 'E002', type: 'error', message: 'CURP requerida para Personas Físicas', field: 'curp' },
    E003: { code: 'E003', type: 'error', message: 'CURP con estructura inválida', field: 'curp' },
    E004: { code: 'E004', type: 'error', message: 'Fecha de operación no puede ser futura', field: 'fecha_operacion' },
    E005: { code: 'E005', type: 'error', message: 'Formato de fecha inválido', field: 'fecha_operacion' },
    E006: { code: 'E006', type: 'error', message: 'Monto de operación inválido', field: 'monto' },
    E100: { code: 'E100', type: 'error', message: 'EXCEDE LÍMITE DE EFECTIVO PERMITIDO', field: 'monto_efectivo', blocking: true },
    W001: { code: 'W001', type: 'warning', message: 'Faltan datos del Beneficiario Controlador', field: 'beneficiario_controlador' },
};

// ============================================================================
// REGEX PATTERNS
// ============================================================================
const PATTERNS = {
    RFC: /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/,
    RFC_PF: /^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$/,
    RFC_PM: /^[A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{3}$/,
    CURP: /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z]{2}$/,
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    CODIGO_POSTAL: /^[0-9]{5}$/,
    FECHA_ISO: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
};

// ============================================================================
// VALIDATION ENGINE CLASS
// ============================================================================
class ValidationEngine {
    constructor(activityType, umaConfig = UMA_CONFIG) {
        this.activityType = activityType;
        this.umaConfig = umaConfig;
        this.today = new Date();
        this.today.setHours(0, 0, 0, 0);

        this.thresholdAviso = this.calculateThreshold('AVISO', activityType);
        this.thresholdEfectivo = this.calculateThreshold('EFECTIVO', activityType);
    }

    calculateThreshold(type, activity) {
        const thresholds = this.umaConfig.thresholds[type];
        const umaCount = thresholds[activity] || thresholds.DEFAULT;
        return umaCount * this.umaConfig.daily_value;
    }

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

        this.validateFormat(record, result);
        this.validateThresholds(record, result);

        if (result.requires_aviso) {
            this.validateIntegrity(record, result);
        }

        result.is_valid = result.errors.length === 0;
        result.has_warnings = result.warnings.length > 0;
        result.is_blocked = result.errors.some(e => e.blocking);

        return result;
    }

    validateFormat(record, result) {
        const tipoPersona = (record.tipo_persona || record.TIPO_PERSONA || '').toUpperCase();

        // RFC
        const rfc = (record.rfc_cliente || record.RFC_CLIENTE || '').toUpperCase().trim();
        if (rfc && !PATTERNS.RFC.test(rfc)) {
            result.errors.push({ ...VALIDATION_MESSAGES.E001, value: rfc });
        }

        // CURP (obligatorio para PF)
        if (tipoPersona === 'PF') {
            const curp = (record.curp_cliente || record.CURP || '').toUpperCase().trim();
            if (!curp) {
                result.errors.push({ ...VALIDATION_MESSAGES.E002 });
            } else if (!PATTERNS.CURP.test(curp)) {
                result.errors.push({ ...VALIDATION_MESSAGES.E003, value: curp });
            }
        }

        // Fecha de operación
        const fechaOp = this.parseDate(record.fecha_operacion || record.FECHA_OPERACION);
        if (fechaOp && fechaOp > this.today) {
            result.errors.push({ ...VALIDATION_MESSAGES.E004 });
        }

        // Monto
        const monto = this.parseNumber(record.monto_operacion || record.MONTO_OPERACION);
        if (isNaN(monto) || monto <= 0) {
            result.errors.push({ ...VALIDATION_MESSAGES.E006 });
        }
    }

    validateThresholds(record, result) {
        const montoOperacion = this.parseNumber(record.monto_operacion || record.MONTO_OPERACION) || 0;
        const montoEfectivo = this.parseNumber(record.monto_efectivo || record.MONTO_EFECTIVO) || 0;
        const formaPago = (record.forma_pago || record.FORMA_PAGO || '').toUpperCase();

        const incluyeEfectivo = montoEfectivo > 0 || formaPago === 'EFECTIVO' || formaPago === 'MIXTO';

        // Umbral de aviso
        if (montoOperacion >= this.thresholdAviso) {
            result.requires_aviso = true;
        }

        // Límite de efectivo
        if (incluyeEfectivo) {
            const efectivoReal = montoEfectivo > 0 ? montoEfectivo :
                (formaPago === 'EFECTIVO' ? montoOperacion : 0);

            if (efectivoReal > this.thresholdEfectivo) {
                result.errors.push({
                    ...VALIDATION_MESSAGES.E100,
                    blocking: true,
                    value: efectivoReal,
                    threshold: this.thresholdEfectivo,
                });
            }
        }
    }

    validateIntegrity(record, result) {
        const tipoPersona = (record.tipo_persona || record.TIPO_PERSONA || '').toUpperCase();

        // Beneficiario Controlador para PM
        if (tipoPersona === 'PM') {
            const bcFields = ['bc_nombre', 'BC_NOMBRE', 'bc_rfc', 'BC_RFC'];
            const hasBC = bcFields.some(f => record[f] && record[f] !== '');

            if (!hasBC) {
                result.warnings.push({ ...VALIDATION_MESSAGES.W001 });
            }
        }
    }

    parseDate(value) {
        if (!value) return null;
        if (value instanceof Date) return value;
        if (typeof value === 'string') {
            const cleaned = value.trim().split('T')[0];
            if (PATTERNS.FECHA_ISO.test(cleaned)) {
                return new Date(cleaned + 'T00:00:00');
            }
        }
        if (typeof value === 'number') {
            const excelEpoch = new Date(1899, 11, 30);
            return new Date(excelEpoch.getTime() + value * 86400000);
        }
        return null;
    }

    parseNumber(value) {
        if (value === null || value === undefined || value === '') return NaN;
        if (typeof value === 'number') return value;
        const cleaned = String(value).replace(/[$,]/g, '').trim();
        return parseFloat(cleaned);
    }
}

module.exports = {
    ValidationEngine,
    UMA_CONFIG,
    VALIDATION_MESSAGES,
    PATTERNS,
};
