/**
 * PLD BDU v2 - Admin Panel BDUNITY
 * Vista consolidada multi-empresa y reportes personalizados
 */

const AdminPanelService = {

    /**
     * Obtener métricas consolidadas de todas las empresas
     */
    async getMetricasGlobales() {
        const empresas = await dbService.getAll('empresas');
        const metricas = {
            totalEmpresas: empresas.length,
            empresasActivas: empresas.filter(e => e.activo).length,
            empresas: [],
            totales: {
                operaciones: 0,
                alertas: 0,
                clientes: 0,
                reportes: 0
            }
        };

        for (const empresa of empresas) {
            // Obtener datos por empresa
            const operations = await dbService.getByIndex('operations', 'empresaId', empresa.id);
            const kyc = await dbService.getByIndex('kyc', 'empresaId', empresa.id);
            const reports = await dbService.getAll('reports');

            const empresaMetrics = {
                id: empresa.id,
                nombre: empresa.nombreComercial || empresa.razonSocial,
                rfc: empresa.rfc,
                giros: empresa.giros,
                operaciones: operations?.length || 0,
                clientes: kyc?.length || 0,
                alertas: operations?.filter(o => o.umaEq >= 645).length || 0,
                ultimaActividad: operations?.length > 0 ?
                    new Date(Math.max(...operations.map(o => new Date(o.fechaProceso || 0)))).toLocaleDateString() :
                    'Sin actividad'
            };

            metricas.empresas.push(empresaMetrics);
            metricas.totales.operaciones += empresaMetrics.operaciones;
            metricas.totales.alertas += empresaMetrics.alertas;
            metricas.totales.clientes += empresaMetrics.clientes;
        }

        metricas.totales.reportes = (await dbService.getAll('reports')).length;

        return metricas;
    },

    /**
     * Obtener ranking de empresas por operaciones
     */
    async getRankingEmpresas() {
        const metricas = await this.getMetricasGlobales();
        return metricas.empresas.sort((a, b) => b.operaciones - a.operaciones);
    },

    /**
     * Obtener empresas con alertas pendientes
     */
    async getEmpresasConAlertas() {
        const metricas = await this.getMetricasGlobales();
        return metricas.empresas.filter(e => e.alertas > 0)
            .sort((a, b) => b.alertas - a.alertas);
    },

    /**
     * Generar reporte consolidado
     */
    async generarReporteConsolidado(opciones = {}) {
        const {
            tipo = 'mensual',
            fechaInicio,
            fechaFin,
            incluirDetalle = true
        } = opciones;

        const metricas = await this.getMetricasGlobales();

        const reporte = {
            titulo: `Reporte ${tipo.charAt(0).toUpperCase() + tipo.slice(1)} Consolidado BDUNITY`,
            fechaGeneracion: new Date().toISOString(),
            periodo: { desde: fechaInicio, hasta: fechaFin },
            resumen: metricas.totales,
            empresas: incluirDetalle ? metricas.empresas : null
        };

        return reporte;
    }
};

// ========== REPORTES PERSONALIZADOS ==========

