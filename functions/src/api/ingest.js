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
// CATÁLOGO DE TIPOS DE OPERACIÓN POR ACTIVIDAD (SAT/LFPIORPI)
// Define los tipos válidos de operación para cada actividad vulnerable.
// Esto permite distinguir la naturaleza de cada operación (ej: depósito vs retiro,
// compra vs venta) lo cual es requerido para los avisos ante el SAT.
// ========================================
const TIPOS_OPERACION = {
    JUEGOS_APUESTAS: [
        'Depósito', 'Retiro', 'Apuesta', 'Premio', 'Compra de fichas',
        'Canje de fichas', 'Carga de cuenta', 'Ingreso', 'Cobro de premio',
        'Devolución',
    ],
    TARJETAS_PREPAGO: [
        'Emisión de tarjeta', 'Carga/Recarga', 'Retiro/Disposición',
        'Compra con tarjeta', 'Transferencia entre tarjetas', 'Cancelación/Reembolso',
    ],
    CHEQUES_VIAJERO: [
        'Emisión', 'Venta', 'Compra', 'Canje/Cobro', 'Reembolso',
    ],
    OPERACIONES_MUTUO: [
        'Otorgamiento de préstamo', 'Pago de préstamo', 'Otorgamiento de crédito',
        'Pago de crédito', 'Constitución de garantía', 'Liberación de garantía',
    ],
    INMUEBLES: [
        'Compra', 'Venta', 'Intermediación en compra', 'Intermediación en venta',
        'Desarrollo inmobiliario', 'Construcción', 'Permuta', 'Dación en pago',
        'Cesión de derechos', 'Fideicomiso',
    ],
    METALES_PIEDRAS: [
        'Compra', 'Venta', 'Empeño', 'Desempeño', 'Consignación',
        'Intercambio', 'Donación recibida', 'Subasta',
    ],
    OBRAS_ARTE: [
        'Compra', 'Venta', 'Subasta', 'Consignación', 'Permuta',
        'Intermediación', 'Donación recibida',
    ],
    VEHICULOS: [
        'Compra', 'Venta', 'Intermediación en compra', 'Intermediación en venta',
        'Consignación', 'Permuta', 'Donación recibida', 'Importación',
    ],
    BLINDAJE: [
        'Blindaje de vehículo', 'Blindaje de inmueble', 'Mantenimiento de blindaje',
        'Reparación de blindaje', 'Certificación de blindaje',
    ],
    TRASLADO_VALORES: [
        'Traslado de efectivo', 'Traslado de valores', 'Custodia de efectivo',
        'Custodia de valores', 'Resguardo', 'Entrega a destino',
    ],
    SERVICIOS_FE_PUBLICA: [
        'Compraventa de inmueble', 'Constitución de sociedad', 'Otorgamiento de poder',
        'Constitución de fideicomiso', 'Cesión de derechos', 'Donación',
        'Testamento', 'Protocolización', 'Ratificación de firmas',
    ],
    SERVICIOS_PROFESIONALES: [
        'Compraventa de inmuebles', 'Administración de activos',
        'Manejo de cuentas bancarias', 'Constitución de sociedades',
        'Constitución de fideicomisos', 'Asesoría fiscal patrimonial',
        'Asesoría legal patrimonial',
    ],
    ARRENDAMIENTO: [
        'Arrendamiento', 'Subarrendamiento', 'Renovación de contrato',
        'Depósito en garantía', 'Pago de renta mensual', 'Pago anticipado',
    ],
    ACTIVOS_VIRTUALES: [
        'Compra', 'Venta', 'Intercambio (swap)', 'Depósito', 'Retiro',
        'Transferencia', 'Conversión a moneda fiat', 'Conversión desde moneda fiat',
    ],
    CONSTITUCION_PERSONAS: [
        'Constitución de sociedad', 'Constitución de fideicomiso',
        'Modificación de escritura', 'Fusión', 'Escisión',
        'Aumento de capital', 'Disminución de capital', 'Disolución/Liquidación',
    ],
    DEFAULT: [
        'Compra', 'Venta', 'Depósito', 'Retiro', 'Otro',
    ],
};

// ========================================
// DEFINICIÓN DE COLUMNAS POR ACTIVIDAD
// type: 'catalog' indica que el campo tiene valores predefinidos en TIPOS_OPERACION
// ========================================

