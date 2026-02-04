/**
 * PLD BDU v2 - Empresa Configuration Service
 * Configuration management per tenant (empresa) instead of global
 */

const EmpresaConfigService = {
    currentConfig: null,

    /**
     * Default configuration template for new empresas
     */
    DEFAULT_CONFIG: {
        year: 2025,
        uma: 113.14,
        girosActivos: [],
        giroPrincipal: null,
        umbralesPersonalizados: {},
        // Datos fiscales (por empresa)
        domicilioFiscal: {
            calle: '',
            numeroExterior: '',
            numeroInterior: '',
            colonia: '',
            cp: '',
            ciudad: '',
            estado: ''
        },
        // Datos de facturación (por empresa)
        datosFacturacion: {
            regimenFiscal: '',
            usoCFDI: '',
            emailFacturacion: ''
        }
    },

    /**
     * Get config ID for an empresa
     * @param {string} empresaId 
     */
    getConfigId(empresaId) {
        return `config_${empresaId}`;
    },

    /**
     * Load configuration for the current empresa
     * Falls back to empresa data if no specific config exists
     */
    async loadConfig() {
        const user = AuthService?.getCurrentUser();
        if (!user) {
            console.warn('No user context for loading config');
            return null;
        }

        const empresaId = user.empresaId;

        // Super admin may not have an empresaId
        if (!empresaId && user.role !== 'super_admin') {
            console.warn('User has no empresaId');
            return null;
        }

        // For super admin without empresaId, check if viewing a specific empresa
        const targetEmpresaId = empresaId || sessionStorage.getItem('viewing_empresa_id');

        if (!targetEmpresaId) {
            console.log('No empresa context - using global defaults');
            this.currentConfig = { ...this.DEFAULT_CONFIG };
            return this.currentConfig;
        }

        try {
            // Try to load empresa-specific config
            const configId = this.getConfigId(targetEmpresaId);
            const config = await dbService.get('config', configId);

            if (config) {
                this.currentConfig = { ...this.DEFAULT_CONFIG, ...config, empresaId: targetEmpresaId };
            } else {
                // Create default config for this empresa
                const empresa = await dbService.get('empresas', targetEmpresaId);
                this.currentConfig = {
                    ...this.DEFAULT_CONFIG,
                    id: configId,
                    empresaId: targetEmpresaId,
                    rfc: empresa?.rfc || '',
                    razonSocial: empresa?.razonSocial || '',
                    nombreComercial: empresa?.nombreComercial || '',
                    girosActivos: empresa?.giros || ['juegos_sorteos'],
                    giroPrincipal: empresa?.giros?.[0] || 'juegos_sorteos'
                };
            }

            console.log(`📋 Config loaded for empresa: ${targetEmpresaId}`);
            return this.currentConfig;
        } catch (error) {
            console.error('Error loading empresa config:', error);
            this.currentConfig = { ...this.DEFAULT_CONFIG };
            return this.currentConfig;
        }
    },

    /**
     * Save configuration for the current empresa
     * @param {Object} configData - Configuration data to save
     */
    async saveConfig(configData) {
        const user = AuthService?.getCurrentUser();
        if (!user) {
            throw new Error('No hay sesión de usuario activa');
        }

        const empresaId = configData.empresaId || user.empresaId;
        if (!empresaId) {
            throw new Error('No se pudo determinar la empresa');
        }

        // Only admin or super_admin can save config
        if (!AuthService.hasPermission('admin')) {
            throw new Error('No tienes permisos para modificar la configuración');
        }

        const configId = this.getConfigId(empresaId);

        const configToSave = {
            ...this.currentConfig,
            ...configData,
            id: configId,
            empresaId: empresaId,
            updatedAt: new Date().toISOString(),
            updatedBy: user.email
        };

        // Remove any undefined values
        Object.keys(configToSave).forEach(key => {
            if (configToSave[key] === undefined) {
                delete configToSave[key];
            }
        });

        await dbService.addItems('config', [configToSave]);
        this.currentConfig = configToSave;

        // Also update empresa document with core data
        const empresaUpdate = {
            id: empresaId,
            rfc: configToSave.rfc,
            razonSocial: configToSave.razonSocial,
            nombreComercial: configToSave.nombreComercial,
            giros: configToSave.girosActivos,
            domicilio: configToSave.domicilioFiscal,
            updated: new Date().toISOString()
        };

        await dbService.addItems('empresas', [empresaUpdate]);

        await AuthService?.logAudit('CONFIG_UPDATE',
            `Configuración actualizada para empresa: ${empresaId}`);

        console.log(`✅ Config saved for empresa: ${empresaId}`);
        return configToSave;
    },

    /**
     * Get current configuration
     */
    getConfig() {
        return this.currentConfig || this.DEFAULT_CONFIG;
    },

    /**
     * Get UMA value for a specific year
     * @param {number} year 
     */
    getUMAValue(year = 2025) {
        const umaValues = {
            2026: 116.94,  // Estimated
            2025: 113.14,
            2024: 108.57,
            2023: 103.74,
            2022: 96.22,
            2021: 89.62,
            2020: 86.88
        };
        return umaValues[year] || umaValues[2025];
    },

    /**
     * Get threshold values for the current empresa's primary giro
     */
    getUmbrales() {
        const config = this.getConfig();
        const giroPrincipal = config.giroPrincipal;

        if (!giroPrincipal) {
            return { identificacion: 325, aviso: 645 }; // JYS defaults
        }

        // Check for custom thresholds first
        if (config.umbralesPersonalizados?.[giroPrincipal]) {
            return config.umbralesPersonalizados[giroPrincipal];
        }

        // Get from giros catalog
        if (typeof GirosCatalogo !== 'undefined') {
            const giro = GirosCatalogo.getById(giroPrincipal);
            if (giro) {
                return {
                    identificacion: giro.umbralIdentificacion,
                    aviso: giro.umbralAviso
                };
            }
        }

        return { identificacion: 325, aviso: 645 };
    },

    /**
     * Get thresholds in pesos (UMA * threshold)
     */
    getUmbralesEnPesos() {
        const config = this.getConfig();
        const uma = config.uma || 113.14;
        const umbrales = this.getUmbrales();

        return {
            identificacion: umbrales.identificacion * uma,
            aviso: umbrales.aviso * uma
        };
    },

    /**
     * Load config for a specific empresa (for super_admin viewing)
     * @param {string} empresaId 
     */
    async loadConfigForEmpresa(empresaId) {
        const user = AuthService?.getCurrentUser();
        if (user?.role !== 'super_admin') {
            throw new Error('Only super_admin can view other empresa configs');
        }

        sessionStorage.setItem('viewing_empresa_id', empresaId);
        return await this.loadConfig();
    },

    /**
     * Clear viewing context (super_admin)
     */
    clearViewingContext() {
        sessionStorage.removeItem('viewing_empresa_id');
        this.currentConfig = null;
    }
};

// Export
if (typeof window !== 'undefined') {
    window.EmpresaConfigService = EmpresaConfigService;
}
