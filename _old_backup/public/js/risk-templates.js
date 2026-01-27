/**
 * PLD BDU - Matrices de Riesgo (EBR)
 * 
 * Esquema de configuración para calificación automática de riesgo.
 * Basado en la Evaluación Nacional de Riesgos (ENR) 2023 de la UIF.
 * 
 * Estructura para Firestore: global_config/risk_templates
 * 
 * Convención de idioma:
 * - Claves técnicas: inglés (high_risk_zone, cash_payment)
 * - Descripciones y alertas: español mexicano
 * 
 * @version 2.0.0
 * @date 2026-01-25
 */

const RISK_TEMPLATES = {

    // ===========================================================================
    // DOCUMENTO 1: FACTORES DE RIESGO GENERALES
    // Path: global_config/risk_templates/general_risk_factors
    // Aplican a TODAS las actividades vulnerables
    // ===========================================================================
    general_risk_factors: {
        _id: "general_risk_factors",
        _description: "Factores de riesgo universales aplicables a todas las actividades vulnerables",
        _version: "2.0.0",
        _updated_at: "2026-01-25",
        _source: "ENR 2023 - UIF México",

        // -------------------------------------------------------------------------
        // CATEGORÍA: Riesgos de Cliente (KYC)
        // -------------------------------------------------------------------------
        client_risk_factors: {

            pep_match: {
                factor_id: "pep_match",
                name_es: "Persona Políticamente Expuesta (PEP)",
                description_es: "El cliente o beneficiario controlador es o ha sido funcionario público de alto nivel, o tiene relación cercana con uno.",
                risk_level: "HIGH",
                risk_level_es: "Alto",
                score_weight: 40,
                legal_reference: "Art. 32 LFPIORPI, Guía PEP UIF 2023",
                alert_message_es: "⚠️ ALERTA PEP: Cliente identificado como Persona Políticamente Expuesta. Aplicar Debida Diligencia Reforzada.",
                requires_escalation: true,
                required_actions_es: [
                    "Obtener autorización del Oficial de Cumplimiento",
                    "Documentar origen lícito de recursos",
                    "Aplicar monitoreo reforzado continuo",
                ],
            },

            blacklist_sat: {
                factor_id: "blacklist_sat",
                name_es: "Lista Negra SAT (69-B)",
                description_es: "El cliente aparece en la lista de contribuyentes con operaciones inexistentes del SAT (Artículo 69-B CFF).",
                risk_level: "CRITICAL",
                risk_level_es: "Crítico",
                score_weight: 100,
                legal_reference: "Art. 69-B Código Fiscal de la Federación",
                alert_message_es: "🚫 ALERTA CRÍTICA: Cliente en Lista 69-B del SAT. OPERACIÓN DEBE SER RECHAZADA conforme al Art. 69-B CFF.",
                requires_escalation: true,
                blocks_operation: true,
                required_actions_es: [
                    "RECHAZAR la operación inmediatamente",
                    "Notificar al Comité de Cumplimiento",
                    "Evaluar presentación de aviso por operación inusual",
                ],
            },

            blacklist_ofac: {
                factor_id: "blacklist_ofac",
                name_es: "Lista OFAC/ONU",
                description_es: "El cliente aparece en listas de sanciones internacionales (OFAC, ONU, UE).",
                risk_level: "CRITICAL",
                risk_level_es: "Crítico",
                score_weight: 100,
                legal_reference: "Resoluciones del Consejo de Seguridad ONU, OFAC SDN",
                alert_message_es: "🚫 ALERTA INTERNACIONAL: Cliente en lista de sanciones internacionales. OPERACIÓN PROHIBIDA.",
                requires_escalation: true,
                blocks_operation: true,
                required_actions_es: [
                    "RECHAZAR la operación inmediatamente",
                    "Reportar a la UIF como operación inusual",
                    "Conservar evidencia documental",
                ],
            },

            age_risk: {
                factor_id: "age_risk",
                name_es: "Edad de Riesgo",
                description_es: "Cliente menor de 18 años o mayor de 85 años realizando operaciones de alto valor.",
                risk_level: "MEDIUM",
                risk_level_es: "Medio",
                score_weight: 20,
                legal_reference: "Tipología UIF - Uso de prestanombres",
                alert_message_es: "⚠️ Cliente con edad atípica para el perfil de la operación. Verificar capacidad legal y origen de recursos.",
                thresholds: {
                    min_age: 18,
                    max_age: 85,
                },
                required_actions_es: [
                    "Verificar documentación de identidad",
                    "Confirmar capacidad legal para la operación",
                    "Documentar origen de recursos",
                ],
            },

            first_operation: {
                factor_id: "first_operation",
                name_es: "Primera Operación",
                description_es: "Es la primera operación del cliente con el sujeto obligado.",
                risk_level: "LOW",
                risk_level_es: "Bajo",
                score_weight: 10,
                legal_reference: "Mejores prácticas GAFI",
                alert_message_es: "ℹ️ Primera operación del cliente. Aplicar procedimientos de debida diligencia inicial.",
                required_actions_es: [
                    "Completar expediente de identificación",
                    "Verificar datos contra documentos oficiales",
                ],
            },

            foreign_national: {
                factor_id: "foreign_national",
                name_es: "Nacionalidad Extranjera",
                description_es: "El cliente tiene nacionalidad de un país diferente a México.",
                risk_level: "MEDIUM",
                risk_level_es: "Medio",
                score_weight: 15,
                legal_reference: "Art. 18 LFPIORPI - Identificación de extranjeros",
                alert_message_es: "ℹ️ Cliente extranjero. Verificar estatus migratorio y documentación.",
                high_risk_countries: [
                    "Irán", "Corea del Norte", "Siria", "Myanmar",
                    "Venezuela", "Nicaragua", "Cuba"
                ],
                required_actions_es: [
                    "Verificar documento migratorio vigente",
                    "Obtener comprobante de domicilio en México",
                    "Evaluar país de origen según lista GAFI",
                ],
            },

            high_risk_occupation: {
                factor_id: "high_risk_occupation",
                name_es: "Ocupación de Alto Riesgo",
                description_es: "El cliente tiene una ocupación asociada a mayor riesgo de lavado de dinero.",
                risk_level: "MEDIUM",
                risk_level_es: "Medio",
                score_weight: 20,
                legal_reference: "Tipologías UIF 2023",
                alert_message_es: "⚠️ Ocupación del cliente asociada a riesgo elevado. Verificar congruencia de ingresos.",
                high_risk_occupations_es: [
                    "Comerciante de joyas/metales preciosos",
                    "Casa de cambio/Centro cambiario",
                    "Comerciante de vehículos",
                    "Notario/Corredor Público",
                    "Agente inmobiliario independiente",
                    "Cambista informal",
                ],
                required_actions_es: [
                    "Verificar registro ante autoridades si aplica",
                    "Analizar congruencia ingreso-operación",
                ],
            },

            complex_ownership: {
                factor_id: "complex_ownership",
                name_es: "Estructura de Propiedad Compleja",
                description_es: "La persona moral tiene una estructura de propiedad compleja o con múltiples capas.",
                risk_level: "HIGH",
                risk_level_es: "Alto",
                score_weight: 30,
                legal_reference: "Reforma 2025 - Beneficiario Controlador",
                alert_message_es: "⚠️ Estructura corporativa compleja. Identificar todos los beneficiarios controladores.",
                required_actions_es: [
                    "Obtener organigrama completo de la estructura",
                    "Identificar a TODOS los beneficiarios controladores (>10%)",
                    "Documentar cadena de control hasta personas físicas",
                ],
            },
        },

        // -------------------------------------------------------------------------
        // CATEGORÍA: Riesgos de Transacción
        // -------------------------------------------------------------------------
        transaction_risk_factors: {

            cash_payment: {
                factor_id: "cash_payment",
                name_es: "Pago en Efectivo",
                description_es: "La operación incluye pago total o parcial en efectivo.",
                risk_level: "MEDIUM",
                risk_level_es: "Medio",
                score_weight: 25,
                legal_reference: "Art. 32 LFPIORPI - Restricciones de efectivo",
                alert_message_es: "💵 Operación con efectivo. Verificar que no exceda límites legales.",
                required_actions_es: [
                    "Verificar monto contra límite de efectivo de la actividad",
                    "Documentar origen del efectivo si supera umbral",
                ],
            },

            threshold_proximity: {
                factor_id: "threshold_proximity",
                name_es: "Proximidad al Umbral",
                description_es: "El monto de la operación está entre 80% y 99% del umbral de aviso.",
                risk_level: "HIGH",
                risk_level_es: "Alto",
                score_weight: 35,
                legal_reference: "Tipología UIF - Pitufeo/Estructuración",
                alert_message_es: "⚠️ ALERTA: Monto cercano al umbral de aviso. Posible estructuración (pitufeo).",
                thresholds: {
                    min_percent: 80,
                    max_percent: 99,
                },
                required_actions_es: [
                    "Revisar historial de operaciones del cliente",
                    "Verificar si hay operaciones fraccionadas recientes",
                    "Considerar reporte por operación inusual",
                ],
            },

            structured_transactions: {
                factor_id: "structured_transactions",
                name_es: "Operaciones Fraccionadas",
                description_es: "Múltiples operaciones del mismo cliente que en conjunto superan el umbral.",
                risk_level: "HIGH",
                risk_level_es: "Alto",
                score_weight: 40,
                legal_reference: "Art. 17 LFPIORPI - Operaciones acumuladas",
                alert_message_es: "🚨 ALERTA ESTRUCTURACIÓN: Operaciones fraccionadas detectadas. Posible evasión de umbrales.",
                lookback_days: 30,
                required_actions_es: [
                    "Sumar TODAS las operaciones del cliente en 30 días",
                    "Si suma supera umbral, generar Aviso",
                    "Evaluar reporte por operación inusual",
                ],
            },

            unusual_timing: {
                factor_id: "unusual_timing",
                name_es: "Temporalidad Inusual",
                description_es: "Operación realizada en horarios o fechas atípicas.",
                risk_level: "LOW",
                risk_level_es: "Bajo",
                score_weight: 10,
                alert_message_es: "ℹ️ Operación en horario/fecha atípica.",
                required_actions_es: [
                    "Documentar justificación del cliente",
                ],
            },

            rapid_turnover: {
                factor_id: "rapid_turnover",
                name_es: "Rotación Rápida",
                description_es: "Compra y venta del mismo bien en periodo corto (menos de 6 meses).",
                risk_level: "HIGH",
                risk_level_es: "Alto",
                score_weight: 35,
                legal_reference: "Tipología UIF - Lavado mediante activos",
                alert_message_es: "⚠️ Compraventa rápida detectada. Verificar justificación económica.",
                threshold_days: 180,
                required_actions_es: [
                    "Solicitar justificación al cliente",
                    "Revisar historial de operaciones similares",
                    "Considerar reporte por operación inusual",
                ],
            },
        },

        // -------------------------------------------------------------------------
        // CATEGORÍA: Riesgos Geográficos
        // -------------------------------------------------------------------------
        geographic_risk_factors: {

            high_risk_zone: {
                factor_id: "high_risk_zone",
                name_es: "Zona de Alto Riesgo",
                description_es: "La operación involucra ubicaciones en estados con alta incidencia de delitos financieros según ENR.",
                risk_level: "HIGH",
                risk_level_es: "Alto",
                score_weight: 30,
                legal_reference: "ENR 2023 - Mapa de riesgo geográfico",
                alert_message_es: "⚠️ Operación en zona de alto riesgo según ENR 2023.",
                high_risk_states: [
                    "Sinaloa",
                    "Chihuahua",
                    "Tamaulipas",
                    "Guerrero",
                    "Michoacán",
                    "Baja California",
                    "Jalisco",
                    "Estado de México",
                    "Sonora",
                    "Quintana Roo",
                ],
                required_actions_es: [
                    "Aplicar debida diligencia reforzada",
                    "Verificar domicilio y operaciones del cliente",
                ],
            },

            border_zone: {
                factor_id: "border_zone",
                name_es: "Zona Fronteriza",
                description_es: "Operación en municipio fronterizo con EE.UU. o Guatemala.",
                risk_level: "MEDIUM",
                risk_level_es: "Medio",
                score_weight: 20,
                legal_reference: "ENR 2023 - Corredores de tráfico ilícito",
                alert_message_es: "ℹ️ Operación en zona fronteriza. Aplicar verificaciones adicionales.",
                border_states: ["Baja California", "Sonora", "Chihuahua", "Coahuila", "Nuevo León", "Tamaulipas", "Chiapas", "Tabasco", "Campeche", "Quintana Roo"],
                required_actions_es: [
                    "Verificar que el cliente tenga nexo legítimo con la zona",
                    "Documentar propósito de la operación",
                ],
            },

            tax_haven: {
                factor_id: "tax_haven",
                name_es: "Paraíso Fiscal",
                description_es: "Operación involucra transferencias desde/hacia jurisdicciones de baja tributación.",
                risk_level: "HIGH",
                risk_level_es: "Alto",
                score_weight: 35,
                legal_reference: "Lista negra UE + Art. 176 LISR",
                alert_message_es: "⚠️ Flujo de recursos hacia/desde paraíso fiscal. Verificar sustancia económica.",
                tax_haven_jurisdictions: [
                    "Islas Caimán", "Islas Vírgenes Británicas", "Panamá",
                    "Bahamas", "Belice", "Bermudas", "Seychelles",
                    "Emiratos Árabes Unidos", "Luxemburgo", "Andorra",
                ],
                required_actions_es: [
                    "Obtener justificación del uso de jurisdicción offshore",
                    "Documentar sustancia económica de entidades intermedias",
                    "Considerar reporte por operación inusual",
                ],
            },
        },
    },

    // ===========================================================================
    // DOCUMENTO 2: MATRIZ DE RIESGO - INMUEBLES
    // Path: global_config/risk_templates/inmuebles_risk_matrix
    // ===========================================================================
    inmuebles_risk_matrix: {
        _id: "inmuebles_risk_matrix",
        _activity_code: "INMUEBLES",
        _activity_name_es: "Compraventa de Bienes Inmuebles",
        _description: "Factores de riesgo específicos para transmisión de inmuebles",
        _version: "2.0.0",
        _updated_at: "2026-01-25",
        _source: "ENR 2023 - Sector Inmobiliario",
        _sat_codes: ["AV01", "AV02"],

        // Umbrales específicos
        thresholds: {
            aviso_uma: 8025,
            cash_limit_uma: 8025,
            uma_2026: 117.31,
            aviso_mxn: 941513,
            cash_limit_mxn: 941513,
        },

        specific_risk_factors: {

            value_discrepancy: {
                factor_id: "value_discrepancy",
                name_es: "Discrepancia de Valor",
                description_es: "Existe diferencia significativa entre el valor catastral/avalúo y el precio pactado.",
                risk_level: "MEDIUM",
                risk_level_es: "Medio",
                score_weight: 25,
                legal_reference: "Tipología UIF - Subvaluación de inmuebles",
                alert_message_es: "⚠️ Discrepancia entre valor comercial y valor declarado >30%.",
                threshold_percent: 30,
                required_actions_es: [
                    "Solicitar avalúo actualizado",
                    "Documentar justificación de la diferencia",
                    "Considerar si hay indicios de evasión fiscal",
                ],
            },

            cash_purchase: {
                factor_id: "cash_purchase",
                name_es: "Compra en Efectivo",
                description_es: "Inmueble adquirido total o parcialmente con efectivo.",
                risk_level: "HIGH",
                risk_level_es: "Alto",
                score_weight: 40,
                legal_reference: "Art. 32 LFPIORPI - Límite de efectivo",
                alert_message_es: "💵 ALERTA: Pago de inmueble con efectivo. Verificar cumplimiento de límites.",
                required_actions_es: [
                    "Verificar que efectivo no exceda 8,025 UMAs",
                    "Documentar origen lícito de los fondos",
                    "Si excede límite, RECHAZAR operación",
                ],
            },

            luxury_property: {
                factor_id: "luxury_property",
                name_es: "Inmueble de Lujo",
                description_es: "Propiedad con valor superior a 5 millones de pesos o en zonas residenciales premium.",
                risk_level: "MEDIUM",
                risk_level_es: "Medio",
                score_weight: 20,
                alert_message_es: "ℹ️ Inmueble de alto valor. Aplicar debida diligencia reforzada.",
                value_threshold_mxn: 5000000,
                required_actions_es: [
                    "Verificar congruencia con perfil económico del comprador",
                    "Documentar origen de recursos",
                ],
            },

            rapid_resale: {
                factor_id: "rapid_resale",
                name_es: "Reventa Rápida",
                description_es: "Inmueble revendido en menos de 6 meses desde su adquisición.",
                risk_level: "HIGH",
                risk_level_es: "Alto",
                score_weight: 35,
                legal_reference: "Tipología UIF - Rotación de activos",
                alert_message_es: "🚨 Reventa rápida de inmueble. Posible esquema de lavado.",
                threshold_days: 180,
                required_actions_es: [
                    "Verificar historial de transacciones del inmueble",
                    "Solicitar justificación comercial",
                    "Considerar reporte por operación inusual",
                ],
            },

            third_party_payment: {
                factor_id: "third_party_payment",
                name_es: "Pago por Tercero",
                description_es: "El pago del inmueble proviene de una persona distinta al comprador.",
                risk_level: "HIGH",
                risk_level_es: "Alto",
                score_weight: 35,
                legal_reference: "Tipología UIF - Uso de prestanombres",
                alert_message_es: "⚠️ Pago realizado por tercero. Identificar y documentar relación.",
                required_actions_es: [
                    "Identificar al tercero pagador (KYC completo)",
                    "Documentar relación con el comprador",
                    "Obtener declaración de origen de recursos",
                ],
            },

            undeveloped_land: {
                factor_id: "undeveloped_land",
                name_es: "Terreno Sin Desarrollar",
                description_es: "Compra de terrenos rústicos o baldíos de gran extensión.",
                risk_level: "MEDIUM",
                risk_level_es: "Medio",
                score_weight: 20,
                alert_message_es: "ℹ️ Adquisición de terreno sin desarrollar. Verificar propósito.",
                threshold_m2: 10000,
                required_actions_es: [
                    "Documentar plan de uso del terreno",
                    "Verificar si zona tiene uso de suelo definido",
                ],
            },

            shell_company_buyer: {
                factor_id: "shell_company_buyer",
                name_es: "Comprador Empresa Reciente",
                description_es: "El comprador es una persona moral constituida hace menos de 1 año.",
                risk_level: "MEDIUM",
                risk_level_es: "Medio",
                score_weight: 25,
                alert_message_es: "⚠️ Empresa compradora de reciente creación.",
                threshold_months: 12,
                required_actions_es: [
                    "Obtener acta constitutiva y modificaciones",
                    "Identificar a todos los socios",
                    "Verificar actividad económica real",
                ],
            },
        },

        // Configuración de score
        score_config: {
            max_score: 100,
            thresholds: {
                low: { min: 0, max: 30, label_es: "Bajo", color: "#22c55e", action_es: "Proceder normalmente" },
                medium: { min: 31, max: 60, label_es: "Medio", color: "#f59e0b", action_es: "Aplicar debida diligencia reforzada" },
                high: { min: 61, max: 80, label_es: "Alto", color: "#ef4444", action_es: "Requiere autorización del Oficial de Cumplimiento" },
                critical: { min: 81, max: 100, label_es: "Crítico", color: "#7f1d1d", action_es: "OPERACIÓN DEBE SER RECHAZADA o escalada a Comité" },
            },
        },
    },

    // ===========================================================================
    // DOCUMENTO 3: MATRIZ DE RIESGO - ACTIVOS VIRTUALES
    // Path: global_config/risk_templates/activos_virtuales_risk_matrix
    // ===========================================================================
    activos_virtuales_risk_matrix: {
        _id: "activos_virtuales_risk_matrix",
        _activity_code: "ACTIVOS_VIRTUALES",
        _activity_name_es: "Operaciones con Activos Virtuales (Criptomonedas)",
        _description: "Factores de riesgo para VASPs y operaciones cripto",
        _version: "2.0.0",
        _updated_at: "2026-01-25",
        _source: "ENR 2023 + Guía GAFI Activos Virtuales 2021",
        _sat_codes: ["AV17"],

        thresholds: {
            aviso_uma: 645,
            cash_limit_uma: 645,
            uma_2026: 117.31,
            aviso_mxn: 75665,
            cash_limit_mxn: 75665,
        },

        specific_risk_factors: {

            privacy_coin: {
                factor_id: "privacy_coin",
                name_es: "Moneda de Privacidad",
                description_es: "Operación involucra criptomonedas con tecnología de anonimato aumentado.",
                risk_level: "HIGH",
                risk_level_es: "Alto",
                score_weight: 40,
                legal_reference: "GAFI Travel Rule, Circular Banxico 4/2019",
                alert_message_es: "🚨 Moneda de privacidad detectada (Monero, Zcash, etc.). Alto riesgo de anonimato.",
                privacy_coins: ["XMR", "ZEC", "DASH", "GRIN", "BEAM"],
                required_actions_es: [
                    "Aplicar debida diligencia ampliada",
                    "Documentar propósito de uso de privacy coin",
                    "Considerar rechazo de operación",
                ],
            },

            unhosted_wallet: {
                factor_id: "unhosted_wallet",
                name_es: "Wallet No Custodiada",
                description_es: "Transferencia hacia/desde wallet sin custodio identificable (self-hosted).",
                risk_level: "MEDIUM",
                risk_level_es: "Medio",
                score_weight: 25,
                legal_reference: "GAFI Travel Rule",
                alert_message_es: "⚠️ Wallet no custodiada. Imposible aplicar Travel Rule completa.",
                required_actions_es: [
                    "Aplicar verificación de propiedad de wallet",
                    "Documentar declaración jurada del cliente",
                ],
            },

            mixer_tumbler: {
                factor_id: "mixer_tumbler",
                name_es: "Uso de Mixer/Tumbler",
                description_es: "Fondos provienen de servicios de mezcla o tumblers.",
                risk_level: "CRITICAL",
                risk_level_es: "Crítico",
                score_weight: 100,
                legal_reference: "Tipología UIF - Lavado con criptoactivos",
                alert_message_es: "🚫 ALERTA CRÍTICA: Fondos posiblemente mezclados. ALTO RIESGO de origen ilícito.",
                blocks_operation: true,
                required_actions_es: [
                    "RECHAZAR la operación",
                    "Reportar como operación inusual a la UIF",
                    "Conservar evidencia blockchain",
                ],
            },

            darknet_exposure: {
                factor_id: "darknet_exposure",
                name_es: "Exposición a Darknet",
                description_es: "Análisis on-chain indica exposición a direcciones asociadas con mercados ilegales.",
                risk_level: "CRITICAL",
                risk_level_es: "Crítico",
                score_weight: 100,
                alert_message_es: "🚫 ALERTA: Fondos con exposición a darknet markets.",
                blocks_operation: true,
                required_actions_es: [
                    "RECHAZAR la operación inmediatamente",
                    "Reportar a la UIF como operación preocupante",
                    "Documentar análisis on-chain",
                ],
            },

            high_volume_conversion: {
                factor_id: "high_volume_conversion",
                name_es: "Conversión de Alto Volumen",
                description_es: "Múltiples conversiones cripto-fiat en periodo corto.",
                risk_level: "HIGH",
                risk_level_es: "Alto",
                score_weight: 35,
                alert_message_es: "⚠️ Patrón de conversión masiva cripto→fiat detectado.",
                threshold_operations_per_week: 5,
                required_actions_es: [
                    "Verificar origen de los activos virtuales",
                    "Analizar patrón de comportamiento",
                    "Considerar reporte por operación inusual",
                ],
            },

            sanctioned_exchange: {
                factor_id: "sanctioned_exchange",
                name_es: "Exchange Sancionado",
                description_es: "Fondos provienen de exchange sancionado o sin licencia.",
                risk_level: "CRITICAL",
                risk_level_es: "Crítico",
                score_weight: 100,
                alert_message_es: "🚫 Fondos de exchange sancionado/no regulado.",
                blocks_operation: true,
                sanctioned_exchanges: ["Garantex", "Hydra", "Chatex", "Suex"],
                required_actions_es: [
                    "RECHAZAR la operación",
                    "Reportar a la UIF",
                ],
            },
        },

        score_config: {
            max_score: 100,
            thresholds: {
                low: { min: 0, max: 30, label_es: "Bajo", color: "#22c55e", action_es: "Proceder normalmente" },
                medium: { min: 31, max: 60, label_es: "Medio", color: "#f59e0b", action_es: "Revisar transacción on-chain" },
                high: { min: 61, max: 80, label_es: "Alto", color: "#ef4444", action_es: "Autorización del Compliance Officer requerida" },
                critical: { min: 81, max: 100, label_es: "Crítico", color: "#7f1d1d", action_es: "OPERACIÓN RECHAZADA - Reporte UIF" },
            },
        },
    },

    // ===========================================================================
    // DOCUMENTO 4: MATRIZ DE RIESGO - MUTUO/PRÉSTAMO
    // Path: global_config/risk_templates/mutuo_risk_matrix
    // ===========================================================================
    mutuo_risk_matrix: {
        _id: "mutuo_risk_matrix",
        _activity_code: "MUTUO_PRESTAMO",
        _activity_name_es: "Otorgamiento de Créditos y Préstamos",
        _description: "Factores de riesgo para operaciones de mutuo",
        _version: "2.0.0",
        _updated_at: "2026-01-25",
        _source: "ENR 2023 - Sector Financiero No Bancario",
        _sat_codes: ["AV06"],

        thresholds: {
            aviso_uma: 8025,
            cash_limit_uma: 8025,
            uma_2026: 117.31,
            aviso_mxn: 941513,
            cash_limit_mxn: 941513,
        },

        specific_risk_factors: {

            prepayment: {
                factor_id: "prepayment",
                name_es: "Prepago Anticipado",
                description_es: "Cliente liquida crédito significativamente antes del vencimiento.",
                risk_level: "MEDIUM",
                risk_level_es: "Medio",
                score_weight: 25,
                alert_message_es: "⚠️ Prepago anticipado del crédito. Verificar origen de recursos.",
                threshold_percent_remaining: 50,
                required_actions_es: [
                    "Documentar origen de fondos para prepago",
                    "Verificar congruencia con perfil del cliente",
                ],
            },

            cash_disbursement: {
                factor_id: "cash_disbursement",
                name_es: "Desembolso en Efectivo",
                description_es: "El crédito se entrega total o parcialmente en efectivo.",
                risk_level: "HIGH",
                risk_level_es: "Alto",
                score_weight: 35,
                alert_message_es: "💵 Desembolso en efectivo. Verificar cumplimiento de límites.",
                required_actions_es: [
                    "Verificar que no exceda límite de efectivo",
                    "Documentar justificación del efectivo",
                ],
            },

            no_credit_history: {
                factor_id: "no_credit_history",
                name_es: "Sin Historial Crediticio",
                description_es: "Cliente sin historial en buró de crédito solicita monto elevado.",
                risk_level: "MEDIUM",
                risk_level_es: "Medio",
                score_weight: 20,
                alert_message_es: "⚠️ Cliente sin historial crediticio solicitando crédito significativo.",
                required_actions_es: [
                    "Aplicar debida diligencia reforzada",
                    "Solicitar referencias bancarias",
                    "Verificar fuentes de ingreso alternativas",
                ],
            },

            excessive_amount: {
                factor_id: "excessive_amount",
                name_es: "Monto Excesivo",
                description_es: "Monto del crédito desproporcional respecto a ingresos declarados.",
                risk_level: "HIGH",
                risk_level_es: "Alto",
                score_weight: 35,
                alert_message_es: "🚨 Monto de crédito excede capacidad de pago aparente.",
                debt_to_income_threshold: 0.4, // 40%
                required_actions_es: [
                    "Verificar todas las fuentes de ingreso",
                    "Obtener garantías adicionales",
                    "Documentar análisis de capacidad de pago",
                ],
            },

            guarantor_risk: {
                factor_id: "guarantor_risk",
                name_es: "Aval de Alto Riesgo",
                description_es: "El aval presenta factores de riesgo identificados.",
                risk_level: "MEDIUM",
                risk_level_es: "Medio",
                score_weight: 20,
                alert_message_es: "⚠️ Aval presenta indicadores de riesgo.",
                required_actions_es: [
                    "Aplicar KYC completo al aval",
                    "Verificar capacidad económica del aval",
                ],
            },
        },

        score_config: {
            max_score: 100,
            thresholds: {
                low: { min: 0, max: 30, label_es: "Bajo", color: "#22c55e", action_es: "Aprobar crédito" },
                medium: { min: 31, max: 60, label_es: "Medio", color: "#f59e0b", action_es: "Revisar con Comité de Crédito" },
                high: { min: 61, max: 80, label_es: "Alto", color: "#ef4444", action_es: "Requiere aprobación del Director" },
                critical: { min: 81, max: 100, label_es: "Crítico", color: "#7f1d1d", action_es: "RECHAZAR solicitud" },
            },
        },
    },
};

