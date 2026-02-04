/**
 * Ingest API — Motor de carga de datos Excel para actividades vulnerables
 *
 * Genera plantillas Excel con:
 * - Columnas oficiales SAT/SPPLD por actividad (Operación, Cliente, Domicilio, Beneficiario)
 * - Data Validations reales (dropdowns) usando exceljs
 * - Hoja de Catálogos oculta para listas desplegables
 * - Encabezados formateados con secciones por color
 *
 * Procesa uploads con validación contra catálogos SAT
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';


// ============================================================================
// CATÁLOGOS SAT — Listas desplegables oficiales
// ============================================================================

const CATALOGS = {
    tipoPersona: [
        { value: '1', label: '1-Física' },
        { value: '2', label: '2-Moral' },
    ],
    moneda: [
        { value: '1', label: '1-MXN' },
        { value: '2', label: '2-USD' },
        { value: '3', label: '3-EUR' },
        { value: '4', label: '4-Otro' },
    ],
    instrumentoMonetario: [
        { value: '1', label: '1-Efectivo' },
        { value: '2', label: '2-Cheque' },
        { value: '3', label: '3-Transferencia' },
        { value: '4', label: '4-Tarjeta Crédito/Débito' },
        { value: '5', label: '5-Fichas/Equivalente' },
        { value: '6', label: '6-Dispositivo electrónico' },
        { value: '7', label: '7-Monedero electrónico' },
        { value: '8', label: '8-Otro' },
    ],
    actuaNombrePropio: [
        { value: 'SI', label: 'SI' },
        { value: 'NO', label: 'NO' },
    ],
    pais: [
        { value: 'MX', label: 'MX-México' },
        { value: 'US', label: 'US-Estados Unidos' },
        { value: 'CA', label: 'CA-Canadá' },
        { value: 'ES', label: 'ES-España' },
        { value: 'GB', label: 'GB-Reino Unido' },
        { value: 'FR', label: 'FR-Francia' },
        { value: 'DE', label: 'DE-Alemania' },
        { value: 'CN', label: 'CN-China' },
        { value: 'JP', label: 'JP-Japón' },
        { value: 'BR', label: 'BR-Brasil' },
        { value: 'CO', label: 'CO-Colombia' },
        { value: 'AR', label: 'AR-Argentina' },
        { value: 'OT', label: 'OT-Otro' },
    ],
};

// ============================================================================
// TIPOS DE OPERACIÓN POR ACTIVIDAD (SAT/LFPIORPI)
// ============================================================================

const TIPOS_OPERACION = {
    JUEGOS_APUESTAS: [
        { value: '1', label: '1-Compra boletos/fichas' },
        { value: '2', label: '2-Pago de premios' },
        { value: '3', label: '3-Reembolso' },
        { value: '4', label: '4-Depósito/Carga de cuenta' },
        { value: '5', label: '5-Retiro/Cobro' },
        { value: '6', label: '6-Apuesta' },
        { value: '7', label: '7-Otro' },
    ],
    TARJETAS_PREPAGO: [
        { value: '1', label: '1-Emisión de tarjeta' },
        { value: '2', label: '2-Carga/Recarga' },
        { value: '3', label: '3-Retiro/Disposición' },
        { value: '4', label: '4-Compra con tarjeta' },
        { value: '5', label: '5-Transferencia entre tarjetas' },
        { value: '6', label: '6-Cancelación/Reembolso' },
        { value: '7', label: '7-Otro' },
    ],
    CHEQUES_VIAJERO: [
        { value: '1', label: '1-Emisión' },
        { value: '2', label: '2-Venta' },
        { value: '3', label: '3-Compra' },
        { value: '4', label: '4-Canje/Cobro' },
        { value: '5', label: '5-Reembolso' },
        { value: '6', label: '6-Otro' },
    ],
    OPERACIONES_MUTUO: [
        { value: '1', label: '1-Otorgamiento de préstamo' },
        { value: '2', label: '2-Pago de préstamo' },
        { value: '3', label: '3-Otorgamiento de crédito' },
        { value: '4', label: '4-Pago de crédito' },
        { value: '5', label: '5-Constitución de garantía' },
        { value: '6', label: '6-Liberación de garantía' },
        { value: '7', label: '7-Otro' },
    ],
    INMUEBLES: [
        { value: '1', label: '1-Compra' },
        { value: '2', label: '2-Venta' },
        { value: '3', label: '3-Intermediación en compra' },
        { value: '4', label: '4-Intermediación en venta' },
        { value: '5', label: '5-Desarrollo inmobiliario' },
        { value: '6', label: '6-Construcción' },
        { value: '7', label: '7-Permuta' },
        { value: '8', label: '8-Dación en pago' },
        { value: '9', label: '9-Cesión de derechos' },
        { value: '10', label: '10-Fideicomiso' },
        { value: '11', label: '11-Otro' },
    ],
    METALES_PIEDRAS: [
        { value: '1', label: '1-Compra' },
        { value: '2', label: '2-Venta' },
        { value: '3', label: '3-Empeño' },
        { value: '4', label: '4-Desempeño' },
        { value: '5', label: '5-Consignación' },
        { value: '6', label: '6-Subasta' },
        { value: '7', label: '7-Intercambio' },
        { value: '8', label: '8-Otro' },
    ],
    OBRAS_ARTE: [
        { value: '1', label: '1-Compra' },
        { value: '2', label: '2-Venta' },
        { value: '3', label: '3-Subasta' },
        { value: '4', label: '4-Consignación' },
        { value: '5', label: '5-Permuta' },
        { value: '6', label: '6-Intermediación' },
        { value: '7', label: '7-Otro' },
    ],
    VEHICULOS: [
        { value: '1', label: '1-Compra' },
        { value: '2', label: '2-Venta' },
        { value: '3', label: '3-Intermediación en compra' },
        { value: '4', label: '4-Intermediación en venta' },
        { value: '5', label: '5-Consignación' },
        { value: '6', label: '6-Permuta' },
        { value: '7', label: '7-Importación' },
        { value: '8', label: '8-Otro' },
    ],
    BLINDAJE: [
        { value: '1', label: '1-Blindaje de vehículo' },
        { value: '2', label: '2-Blindaje de inmueble' },
        { value: '3', label: '3-Mantenimiento de blindaje' },
        { value: '4', label: '4-Reparación de blindaje' },
        { value: '5', label: '5-Certificación' },
        { value: '6', label: '6-Otro' },
    ],
    TRASLADO_VALORES: [
        { value: '1', label: '1-Traslado de efectivo' },
        { value: '2', label: '2-Traslado de valores' },
        { value: '3', label: '3-Custodia de efectivo' },
        { value: '4', label: '4-Custodia de valores' },
        { value: '5', label: '5-Resguardo' },
        { value: '6', label: '6-Otro' },
    ],
    SERVICIOS_FE_PUBLICA: [
        { value: '1', label: '1-Compraventa de inmueble' },
        { value: '2', label: '2-Constitución de sociedad' },
        { value: '3', label: '3-Otorgamiento de poder' },
        { value: '4', label: '4-Constitución de fideicomiso' },
        { value: '5', label: '5-Cesión de derechos' },
        { value: '6', label: '6-Donación' },
        { value: '7', label: '7-Testamento' },
        { value: '8', label: '8-Protocolización' },
        { value: '9', label: '9-Ratificación de firmas' },
        { value: '10', label: '10-Otro' },
    ],
    SERVICIOS_PROFESIONALES: [
        { value: '1', label: '1-Compraventa de inmuebles' },
        { value: '2', label: '2-Administración de activos' },
        { value: '3', label: '3-Manejo de cuentas bancarias' },
        { value: '4', label: '4-Constitución de sociedades' },
        { value: '5', label: '5-Constitución de fideicomisos' },
        { value: '6', label: '6-Asesoría fiscal/patrimonial' },
        { value: '7', label: '7-Otro' },
    ],
    ARRENDAMIENTO: [
        { value: '1', label: '1-Arrendamiento' },
        { value: '2', label: '2-Subarrendamiento' },
        { value: '3', label: '3-Renovación de contrato' },
        { value: '4', label: '4-Depósito en garantía' },
        { value: '5', label: '5-Pago de renta' },
        { value: '6', label: '6-Pago anticipado' },
        { value: '7', label: '7-Otro' },
    ],
    ACTIVOS_VIRTUALES: [
        { value: '1', label: '1-Compra' },
        { value: '2', label: '2-Venta' },
        { value: '3', label: '3-Intercambio (swap)' },
        { value: '4', label: '4-Depósito' },
        { value: '5', label: '5-Retiro' },
        { value: '6', label: '6-Transferencia' },
        { value: '7', label: '7-Conversión a moneda fiat' },
        { value: '8', label: '8-Conversión desde moneda fiat' },
        { value: '9', label: '9-Otro' },
    ],
    CONSTITUCION_PERSONAS: [
        { value: '1', label: '1-Constitución de sociedad' },
        { value: '2', label: '2-Constitución de fideicomiso' },
        { value: '3', label: '3-Modificación de escritura' },
        { value: '4', label: '4-Fusión' },
        { value: '5', label: '5-Escisión' },
        { value: '6', label: '6-Aumento de capital' },
        { value: '7', label: '7-Disminución de capital' },
        { value: '8', label: '8-Disolución/Liquidación' },
        { value: '9', label: '9-Otro' },
    ],
    DEFAULT: [
        { value: '1', label: '1-Compra' },
        { value: '2', label: '2-Venta' },
        { value: '3', label: '3-Depósito' },
        { value: '4', label: '4-Retiro' },
        { value: '5', label: '5-Otro' },
    ],
};


// ============================================================================
// COLUMNAS BASE (Comunes a todas las actividades)
// Secciones: Operación, Cliente, Domicilio, Beneficiario Controlador
// ============================================================================

// Sección CLIENTE (persona del aviso)
const CLIENT_COLUMNS = [
    { key: 'tipoPersona', label: 'Tipo Persona', required: true, type: 'catalog', catalog: 'tipoPersona', section: 'cliente' },
    { key: 'rfcCliente', label: 'RFC', required: true, type: 'rfc', section: 'cliente' },
    { key: 'curp', label: 'CURP', required: false, type: 'string', section: 'cliente', note: 'Solo personas físicas' },
    { key: 'nombreCliente', label: 'Nombre / Razón Social', required: true, type: 'string', section: 'cliente' },
    { key: 'apellidoPaterno', label: 'Apellido Paterno', required: false, type: 'string', section: 'cliente', note: 'Solo personas físicas' },
    { key: 'apellidoMaterno', label: 'Apellido Materno', required: false, type: 'string', section: 'cliente', note: 'Solo personas físicas' },
    { key: 'fechaNacimiento', label: 'Fecha Nacimiento/Constitución', required: false, type: 'date', section: 'cliente' },
    { key: 'telefono', label: 'Teléfono', required: false, type: 'string', section: 'cliente' },
    { key: 'actividadEconomica', label: 'Actividad Económica', required: false, type: 'string', section: 'cliente' },
];

// Sección DOMICILIO
const ADDRESS_COLUMNS = [
    { key: 'calle', label: 'Calle', required: false, type: 'string', section: 'domicilio' },
    { key: 'noExterior', label: 'No. Exterior', required: false, type: 'string', section: 'domicilio' },
    { key: 'noInterior', label: 'No. Interior', required: false, type: 'string', section: 'domicilio' },
    { key: 'colonia', label: 'Colonia', required: false, type: 'string', section: 'domicilio' },
    { key: 'codigoPostal', label: 'Código Postal', required: false, type: 'string', section: 'domicilio' },
    { key: 'ciudad', label: 'Ciudad/Municipio', required: false, type: 'string', section: 'domicilio' },
    { key: 'estado', label: 'Estado', required: false, type: 'string', section: 'domicilio' },
    { key: 'pais', label: 'País', required: false, type: 'catalog', catalog: 'pais', section: 'domicilio' },
];

// Sección BENEFICIARIO CONTROLADOR
const BENEFICIARY_COLUMNS = [
    { key: 'actuaNombrePropio', label: '¿Actúa a nombre propio?', required: true, type: 'catalog', catalog: 'actuaNombrePropio', section: 'beneficiario' },
    { key: 'nombreBeneficiario', label: 'Nombre Dueño Beneficiario', required: false, type: 'string', section: 'beneficiario', note: 'Requerido si NO actúa a nombre propio' },
    { key: 'apellidoPaternoBeneficiario', label: 'Ap. Paterno Beneficiario', required: false, type: 'string', section: 'beneficiario' },
    { key: 'apellidoMaternoBeneficiario', label: 'Ap. Materno Beneficiario', required: false, type: 'string', section: 'beneficiario' },
    { key: 'rfcBeneficiario', label: 'RFC Beneficiario', required: false, type: 'rfc', section: 'beneficiario' },
];


// ============================================================================
// COLUMNAS ESPECÍFICAS DE OPERACIÓN POR ACTIVIDAD
// Incluyen: fecha, tipo operación, monto, moneda, instrumento + campos propios
// ============================================================================

const OPERATION_COLUMNS = {
    JUEGOS_APUESTAS: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date', section: 'operacion' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalog: 'tipoOp', section: 'operacion' },
        { key: 'monto', label: 'Monto Operación', required: true, type: 'number', section: 'operacion' },
        { key: 'moneda', label: 'Moneda', required: true, type: 'catalog', catalog: 'moneda', section: 'operacion' },
        { key: 'instrumentoMonetario', label: 'Instrumento Monetario', required: true, type: 'catalog', catalog: 'instrumentoMonetario', section: 'operacion' },
        { key: 'tipoJuego', label: 'Tipo Juego/Sorteo', required: true, type: 'string', section: 'operacion' },
        { key: 'premioObtenido', label: 'Premio Obtenido', required: false, type: 'number', section: 'operacion' },
    ],
    TARJETAS_PREPAGO: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date', section: 'operacion' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalog: 'tipoOp', section: 'operacion' },
        { key: 'monto', label: 'Monto Operación', required: true, type: 'number', section: 'operacion' },
        { key: 'moneda', label: 'Moneda', required: true, type: 'catalog', catalog: 'moneda', section: 'operacion' },
        { key: 'instrumentoMonetario', label: 'Instrumento Monetario', required: true, type: 'catalog', catalog: 'instrumentoMonetario', section: 'operacion' },
        { key: 'tipoTarjeta', label: 'Tipo Tarjeta', required: true, type: 'string', section: 'operacion' },
        { key: 'numeroTarjeta', label: 'Número Tarjeta', required: true, type: 'string', section: 'operacion' },
    ],
    CHEQUES_VIAJERO: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date', section: 'operacion' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalog: 'tipoOp', section: 'operacion' },
        { key: 'monto', label: 'Monto Operación', required: true, type: 'number', section: 'operacion' },
        { key: 'moneda', label: 'Moneda', required: true, type: 'catalog', catalog: 'moneda', section: 'operacion' },
        { key: 'instrumentoMonetario', label: 'Instrumento Monetario', required: true, type: 'catalog', catalog: 'instrumentoMonetario', section: 'operacion' },
        { key: 'denominacionCheque', label: 'Denominación Cheque', required: true, type: 'string', section: 'operacion' },
        { key: 'cantidadCheques', label: 'Cantidad Cheques', required: true, type: 'number', section: 'operacion' },
    ],
    OPERACIONES_MUTUO: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date', section: 'operacion' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalog: 'tipoOp', section: 'operacion' },
        { key: 'monto', label: 'Monto Operación', required: true, type: 'number', section: 'operacion' },
        { key: 'moneda', label: 'Moneda', required: true, type: 'catalog', catalog: 'moneda', section: 'operacion' },
        { key: 'instrumentoMonetario', label: 'Instrumento Monetario', required: true, type: 'catalog', catalog: 'instrumentoMonetario', section: 'operacion' },
        { key: 'tipoGarantia', label: 'Tipo Garantía', required: false, type: 'string', section: 'operacion' },
        { key: 'plazo', label: 'Plazo', required: true, type: 'string', section: 'operacion' },
        { key: 'tasaInteres', label: 'Tasa Interés (%)', required: false, type: 'number', section: 'operacion' },
    ],
    INMUEBLES: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date', section: 'operacion' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalog: 'tipoOp', section: 'operacion' },
        { key: 'monto', label: 'Monto Operación', required: true, type: 'number', section: 'operacion' },
        { key: 'moneda', label: 'Moneda', required: true, type: 'catalog', catalog: 'moneda', section: 'operacion' },
        { key: 'instrumentoMonetario', label: 'Instrumento Monetario', required: true, type: 'catalog', catalog: 'instrumentoMonetario', section: 'operacion' },
        { key: 'folioReal', label: 'Folio Real', required: false, type: 'string', section: 'operacion' },
        { key: 'ubicacionInmueble', label: 'Ubicación Inmueble', required: true, type: 'string', section: 'operacion' },
        { key: 'tipoInmueble', label: 'Tipo Inmueble', required: true, type: 'string', section: 'operacion' },
    ],
    METALES_PIEDRAS: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date', section: 'operacion' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalog: 'tipoOp', section: 'operacion' },
        { key: 'monto', label: 'Monto Operación', required: true, type: 'number', section: 'operacion' },
        { key: 'moneda', label: 'Moneda', required: true, type: 'catalog', catalog: 'moneda', section: 'operacion' },
        { key: 'instrumentoMonetario', label: 'Instrumento Monetario', required: true, type: 'catalog', catalog: 'instrumentoMonetario', section: 'operacion' },
        { key: 'descripcionArticulo', label: 'Descripción Artículo', required: true, type: 'string', section: 'operacion' },
        { key: 'pesoQuilates', label: 'Peso/Quilates', required: false, type: 'string', section: 'operacion' },
    ],
    OBRAS_ARTE: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date', section: 'operacion' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalog: 'tipoOp', section: 'operacion' },
        { key: 'monto', label: 'Monto Operación', required: true, type: 'number', section: 'operacion' },
        { key: 'moneda', label: 'Moneda', required: true, type: 'catalog', catalog: 'moneda', section: 'operacion' },
        { key: 'instrumentoMonetario', label: 'Instrumento Monetario', required: true, type: 'catalog', catalog: 'instrumentoMonetario', section: 'operacion' },
        { key: 'descripcionObra', label: 'Descripción Obra', required: true, type: 'string', section: 'operacion' },
        { key: 'autorArtista', label: 'Autor/Artista', required: false, type: 'string', section: 'operacion' },
        { key: 'tecnicaMaterial', label: 'Técnica/Material', required: false, type: 'string', section: 'operacion' },
    ],
    VEHICULOS: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date', section: 'operacion' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalog: 'tipoOp', section: 'operacion' },
        { key: 'monto', label: 'Monto Operación', required: true, type: 'number', section: 'operacion' },
        { key: 'moneda', label: 'Moneda', required: true, type: 'catalog', catalog: 'moneda', section: 'operacion' },
        { key: 'instrumentoMonetario', label: 'Instrumento Monetario', required: true, type: 'catalog', catalog: 'instrumentoMonetario', section: 'operacion' },
        { key: 'serieNIV', label: 'Serie/NIV', required: true, type: 'string', section: 'operacion' },
        { key: 'marca', label: 'Marca', required: true, type: 'string', section: 'operacion' },
        { key: 'modelo', label: 'Modelo', required: true, type: 'string', section: 'operacion' },
        { key: 'anio', label: 'Año', required: true, type: 'number', section: 'operacion' },
    ],
    BLINDAJE: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date', section: 'operacion' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalog: 'tipoOp', section: 'operacion' },
        { key: 'monto', label: 'Monto Operación', required: true, type: 'number', section: 'operacion' },
        { key: 'moneda', label: 'Moneda', required: true, type: 'catalog', catalog: 'moneda', section: 'operacion' },
        { key: 'instrumentoMonetario', label: 'Instrumento Monetario', required: true, type: 'catalog', catalog: 'instrumentoMonetario', section: 'operacion' },
        { key: 'tipoBlindaje', label: 'Tipo Blindaje', required: true, type: 'string', section: 'operacion' },
        { key: 'nivelBlindaje', label: 'Nivel Blindaje', required: true, type: 'string', section: 'operacion' },
        { key: 'descripcionBienBlindado', label: 'Descripción Bien Blindado', required: true, type: 'string', section: 'operacion' },
    ],
    TRASLADO_VALORES: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date', section: 'operacion' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalog: 'tipoOp', section: 'operacion' },
        { key: 'monto', label: 'Monto Operación', required: true, type: 'number', section: 'operacion' },
        { key: 'moneda', label: 'Moneda', required: true, type: 'catalog', catalog: 'moneda', section: 'operacion' },
        { key: 'instrumentoMonetario', label: 'Instrumento Monetario', required: true, type: 'catalog', catalog: 'instrumentoMonetario', section: 'operacion' },
        { key: 'origen', label: 'Origen', required: true, type: 'string', section: 'operacion' },
        { key: 'destino', label: 'Destino', required: true, type: 'string', section: 'operacion' },
        { key: 'tipoValorTrasladado', label: 'Tipo Valor Trasladado', required: true, type: 'string', section: 'operacion' },
    ],
    SERVICIOS_FE_PUBLICA: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date', section: 'operacion' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalog: 'tipoOp', section: 'operacion' },
        { key: 'monto', label: 'Monto Operación', required: true, type: 'number', section: 'operacion' },
        { key: 'moneda', label: 'Moneda', required: true, type: 'catalog', catalog: 'moneda', section: 'operacion' },
        { key: 'instrumentoMonetario', label: 'Instrumento Monetario', required: true, type: 'catalog', catalog: 'instrumentoMonetario', section: 'operacion' },
        { key: 'numeroInstrumento', label: 'Número Instrumento Notarial', required: true, type: 'string', section: 'operacion' },
        { key: 'tipoActoJuridico', label: 'Tipo Acto Jurídico', required: true, type: 'string', section: 'operacion' },
        { key: 'descripcionActo', label: 'Descripción Acto', required: false, type: 'string', section: 'operacion' },
    ],
    SERVICIOS_PROFESIONALES: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date', section: 'operacion' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalog: 'tipoOp', section: 'operacion' },
        { key: 'monto', label: 'Monto Operación', required: true, type: 'number', section: 'operacion' },
        { key: 'moneda', label: 'Moneda', required: true, type: 'catalog', catalog: 'moneda', section: 'operacion' },
        { key: 'instrumentoMonetario', label: 'Instrumento Monetario', required: true, type: 'catalog', catalog: 'instrumentoMonetario', section: 'operacion' },
        { key: 'tipoServicio', label: 'Tipo Servicio', required: true, type: 'string', section: 'operacion' },
        { key: 'descripcionServicio', label: 'Descripción Servicio', required: true, type: 'string', section: 'operacion' },
    ],
    ARRENDAMIENTO: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date', section: 'operacion' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalog: 'tipoOp', section: 'operacion' },
        { key: 'monto', label: 'Monto Mensual', required: true, type: 'number', section: 'operacion' },
        { key: 'moneda', label: 'Moneda', required: true, type: 'catalog', catalog: 'moneda', section: 'operacion' },
        { key: 'instrumentoMonetario', label: 'Instrumento Monetario', required: true, type: 'catalog', catalog: 'instrumentoMonetario', section: 'operacion' },
        { key: 'ubicacionInmueble', label: 'Ubicación Inmueble', required: true, type: 'string', section: 'operacion' },
        { key: 'tipoInmueble', label: 'Tipo Inmueble', required: true, type: 'string', section: 'operacion' },
        { key: 'plazoContrato', label: 'Plazo Contrato', required: false, type: 'string', section: 'operacion' },
    ],
    ACTIVOS_VIRTUALES: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date', section: 'operacion' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalog: 'tipoOp', section: 'operacion' },
        { key: 'monto', label: 'Monto (MXN)', required: true, type: 'number', section: 'operacion' },
        { key: 'moneda', label: 'Moneda', required: true, type: 'catalog', catalog: 'moneda', section: 'operacion' },
        { key: 'instrumentoMonetario', label: 'Instrumento Monetario', required: true, type: 'catalog', catalog: 'instrumentoMonetario', section: 'operacion' },
        { key: 'tipoActivoVirtual', label: 'Tipo Activo Virtual', required: true, type: 'string', section: 'operacion' },
        { key: 'cantidadTokens', label: 'Cantidad Tokens', required: true, type: 'number', section: 'operacion' },
    ],
    CONSTITUCION_PERSONAS: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date', section: 'operacion' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalog: 'tipoOp', section: 'operacion' },
        { key: 'monto', label: 'Monto Operación', required: true, type: 'number', section: 'operacion' },
        { key: 'moneda', label: 'Moneda', required: true, type: 'catalog', catalog: 'moneda', section: 'operacion' },
        { key: 'instrumentoMonetario', label: 'Instrumento Monetario', required: true, type: 'catalog', catalog: 'instrumentoMonetario', section: 'operacion' },
        { key: 'denominacionRazonSocial', label: 'Denominación/Razón Social', required: true, type: 'string', section: 'operacion' },
        { key: 'tipoPersonaMoral', label: 'Tipo Persona Moral', required: true, type: 'string', section: 'operacion' },
        { key: 'objetoSocial', label: 'Objeto Social', required: false, type: 'string', section: 'operacion' },
        { key: 'capitalSocial', label: 'Capital Social', required: false, type: 'number', section: 'operacion' },
    ],
    DEFAULT: [
        { key: 'fechaOperacion', label: 'Fecha Operación', required: true, type: 'date', section: 'operacion' },
        { key: 'tipoOperacion', label: 'Tipo Operación', required: true, type: 'catalog', catalog: 'tipoOp', section: 'operacion' },
        { key: 'monto', label: 'Monto Operación', required: true, type: 'number', section: 'operacion' },
        { key: 'moneda', label: 'Moneda', required: true, type: 'catalog', catalog: 'moneda', section: 'operacion' },
        { key: 'instrumentoMonetario', label: 'Instrumento Monetario', required: true, type: 'catalog', catalog: 'instrumentoMonetario', section: 'operacion' },
        { key: 'descripcion', label: 'Descripción', required: false, type: 'string', section: 'operacion' },
    ],
};

/**
 * Build full column list for an activity:
 * [Operation columns] + [Client columns] + [Address columns] + [Beneficiary columns]
 */
