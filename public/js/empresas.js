/**
 * PLD BDU v2 - Empresas Service (Multi-Tenant)
 * Gestión de empresas (tenants) en la plataforma
 */

const EmpresasService = {
    currentEmpresa: null,

    /**
     * Empresa por defecto (10bet Casino)
     */
    DEFAULT_EMPRESA: {
        id: 'empresa_10bet',
        rfc: 'SPE091216B35',
        razonSocial: 'Sao Paulo Entretenimiento S.A. de C.V.',
        nombreComercial: '10bet Casino',
        giros: ['juegos_sorteos'],
        domicilio: {
            calle: '',
            colonia: '',
            cp: '',
            ciudad: '',
            estado: ''
        },
        contacto: {
            nombre: '',
            email: '',
            telefono: ''
        },
        activo: true,
        created: new Date().toISOString()
    },

    /**
     * Inicializar servicio de empresas
     */
    async init() {
        const empresas = await dbService.getAll('empresas');

        // Si no hay empresas, crear la default
        if (empresas.length === 0) {
            await this.create(this.DEFAULT_EMPRESA);
            console.log('🏢 Empresa por defecto creada: 10bet Casino');
        }

        // Inicializar catálogo de giros si está vacío
        const giros = await dbService.getAll('giros');
        if (giros.length === 0 && typeof GirosCatalogo !== 'undefined') {
            await GirosCatalogo.seedGiros();
        }

        // Seleccionar primera empresa por defecto
        const all = await this.getAll();
        if (all.length > 0) {
            this.currentEmpresa = all[0];
        }

        return this.currentEmpresa;
    },

    /**
     * Obtener todas las empresas
     */
    async getAll() {
        return await dbService.getAll('empresas');
    },

    /**
     * Obtener empresa por ID
     */
    async getById(id) {
        return await dbService.get('empresas', id);
    },

    /**
     * Obtener empresa por RFC
     */
    async getByRFC(rfc) {
        const empresas = await dbService.getByIndex('empresas', 'rfc', rfc);
        return empresas.length > 0 ? empresas[0] : null;
    },

    /**
     * Crear nueva empresa
     */
    async create(empresa) {
        // Validar RFC único
        const existing = await this.getByRFC(empresa.rfc);
        if (existing) {
            throw new Error(`Ya existe una empresa con RFC: ${empresa.rfc}`);
        }

        // Generar ID si no tiene
        if (!empresa.id) {
            empresa.id = 'empresa_' + Date.now();
        }

        empresa.created = new Date().toISOString();
        empresa.activo = empresa.activo !== false;

        await dbService.addItems('empresas', [empresa]);
        return empresa;
    },

    /**
     * Actualizar empresa
     */
    async update(empresa) {
        empresa.updated = new Date().toISOString();
        await dbService.addItems('empresas', [empresa]);

        // Actualizar currentEmpresa si es la misma
        if (this.currentEmpresa && this.currentEmpresa.id === empresa.id) {
            this.currentEmpresa = empresa;
        }

        return empresa;
    },

    /**
     * Eliminar empresa
     */
    async delete(id) {
        if (id === 'empresa_10bet') {
            throw new Error('No se puede eliminar la empresa por defecto');
        }
        await dbService.delete('empresas', id);
    },

    /**
     * Seleccionar empresa actual
     */
    async selectEmpresa(id) {
        const empresa = await this.getById(id);
        if (!empresa) {
            throw new Error('Empresa no encontrada');
        }
        this.currentEmpresa = empresa;

        // Guardar en sessionStorage
        sessionStorage.setItem('currentEmpresaId', id);

        return empresa;
    },

    /**
     * Obtener empresa actual
     */
    getCurrentEmpresa() {
        return this.currentEmpresa;
    },

    /**
     * Obtener giros de la empresa actual
     */
    async getCurrentGiros() {
        if (!this.currentEmpresa) return [];

        const girosIds = this.currentEmpresa.giros || [];
        const giros = [];

        for (const id of girosIds) {
            if (typeof GirosCatalogo !== 'undefined') {
                const giro = GirosCatalogo.getById(id);
                if (giro) giros.push(giro);
            }
        }

        return giros;
    },

    /**
     * Obtener parámetros del giro principal de la empresa
     */
    async getMainGiroParams(year = 2025) {
        const giros = await this.getCurrentGiros();
        if (giros.length === 0) return null;

        const mainGiro = giros[0];
        const umbrales = GirosCatalogo.getUmbralesEnPesos(mainGiro.id, year);

        return {
            giro: mainGiro,
            umbralIdentificacionPesos: umbrales.identificacion,
            umbralAvisoPesos: umbrales.aviso,
            umbralIdentificacionUMA: mainGiro.umbralIdentificacion,
            umbralAvisoUMA: mainGiro.umbralAviso
        };
    },

    /**
     * Agregar giro a empresa
     */
    async addGiro(empresaId, giroId) {
        const empresa = await this.getById(empresaId);
        if (!empresa) throw new Error('Empresa no encontrada');

        if (!empresa.giros) empresa.giros = [];
        if (!empresa.giros.includes(giroId)) {
            empresa.giros.push(giroId);
            await this.update(empresa);
        }

        return empresa;
    },

    /**
     * Remover giro de empresa
     */
    async removeGiro(empresaId, giroId) {
        const empresa = await this.getById(empresaId);
        if (!empresa) throw new Error('Empresa no encontrada');

        empresa.giros = (empresa.giros || []).filter(g => g !== giroId);
        await this.update(empresa);

        return empresa;
    }
};

// Export for use in app.js
if (typeof window !== 'undefined') {
    window.EmpresasService = EmpresasService;
}
