/**
 * PLD BDU v2 - Cargas Service
 * Manages data import history per empresa with tenant isolation
 */

const CargasService = {
    /**
     * Create a new carga record
     * @param {Object} cargaData
     */
    async create(cargaData) {
        const user = AuthService?.getCurrentUser();
        const empresaId = user?.empresaId || cargaData.empresaId;

        if (!empresaId) {
            throw new Error('No se puede crear carga sin empresa asociada');
        }

        const carga = {
            id: `carga_${Date.now()}`,
            empresaId: empresaId,
            giroId: cargaData.giroId || 'juegos_sorteos',
            periodoId: cargaData.periodoId,
            archivoNombre: cargaData.archivoNombre,
            archivoTipo: cargaData.archivoTipo || 'xlsx',
            totalRegistros: cargaData.totalRegistros || 0,
            registrosDepositados: cargaData.registrosDepositados || 0,
            registrosRetiros: cargaData.registrosRetiros || 0,
            registrosKYC: cargaData.registrosKYC || 0,
            status: 'completado',
            creadoPor: user?.email,
            createdAt: new Date().toISOString()
        };

        await dbService.addItems('cargas', [carga]);
        console.log(`📦 Carga registrada: ${carga.id}`);

        return carga;
    },

    /**
     * Get all cargas for current empresa
     */
    async getAll() {
        return await dbService.getAll('cargas');
    },

    /**
     * Get cargas by periodo
     * @param {number} periodoId 
     */
    async getByPeriodo(periodoId) {
        return await dbService.getByIndex('cargas', 'periodoId', periodoId);
    },

    /**
     * Get cargas by giro
     * @param {string} giroId 
     */
    async getByGiro(giroId) {
        return await dbService.getByIndex('cargas', 'giroId', giroId);
    },

    /**
     * Get carga statistics
     */
    async getStats() {
        const cargas = await this.getAll();

        return {
            total: cargas.length,
            ultimaCarga: cargas.length > 0
                ? cargas.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
                : null,
            totalRegistros: cargas.reduce((sum, c) => sum + (c.totalRegistros || 0), 0),
            porGiro: cargas.reduce((acc, c) => {
                acc[c.giroId] = (acc[c.giroId] || 0) + 1;
                return acc;
            }, {}),
            porPeriodo: cargas.reduce((acc, c) => {
                acc[c.periodoId] = (acc[c.periodoId] || 0) + 1;
                return acc;
            }, {})
        };
    }
};

// Export
if (typeof window !== 'undefined') {
    window.CargasService = CargasService;
}