const ReportesService = {

    /**
     * Plantillas de reportes disponibles
     */
    PLANTILLAS: {
        operaciones_mes: {
            nombre: 'Operaciones Mensuales',
            descripcion: 'Resumen de operaciones del mes con clasificación por umbral',
            campos: ['fecha', 'cliente', 'tipo', 'monto', 'umaEq', 'estado']
        },
        alertas_periodo: {
            nombre: 'Alertas del Periodo',
            descripcion: 'Operaciones que superaron umbral de aviso',
            campos: ['fecha', 'cliente', 'rfc', 'monto', 'umaEq']
        },
        kyc_expedientes: {
            nombre: 'Estado de Expedientes KYC',
            descripcion: 'Porcentaje de completitud de expedientes',
            campos: ['cliente', 'rfc', 'porcentaje', 'documentos_faltantes']
        },
        cumplimiento: {
            nombre: 'Reporte de Cumplimiento',
            descripcion: 'Métricas de cumplimiento normativo',
            campos: ['metrica', 'valor', 'status', 'recomendacion']
        },
        patrones: {
            nombre: 'Análisis de Patrones',
            descripcion: 'Patrones inusuales detectados',
            campos: ['cliente', 'tipo_patron', 'severidad', 'descripcion', 'accion']
        },
        pep_verificacion: {
            nombre: 'Verificación PEP/Sanciones',
            descripcion: 'Resultados de verificación contra listas',
            campos: ['cliente', 'pep', 'ofac', 'pais_riesgo', 'nivel_riesgo']
        }
    },

    /**
     * Generar reporte personalizado
     */
    async generarReporte(plantillaId, opciones = {}) {
        const plantilla = this.PLANTILLAS[plantillaId];
        if (!plantilla) throw new Error(`Plantilla ${plantillaId} no encontrada`);

        const reporte = {
            id: Date.now(),
            plantilla: plantillaId,
            nombre: plantilla.nombre,
            fechaGeneracion: new Date().toISOString(),
            generadoPor: typeof AuthService !== 'undefined' ?
                AuthService.getCurrentUser()?.email : 'Sistema',
            datos: []
        };

        // Generar datos según plantilla
        switch (plantillaId) {
            case 'operaciones_mes':
                reporte.datos = await this.generarOperacionesMes(opciones);
                break;
            case 'alertas_periodo':
                reporte.datos = await this.generarAlertasPeriodo(opciones);
                break;
            case 'kyc_expedientes':
                reporte.datos = await this.generarKYCExpedientes();
                break;
            case 'cumplimiento':
                reporte.datos = await this.generarCumplimiento();
                break;
            case 'patrones':
                reporte.datos = await this.generarPatrones();
                break;
            case 'pep_verificacion':
                reporte.datos = await this.generarVerificacionPEP();
                break;
        }

        return reporte;
    },

    async generarOperacionesMes(opciones) {
        const { periodo } = opciones;
        if (!periodo) return [];

        const ops = await dbService.getByIndex('operations', 'periodoId', parseInt(periodo));
        return ops.map(o => ({
            fecha: o.fechaProceso,
            cliente: `${o.firstname} ${o.lastname}`,
            tipo: o.tipo,
            monto: o.monto,
            umaEq: o.umaEq?.toFixed(2),
            estado: o.umaEq >= 645 ? 'AVISO' : o.umaEq >= 325 ? 'MONITOREO' : 'NORMAL'
        }));
    },

    async generarAlertasPeriodo(opciones) {
        const ops = await dbService.getAll('operations');
        return ops.filter(o => o.umaEq >= 645).map(o => ({
            fecha: o.fechaProceso,
            cliente: `${o.firstname} ${o.lastname}`,
            rfc: o.rfc,
            monto: o.monto,
            umaEq: o.umaEq?.toFixed(2)
        }));
    },

    async generarKYCExpedientes() {
        if (typeof DocumentosService === 'undefined') return [];
        return await DocumentosService.reporteExpedientesIncompletos();
    },

    async generarCumplimiento() {
        if (typeof ComplianceService === 'undefined') return [];
        const metricas = await ComplianceService.calcularMetricas();
        if (!metricas) return [];

        return [
            {
                metrica: 'Reportes Generados (12 meses)',
                valor: metricas.reportes.ultimos12Meses,
                status: metricas.reportes.ultimos12Meses >= 12 ? 'OK' : 'REVISAR',
                recomendacion: 'Generar reportes mensuales consistentemente'
            },
            {
                metrica: 'Operaciones con Alerta',
                valor: metricas.operaciones.conAlerta,
                status: 'INFO',
                recomendacion: 'Revisar expedientes de clientes con alertas'
            },
            {
                metrica: 'Tasa de Alertas',
                valor: metricas.operaciones.tasaAlertas + '%',
                status: parseFloat(metricas.operaciones.tasaAlertas) < 10 ? 'OK' : 'REVISAR',
                recomendacion: 'Monitorear tendencia de tasa de alertas'
            },
            {
                metrica: 'Score de Cumplimiento',
                valor: metricas.cumplimiento.score,
                status: metricas.cumplimiento.score >= 80 ? 'OPTIMO' : 'MEJORAR',
                recomendacion: metricas.cumplimiento.estado
            }
        ];
    },

    async generarPatrones() {
        if (typeof ComplianceService === 'undefined') return [];
        const ops = await dbService.getAll('operations');
        const alertas = await ComplianceService.detectarPatrones(ops);
        return alertas.map(a => ({
            cliente: a.nombre,
            tipo_patron: a.tipo,
            severidad: a.severidad,
            descripcion: a.descripcion,
            accion: a.accion
        }));
    },

    async generarVerificacionPEP() {
        if (typeof ListasControlService === 'undefined') return [];
        const clientes = await dbService.getAll('kyc');
        const resultados = [];

        for (const cliente of clientes.slice(0, 100)) { // Limitar a 100
            const pep = ListasControlService.verificarPEP(cliente);
            const pais = ListasControlService.verificarPais(cliente.paisNacionalidad || 'MX');

            resultados.push({
                cliente: `${cliente.firstname} ${cliente.lastname}`,
                pep: pep.esPEP ? 'SÍ' : 'NO',
                ofac: 'Pendiente', // Requiere API
                pais_riesgo: pais.esRiesgo ? 'SÍ' : 'NO',
                nivel_riesgo: pep.riesgo
            });
        }

        return resultados;
    },

    /**
     * Exportar reporte a Excel
     */
    exportarExcel(reporte) {
        if (typeof XLSX === 'undefined') {
            console.error('XLSX library not loaded');
            return;
        }

        const ws = XLSX.utils.json_to_sheet(reporte.datos);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
        XLSX.writeFile(wb, `${reporte.nombre}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    },

    /**
     * Exportar reporte a PDF
     */
    exportarPDF(reporte) {
        if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
            console.error('jsPDF library not loaded');
            return;
        }

        const { jsPDF } = window.jspdf || jspdf;
        const doc = new jsPDF();

        doc.setFontSize(16);
        doc.text(reporte.nombre, 20, 20);

        doc.setFontSize(10);
        doc.text(`Generado: ${new Date(reporte.fechaGeneracion).toLocaleString()}`, 20, 30);

        if (reporte.datos.length > 0) {
            let y = 45;
            const keys = Object.keys(reporte.datos[0]);

            // Headers
            doc.setFontSize(8);
            keys.forEach((key, i) => {
                doc.text(key.toUpperCase(), 20 + (i * 35), y);
            });

            y += 10;

            // Data
            reporte.datos.slice(0, 30).forEach(row => {
                keys.forEach((key, i) => {
                    doc.text(String(row[key] || '').slice(0, 15), 20 + (i * 35), y);
                });
                y += 8;
                if (y > 280) {
                    doc.addPage();
                    y = 20;
                }
            });
        }

        doc.save(`${reporte.nombre}_${new Date().toISOString().slice(0, 10)}.pdf`);
    }
};

// Export
if (typeof window !== 'undefined') {
    window.AdminPanelService = AdminPanelService;
    window.ReportesService = ReportesService;
}
