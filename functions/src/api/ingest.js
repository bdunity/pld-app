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
// CONSTANTES LEGALES — LFPIORPI / UMA / EBR
// ============================================================================

/**
 * UMA (Unidad de Medida y Actualización) 2025
 * Publicado en DOF por INEGI
 */
const UMA_DIARIO = 113.14; // MXN por día (2025)
const UMA_MENSUAL = UMA_DIARIO * 30.4; // ~3,439.46 MXN

/**
 * LFPIORPI Art. 32 — Restricción de efectivo
 * "Las Actividades Vulnerables NO podrán recibir pagos en efectivo
 *  por montos superiores al equivalente a 3,210 UMA"
 */
const LIMITE_EFECTIVO_UMA = 3210;
const LIMITE_EFECTIVO_MXN = LIMITE_EFECTIVO_UMA * UMA_DIARIO; // ~$363,179.40

/**
 * EBR — Enfoque Basado en Riesgo (umbrales de aviso LFPIORPI Art. 17)
 * HIGH  = Monto ≥ 645 UMA → Aviso automático SAT/SPPLD
 * MEDIUM = Monto ≥ 325 UMA → Identificación obligatoria
 * LOW   = Por debajo de umbrales
 */
const UMBRAL_AVISO_UMA = 645;     // Aviso automático
const UMBRAL_IDENT_UMA = 325;     // Identificación obligatoria
const UMBRAL_AVISO_MXN = UMBRAL_AVISO_UMA * UMA_DIARIO;  // ~$72,975.30
const UMBRAL_IDENT_MXN = UMBRAL_IDENT_UMA * UMA_DIARIO;  // ~$36,770.50

/**
 * CURP Regex — 18 caracteres alfanuméricos con estructura SAT
 */
const CURP_REGEX = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]{2}$/;


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

/**
 * Validate CURP format (18 chars, alphanumeric structure)
 */
function validateCURP(curp) {
    if (!curp || typeof curp !== 'string') return false;
    return CURP_REGEX.test(curp.toUpperCase().trim());
}

/**
 * Determine if the instrument is "Efectivo" (cash)
 * Accepts: "1-Efectivo", "Efectivo", "1", etc.
 */
function isEfectivo(instrumentoMonetario) {
    if (!instrumentoMonetario) return false;
    const clean = String(instrumentoMonetario).toLowerCase().trim();
    return clean === '1-efectivo' || clean === 'efectivo' || clean === '1';
}

/**
 * Determine if operation is "Pago de premios" in JUEGOS_APUESTAS
 * Accepts: "2-Pago de premios", etc.
 */
function isPagoPremios(tipoOperacion) {
    if (!tipoOperacion) return false;
    const clean = String(tipoOperacion).toLowerCase().trim();
    return clean.includes('pago de premios') || clean.startsWith('2-');
}

/**
 * Extract person type code from catalog value
 * "1-Física" → "PF", "2-Moral" → "PM"
 */
function getPersonType(tipoPersona) {
    if (!tipoPersona) return null;
    const clean = String(tipoPersona).toLowerCase().trim();
    if (clean.includes('física') || clean === '1' || clean === '1-física') return 'PF';
    if (clean.includes('moral') || clean === '2' || clean === '2-moral') return 'PM';
    return null;
}

// ============================================================================
// LEGAL VALIDATION ENGINE — LFPIORPI Art. 17, 18, 32
// ============================================================================

/**
 * Validates a single row against LFPIORPI legal rules.
 * Returns: { hardStops: [], warnings: [], riskLevel, riskReason, riskScore }
 *
 * Hard Stops → Row is REJECTED (not saved)
 * Warnings  → Row is saved with warnings attached
 */
