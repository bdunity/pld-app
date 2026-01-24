/**
 * PLD BDU v2 - XML Engine (Modular Router)
 * Routes XML generation to specific activity generators
 * Preserves existing JYS logic while enabling multi-activity support
 */

const XMLEngine = {
    generators: {},
    parsers: {},

    /**
     * Register a generator for a specific giro
     * @param {string} giroId - e.g., 'juegos_sorteos'
     * @param {Object} generator - Generator instance with generate() method
     */
    registerGenerator(giroId, generator) {
        this.generators[giroId] = generator;
        console.log(`📄 XML Generator registered: ${giroId}`);
    },

    /**
     * Register a parser for a specific giro
     * @param {string} giroId 
     * @param {Object} parser - Parser instance with parse() method
     */
    registerParser(giroId, parser) {
        this.parsers[giroId] = parser;
        console.log(`📊 Excel Parser registered: ${giroId}`);
    },

    /**
     * Get available generators
     */
    getAvailableGenerators() {
        return Object.keys(this.generators);
    },

    /**
     * Generate XML for a specific activity
     * @param {string} giroId - Activity identifier
     * @param {Object} config - Generation configuration
     */
    async generate(giroId, config) {
        const generator = this.generators[giroId];

        if (!generator) {
            throw new Error(`No hay generador XML disponible para: ${giroId}. Disponibles: ${this.getAvailableGenerators().join(', ')}`);
        }

        // Add empresa context
        const user = AuthService?.getCurrentUser();
        const empresaConfig = EmpresaConfigService?.getConfig();

        const fullConfig = {
            ...config,
            empresaId: user?.empresaId,
            rfcSujetoObligado: config.rfcSujetoObligado || empresaConfig?.rfc,
            generatedAt: new Date().toISOString(),
            generatedBy: user?.email
        };

        // Generate XML
        const result = await generator.generate(fullConfig);

        // Validate if validator exists
        if (typeof XMLValidator !== 'undefined') {
            const validation = XMLValidator.validate(result.xml, giroId);
            result.validation = validation;
        }

        // Store report record
        await this.storeReport({
            giroId,
            periodoId: config.mesReportado,
            empresaId: fullConfig.empresaId,
            tipoReporte: result.tipo || 'aviso',
            totalAvisos: result.totalAvisos || 0,
            archivoNombre: result.filename,
            contenidoXML: result.xml,
            generadoPor: fullConfig.generatedBy
        });

        return result;
    },

    /**
     * Store XML report record in Firestore
     */
    async storeReport(report) {
        const reportRecord = {
            id: `xml_${Date.now()}`,
            ...report,
            createdAt: new Date().toISOString()
        };

        try {
            await dbService.addItems('xml_reports', [reportRecord]);
            console.log(`✅ XML Report stored: ${reportRecord.id}`);
        } catch (error) {
            console.error('Error storing XML report:', error);
        }

        return reportRecord;
    },

    /**
     * Get report history for current empresa
     * @param {Object} filters - Optional filters (giroId, periodoId, etc.)
     */
    async getReportHistory(filters = {}) {
        try {
            let reports = await dbService.getAll('xml_reports');

            if (filters.giroId) {
                reports = reports.filter(r => r.giroId === filters.giroId);
            }
            if (filters.periodoId) {
                reports = reports.filter(r => r.periodoId === filters.periodoId);
            }

            // Sort by date descending
            return reports.sort((a, b) =>
                new Date(b.createdAt) - new Date(a.createdAt)
            );
        } catch (error) {
            console.error('Error getting report history:', error);
            return [];
        }
    },

    /**
     * Parse Excel file for a specific activity
     * @param {string} giroId 
     * @param {ArrayBuffer} fileData 
     */
    async parseExcel(giroId, fileData) {
        const parser = this.parsers[giroId];

        if (!parser) {
            // Fall back to default parser if no specific one exists
            console.warn(`No parser for ${giroId}, using default`);
            return this.defaultParse(fileData);
        }

        return await parser.parse(fileData);
    },

    /**
     * Default Excel parser (current behavior)
     */
    defaultParse(fileData) {
        const workbook = XLSX.read(fileData, { type: 'array', cellDates: true });
        return { workbook, sheets: workbook.SheetNames };
    },

    /**
     * Generate "Informe en Cero" for any activity
     * @param {string} giroId 
     * @param {Object} config 
     */
    async generateInformeCero(giroId, config) {
        const generator = this.generators[giroId];

        if (generator && typeof generator.generateInformeCero === 'function') {
            return await generator.generateInformeCero(config);
        }

        // Fall back to base implementation
        return XMLGeneratorBase.generateInformeCero({
            ...config,
            giroId
        });
    }
};

/**
 * Base XML Generator class - common functionality for all activities
 */
const XMLGeneratorBase = {
    /**
     * Escape XML special characters
     */
    escapeXML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;')
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    },

    /**
     * Format date to YYYYMMDD
     */
    formatDate(rawDate) {
        if (!rawDate) return this.formatDate(new Date());
        try {
            const d = typeof rawDate === 'string' ? new Date(rawDate) : rawDate;
            if (isNaN(d.getTime())) return '19000101';
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}${month}${day}`;
        } catch (e) {
            return '19000101';
        }
    },

    /**
     * Generate unique reference for aviso
     */
    generateReferencia(rfc, mesReportado, consecutivo = 1) {
        return `AVISO-${rfc}-${mesReportado}-${String(consecutivo).padStart(4, '0')}`;
    },

    /**
     * Generate Informe en Cero (base implementation)
     */
    generateInformeCero(config) {
        const giroInfo = typeof GirosCatalogo !== 'undefined'
            ? GirosCatalogo.getById(config.giroId)
            : null;

        const claveActividad = giroInfo?.id?.toUpperCase() || 'JYS';
        const namespace = `http://www.uif.shcp.gob.mx/recepcion/${claveActividad.toLowerCase()}`;

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += `<archivo xmlns="${namespace}" `;
        xml += 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ';
        xml += `xsi:schemaLocation="${namespace} ${claveActividad.toLowerCase()}.xsd">\n`;
        xml += '  <informe>\n';
        xml += `    <mes_reportado>${config.mesReportado}</mes_reportado>\n`;
        xml += '    <sujeto_obligado>\n';
        xml += `      <clave_sujeto_obligado>${config.rfcSujetoObligado}</clave_sujeto_obligado>\n`;
        xml += `      <clave_actividad>${claveActividad}</clave_actividad>\n`;
        xml += '      <exento>1</exento>\n';
        xml += '    </sujeto_obligado>\n';
        xml += '  </informe>\n';
        xml += '</archivo>';

        return {
            xml,
            tipo: 'informe_cero',
            totalAvisos: 0,
            filename: `Informe_Cero_${claveActividad}_${config.mesReportado}.xml`
        };
    },

    /**
     * Download XML as file
     */
    download(xmlString, filename) {
        const blob = new Blob([xmlString], { type: 'text/xml;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }
};

// Export
if (typeof window !== 'undefined') {
    window.XMLEngine = XMLEngine;
    window.XMLGeneratorBase = XMLGeneratorBase;
}
