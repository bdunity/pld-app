/**
 * PLD BDU v2 - Listas de Control (PEP, OFAC, Sanciones)
 * Verificación contra listas de personas de alto riesgo
 */

const ListasControlService = {

    // ========== LISTA PEP (Personas Políticamente Expuestas) ==========

    /**
     * Cargos que califican como PEP según GAFI/FATF
     */
    CARGOS_PEP: [
        // Poder Ejecutivo
        'PRESIDENTE', 'VICEPRESIDENTE', 'JEFE DE ESTADO', 'JEFE DE GOBIERNO',
        'SECRETARIO DE ESTADO', 'SUBSECRETARIO', 'MINISTRO', 'VICEMINISTRO',
        'GOBERNADOR', 'ALCALDE', 'PRESIDENTE MUNICIPAL',

        // Poder Legislativo
        'SENADOR', 'DIPUTADO FEDERAL', 'DIPUTADO LOCAL', 'CONGRESISTA',
        'LEGISLADOR', 'ASAMBLEISTA',

        // Poder Judicial
        'MINISTRO SUPREMA CORTE', 'MAGISTRADO', 'JUEZ FEDERAL', 'JUEZ',
        'FISCAL GENERAL', 'PROCURADOR', 'CONSEJERO JUDICATURA',

        // Organismos Autónomos
        'CONSEJERO INE', 'COMISIONADO INAI', 'COMISIONADO COFECE',
        'AUDITOR SUPERIOR', 'GOBERNADOR BANXICO', 'SUBGOBERNADOR BANXICO',

        // Fuerzas Armadas y Seguridad
        'GENERAL', 'ALMIRANTE', 'SECRETARIO DEFENSA', 'SECRETARIO MARINA',
        'COMANDANTE', 'CORONEL', 'DIRECTOR SEGURIDAD',

        // Empresas del Estado
        'DIRECTOR GENERAL PEMEX', 'DIRECTOR GENERAL CFE', 'DIRECTOR GENERAL IMSS',

        // Partidos Políticos
        'PRESIDENTE PARTIDO', 'SECRETARIO GENERAL PARTIDO', 'DIRIGENTE PARTIDO',

        // Internacional
        'EMBAJADOR', 'CONSUL', 'REPRESENTANTE DIPLOMATICO', 'AGREGADO MILITAR'
    ],

    /**
     l* Lista de familias/apellidos de alto perfil (ejemplo - debe actualizarse)
     */
    APELLIDOS_ALTO_PERFIL: [
        // Esta lista debe ser actualizada con datos reales de fuentes oficiales
        // Por seguridad, aquí solo se incluyen ejemplos genéricos
    ],

    /**
     * Verificar si una persona es PEP
     */
    verificarPEP(persona) {
        const resultado = {
            esPEP: false,
            nivel: null, // 'directo', 'familiar', 'asociado'
            indicadores: [],
            riesgo: 'normal',
            fechaVerificacion: new Date().toISOString()
        };

        const nombreCompleto = `${persona.nombre || ''} ${persona.apellidoPaterno || ''} ${persona.apellidoMaterno || ''}`.toUpperCase();
        const ocupacion = (persona.ocupacion || persona.actividadEconomica || '').toUpperCase();

        // Verificar por cargo/ocupación
        for (const cargo of this.CARGOS_PEP) {
            if (ocupacion.includes(cargo)) {
                resultado.esPEP = true;
                resultado.nivel = 'directo';
                resultado.indicadores.push(`Cargo PEP detectado: ${cargo}`);
                resultado.riesgo = 'alto';
                break;
            }
        }

        // Verificar por monto de operaciones (si está disponible)
        if (persona.montoTotal && persona.montoTotal > 5000000) {
            resultado.indicadores.push('Operaciones superiores a $5M');
            if (!resultado.esPEP) {
                resultado.riesgo = 'medio';
            }
        }

        // Agregar recomendación
        if (resultado.esPEP) {
            resultado.recomendacion = 'Aplicar debida diligencia ampliada (EDD) y obtener aprobación de alta dirección';
        }

        return resultado;
    },

    // ========== LISTA OFAC (Sanciones Internacionales) ==========

    /**
     * Países de alto riesgo según GAFI
     */
    PAISES_ALTO_RIESGO: [
        'COREA DEL NORTE', 'IRAN', 'SIRIA', 'MYANMAR', 'AFGANISTAN',
        'YEMEN', 'HAITI', 'PAKISTAN', 'NIGERIA', 'MALI', 'MOZAMBIQUE',
        'BURKINA FASO', 'CAMERUN', 'SENEGAL', 'TANZANIA', 'CONGO',
        'SUDAN DEL SUR', 'FILIPINAS', 'SUDAFRICA', 'BARBADOS', 'JAMAICA',
        'GIBRALTAR', 'EMIRATOS ARABES UNIDOS', 'UGANDA', 'VIETNAM'
    ],

    /**
     * Verificar país de riesgo
     */
    verificarPais(pais) {
        if (!pais) return { esRiesgo: false };

        const paisUpper = pais.toUpperCase();
        const esRiesgo = this.PAISES_ALTO_RIESGO.some(p =>
            paisUpper.includes(p) || p.includes(paisUpper)
        );

        return {
            esRiesgo,
            nivel: esRiesgo ? 'alto' : 'normal',
            mensaje: esRiesgo ?
                `País ${pais} está en lista de alto riesgo GAFI` :
                'País no está en lista de alto riesgo'
        };
    },

    /**
     * Verificar contra lista OFAC (simulada - en producción usar API oficial)
     * https://sanctionssearch.ofac.treas.gov/
     */
    async verificarOFAC(persona) {
        // NOTA: En producción, esto debería conectarse a la API oficial de OFAC
        // https://ofac-api.com/ o usar el archivo SDN actualizado

        return {
            verificado: true,
            enLista: false,
            fuente: 'OFAC SDN List',
            fechaVerificacion: new Date().toISOString(),
            mensaje: 'Verificación simulada - Conectar a API OFAC en producción'
        };
    },

    /**
     * Verificación completa contra todas las listas
     */
    async verificacionCompleta(persona) {
        const resultados = {
            persona: `${persona.nombre} ${persona.apellidoPaterno}`,
            fechaVerificacion: new Date().toISOString(),
            verificaciones: []
        };

        // PEP Check
        const pepResult = this.verificarPEP(persona);
        resultados.verificaciones.push({
            tipo: 'PEP',
            resultado: pepResult.esPEP ? 'ALERTA' : 'OK',
            detalle: pepResult
        });

        // País de riesgo
        if (persona.paisNacionalidad) {
            const paisResult = this.verificarPais(persona.paisNacionalidad);
            resultados.verificaciones.push({
                tipo: 'PAIS_RIESGO',
                resultado: paisResult.esRiesgo ? 'ALERTA' : 'OK',
                detalle: paisResult
            });
        }

        // OFAC Check
        const ofacResult = await this.verificarOFAC(persona);
        resultados.verificaciones.push({
            tipo: 'OFAC',
            resultado: ofacResult.enLista ? 'ALERTA' : 'OK',
            detalle: ofacResult
        });

        // Calcular riesgo global
        const alertas = resultados.verificaciones.filter(v => v.resultado === 'ALERTA').length;
        resultados.riesgoGlobal = alertas >= 2 ? 'CRITICO' : alertas === 1 ? 'ALTO' : 'NORMAL';
        resultados.requiereRevision = alertas > 0;

        return resultados;
    },

    /**
     * Verificar lote de clientes
     */
    async verificarLote(clientes) {
        const resultados = [];
        for (const cliente of clientes) {
            const resultado = await this.verificacionCompleta(cliente);
            resultados.push(resultado);
        }
        return {
            total: clientes.length,
            conAlertas: resultados.filter(r => r.requiereRevision).length,
            resultados
        };
    }
};

// Export
if (typeof window !== 'undefined') {
    window.ListasControlService = ListasControlService;
}