function getAllColumns(activityType) {
    const opCols = OPERATION_COLUMNS[activityType] || OPERATION_COLUMNS.DEFAULT;
    return [...opCols, ...CLIENT_COLUMNS, ...ADDRESS_COLUMNS, ...BENEFICIARY_COLUMNS];
}

// ============================================================================
// SECTION COLORS for Excel headers
// ============================================================================
const SECTION_COLORS = {
    operacion: { fill: '1E3A8A', font: 'FFFFFF' },   // Blue
    cliente: { fill: '065F46', font: 'FFFFFF' },       // Green
    domicilio: { fill: '7C2D12', font: 'FFFFFF' },     // Brown
    beneficiario: { fill: '581C87', font: 'FFFFFF' },   // Purple
};


// ============================================================================
// VALIDADORES
// ============================================================================

const RFC_REGEX = /^([A-ZÑ&]{3,4})(\d{6})([A-Z\d]{3})$/;

function validateRFC(rfc) {
    if (!rfc || typeof rfc !== 'string') return false;
    const cleanRfc = rfc.toUpperCase().trim();
    return RFC_REGEX.test(cleanRfc) && (cleanRfc.length === 12 || cleanRfc.length === 13);
}

function validateDate(dateValue) {
    if (!dateValue) return false;
    if (typeof dateValue === 'number') return dateValue > 0;
    if (typeof dateValue === 'string') return !isNaN(new Date(dateValue).getTime());
    if (dateValue instanceof Date) return !isNaN(dateValue.getTime());
    return false;
}

