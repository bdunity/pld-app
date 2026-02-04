/**
 * PLD BDU v2 - Catálogo de Giros (Actividades Vulnerables)
 * Según LFPIORPI Art. 17 - Datos del SAT
 */

const GirosCatalogo = {

    // Catálogo completo de actividades vulnerables con umbrales
    GIROS: {
        'juegos_sorteos': {
            id: 'juegos_sorteos',
            fraccion: 'I',
            nombre: 'Juegos con Apuesta, Concursos y Sorteos',
            descripcion: 'Venta de boletos, fichas, pago de premios y operaciones financieras relacionadas',
            umbralIdentificacion: 325,
            umbralAviso: 645,
            tipoOperaciones: ['venta_boletos', 'pago_premios', 'operacion_financiera'],
            xsdUrl: 'https://www.pld.hacienda.gob.mx/work/models/PLD/documentos/xsd/jys.xsd',
            ejemploXml: 'https://www.pld.hacienda.gob.mx/work/models/PLD/documentos/ejemplosxml/ejemplo_jys.xml',
            activo: true
        },
        'tarjetas_credito': {
            id: 'tarjetas_credito',
            fraccion: 'II',
            nombre: 'Tarjetas de Crédito o Servicios',
            descripcion: 'Emisión y comercialización de tarjetas de crédito o servicios',
            umbralIdentificacion: 805,
            umbralAviso: 1285,
            tipoOperaciones: ['emision', 'comercializacion'],
            activo: true
        },
        'tarjetas_prepago': {
            id: 'tarjetas_prepago',
            fraccion: 'II',
            nombre: 'Tarjetas de Prepago',
            descripcion: 'Emisión y comercialización de tarjetas prepagadas',
            umbralIdentificacion: 645,
            umbralAviso: 645,
            tipoOperaciones: ['emision', 'comercializacion'],
            activo: true
        },
        'vales_cupones': {
            id: 'vales_cupones',
            fraccion: 'II',
            nombre: 'Vales, Cupones y Monederos Electrónicos',
            descripcion: 'Emisión y comercialización de vales, cupones o monederos electrónicos',
            umbralIdentificacion: 645,
            umbralAviso: 645,
            tipoOperaciones: ['emision', 'comercializacion'],
            activo: true
        },
        'cheques_viajero': {
            id: 'cheques_viajero',
            fraccion: 'III',
            nombre: 'Cheques de Viajero',
            descripcion: 'Emisión y comercialización de cheques de viajero',
            umbralIdentificacion: 0, // Siempre
            umbralAviso: 645,
            tipoOperaciones: ['emision', 'comercializacion'],
            activo: true
        },
        'mutuo_prestamo': {
            id: 'mutuo_prestamo',
            fraccion: 'IV',
            nombre: 'Mutuo, Préstamo o Crédito',
            descripcion: 'Otorgamiento de préstamos o créditos con o sin garantía',
            umbralIdentificacion: 0, // Siempre
            umbralAviso: 1605,
            tipoOperaciones: ['otorgamiento', 'garantia'],
            activo: true
        },
        'inmuebles': {
            id: 'inmuebles',
            fraccion: 'V',
            nombre: 'Comercialización de Bienes Inmuebles',
            descripcion: 'Construcción, desarrollo, intermediación, compraventa de inmuebles',
            umbralIdentificacion: 0, // Siempre
            umbralAviso: 8025,
            tipoOperaciones: ['compraventa', 'intermediacion', 'construccion'],
            activo: true
        },
        'desarrollo_inmobiliario': {
            id: 'desarrollo_inmobiliario',
            fraccion: 'V Bis',
            nombre: 'Desarrollo Inmobiliario',
            descripcion: 'Desarrollo y promoción de proyectos inmobiliarios',
            umbralIdentificacion: 0, // Siempre
            umbralAviso: 8025,
            tipoOperaciones: ['desarrollo', 'promocion'],
            activo: true
        },
        'metales_joyas': {
            id: 'metales_joyas',
            fraccion: 'VI',
            nombre: 'Metales y Piedras Preciosas, Joyas y Relojes',
            descripcion: 'Comercialización de metales, piedras preciosas, joyas y relojes',
            umbralIdentificacion: 805,
            umbralAviso: 1605,
            tipoOperaciones: ['compraventa'],
            activo: true
        },
        'obras_arte': {
            id: 'obras_arte',
            fraccion: 'VII',
            nombre: 'Obras de Arte',
            descripcion: 'Subasta y comercialización de obras de arte',
            umbralIdentificacion: 2410,
            umbralAviso: 4815,
            tipoOperaciones: ['subasta', 'comercializacion'],
            activo: true
        },
        'vehiculos': {
            id: 'vehiculos',
            fraccion: 'VIII',
            nombre: 'Vehículos',
            descripcion: 'Distribución y comercialización de vehículos terrestres, marítimos y aéreos',
            umbralIdentificacion: 3210,
            umbralAviso: 6420,
            tipoOperaciones: ['distribucion', 'comercializacion'],
            activo: true
        },
        'blindaje': {
            id: 'blindaje',
            fraccion: 'IX',
            nombre: 'Servicios de Blindaje',
            descripcion: 'Blindaje de vehículos y bienes inmuebles',
            umbralIdentificacion: 2410,
            umbralAviso: 4815,
            tipoOperaciones: ['blindaje_vehiculos', 'blindaje_inmuebles'],
            activo: true
        },
        'traslado_valores': {
            id: 'traslado_valores',
            fraccion: 'X',
            nombre: 'Traslado y Custodia de Valores',
            descripcion: 'Traslado y custodia de dinero o valores',
            umbralIdentificacion: 0, // Siempre
            umbralAviso: 3210,
            tipoOperaciones: ['traslado', 'custodia'],
            activo: true
        },
        'servicios_profesionales': {
            id: 'servicios_profesionales',
            fraccion: 'XI',
            nombre: 'Servicios Profesionales',
            descripcion: 'Prestación de servicios profesionales independientes',
            umbralIdentificacion: 0, // Siempre
            umbralAviso: 0, // Cuando se realice operación financiera
            tipoOperaciones: ['compraventa_inmuebles', 'administracion_recursos', 'constitucion_sociedades'],
            activo: true
        },
        'donativos': {
            id: 'donativos',
            fraccion: 'XIII',
            nombre: 'Recepción de Donativos',
            descripcion: 'Recepción de donativos por organizaciones sin fines de lucro',
            umbralIdentificacion: 1605,
            umbralAviso: 3210,
            tipoOperaciones: ['donativo'],
            activo: true
        },
        'arrendamiento': {
            id: 'arrendamiento',
            fraccion: 'XV',
            nombre: 'Arrendamiento de Inmuebles',
            descripcion: 'Derechos personales de uso y goce de bienes inmuebles',
            umbralIdentificacion: 1605,
            umbralAviso: 3210,
            tipoOperaciones: ['arrendamiento'],
            activo: true
        },
        'activos_virtuales': {
            id: 'activos_virtuales',
            fraccion: 'XVI',
            nombre: 'Operaciones con Activos Virtuales',
            descripcion: 'PSAV - Proveedores de Servicios de Activos Virtuales',
            umbralIdentificacion: 0, // Siempre
            umbralAviso: 210,
            tipoOperaciones: ['intercambio', 'custodia', 'transferencia'],
            activo: true
        },
        'fe_publica_notarios': {
            id: 'fe_publica_notarios',
            fraccion: 'XII',
            nombre: 'Fe Pública (Notarios y Corredores)',
            descripcion: 'Protocolizaciones y actos que conllevan formalización',
            umbralIdentificacion: 0, // Siempre
            umbralAviso: 0, // Siempre o según acto
            tipoOperaciones: ['transmision_inmuebles', 'poderes', 'constitucion_sociedades', 'fideicomisos'],
            activo: true
        },
        'comercio_exterior': {
            id: 'comercio_exterior',
            fraccion: 'XIV',
            nombre: 'Comercio Exterior',
            descripcion: 'Servicios como agente aduanal o agencia aduanal',
            umbralIdentificacion: 0, // Siempre
            umbralAviso: 0, // Siempre según tipo
            tipoOperaciones: ['vehiculos', 'maquinas_juego', 'equipos_tarjetas', 'joyas', 'obras_arte', 'blindaje'],
            activo: true
        }
    },

    /**
     * Obtener todos los giros
     */
    getAll() {
        return Object.values(this.GIROS);
    },

    /**
     * Obtener giro por ID
     */
    getById(id) {
        return this.GIROS[id] || null;
    },

    /**
     * Obtener giros activos
     */
    getActive() {
        return this.getAll().filter(g => g.activo);
    },

    /**
     * Calcular monto en pesos basado en UMA
     */
    calcularMontoUMA(umaMultiple, year = 2025) {
        const umaValues = {
            2025: 113.14,
            2024: 108.57,
            2023: 103.74,
            2022: 96.22,
            2021: 89.62,
            2020: 86.88
        };
        const uma = umaValues[year] || umaValues[2025];
        return umaMultiple * uma;
    },

    /**
     * Obtener umbrales en pesos para un giro
     */
    getUmbralesEnPesos(giroId, year = 2025) {
        const giro = this.getById(giroId);
        if (!giro) return null;

        return {
            identificacion: this.calcularMontoUMA(giro.umbralIdentificacion, year),
            aviso: this.calcularMontoUMA(giro.umbralAviso, year)
        };
    },

    /**
     * Inicializar giros en IndexedDB
     */
    async seedGiros() {
        const giros = this.getAll();
        await dbService.addItems('giros', giros);
        console.log(`✅ ${giros.length} giros cargados en DB`);
    }
};

// Export for use in app.js
if (typeof window !== 'undefined') {
    window.GirosCatalogo = GirosCatalogo;
}
