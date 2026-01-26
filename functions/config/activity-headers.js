/**
 * BDU PLD - Activity Headers Definition
 * Source of truth for Excel Templates and Data Validation
 */

const ACTIVITY_HEADERS = {
    "INMUEBLES": [
        "Referencia_Interna",
        "Fecha_Operacion",
        "Tipo_Operacion", // Compra, Venta
        "Monto_Operacion",
        "Moneda",
        "Forma_Pago", // Cheque, Transferencia, Efectivo
        "Valor_Catastral",
        "Folio_Real",
        "Descripcion_Inmueble",
        "Ubicacion_Inmueble",
        "RFC_Cliente",
        "Nombre_Cliente",
        "Fecha_Nacimiento_Constitucion",
        "Domicilio_Cliente",
        "Telefono_Cliente",
        "Email_Cliente"
    ],
    "ACTIVOS_VIRTUALES": [
        "Referencia_Interna",
        "Fecha_Operacion",
        "Tipo_Operacion", // Compra, Venta, Intercambio
        "Tipo_Activo", // BTC, ETH, USDT
        "Cantidad",
        "Valor_Unitario_MXN",
        "Monto_Total_MXN",
        "Wallet_Origen",
        "Wallet_Destino",
        "RFC_Cliente",
        "Nombre_Cliente",
        "Beneficiario_Controlador"
    ],
    "VEHICULOS": [
        "Referencia_Interna",
        "Fecha_Operacion",
        "Tipo_Operacion",
        "Marca",
        "Modelo",
        "Anio",
        "VIN_Serie",
        "Monto_Operacion",
        "Forma_Pago",
        "RFC_Cliente",
        "Nombre_Cliente"
    ],
    "MUTUO_PRESTAMO": [
        "Referencia_Interna",
        "Fecha_Otorgamiento",
        "Monto_Credito",
        "Plazo_Meses",
        "Tasa_Interes",
        "Garantia",
        "RFC_Acreditado",
        "Nombre_Acreditado",
        "Destino_Credito"
    ],
    "DEFAULT": [
        "Referencia_Interna",
        "Fecha_Operacion",
        "Monto_Operacion",
        "RFC_Cliente",
        "Nombre_Cliente"
    ]
};

module.exports = { ACTIVITY_HEADERS };