const ACTIVITY_COLUMNS = {
    INMUEBLES: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalogKey: 'INMUEBLES' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'folioReal', label: 'Folio Real', required: false, type: 'string' },
        { key: 'ubicacionInmueble', label: 'Ubicación Inmueble', required: true, type: 'string' },
        { key: 'tipoInmueble', label: 'Tipo Inmueble', required: true, type: 'string' },
    ],
    VEHICULOS: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalogKey: 'VEHICULOS' },
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
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalogKey: 'METALES_PIEDRAS' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'descripcionArticulo', label: 'Descripción Artículo', required: true, type: 'string' },
        { key: 'pesoQuilates', label: 'Peso/Quilates', required: false, type: 'string' },
    ],
    ACTIVOS_VIRTUALES: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalogKey: 'ACTIVOS_VIRTUALES' },
        { key: 'montoMXN', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'tipoActivoVirtual', label: 'Tipo Activo Virtual', required: true, type: 'string' },
        { key: 'cantidadTokens', label: 'Cantidad Tokens', required: true, type: 'number' },
    ],
    JUEGOS_APUESTAS: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalogKey: 'JUEGOS_APUESTAS' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'tipoJuego', label: 'Tipo Juego/Apuesta', required: true, type: 'string' },
        { key: 'premioObtenido', label: 'Premio Obtenido', required: false, type: 'number' },
    ],
    BLINDAJE: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalogKey: 'BLINDAJE' },
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
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalogKey: 'TARJETAS_PREPAGO' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'tipoTarjeta', label: 'Tipo Tarjeta', required: true, type: 'string' },
        { key: 'numeroTarjeta', label: 'Número Tarjeta', required: true, type: 'string' },
        { key: 'montoCargaOperacion', label: 'Monto Carga/Operación', required: true, type: 'number' },
    ],
    CHEQUES_VIAJERO: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalogKey: 'CHEQUES_VIAJERO' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'denominacionCheque', label: 'Denominación Cheque', required: true, type: 'string' },
        { key: 'cantidadCheques', label: 'Cantidad Cheques', required: true, type: 'number' },
        { key: 'moneda', label: 'Moneda', required: true, type: 'string' },
    ],
    OPERACIONES_MUTUO: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalogKey: 'OPERACIONES_MUTUO' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'tipoGarantia', label: 'Tipo Garantía', required: false, type: 'string' },
        { key: 'plazo', label: 'Plazo', required: true, type: 'string' },
        { key: 'tasaInteres', label: 'Tasa Interés', required: false, type: 'number' },
    ],
    OBRAS_ARTE: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalogKey: 'OBRAS_ARTE' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'descripcionObra', label: 'Descripción Obra', required: true, type: 'string' },
        { key: 'autorArtista', label: 'Autor/Artista', required: false, type: 'string' },
        { key: 'tecnicaMaterial', label: 'Técnica/Material', required: false, type: 'string' },
    ],
    TRASLADO_VALORES: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalogKey: 'TRASLADO_VALORES' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'origen', label: 'Origen', required: true, type: 'string' },
        { key: 'destino', label: 'Destino', required: true, type: 'string' },
        { key: 'tipoValorTrasladado', label: 'Tipo Valor Trasladado', required: true, type: 'string' },
    ],
    SERVICIOS_FE_PUBLICA: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalogKey: 'SERVICIOS_FE_PUBLICA' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'numeroInstrumento', label: 'Número Instrumento', required: true, type: 'string' },
        { key: 'tipoActoJuridico', label: 'Tipo Acto Jurídico', required: true, type: 'string' },
        { key: 'descripcionActo', label: 'Descripción Acto', required: false, type: 'string' },
    ],
    SERVICIOS_PROFESIONALES: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalogKey: 'SERVICIOS_PROFESIONALES' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'tipoServicio', label: 'Tipo Servicio', required: true, type: 'string' },
        { key: 'descripcionServicio', label: 'Descripción Servicio', required: true, type: 'string' },
    ],
    ARRENDAMIENTO: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalogKey: 'ARRENDAMIENTO' },
        { key: 'montoMensual', label: 'Monto Mensual (MXN)', required: true, type: 'number' },
        { key: 'rfcCliente', label: 'RFC Cliente', required: true, type: 'rfc' },
        { key: 'nombreCliente', label: 'Nombre Cliente', required: true, type: 'string' },
        { key: 'ubicacionInmueble', label: 'Ubicación Inmueble', required: true, type: 'string' },
        { key: 'tipoInmueble', label: 'Tipo Inmueble', required: true, type: 'string' },
        { key: 'plazoContrato', label: 'Plazo Contrato', required: false, type: 'string' },
    ],
    CONSTITUCION_PERSONAS: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalogKey: 'CONSTITUCION_PERSONAS' },
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
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalogKey: 'DEFAULT' },
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

            // Obtener catálogo de tipos de operación
            const catalogKey = columns.find(c => c.type === 'catalog')?.catalogKey || activityType;
            const tiposOperacion = TIPOS_OPERACION[catalogKey] || TIPOS_OPERACION[activityType] || TIPOS_OPERACION.DEFAULT;

            // Crear workbook
            const wb = XLSX.utils.book_new();

            // Crear hoja de catálogos (oculta, usada para validación de datos)
            const catalogData = [['Tipos de Operación'], ...tiposOperacion.map(t => [t])];
            const wsCatalog = XLSX.utils.aoa_to_sheet(catalogData);
            wsCatalog['!cols'] = [{ wch: 35 }];

            // Crear hoja de datos con headers
            const headers = columns.map(col => col.label);
            const wsData = [headers];

            // Agregar 3 filas de ejemplo vacías
            for (let i = 0; i < 3; i++) {
                wsData.push(columns.map(() => ''));
            }

            const ws = XLSX.utils.aoa_to_sheet(wsData);

            // Ajustar anchos de columna
            ws['!cols'] = columns.map(col => ({
                wch: col.type === 'catalog' ? 30 : 20
            }));

            // Agregar validación de datos para columnas de tipo 'catalog'
            // Usamos una lista de valores directamente en la celda
            const catalogColIndex = columns.findIndex(c => c.type === 'catalog');
            if (catalogColIndex >= 0) {
                // Crear data validation con lista de valores
                const dvFormula = `"${tiposOperacion.join(',')}"`;
                ws['!dataValidation'] = ws['!dataValidation'] || [];

                // Aplicar validación a las filas 2-1001 (columna del catálogo)
                const colLetter = String.fromCharCode(65 + catalogColIndex); // A=0, B=1, etc
                ws['!dataValidation'].push({
                    ref: `${colLetter}2:${colLetter}1001`,
                    type: 'list',
                    operator: 'between',
                    formula1: dvFormula,
                    showDropDown: true,
                    showErrorMessage: true,
                    errorTitle: 'Tipo de Operación Inválido',
                    error: `Selecciona un tipo válido: ${tiposOperacion.join(', ')}`,
                    errorStyle: 'warning',
                });
            }

            // Agregar hoja de instrucciones
            const instructionsData = [
                ['INSTRUCCIONES DE LLENADO'],
                [''],
                ['1. Complete todas las columnas marcadas como obligatorias'],
                ['2. Formato de fecha: DD/MM/YYYY o YYYY-MM-DD'],
                ['3. Formato de RFC: 12 caracteres (Persona Moral) o 13 caracteres (Persona Física)'],
                ['4. Los montos deben ser numéricos sin símbolos de moneda'],
                ['5. La columna "Tipo Operación" debe usar uno de los valores del catálogo'],
                [''],
                ['COLUMNAS OBLIGATORIAS:'],
                ...columns.filter(c => c.required).map(c => [`- ${c.label}${c.type === 'catalog' ? ' (ver catálogo abajo)' : ''}`]),
                [''],
                ['COLUMNAS OPCIONALES:'],
                ...columns.filter(c => !c.required).map(c => [`- ${c.label}`]),
                [''],
                ['═══════════════════════════════════════════════'],
                ['CATÁLOGO DE TIPOS DE OPERACIÓN'],
                [`Actividad: ${activityType.replace(/_/g, ' ')}`],
                ['═══════════════════════════════════════════════'],
                [''],
                ['Los siguientes son los tipos válidos de operación para esta actividad:'],
                [''],
                ...tiposOperacion.map((t, i) => [`${i + 1}. ${t}`]),
                [''],
                ['NOTA: En la hoja "Operaciones", la columna "Tipo Operación" tiene'],
                ['un menú desplegable con estos valores. Seleccione el que corresponda.'],
                ['Esto es requerido para clasificar correctamente la operación en el'],
                ['aviso ante el SAT.'],
            ];

            const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsData);
            wsInstructions['!cols'] = [{ wch: 60 }];

            // Agregar hojas al workbook
            XLSX.utils.book_append_sheet(wb, ws, 'Operaciones');
            XLSX.utils.book_append_sheet(wb, wsCatalog, 'Catálogos');
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

                        case 'catalog': {
                            const cleanValue = String(value).trim();
                            const catKey = colDef.catalogKey || activityType;
                            const validValues = TIPOS_OPERACION[catKey] || TIPOS_OPERACION.DEFAULT;
                            // Buscar match case-insensitive
                            const matched = validValues.find(v => v.toLowerCase() === cleanValue.toLowerCase());
                            if (matched) {
                                rowData[key] = matched; // Guardar con formato correcto del catálogo
                            } else {
                                // Advertencia pero no bloquear — guardar el valor y agregar warning
                                rowData[key] = cleanValue;
                                rowErrors.push(`Tipo de operación "${cleanValue}" no está en el catálogo. Valores válidos: ${validValues.join(', ')}`);
                            }
                            break;
                        }

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