function validateLegalRules(rowData, activityType) {
    const hardStops = [];
    const warnings = [];
    let riskLevel = 'LOW';
    let riskReason = '';
    let riskScore = 0;

    const monto = Number(rowData.monto) || 0;
    const instrumento = rowData.instrumentoMonetario || '';
    const tipoPersona = getPersonType(rowData.tipoPersona);
    const rfcCliente = rowData.rfcCliente || '';
    const curp = rowData.curp || '';
    const nombreCliente = rowData.nombreCliente || '';
    const apellidoPaterno = rowData.apellidoPaterno || '';
    const tipoOperacion = rowData.tipoOperacion || '';
    const actuaNombrePropio = String(rowData.actuaNombrePropio || '').toUpperCase().trim();

    // ─────────────────────────────────────────────
    // 1. ART. 32 LFPIORPI — Restricción de Efectivo
    //    HARD STOP: Efectivo > 3,210 UMA = REJECT
    // ─────────────────────────────────────────────
    if (isEfectivo(instrumento) && monto > LIMITE_EFECTIVO_MXN) {
        hardStops.push(
            `⛔ Art. 32 LFPIORPI: Operación en EFECTIVO por $${monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })} ` +
            `EXCEDE el límite de 3,210 UMA ($${LIMITE_EFECTIVO_MXN.toLocaleString('es-MX', { minimumFractionDigits: 2 })}). ` +
            `OPERACIÓN RECHAZADA — No se puede recibir efectivo por este monto.`
        );
    }

    // ─────────────────────────────────────────────
    // 2. VALIDACIÓN DE IDENTIDAD (PF vs PM)
    // ─────────────────────────────────────────────
    if (tipoPersona === 'PF') {
        // Persona Física: RFC 13 chars + apellidos requeridos
        if (rfcCliente && rfcCliente.length !== 13) {
            hardStops.push(
                `⛔ RFC "${rfcCliente}" tiene ${rfcCliente.length} caracteres. ` +
                `Persona Física requiere RFC de 13 caracteres.`
            );
        }
        if (!apellidoPaterno) {
            warnings.push(
                `⚠️ Persona Física sin Apellido Paterno. Requerido por SAT para identificación.`
            );
        }
        if (curp && !validateCURP(curp)) {
            warnings.push(
                `⚠️ CURP "${curp}" no tiene formato válido (18 caracteres alfanuméricos).`
            );
        }
    } else if (tipoPersona === 'PM') {
        // Persona Moral: RFC 12 chars + razón social requerida
        if (rfcCliente && rfcCliente.length !== 12) {
            hardStops.push(
                `⛔ RFC "${rfcCliente}" tiene ${rfcCliente.length} caracteres. ` +
                `Persona Moral requiere RFC de 12 caracteres.`
            );
        }
        if (!nombreCliente) {
            warnings.push(
                `⚠️ Persona Moral sin Razón Social. Campo requerido por SAT.`
            );
        }
        // Persona Moral should NOT have CURP
        if (curp) {
            warnings.push(
                `⚠️ Persona Moral no debe tener CURP. Se ignorará este campo.`
            );
        }
    }

    // ─────────────────────────────────────────────
    // 3. EBR — Enfoque Basado en Riesgo
    //    Semáforo por monto de operación individual
    // ─────────────────────────────────────────────
    if (monto >= UMBRAL_AVISO_MXN) {
        riskLevel = 'HIGH';
        riskReason = `Monto $${monto.toLocaleString('es-MX')} ≥ 645 UMA ($${UMBRAL_AVISO_MXN.toLocaleString('es-MX')}). Aviso automático SAT.`;
        riskScore = 100;
    } else if (monto >= UMBRAL_IDENT_MXN) {
        riskLevel = 'MEDIUM';
        riskReason = `Monto $${monto.toLocaleString('es-MX')} ≥ 325 UMA ($${UMBRAL_IDENT_MXN.toLocaleString('es-MX')}). Identificación obligatoria.`;
        riskScore = 60;
    } else {
        riskLevel = 'LOW';
        riskReason = 'Monto por debajo de umbrales LFPIORPI.';
        riskScore = 10;
    }

    // ─────────────────────────────────────────────
    // 4. REGLAS ESPECÍFICAS: JUEGOS_APUESTAS
    //    Pago de premios en efectivo → MEDIUM review
    // ─────────────────────────────────────────────
    if (activityType === 'JUEGOS_APUESTAS') {
        if (isPagoPremios(tipoOperacion) && isEfectivo(instrumento)) {
            if (riskLevel === 'LOW') {
                riskLevel = 'MEDIUM';
                riskReason = 'Pago de premio en efectivo (Juegos y Sorteos). Revisión manual recomendada.';
                riskScore = Math.max(riskScore, 50);
            }
            warnings.push(
                `⚠️ Juegos y Sorteos: Pago de premio en efectivo detectado. ` +
                `Art. 17 fracción XI LFPIORPI — requiere revisión manual.`
            );
        }
    }

    // ─────────────────────────────────────────────
    // 5. EFECTIVO ALTO (sin llegar al límite Art. 32)
    //    Si paga en efectivo y monto > 50,000 MXN → warning
    // ─────────────────────────────────────────────
    if (isEfectivo(instrumento) && monto > 50000 && monto <= LIMITE_EFECTIVO_MXN) {
        warnings.push(
            `⚠️ Operación en efectivo por $${monto.toLocaleString('es-MX')}. ` +
            `Verificar origen de recursos.`
        );
    }

    // ─────────────────────────────────────────────
    // 6. BENEFICIARIO CONTROLADOR
    //    Si NO actúa a nombre propio, datos del beneficiario son requeridos
    // ─────────────────────────────────────────────
    if (actuaNombrePropio === 'NO') {
        const nombreBenef = rowData.nombreBeneficiario || '';
        const rfcBenef = rowData.rfcBeneficiario || '';
        if (!nombreBenef) {
            warnings.push(
                `⚠️ Cliente NO actúa a nombre propio pero falta el nombre del Beneficiario Controlador. ` +
                `Requerido por Art. 18 LFPIORPI.`
            );
        }
        if (!rfcBenef) {
            warnings.push(
                `⚠️ Cliente NO actúa a nombre propio pero falta el RFC del Beneficiario Controlador.`
            );
        }
    }

    return { hardStops, warnings, riskLevel, riskReason, riskScore };
}

