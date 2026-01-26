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
    "CONSTRUCCION_INMUEBLES": [ // Inmobiliaria
        "Referencia_Interna",
        "Fecha_Operacion",
        "Tipo_Inmueble", // Casa, Terreno, Local
        "Ubicacion",
        "Valor_Pactado",
        "Monto_Pagado_Fecha",
        "RFC_Cliente",
        "Nombre_Cliente",
        "Fecha_Contrato"
    ],
    "JOYAS_RELOJES": [
        "Referencia_Interna",
        "Fecha_Venta",
        "Tipo_Bien", // Joya, Reloj, Metal
        "Material", // Oro, Plata, Platino
        "Kilates_Calidad",
        "Descripcion",
        "Monto_Operacion",
        "Forma_Pago",
        "RFC_Cliente",
        "Nombre_Cliente"
    ],
    "OBRAS_ARTE": [
        "Referencia_Interna",
        "Fecha_Operacion",
        "Nombre_Obra",
        "Autor",
        "Anio_Creacion",
        "Tecnica",
        "Monto_Valuacion",
        "RFC_Cliente",
        "Nombre_Cliente"
    ],
    "TARJETAS_SERVICIOS": [
        "Numero_Tarjeta", // Enmascarado idealmente
        "Fecha_Emision",
        "Limite_Credito",
        "Saldo_Mensual",
        "Gasto_Acumulado",
        "RFC_Titular",
        "Nombre_Titular",
        "Fecha_Pago"
    ],
    "CHEQUES_VIAJERO": [
        "Referencia_Interna",
        "Fecha_Venta",
        "Numero_Serie",
        "Monto_Total",
        "Moneda",
        "RFC_Cliente",
        "Nombre_Cliente"
    ],
    "BLINDAJE": [
        "Referencia_Interna",
        "Fecha_Venta",
        "Nivel_Blindaje",
        "Tipo_Vehiculo_Inmueble",
        "Marca_Modelo",
        "VIN_Ubicacion",
        "Monto_Operacion",
        "RFC_Cliente",
        "Nombre_Cliente"
    ],
    "CUSTODIA_VALORES": [
        "Referencia_Contrato",
        "Fecha_Traslado",
        "Origen",
        "Destino",
        "Tipo_Valor", // Billete, Moneda, Metal
        "Monto_Total",
        "RFC_Cliente",
        "Nombre_Cliente"
    ],
    "SERVICIOS_PROFESIONALES": [ // Outsourcing / Abogados / Contadores
        "Referencia_Servicio",
        "Fecha_Inicio",
        "Tipo_Servicio", // Administración, Compraventa, Cuentas
        "Descripcion_Detallada",
        "Monto_Honorarios",
        "Recursos_Manejados", // Si/No
        "Monto_Recursos",
        "RFC_Cliente",
        "Nombre_Cliente"
    ],
    "FE_PUBLICA": [ // Notarios
        "Numero_Escritura",
        "Fecha_Escritura",
        "Tipo_Acto", // Transmisión Propiedad, Poder, Constitución
        "Valor_Operacion",
        "Ubicacion_Inmueble", // Si aplica
        "Folio_Real",
        "RFC_Otorgante",
        "Nombre_Otorgante",
        "RFC_Adquirente",
        "Nombre_Adquirente"
    ],
    "DONATIVOS": [
        "Referencia_Donativo",
        "Fecha_Recepcion",
        "Tipo_Donativo", // Efectivo, Especie
        "Descripcion_Bien", // Si es especie
        "Monto_Valor",
        "RFC_Donante",
        "Nombre_Donante"
    ],
    "AGENTES_ADUANALES": [
        "Numero_Pedimento",
        "Fecha_Pedimento",
        "Aduana",
        "Tipo_Mercancia",
        "Valor_Aduana",
        "Pais_Origen",
        "Pais_Destino",
        "RFC_Importador_Exportador",
        "Nombre_Cliente"
    ],
    "ARRENDAMIENTO": [
        "Referencia_Contrato",
        "Fecha_Contrato",
        "Ubicacion_Inmueble",
        "Monto_Renta_Mensual",
        "Plazo_Meses",
        "RFC_Arrendatario",
        "Nombre_Arrendatario"
    ],
    "JUEGOS_APUESTA": [
        "Referencia_Ticket",
        "Fecha_Apuesta",
        "Tipo_Juego",
        "Monto_Apostado",
        "Monto_Ganado",
        "RFC_Cliente",
        "Nombre_Cliente"
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