// ===========================================================================
// FUNCIÓN DE CÁLCULO DE SCORE
// ===========================================================================

/**
 * Calcula el score de riesgo para una operación
 * @param {Object} operation - Datos de la operación
 * @param {Array} triggeredFactors - Array de IDs de factores activados
 * @param {Object} riskMatrix - Matriz de riesgo aplicable
 * @returns {Object} Score y nivel de riesgo
 */
function calculateRiskScore(operation, triggeredFactors, riskMatrix) {
    let totalScore = 0;
    const factorDetails = [];

    // Combinar factores generales y específicos
    const allFactors = {
        ...RISK_TEMPLATES.general_risk_factors.client_risk_factors,
        ...RISK_TEMPLATES.general_risk_factors.transaction_risk_factors,
        ...RISK_TEMPLATES.general_risk_factors.geographic_risk_factors,
        ...(riskMatrix?.specific_risk_factors || {}),
    };

    // Calcular score
    for (const factorId of triggeredFactors) {
        const factor = allFactors[factorId];
        if (factor) {
            totalScore += factor.score_weight;
            factorDetails.push({
                factor_id: factorId,
                name_es: factor.name_es,
                score: factor.score_weight,
                risk_level: factor.risk_level,
                alert: factor.alert_message_es,
                blocks: factor.blocks_operation || false,
            });
        }
    }

    // Normalizar a 100
    const normalizedScore = Math.min(totalScore, 100);

    // Determinar nivel
    const scoreConfig = riskMatrix?.score_config?.thresholds || RISK_TEMPLATES.inmuebles_risk_matrix.score_config.thresholds;
    let riskLevel = 'low';

    for (const [level, config] of Object.entries(scoreConfig)) {
        if (normalizedScore >= config.min && normalizedScore <= config.max) {
            riskLevel = level;
            break;
        }
    }

    const levelConfig = scoreConfig[riskLevel];

    return {
        score: normalizedScore,
        risk_level: riskLevel,
        risk_level_es: levelConfig.label_es,
        color: levelConfig.color,
        recommended_action_es: levelConfig.action_es,
        triggered_factors: factorDetails,
        is_blocked: factorDetails.some(f => f.blocks),
        requires_escalation: factorDetails.some(f => f.requires_escalation),
    };
}

// ===========================================================================
// EXPORTS
// ===========================================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        RISK_TEMPLATES,
        calculateRiskScore,
    };
}

if (typeof window !== 'undefined') {
    window.RISK_TEMPLATES = RISK_TEMPLATES;
    window.calculateRiskScore = calculateRiskScore;
}