/**
 * Query Firestore for monthly accumulated amount by RFC within same tenant/activity/month.
 * Used for EBR accumulation check — if cumulative ≥ 645 UMA, upgrade risk to HIGH.
 */
async function getMonthlyAccumulation(tenantId, rfcCliente, activityType, periodYear, periodMonth) {
    if (!rfcCliente) return 0;

    try {
        const opsRef = db.collection('tenants').doc(tenantId).collection('operations');
        const snapshot = await opsRef
            .where('rfcCliente', '==', rfcCliente.toUpperCase().trim())
            .where('activityType', '==', activityType)
            .where('periodYear', '==', periodYear)
            .where('periodMonth', '==', periodMonth)
            .get();

        let total = 0;
        snapshot.forEach(doc => {
            total += Number(doc.data().monto) || 0;
        });
        return total;
    } catch (err) {
        logger.warn('Error querying monthly accumulation:', err.message);
        return 0;
    }
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
// Motor de Ingesta con Validación Legal LFPIORPI + EBR Risk Engine
//
// Pipeline:
//   1. Parse Excel → Extract rows
//   2. Format validation (RFC, dates, numbers, catalogs)
//   3. LEGAL VALIDATION (Art. 32 cash limit, identity PF/PM, beneficiary)
//   4. EBR Risk Assessment (individual monto)
//   5. Monthly Accumulation by RFC (Firestore query)
//   6. Accumulation risk upgrade (if cumulative ≥ 645 UMA → HIGH)
//   7. Save to Firestore with riskLevel, riskReason, warnings
// ============================================================================

export const processUpload = onCall(
    { region: 'us-central1', memory: '1GiB', timeoutSeconds: 180 },
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

            // ── PHASE 1: Format Validation (parse each row) ──
            const parsedRows = [];
            const formatErrors = [];
            const uploadBatchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const uploadDate = new Date().toISOString();
            const pYear = parseInt(periodYear);
            const pMonth = parseInt(periodMonth);

            dataRows.forEach((row, rowIndex) => {
                const rowNum = rowIndex + 2;
                const rowErrors = [];
                const rowData = {
                    tenantId,
                    activityType,
                    periodYear: pYear,
                    periodMonth: pMonth,
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
                    formatErrors.push({ row: rowNum, errors: rowErrors, type: 'FORMAT' });
                } else {
                    // Verify minimum required fields
                    const missingRequired = columns
                        .filter(c => c.required && c.section === 'operacion')
                        .filter(c => !rowData[c.key]);

                    if (missingRequired.length > 0) {
                        formatErrors.push({
                            row: rowNum,
                            errors: missingRequired.map(c => `"${c.label}" es requerido`),
                            type: 'FORMAT',
                        });
                    } else {
                        parsedRows.push(rowData);
                    }
                }
            });

            // ── PHASE 2: Legal Validation + EBR Risk Assessment ──
            const validRows = [];
            const rejectedRows = [];  // Hard stops (Art. 32, identity)
            const warningRows = [];   // Passed but with warnings

            // Collect unique RFCs for accumulation query
            const uniqueRFCs = [...new Set(
                parsedRows.map(r => r.rfcCliente).filter(Boolean)
            )];

            // Query monthly accumulation for all unique RFCs in parallel
            const accumulationMap = {};  // { rfc: totalAccumulated }
            if (uniqueRFCs.length > 0) {
                const accPromises = uniqueRFCs.map(async (rfc) => {
                    const accumulated = await getMonthlyAccumulation(
                        tenantId, rfc, activityType, pYear, pMonth
                    );
                    accumulationMap[rfc.toUpperCase().trim()] = accumulated;
                });
                await Promise.all(accPromises);
            }

            // Track in-batch accumulation (for rows in same upload with same RFC)
            const batchAccumulation = {};  // { rfc: runningTotal }

            for (const rowData of parsedRows) {
                // Run legal validation
                const legalResult = validateLegalRules(rowData, activityType);

                // HARD STOPS → Reject the row entirely
                if (legalResult.hardStops.length > 0) {
                    rejectedRows.push({
                        row: rowData.sourceRow,
                        errors: legalResult.hardStops,
                        type: 'LEGAL_REJECT',
                    });
                    continue;
                }

                // ── Accumulation Check ──
                const rfc = (rowData.rfcCliente || '').toUpperCase().trim();
                const monto = Number(rowData.monto) || 0;

                // Previous months (already in Firestore) + this batch
                const previousAccumulated = accumulationMap[rfc] || 0;
                const batchPrevious = batchAccumulation[rfc] || 0;
                const totalAccumulated = previousAccumulated + batchPrevious + monto;

                // Update batch running total
                if (rfc) {
                    batchAccumulation[rfc] = (batchAccumulation[rfc] || 0) + monto;
                }

                // Upgrade risk level based on accumulation
                let { riskLevel, riskReason, riskScore } = legalResult;

                if (totalAccumulated >= UMBRAL_AVISO_MXN && riskLevel !== 'HIGH') {
                    riskLevel = 'HIGH';
                    riskReason = `Acumulado mensual RFC ${rfc}: $${totalAccumulated.toLocaleString('es-MX')} ` +
                        `≥ 645 UMA ($${UMBRAL_AVISO_MXN.toLocaleString('es-MX')}). ` +
                        `Aviso automático SAT por acumulación.`;
                    riskScore = 100;
                } else if (totalAccumulated >= UMBRAL_IDENT_MXN && riskLevel === 'LOW') {
                    riskLevel = 'MEDIUM';
                    riskReason = `Acumulado mensual RFC ${rfc}: $${totalAccumulated.toLocaleString('es-MX')} ` +
                        `≥ 325 UMA ($${UMBRAL_IDENT_MXN.toLocaleString('es-MX')}). ` +
                        `Identificación obligatoria por acumulación.`;
                    riskScore = Math.max(riskScore, 60);
                }

                // Determine final status based on risk
                let status = 'PENDING';
                if (riskLevel === 'HIGH') {
                    status = 'PENDING_REPORT';  // Needs SAT report (aviso automático)
                } else if (riskLevel === 'MEDIUM') {
                    status = 'PENDING_REVIEW';  // Needs manual review
                }

                // Enrich row data with risk + accumulation info
                const enrichedRow = {
                    ...rowData,
                    status,
                    // EBR Risk fields
                    riskLevel,
                    riskReason,
                    riskScore,
                    // Accumulation data
                    monthlyAccumulated: totalAccumulated,
                    previousAccumulated: previousAccumulated + batchPrevious,
                    // Warnings (non-blocking)
                    warnings: legalResult.warnings,
                    hasWarnings: legalResult.warnings.length > 0,
                    // Legal metadata
                    validatedAt: uploadDate,
                    umaReference: UMA_DIARIO,
                    limiteEfectivoMXN: LIMITE_EFECTIVO_MXN,
                };

                validRows.push(enrichedRow);

                if (legalResult.warnings.length > 0) {
                    warningRows.push({
                        row: rowData.sourceRow,
                        warnings: legalResult.warnings,
                        riskLevel,
                        type: 'WARNING',
                    });
                }
            }

            // ── PHASE 3: Save to Firestore ──
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

            // ── PHASE 4: Save upload summary to tenant audit log ──
            const riskSummary = {
                HIGH: validRows.filter(r => r.riskLevel === 'HIGH').length,
                MEDIUM: validRows.filter(r => r.riskLevel === 'MEDIUM').length,
                LOW: validRows.filter(r => r.riskLevel === 'LOW').length,
            };

            try {
                await db.collection('tenants').doc(tenantId).collection('uploadHistory').add({
                    uploadBatchId,
                    activityType,
                    periodYear: pYear,
                    periodMonth: pMonth,
                    fileName,
                    totalRows: dataRows.length,
                    validRows: validRows.length,
                    rejectedRows: rejectedRows.length,
                    formatErrors: formatErrors.length,
                    warningRows: warningRows.length,
                    riskSummary,
                    uploadedBy: userId,
                    createdAt: FieldValue.serverTimestamp(),
                });
            } catch (auditErr) {
                logger.warn('Failed to save upload audit:', auditErr.message);
            }

            logger.log('Upload processed with legal validation:', {
                tenantId, activityType, fileName,
                totalRows: dataRows.length,
                validRows: validRows.length,
                formatErrors: formatErrors.length,
                rejectedRows: rejectedRows.length,
                warningRows: warningRows.length,
                riskSummary,
                user: userId,
            });

            // ── Return comprehensive result ──
            return {
                success: true,
                // Counts
                recordsProcessed: validRows.length,
                recordsRejected: rejectedRows.length,
                recordsWithWarnings: warningRows.length,
                recordsWithErrors: formatErrors.length,
                totalRecords: dataRows.length,
                // Risk summary
                riskSummary,
                // Detailed errors (format + legal rejects)
                errors: [
                    ...formatErrors.slice(0, 25),
                    ...rejectedRows.slice(0, 25),
                ].slice(0, 50),
                hasMoreErrors: (formatErrors.length + rejectedRows.length) > 50,
                // Warnings (non-blocking)
                warnings: warningRows.slice(0, 30),
                hasMoreWarnings: warningRows.length > 30,
                // Metadata
                uploadBatchId,
                // Legal reference info
                legalContext: {
                    umaDaily: UMA_DIARIO,
                    limiteEfectivoMXN: LIMITE_EFECTIVO_MXN,
                    umbralAvisoMXN: UMBRAL_AVISO_MXN,
                    umbralIdentMXN: UMBRAL_IDENT_MXN,
                },
            };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            logger.error('Error processing upload:', error);
            throw new HttpsError('internal', 'Error al procesar: ' + error.message);
        }
    }
);