function parseDate(dateValue) {
    if (typeof dateValue === 'number') {
        const excelEpoch = new Date(1899, 11, 30);
        return new Date(excelEpoch.getTime() + dateValue * 86400000).toISOString().split('T')[0];
    }
    if (dateValue instanceof Date) return dateValue.toISOString().split('T')[0];
    if (typeof dateValue === 'string') return new Date(dateValue).toISOString().split('T')[0];
    return null;
}

function validateNumber(value) {
    if (value === null || value === undefined || value === '') return false;
    return !isNaN(Number(value)) && Number(value) >= 0;
}


// ============================================================================
// CLOUD FUNCTION: getTemplate
// Genera plantilla Excel con ExcelJS (data validations reales)
// ============================================================================

export const getTemplate = onCall(
    { region: 'us-central1', memory: '512MiB' },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Debes iniciar sesión');
        }

        const { activityType } = request.data;
        if (!activityType) {
            throw new HttpsError('invalid-argument', 'El tipo de actividad es requerido');
        }

        try {
            const columns = getAllColumns(activityType);
            const tiposOp = TIPOS_OPERACION[activityType] || TIPOS_OPERACION.DEFAULT;

            // Create workbook
            const wb = new ExcelJS.Workbook();
            wb.creator = 'PLD BDU';
            wb.created = new Date();

            // ── HOJA: Catálogos (hidden, used for data validation references) ──
            const wsCat = wb.addWorksheet('Catalogos', { state: 'veryHidden' });

            // Write each catalog in a separate column
            const catalogPositions = {}; // { catalogName: { col, count } }
            let catCol = 1;

            // Tipo Operación (activity-specific)
            wsCat.getCell(1, catCol).value = 'TipoOperacion';
            tiposOp.forEach((item, i) => {
                wsCat.getCell(i + 2, catCol).value = item.label;
            });
            catalogPositions['tipoOp'] = { col: catCol, count: tiposOp.length };
            catCol++;

            // Generic catalogs
            for (const [catName, items] of Object.entries(CATALOGS)) {
                wsCat.getCell(1, catCol).value = catName;
                items.forEach((item, i) => {
                    wsCat.getCell(i + 2, catCol).value = item.label;
                });
                catalogPositions[catName] = { col: catCol, count: items.length };
                catCol++;
            }

            // Helper: get Excel column letter
            function colLetter(num) {
                let result = '';
                while (num > 0) {
                    num--;
                    result = String.fromCharCode(65 + (num % 26)) + result;
                    num = Math.floor(num / 26);
                }
                return result;
            }

            // Helper: get catalog range formula for data validation
            function getCatalogFormula(catalogName) {
                const pos = catalogPositions[catalogName];
                if (!pos) return null;
                const letter = colLetter(pos.col);
                return `Catalogos!$${letter}$2:$${letter}$${pos.count + 1}`;
            }

            // ── HOJA: Operaciones (main data entry) ──
            const wsOps = wb.addWorksheet('Operaciones');

            // Set column widths and headers
            columns.forEach((col, idx) => {
                const colNum = idx + 1;
                const cell = wsOps.getCell(1, colNum);

                // Header text
                const headerText = col.required ? `${col.label} *` : col.label;
                cell.value = headerText;

                // Section-based styling
                const sectionStyle = SECTION_COLORS[col.section] || SECTION_COLORS.operacion;
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: `FF${sectionStyle.fill}` },
                };
                cell.font = {
                    bold: true,
                    color: { argb: `FF${sectionStyle.font}` },
                    size: 10,
                };
                cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'medium' },
                    right: { style: 'thin' },
                };

                // Column width
                const w = col.type === 'catalog' ? 28 : col.label.length > 18 ? col.label.length + 4 : 20;
                wsOps.getColumn(colNum).width = w;

                // Add data validation for catalog columns
                if (col.type === 'catalog' && col.catalog) {
                    const formula = getCatalogFormula(col.catalog);
                    if (formula) {
                        // Apply to rows 2-1001
                        for (let row = 2; row <= 1001; row++) {
                            wsOps.getCell(row, colNum).dataValidation = {
                                type: 'list',
                                allowBlank: !col.required,
                                formulae: [formula],
                                showErrorMessage: true,
                                errorTitle: 'Valor inválido',
                                error: `Selecciona un valor del catálogo para "${col.label}"`,
                                errorStyle: 'warning',
                            };
                        }
                    }
                }

                // Add note/comment for columns with notes
                if (col.note) {
                    cell.note = {
                        texts: [{ text: col.note }],
                    };
                }
            });

            // Freeze header row
            wsOps.views = [{ state: 'frozen', xSplit: 0, ySplit: 1, topLeftCell: 'A2' }];

            // Protect header row
            wsOps.getRow(1).height = 35;

            // ── HOJA: Instrucciones ──
            const wsInst = wb.addWorksheet('Instrucciones');
            wsInst.getColumn(1).width = 70;

            const actLabel = activityType.replace(/_/g, ' ');
            const instructions = [
                ['INSTRUCCIONES DE LLENADO'],
                [`Actividad: ${actLabel}`],
                [''],
                ['REGLAS GENERALES:'],
                ['1. Los campos marcados con * son obligatorios'],
                ['2. Formato de fecha: DD/MM/YYYY o YYYY-MM-DD'],
                ['3. RFC: 12 caracteres (Persona Moral) o 13 (Persona Física)'],
                ['4. CURP: Solo para personas físicas (18 caracteres)'],
                ['5. Montos numéricos sin símbolos de moneda, con 2 decimales'],
                ['6. Los campos con lista desplegable DEBEN usar los valores del catálogo'],
                [''],
                ['══════════════════════════════════════════'],
                ['SECCIONES DEL ARCHIVO:'],
                ['══════════════════════════════════════════'],
                [''],
                ['AZUL - Datos de la Operación:'],
                ['  Información del acto u operación vulnerable'],
                ['  (fecha, tipo, monto, moneda, instrumento + campos específicos)'],
                [''],
                ['VERDE - Datos del Cliente (Persona del Aviso):'],
                ['  Tipo persona, RFC, CURP, nombre/razón social,'],
                ['  apellidos, fecha nacimiento, teléfono, actividad económica'],
                [''],
                ['CAFÉ - Domicilio del Cliente:'],
                ['  Calle, números, colonia, CP, ciudad, estado, país'],
                [''],
                ['MORADO - Beneficiario Controlador:'],
                ['  Si la persona actúa a nombre de un tercero,'],
                ['  se requieren los datos del dueño beneficiario real'],
                [''],
                ['══════════════════════════════════════════'],
                ['CATÁLOGO DE TIPOS DE OPERACIÓN:'],
                [`(${actLabel})`],
                ['══════════════════════════════════════════'],
                [''],
                ...tiposOp.map(t => [t.label]),
                [''],
                ['══════════════════════════════════════════'],
                ['INSTRUMENTOS MONETARIOS:'],
                ['══════════════════════════════════════════'],
                [''],
                ...CATALOGS.instrumentoMonetario.map(t => [t.label]),
            ];

            instructions.forEach((row, i) => {
                const cell = wsInst.getCell(i + 1, 1);
                cell.value = row[0];
                if (i === 0) {
                    cell.font = { bold: true, size: 14 };
                } else if (row[0]?.startsWith('══')) {
                    cell.font = { bold: true, size: 10, color: { argb: 'FF1E3A8A' } };
                } else if (row[0]?.startsWith('AZUL') || row[0]?.startsWith('VERDE') || row[0]?.startsWith('CAFÉ') || row[0]?.startsWith('MORADO')) {
                    cell.font = { bold: true, size: 11 };
                }
            });

            // ── Generate buffer ──
            const buffer = await wb.xlsx.writeBuffer();
            const base64 = Buffer.from(buffer).toString('base64');

            const date = new Date().toISOString().split('T')[0];
            const fileName = `Plantilla_${activityType}_${date}.xlsx`;

            logger.log('Template generated (exceljs):', { activityType, columns: columns.length, user: request.auth.uid });

            return {
                success: true,
                fileBase64: base64,
                fileName,
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            };
        } catch (error) {
            logger.error('Error generating template:', error);
            throw new HttpsError('internal', 'Error al generar la plantilla: ' + error.message);
        }
    }
);


