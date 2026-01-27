/**
 * PLD BDU - Master Data Dictionary
 * 
 * Mapa Maestro XSD-to-JSON para plantillas de carga Excel/CSV.
 * Basado en los esquemas XSD oficiales del SAT para avisos PLD/FT.
 * 
 * Estructura:
 * - COMMON_FIELDS: Campos comunes a todas las actividades
 * - ACTIVITY_TEMPLATES: Campos específicos por actividad
 * - VALIDATION_RULES: Reglas de validación por tipo de dato
 * 
 * Última actualización: 2026-01-25
 * Incluye: Reforma 2025 (Beneficiario Controlador obligatorio)
 */

const MASTER_DATA_DICTIONARY = {

    // ===========================================================================
    // META INFORMACIÓN
    // ===========================================================================
    _meta: {
        version: "2.0.0",
        last_updated: "2026-01-25",
        sat_schema_version: "3.3",
        reforma_2025_compliant: true,
        supported_file_formats: ["xlsx", "xls", "csv"],
    },

    // ===========================================================================
    // NIVEL 1: DATOS DEL SUJETO OBLIGADO (Común a todos)
    // Estos datos se pre-llenan desde la configuración del Tenant
    // ===========================================================================
    SUJETO_OBLIGADO: {
        _description: "Datos de la empresa que reporta (se auto-llena del sistema)",
        _source: "tenant_config",
        fields: {
            rfc_sujeto_obligado: {
                label: "RFC del Sujeto Obligado",
                excel_column: "RFC_SO",
                xsd_element: "rfc",
                data_type: "string",
                max_length: 13,
                pattern: "^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$",
                is_required: true,
                is_auto_filled: true,
                example: "XNO950101AAA",
            },
            razon_social: {
                label: "Razón Social",
                excel_column: "RAZON_SOCIAL_SO",
                xsd_element: "razon_social",
                data_type: "string",
                max_length: 150,
                is_required: true,
                is_auto_filled: true,
                example: "Inmobiliaria Nacional S.A. de C.V.",
            },
            clave_actividad: {
                label: "Clave de Actividad PLD",
                excel_column: "CLAVE_ACTIVIDAD",
                xsd_element: "clave_actividad",
                data_type: "string",
                max_length: 20,
                is_required: true,
                is_auto_filled: true,
                catalog_ref: "SAT_ACTIVIDADES_VULNERABLES",
                example: "AV_INMUEBLES",
            },
        },
    },

    // ===========================================================================
    // NIVEL 3: IDENTIFICACIÓN KYC (Común a todos - Cliente)
    // Reforma 2025: Beneficiario Controlador es OBLIGATORIO
    // ===========================================================================
    KYC_CLIENTE: {
        _description: "Datos de identificación del cliente (KYC)",
        _reforma_2025: true,
        fields: {
            // --- Persona Física ---
            tipo_persona: {
                label: "Tipo de Persona",
                excel_column: "TIPO_PERSONA",
                xsd_element: "tipo_persona",
                data_type: "enum",
                allowed_values: ["PF", "PM"],
                value_labels: { PF: "Persona Física", PM: "Persona Moral" },
                is_required: true,
                example: "PF",
            },
            nombre: {
                label: "Nombre(s)",
                excel_column: "NOMBRE",
                xsd_element: "nombre",
                data_type: "string",
                max_length: 100,
                is_required: true,
                applies_to: ["PF"],
                example: "Juan Carlos",
            },
            apellido_paterno: {
                label: "Apellido Paterno",
                excel_column: "APELLIDO_PATERNO",
                xsd_element: "apellido_paterno",
                data_type: "string",
                max_length: 100,
                is_required: true,
                applies_to: ["PF"],
                example: "González",
            },
            apellido_materno: {
                label: "Apellido Materno",
                excel_column: "APELLIDO_MATERNO",
                xsd_element: "apellido_materno",
                data_type: "string",
                max_length: 100,
                is_required: false,
                applies_to: ["PF"],
                example: "Martínez",
            },
            fecha_nacimiento: {
                label: "Fecha de Nacimiento",
                excel_column: "FECHA_NACIMIENTO",
                xsd_element: "fecha_nacimiento",
                data_type: "date",
                format: "YYYY-MM-DD",
                is_required: true,
                applies_to: ["PF"],
                example: "1985-03-15",
            },
            rfc_cliente: {
                label: "RFC del Cliente",
                excel_column: "RFC_CLIENTE",
                xsd_element: "rfc",
                data_type: "string",
                max_length: 13,
                pattern: "^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$",
                is_required: true,
                example: "GOMJ850315XXX",
            },
            curp_cliente: {
                label: "CURP del Cliente",
                excel_column: "CURP",
                xsd_element: "curp",
                data_type: "string",
                max_length: 18,
                pattern: "^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z]{2}$",
                is_required: true,
                applies_to: ["PF"],
                example: "GOMJ850315HDFRTN09",
            },

            // --- Persona Moral ---
            razon_social_cliente: {
                label: "Razón Social del Cliente",
                excel_column: "RAZON_SOCIAL_CLIENTE",
                xsd_element: "razon_social",
                data_type: "string",
                max_length: 150,
                is_required: true,
                applies_to: ["PM"],
                example: "Constructora del Norte S.A. de C.V.",
            },
            fecha_constitucion: {
                label: "Fecha de Constitución",
                excel_column: "FECHA_CONSTITUCION",
                xsd_element: "fecha_constitucion",
                data_type: "date",
                format: "YYYY-MM-DD",
                is_required: true,
                applies_to: ["PM"],
                example: "2010-06-20",
            },

            // --- Domicilio ---
            pais: {
                label: "País",
                excel_column: "PAIS",
                xsd_element: "pais",
                data_type: "string",
                max_length: 3,
                is_required: true,
                default_value: "MX",
                catalog_ref: "ISO_3166_ALPHA2",
                example: "MX",
            },
            estado: {
                label: "Estado",
                excel_column: "ESTADO",
                xsd_element: "entidad_federativa",
                data_type: "string",
                max_length: 50,
                is_required: true,
                catalog_ref: "INEGI_ENTIDADES",
                example: "Jalisco",
            },
            municipio: {
                label: "Municipio/Alcaldía",
                excel_column: "MUNICIPIO",
                xsd_element: "municipio",
                data_type: "string",
                max_length: 100,
                is_required: true,
                example: "Guadalajara",
            },
            colonia: {
                label: "Colonia",
                excel_column: "COLONIA",
                xsd_element: "colonia",
                data_type: "string",
                max_length: 100,
                is_required: true,
                example: "Centro",
            },
            calle: {
                label: "Calle",
                excel_column: "CALLE",
                xsd_element: "calle",
                data_type: "string",
                max_length: 150,
                is_required: true,
                example: "Av. Juárez",
            },
            numero_exterior: {
                label: "Número Exterior",
                excel_column: "NUM_EXTERIOR",
                xsd_element: "numero_exterior",
                data_type: "string",
                max_length: 20,
                is_required: true,
                example: "123",
            },
            numero_interior: {
                label: "Número Interior",
                excel_column: "NUM_INTERIOR",
                xsd_element: "numero_interior",
                data_type: "string",
                max_length: 20,
                is_required: false,
                example: "4B",
            },
            codigo_postal: {
                label: "Código Postal",
                excel_column: "CP",
                xsd_element: "codigo_postal",
                data_type: "string",
                max_length: 5,
                pattern: "^[0-9]{5}$",
                is_required: true,
                example: "44100",
            },

            // --- Contacto ---
            telefono: {
                label: "Teléfono",
                excel_column: "TELEFONO",
                xsd_element: "telefono",
                data_type: "string",
                max_length: 20,
                is_required: false,
                example: "+52 33 1234 5678",
            },
            email: {
                label: "Correo Electrónico",
                excel_column: "EMAIL",
                xsd_element: "correo_electronico",
                data_type: "email",
                max_length: 100,
                is_required: false,
                example: "cliente@email.com",
            },

            // --- Información Adicional ---
            nacionalidad: {
                label: "Nacionalidad",
                excel_column: "NACIONALIDAD",
                xsd_element: "nacionalidad",
                data_type: "string",
                max_length: 3,
                is_required: true,
                catalog_ref: "ISO_3166_ALPHA2",
                example: "MX",
            },
            actividad_economica: {
                label: "Actividad Económica / Ocupación",
                excel_column: "ACTIVIDAD_ECONOMICA",
                xsd_element: "actividad_economica",
                data_type: "string",
                max_length: 100,
                is_required: true,
                example: "Comerciante",
            },

            // --- PEP (Persona Políticamente Expuesta) ---
            es_pep: {
                label: "¿Es PEP?",
                excel_column: "ES_PEP",
                xsd_element: "es_pep",
                data_type: "boolean",
                is_required: true,
                default_value: false,
                help_text: "Persona Políticamente Expuesta según Art. 32 LFPIORPI",
                example: false,
            },
            pep_cargo: {
                label: "Cargo PEP",
                excel_column: "PEP_CARGO",
                xsd_element: "pep_cargo",
                data_type: "string",
                max_length: 100,
                is_required: false,
                conditional_on: { es_pep: true },
                example: "Diputado Federal",
            },
        },
    },

    // ===========================================================================
    // BENEFICIARIO CONTROLADOR (Reforma 2025 - OBLIGATORIO)
    // ===========================================================================
    BENEFICIARIO_CONTROLADOR: {
        _description: "Dueño Real / Beneficiario Controlador - Reforma 2025",
        _reforma_2025: true,
        _is_required_section: true,
        _help_text: "Persona física que ejerce control efectivo sobre el cliente (Art. 32-Bis LFPIORPI)",
        fields: {
            aplica_beneficiario: {
                label: "¿Aplica Beneficiario Controlador?",
                excel_column: "APLICA_BC",
                data_type: "boolean",
                is_required: true,
                help_text: "Obligatorio para Personas Morales. Para PF que actúan por cuenta propia = NO",
                example: true,
            },
            bc_nombre: {
                label: "Nombre(s) del Beneficiario Controlador",
                excel_column: "BC_NOMBRE",
                xsd_element: "bc_nombre",
                data_type: "string",
                max_length: 100,
                is_required: true,
                conditional_on: { aplica_beneficiario: true },
                example: "Roberto",
            },
            bc_apellido_paterno: {
                label: "Apellido Paterno BC",
                excel_column: "BC_APELLIDO_PATERNO",
                xsd_element: "bc_apellido_paterno",
                data_type: "string",
                max_length: 100,
                is_required: true,
                conditional_on: { aplica_beneficiario: true },
                example: "Hernández",
            },
            bc_apellido_materno: {
                label: "Apellido Materno BC",
                excel_column: "BC_APELLIDO_MATERNO",
                xsd_element: "bc_apellido_materno",
                data_type: "string",
                max_length: 100,
                is_required: false,
                conditional_on: { aplica_beneficiario: true },
                example: "López",
            },
            bc_fecha_nacimiento: {
                label: "Fecha de Nacimiento BC",
                excel_column: "BC_FECHA_NAC",
                xsd_element: "bc_fecha_nacimiento",
                data_type: "date",
                format: "YYYY-MM-DD",
                is_required: true,
                conditional_on: { aplica_beneficiario: true },
                example: "1970-08-22",
            },
            bc_rfc: {
                label: "RFC del Beneficiario Controlador",
                excel_column: "BC_RFC",
                xsd_element: "bc_rfc",
                data_type: "string",
                max_length: 13,
                pattern: "^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$",
                is_required: true,
                conditional_on: { aplica_beneficiario: true },
                example: "HELR700822XXX",
            },
            bc_curp: {
                label: "CURP del Beneficiario Controlador",
                excel_column: "BC_CURP",
                xsd_element: "bc_curp",
                data_type: "string",
                max_length: 18,
                pattern: "^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z]{2}$",
                is_required: true,
                conditional_on: { aplica_beneficiario: true },
                example: "HELR700822HDFRPB07",
            },
            bc_nacionalidad: {
                label: "Nacionalidad BC",
                excel_column: "BC_NACIONALIDAD",
                xsd_element: "bc_nacionalidad",
                data_type: "string",
                max_length: 3,
                is_required: true,
                conditional_on: { aplica_beneficiario: true },
                catalog_ref: "ISO_3166_ALPHA2",
                example: "MX",
            },
            bc_porcentaje_participacion: {
                label: "% de Participación",
                excel_column: "BC_PORCENTAJE",
                xsd_element: "bc_porcentaje",
                data_type: "decimal",
                min_value: 0,
                max_value: 100,
                is_required: true,
                conditional_on: { aplica_beneficiario: true },
                help_text: "Porcentaje de control o participación accionaria",
                example: 51.5,
            },
            bc_tipo_control: {
                label: "Tipo de Control",
                excel_column: "BC_TIPO_CONTROL",
                xsd_element: "bc_tipo_control",
                data_type: "enum",
                allowed_values: ["ACCIONARIO", "ADMINISTRATIVO", "OTRO"],
                is_required: true,
                conditional_on: { aplica_beneficiario: true },
                example: "ACCIONARIO",
            },
        },
    },

    // ===========================================================================
    // NIVEL 2: DATOS DE LA OPERACIÓN (Dinámico por Actividad)
    // ===========================================================================
    ACTIVITY_TEMPLATES: {

        // =========================================================================
        // ACTIVIDAD: DESARROLLO INMOBILIARIO / COMPRAVENTA DE INMUEBLES
        // Clave SAT: AV01, AV02
        // =========================================================================
        INMUEBLES: {
            _activity_code: "INMUEBLES",
            _sat_codes: ["AV01", "AV02"],
            _description: "Compraventa de bienes inmuebles",
            _uma_threshold_aviso: 8025,
            _uma_threshold_cash: 8025,
            _xml_schema: "INMUEBLES",

            // Documentos requeridos para esta actividad
            required_documents: [
                "Identificación oficial vigente",
                "Comprobante de domicilio",
                "Escritura pública o contrato de compraventa",
                "Avalúo del inmueble",
                "Constancia de situación fiscal",
            ],

            fields: {
                tipo_operacion: {
                    label: "Tipo de Operación",
                    excel_column: "TIPO_OPERACION",
                    xsd_element: "tipo_operacion",
                    data_type: "enum",
                    allowed_values: ["COMPRA", "VENTA", "ARRENDAMIENTO", "CESION"],
                    is_required: true,
                    example: "VENTA",
                },
                fecha_operacion: {
                    label: "Fecha de la Operación",
                    excel_column: "FECHA_OPERACION",
                    xsd_element: "fecha_celebracion",
                    data_type: "date",
                    format: "YYYY-MM-DD",
                    is_required: true,
                    example: "2026-01-25",
                },
                monto_operacion: {
                    label: "Monto de la Operación (MXN)",
                    excel_column: "MONTO_OPERACION",
                    xsd_element: "valor_operacion",
                    data_type: "decimal",
                    min_value: 0,
                    is_required: true,
                    is_threshold_field: true,
                    example: 8500000.00,
                },
                valor_pactado: {
                    label: "Valor Pactado (MXN)",
                    excel_column: "VALOR_PACTADO",
                    xsd_element: "valor_pactado",
                    data_type: "decimal",
                    min_value: 0,
                    is_required: true,
                    example: 8500000.00,
                },
                moneda: {
                    label: "Moneda",
                    excel_column: "MONEDA",
                    xsd_element: "moneda",
                    data_type: "enum",
                    allowed_values: ["MXN", "USD", "EUR"],
                    is_required: true,
                    default_value: "MXN",
                    example: "MXN",
                },
                tipo_cambio: {
                    label: "Tipo de Cambio",
                    excel_column: "TIPO_CAMBIO",
                    xsd_element: "tipo_cambio",
                    data_type: "decimal",
                    is_required: false,
                    conditional_on: { moneda: ["USD", "EUR"] },
                    example: 17.50,
                },
                forma_pago: {
                    label: "Forma de Pago",
                    excel_column: "FORMA_PAGO",
                    xsd_element: "forma_pago",
                    data_type: "enum",
                    allowed_values: [
                        "EFECTIVO",
                        "TRANSFERENCIA",
                        "CHEQUE",
                        "TARJETA_CREDITO",
                        "TARJETA_DEBITO",
                        "ESPECIE",
                        "MIXTO",
                    ],
                    is_required: true,
                    example: "TRANSFERENCIA",
                },
                monto_efectivo: {
                    label: "Monto en Efectivo (MXN)",
                    excel_column: "MONTO_EFECTIVO",
                    xsd_element: "monto_efectivo",
                    data_type: "decimal",
                    is_required: false,
                    conditional_on: { forma_pago: ["EFECTIVO", "MIXTO"] },
                    is_cash_threshold_field: true,
                    example: 500000.00,
                },

                // --- Datos del Inmueble ---
                ubicacion_inmueble: {
                    label: "Ubicación del Inmueble (Dirección Completa)",
                    excel_column: "UBICACION_INMUEBLE",
                    xsd_element: "ubicacion",
                    data_type: "string",
                    max_length: 300,
                    is_required: true,
                    example: "Calle Reforma 456, Col. Centro, Guadalajara, Jalisco, C.P. 44100",
                },
                tipo_inmueble: {
                    label: "Tipo de Inmueble",
                    excel_column: "TIPO_INMUEBLE",
                    xsd_element: "tipo_inmueble",
                    data_type: "enum",
                    allowed_values: [
                        "CASA_HABITACION",
                        "DEPARTAMENTO",
                        "TERRENO",
                        "LOCAL_COMERCIAL",
                        "OFICINA",
                        "BODEGA",
                        "NAVE_INDUSTRIAL",
                        "RANCHO",
                        "OTRO",
                    ],
                    is_required: true,
                    example: "CASA_HABITACION",
                },
                superficie_m2: {
                    label: "Superficie (m²)",
                    excel_column: "SUPERFICIE_M2",
                    xsd_element: "superficie",
                    data_type: "decimal",
                    is_required: false,
                    example: 250.50,
                },
                folio_real: {
                    label: "Folio Real / Matrícula",
                    excel_column: "FOLIO_REAL",
                    xsd_element: "folio_real",
                    data_type: "string",
                    max_length: 50,
                    is_required: true,
                    example: "1234567",
                },

                // --- Datos Notariales ---
                escritura_numero: {
                    label: "Número de Escritura",
                    excel_column: "NUM_ESCRITURA",
                    xsd_element: "numero_escritura",
                    data_type: "string",
                    max_length: 30,
                    is_required: true,
                    example: "12345",
                },
                fecha_escritura: {
                    label: "Fecha de Escritura",
                    excel_column: "FECHA_ESCRITURA",
                    xsd_element: "fecha_escritura",
                    data_type: "date",
                    format: "YYYY-MM-DD",
                    is_required: true,
                    example: "2026-01-20",
                },
                notaria_numero: {
                    label: "Número de Notaría",
                    excel_column: "NUM_NOTARIA",
                    xsd_element: "numero_notaria",
                    data_type: "string",
                    max_length: 10,
                    is_required: true,
                    example: "15",
                },
                notaria_estado: {
                    label: "Estado de la Notaría",
                    excel_column: "ESTADO_NOTARIA",
                    xsd_element: "estado_notaria",
                    data_type: "string",
                    max_length: 50,
                    is_required: true,
                    catalog_ref: "INEGI_ENTIDADES",
                    example: "Jalisco",
                },
                nombre_notario: {
                    label: "Nombre del Notario",
                    excel_column: "NOMBRE_NOTARIO",
                    xsd_element: "nombre_notario",
                    data_type: "string",
                    max_length: 150,
                    is_required: false,
                    example: "Lic. Pedro Ramírez García",
                },
            },
        },

        // =========================================================================
        // ACTIVIDAD: ACTIVOS VIRTUALES (Criptomonedas)
        // Clave SAT: AV17
        // =========================================================================
        ACTIVOS_VIRTUALES: {
            _activity_code: "ACTIVOS_VIRTUALES",
            _sat_codes: ["AV17"],
            _description: "Operaciones con activos virtuales (criptomonedas)",
            _uma_threshold_aviso: 645,
            _uma_threshold_cash: 645,
            _xml_schema: "ACTIVOS_VIRTUALES",

            required_documents: [
                "Identificación oficial vigente",
                "Comprobante de domicilio",
                "Constancia de situación fiscal",
                "Comprobante del origen de fondos",
            ],

            fields: {
                tipo_operacion_av: {
                    label: "Tipo de Operación",
                    excel_column: "TIPO_OPERACION",
                    xsd_element: "tipo_operacion",
                    data_type: "enum",
                    allowed_values: ["COMPRA", "VENTA", "INTERCAMBIO", "TRANSFERENCIA"],
                    is_required: true,
                    example: "COMPRA",
                },
                fecha_operacion: {
                    label: "Fecha de la Operación",
                    excel_column: "FECHA_OPERACION",
                    xsd_element: "fecha_operacion",
                    data_type: "datetime",
                    format: "YYYY-MM-DDTHH:mm:ss",
                    is_required: true,
                    example: "2026-01-25T14:30:00",
                },
                tipo_activo: {
                    label: "Tipo de Activo Virtual",
                    excel_column: "TIPO_ACTIVO",
                    xsd_element: "tipo_activo_virtual",
                    data_type: "enum",
                    allowed_values: [
                        "BTC",   // Bitcoin
                        "ETH",   // Ethereum
                        "USDT",  // Tether
                        "USDC",  // USD Coin
                        "XRP",   // Ripple
                        "SOL",   // Solana
                        "OTRO",
                    ],
                    is_required: true,
                    example: "BTC",
                },
                otro_tipo_activo: {
                    label: "Especificar Otro Tipo",
                    excel_column: "OTRO_TIPO_ACTIVO",
                    xsd_element: "otro_tipo",
                    data_type: "string",
                    max_length: 50,
                    is_required: false,
                    conditional_on: { tipo_activo: "OTRO" },
                    example: "DOGE",
                },
                cantidad: {
                    label: "Cantidad de Activos",
                    excel_column: "CANTIDAD",
                    xsd_element: "cantidad",
                    data_type: "decimal",
                    decimal_places: 8,
                    is_required: true,
                    example: 0.5,
                },
                valor_unitario_mxn: {
                    label: "Valor Unitario (MXN)",
                    excel_column: "VALOR_UNITARIO_MXN",
                    xsd_element: "valor_unitario",
                    data_type: "decimal",
                    is_required: true,
                    example: 850000.00,
                },
                valor_total_mxn: {
                    label: "Valor Total (MXN)",
                    excel_column: "VALOR_MXN",
                    xsd_element: "valor_mxn",
                    data_type: "decimal",
                    is_required: true,
                    is_threshold_field: true,
                    is_calculated: true,
                    formula: "cantidad * valor_unitario_mxn",
                    example: 425000.00,
                },
                wallet_origen: {
                    label: "Wallet de Origen",
                    excel_column: "WALLET_ORIGEN",
                    xsd_element: "direccion_origen",
                    data_type: "string",
                    max_length: 100,
                    is_required: false,
                    example: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
                },
                wallet_destino: {
                    label: "Wallet de Destino",
                    excel_column: "WALLET_DESTINO",
                    xsd_element: "direccion_destino",
                    data_type: "string",
                    max_length: 100,
                    is_required: false,
                    example: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
                },
                plataforma: {
                    label: "Plataforma / Exchange",
                    excel_column: "PLATAFORMA",
                    xsd_element: "plataforma",
                    data_type: "string",
                    max_length: 50,
                    is_required: true,
                    example: "Bitso",
                },
                tx_hash: {
                    label: "Hash de Transacción",
                    excel_column: "TX_HASH",
                    xsd_element: "hash_transaccion",
                    data_type: "string",
                    max_length: 100,
                    is_required: false,
                    example: "a1b2c3d4e5f6...",
                },
            },
        },

        // =========================================================================
        // ACTIVIDAD: MUTUO / PRÉSTAMO
        // Clave SAT: AV06
        // =========================================================================
        MUTUO_PRESTAMO: {
            _activity_code: "MUTUO_PRESTAMO",
            _sat_codes: ["AV06"],
            _description: "Otorgamiento de préstamos o créditos (mutuo)",
            _uma_threshold_aviso: 8025,
            _uma_threshold_cash: 8025,
            _xml_schema: "MUTUO",

            required_documents: [
                "Identificación oficial vigente",
                "Comprobante de domicilio",
                "Constancia de situación fiscal",
                "Contrato de mutuo/préstamo",
                "Pagaré firmado",
                "Comprobante de ingresos del acreditado",
            ],

            fields: {
                tipo_credito: {
                    label: "Tipo de Crédito",
                    excel_column: "TIPO_CREDITO",
                    xsd_element: "tipo_credito",
                    data_type: "enum",
                    allowed_values: [
                        "PERSONAL",
                        "HIPOTECARIO",
                        "AUTOMOTRIZ",
                        "EMPRESARIAL",
                        "TARJETA_CREDITO",
                        "OTRO",
                    ],
                    is_required: true,
                    example: "PERSONAL",
                },
                monto_credito: {
                    label: "Monto del Crédito (MXN)",
                    excel_column: "MONTO_CREDITO",
                    xsd_element: "monto_credito",
                    data_type: "decimal",
                    is_required: true,
                    is_threshold_field: true,
                    example: 500000.00,
                },
                fecha_otorgamiento: {
                    label: "Fecha de Otorgamiento",
                    excel_column: "FECHA_OTORGAMIENTO",
                    xsd_element: "fecha_otorgamiento",
                    data_type: "date",
                    format: "YYYY-MM-DD",
                    is_required: true,
                    example: "2026-01-25",
                },
                plazo_meses: {
                    label: "Plazo (Meses)",
                    excel_column: "PLAZO_MESES",
                    xsd_element: "plazo",
                    data_type: "integer",
                    min_value: 1,
                    is_required: true,
                    example: 36,
                },
                tasa_interes: {
                    label: "Tasa de Interés Anual (%)",
                    excel_column: "TASA_INTERES",
                    xsd_element: "tasa_interes",
                    data_type: "decimal",
                    min_value: 0,
                    max_value: 100,
                    is_required: true,
                    example: 24.5,
                },
                cat: {
                    label: "CAT (%)",
                    excel_column: "CAT",
                    xsd_element: "cat",
                    data_type: "decimal",
                    min_value: 0,
                    is_required: false,
                    help_text: "Costo Anual Total",
                    example: 32.8,
                },
                instrumento_pago: {
                    label: "Instrumento de Pago",
                    excel_column: "INSTRUMENTO_PAGO",
                    xsd_element: "instrumento_pago",
                    data_type: "enum",
                    allowed_values: [
                        "TRANSFERENCIA",
                        "CHEQUE",
                        "DEPOSITO_EFECTIVO",
                        "TARJETA",
                        "MIXTO",
                    ],
                    is_required: true,
                    example: "TRANSFERENCIA",
                },
                destino_recursos: {
                    label: "Destino de los Recursos",
                    excel_column: "DESTINO_RECURSOS",
                    xsd_element: "destino",
                    data_type: "string",
                    max_length: 200,
                    is_required: true,
                    example: "Adquisición de equipo de cómputo para negocio",
                },

                // --- Garantía ---
                tipo_garantia: {
                    label: "Tipo de Garantía",
                    excel_column: "TIPO_GARANTIA",
                    xsd_element: "tipo_garantia",
                    data_type: "enum",
                    allowed_values: [
                        "SIN_GARANTIA",
                        "HIPOTECARIA",
                        "PRENDARIA",
                        "AVAL",
                        "FIANZA",
                        "OTRO",
                    ],
                    is_required: true,
                    example: "AVAL",
                },
                descripcion_garantia: {
                    label: "Descripción de la Garantía",
                    excel_column: "DESC_GARANTIA",
                    xsd_element: "descripcion_garantia",
                    data_type: "string",
                    max_length: 300,
                    is_required: false,
                    conditional_on: { tipo_garantia: ["HIPOTECARIA", "PRENDARIA", "OTRO"] },
                    example: "Inmueble ubicado en Calle X, valor catastral $1,000,000",
                },
                valor_garantia: {
                    label: "Valor de la Garantía (MXN)",
                    excel_column: "VALOR_GARANTIA",
                    xsd_element: "valor_garantia",
                    data_type: "decimal",
                    is_required: false,
                    conditional_on: { tipo_garantia: ["HIPOTECARIA", "PRENDARIA"] },
                    example: 1000000.00,
                },

                // --- Datos del Contrato ---
                numero_contrato: {
                    label: "Número de Contrato",
                    excel_column: "NUM_CONTRATO",
                    xsd_element: "numero_contrato",
                    data_type: "string",
                    max_length: 50,
                    is_required: true,
                    example: "CRED-2026-00123",
                },
                fecha_vencimiento: {
                    label: "Fecha de Vencimiento",
                    excel_column: "FECHA_VENCIMIENTO",
                    xsd_element: "fecha_vencimiento",
                    data_type: "date",
                    format: "YYYY-MM-DD",
                    is_required: true,
                    example: "2029-01-25",
                },
            },
        },

        // =========================================================================
        // ACTIVIDAD: JUEGOS Y SORTEOS (Casinos)
        // Clave SAT: AV11
        // =========================================================================
        JUEGOS_SORTEOS: {
            _activity_code: "JUEGOS_SORTEOS",
            _sat_codes: ["AV11"],
            _description: "Juegos con apuesta, concursos y sorteos",
            _uma_threshold_aviso: 325,
            _uma_threshold_cash: 325,
            _xml_schema: "JUEGOS",

            required_documents: [
                "Identificación oficial vigente",
                "Comprobante de domicilio",
            ],

            fields: {
                tipo_juego: {
                    label: "Tipo de Juego/Sorteo",
                    excel_column: "TIPO_JUEGO",
                    xsd_element: "tipo_juego",
                    data_type: "enum",
                    allowed_values: [
                        "CASINO",
                        "APUESTAS_DEPORTIVAS",
                        "LOTERIA",
                        "SORTEO",
                        "MAQUINAS_TRAGAMONEDAS",
                        "BINGO",
                        "OTRO",
                    ],
                    is_required: true,
                    example: "APUESTAS_DEPORTIVAS",
                },
                fecha_operacion: {
                    label: "Fecha de Operación",
                    excel_column: "FECHA_OPERACION",
                    xsd_element: "fecha_operacion",
                    data_type: "date",
                    format: "YYYY-MM-DD",
                    is_required: true,
                    example: "2026-01-25",
                },
                monto_apuesta: {
                    label: "Monto de Apuesta (MXN)",
                    excel_column: "MONTO_APUESTA",
                    xsd_element: "monto_apuesta",
                    data_type: "decimal",
                    is_required: true,
                    is_threshold_field: true,
                    example: 50000.00,
                },
                monto_premio: {
                    label: "Monto del Premio (MXN)",
                    excel_column: "MONTO_PREMIO",
                    xsd_element: "monto_premio",
                    data_type: "decimal",
                    is_required: false,
                    example: 150000.00,
                },
                forma_pago_apuesta: {
                    label: "Forma de Pago de Apuesta",
                    excel_column: "FORMA_PAGO",
                    xsd_element: "forma_pago",
                    data_type: "enum",
                    allowed_values: ["EFECTIVO", "FICHAS", "TARJETA", "TRANSFERENCIA"],
                    is_required: true,
                    example: "FICHAS",
                },
                forma_pago_premio: {
                    label: "Forma de Pago del Premio",
                    excel_column: "FORMA_PAGO_PREMIO",
                    xsd_element: "forma_pago_premio",
                    data_type: "enum",
                    allowed_values: ["EFECTIVO", "CHEQUE", "TRANSFERENCIA"],
                    is_required: false,
                    conditional_on: { monto_premio: "> 0" },
                    example: "CHEQUE",
                },
            },
        },
    },

    // ===========================================================================
    // REGLAS DE VALIDACIÓN
    // ===========================================================================
    VALIDATION_RULES: {
        string: {
            validator: "validateString",
            params: ["max_length", "pattern", "min_length"],
        },
        decimal: {
            validator: "validateDecimal",
            params: ["min_value", "max_value", "decimal_places"],
        },
        integer: {
            validator: "validateInteger",
            params: ["min_value", "max_value"],
        },
        date: {
            validator: "validateDate",
            params: ["format", "min_date", "max_date"],
        },
        datetime: {
            validator: "validateDateTime",
            params: ["format"],
        },
        enum: {
            validator: "validateEnum",
            params: ["allowed_values"],
        },
        boolean: {
            validator: "validateBoolean",
            params: [],
        },
        email: {
            validator: "validateEmail",
            params: ["max_length"],
        },
    },

    // ===========================================================================
    // CATÁLOGOS DE REFERENCIA
    // ===========================================================================
    CATALOGS: {
        SAT_ACTIVIDADES_VULNERABLES: {
            source: "global_config/catalogs/actividades_sat",
            url: "https://www.sat.gob.mx/catalogos/pld",
        },
        INEGI_ENTIDADES: {
            source: "global_config/catalogs/entidades_inegi",
            values: [
                "Aguascalientes", "Baja California", "Baja California Sur", "Campeche",
                "Chiapas", "Chihuahua", "Ciudad de México", "Coahuila", "Colima",
                "Durango", "Estado de México", "Guanajuato", "Guerrero", "Hidalgo",
                "Jalisco", "Michoacán", "Morelos", "Nayarit", "Nuevo León", "Oaxaca",
                "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí", "Sinaloa",
                "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán",
                "Zacatecas",
            ],
        },
        ISO_3166_ALPHA2: {
            source: "global_config/catalogs/paises_iso",
            url: "https://www.iso.org/iso-3166-country-codes.html",
        },
    },
};

// Export for use in both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MASTER_DATA_DICTIONARY };
}