// ============================================================================
// CLOUD FUNCTION: processUpload
// Procesa archivo Excel cargado y guarda operaciones en Firestore
// ============================================================================

export const processUpload = onCall(
    { region: 'us-central1', memory: '512MiB', timeoutSeconds: 120 },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Debes iniciar sesión');
        }

        const { fileBase64, fileName, activityType, periodYear, periodMonth } = request.data;

        if (!fileBase64) throw new HttpsError('invalid-argument', 'El archivo es requerido');
        if (!activityType) throw new HttpsError('invalid-argument', 'El tipo de actividad es requerido');
        if (!periodYear || !periodMonth) throw new HttpsError('invalid-argument', 'El periodo es requerido');

        try {
            const userId = request.auth.uid;
            let tenantId = request.auth.token.tenantId || userId;

            const tenantDoc = await db.collection('tenants').doc(tenantId).get();
            if (!tenantDoc.exists) {
                throw new HttpsError('permission-denied', 'No tienes un tenant asociado');
            }

            // Get all columns for this activity
            const columns = getAllColumns(activityType);
            const tiposOp = TIPOS_OPERACION[activityType] || TIPOS_OPERACION.DEFAULT;

            // Parse Excel
            const buffer = Buffer.from(fileBase64, 'base64');
            const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (rawData.length < 2) {
                throw new HttpsError('invalid-argument', 'El archivo no contiene datos');
            }

            // Map headers to column definitions
            const headers = rawData[0].map(h => String(h || '').trim().replace(/\s*\*\s*$/, '')); // Remove trailing *
            const dataRows = rawData.slice(1).filter(row =>
                row.some(cell => cell !== null && cell !== undefined && cell !== '')
            );

            const headerToCol = {};
            headers.forEach((header, index) => {
                const colDef = columns.find(c =>
                    c.label.toLowerCase() === header.toLowerCase() ||
                    c.label.toLowerCase().replace(/\s*\*\s*$/, '') === header.toLowerCase()
                );
                if (colDef) headerToCol[index] = colDef;
            });

            // Process rows
            const validRows = [];
            const errors = [];
            const uploadBatchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const uploadDate = new Date().toISOString();

            dataRows.forEach((row, rowIndex) => {
                const rowNum = rowIndex + 2;
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

                headers.forEach((header, colIndex) => {
                    const colDef = headerToCol[colIndex];
                    if (!colDef) return;

                    const value = row[colIndex];
                    const { key, label, required, type, catalog } = colDef;

                    // Validate required
                    if (required && (value === null || value === undefined || value === '')) {
                        rowErrors.push(`"${label}" es requerido`);
                        return;
                    }
                    if (value === null || value === undefined || value === '') return;

                    // Validate by type
                    switch (type) {
                        case 'rfc':
                            if (!validateRFC(value)) {
                                rowErrors.push(`RFC inválido: "${value}"`);
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
                            // Validate against appropriate catalog
                            let validValues = [];
                            if (catalog === 'tipoOp') {
                                validValues = tiposOp.map(v => v.label);
                            } else if (CATALOGS[catalog]) {
                                validValues = CATALOGS[catalog].map(v => v.label);
                            }
                            if (validValues.length > 0) {
                                const matched = validValues.find(v =>
                                    v.toLowerCase() === cleanValue.toLowerCase()
                                );
                                rowData[key] = matched || cleanValue;
                                if (!matched) {
                                    rowErrors.push(`"${label}": "${cleanValue}" no está en el catálogo`);
                                }
                            } else {
                                rowData[key] = cleanValue;
                            }
                            break;
                        }

                        default:
                            rowData[key] = String(value).trim();
                    }
                });

                if (rowErrors.length > 0) {
                    errors.push({ row: rowNum, errors: rowErrors });
                } else {
                    // Verify minimum required fields
                    const missingRequired = columns
                        .filter(c => c.required && c.section === 'operacion')
                        .filter(c => !rowData[c.key]);

                    if (missingRequired.length > 0) {
                        errors.push({
                            row: rowNum,
                            errors: missingRequired.map(c => `"${c.label}" es requerido`),
                        });
                    } else {
                        validRows.push(rowData);
                    }
                }
            });

            // Save valid rows to Firestore (batch write, max 500 per batch)
            const savedIds = [];
            const BATCH_SIZE = 400;

            for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
                const batch = db.batch();
                const chunk = validRows.slice(i, i + BATCH_SIZE);
                for (const rowData of chunk) {
                    const docRef = db.collection('tenants').doc(tenantId).collection('operations').doc();
                    batch.set(docRef, {
                        ...rowData,
                        createdAt: FieldValue.serverTimestamp(),
                    });
                    savedIds.push(docRef.id);
                }
                await batch.commit();
            }

            logger.log('Upload processed:', {
                tenantId, activityType, fileName,
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
                errors: errors.slice(0, 50),
                hasMoreErrors: errors.length > 50,
                uploadBatchId,
            };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            logger.error('Error processing upload:', error);
            throw new HttpsError('internal', 'Error al procesar: ' + error.message);
        }
    }
);
