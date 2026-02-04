/**
 * PLD BDU v2 - Compliance Module
 * Calendario de obligaciones, detección de patrones y alertas
 */

const ComplianceService = {

    // Configuración de obligaciones PLD
    OBLIGACIONES: {
        avisos: {
            nombre: 'Presentación de Avisos',
            diaLimite: 17,
            descripcion: 'Los avisos deben presentarse a más tardar el día 17 del mes siguiente',
            diasAnticipacion: [7, 3, 1] // Días antes para alertar
        },
        informeCero: {
            nombre: 'Informe en Cero',
            diaLimite: 17,
            descripcion: 'Si no hay operaciones reportables, presentar informe en cero',
            diasAnticipacion: [7, 3, 1]
        },
        actualizacionKYC: {
            nombre: 'Actualización Expedientes KYC',
            periodicidadMeses: 12,
            descripcion: 'Revisar y actualizar expedientes de clientes',
            diasAnticipacion: [30, 15, 7]
        }
    },

    /**
     * Obtener obligaciones pendientes
     */
    getObligacionesPendientes() {
        const hoy = new Date();
        const obligaciones = [];

        // Calcular próxima fecha de avisos
        const proximoAviso = this.getProximaFechaAviso();
        const diasParaAviso = this.diasEntre(hoy, proximoAviso);

        if (diasParaAviso <= 17) {
            obligaciones.push({
                tipo: 'avisos',
                nombre: this.OBLIGACIONES.avisos.nombre,
                fechaLimite: proximoAviso,
                diasRestantes: diasParaAviso,
                urgencia: this.calcularUrgencia(diasParaAviso),
                descripcion: `Presentar avisos del mes ${this.getMesPrevio()}`,
                accion: 'Generar y enviar XML de avisos'
            });
        }

        // Verificar si hay que presentar informe en cero
        obligaciones.push({
            tipo: 'informeCero',
            nombre: 'Verificar Informe en Cero',
            fechaLimite: proximoAviso,
            diasRestantes: diasParaAviso,
            urgencia: diasParaAviso <= 3 ? 'alta' : 'media',
            descripcion: 'Verificar si hay operaciones reportables',
            accion: 'Si no hay avisos, generar informe en cero'
        });

        return obligaciones;
    },

    /**
     * Obtener próxima fecha límite de avisos (día 17 del mes siguiente)
     */
    getProximaFechaAviso() {
        const hoy = new Date();
        let year = hoy.getFullYear();
        let month = hoy.getMonth() + 1; // Mes siguiente

        // Si ya pasó el día 17 de este mes, el próximo es el siguiente mes
        if (hoy.getDate() > 17) {
            month++;
        }

        if (month > 12) {
            month = 1;
            year++;
        }

        return new Date(year, month - 1, 17); // month es 0-indexed
    },

    /**
     * Obtener mes previo en formato legible
     */
    getMesPrevio() {
        const hoy = new Date();
        const mesPrevio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
        return mesPrevio.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    },

    /**
     * Calcular días entre dos fechas
     */
    diasEntre(fecha1, fecha2) {
        const diffTime = fecha2.getTime() - fecha1.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    },

    /**
     * Calcular nivel de urgencia
     */
    calcularUrgencia(diasRestantes) {
        if (diasRestantes <= 0) return 'vencida';
        if (diasRestantes <= 3) return 'critica';
        if (diasRestantes <= 7) return 'alta';
        if (diasRestantes <= 14) return 'media';
        return 'baja';
    },

    /**
     * Calcular nivel de urgencia
     */
    calcularRiesgo(cliente) {
        let score = 0;
        let factores = [];

        // 1. PEP Check
        if (cliente.pep) {
            score += 50;
            factores.push('Persona Políticamente Expuesta (PEP)');
        }

        // 2. High Risk State (ENR 2023)
        const highRiskStates = ['Sinaloa', 'Tamaulipas', 'Michoacán', 'Guerrero', 'Jalisco', 'Guanajuato', 'Baja California'];
        if (highRiskStates.includes(cliente.entidad)) {
            score += 25;
            factores.push(`Entidad de Alto Riesgo: ${cliente.entidad}`);
        }

        // 3. Age Risk
        const age = this.calcularEdad(cliente.fechaNacimiento);
        if (age < 21 || age > 80) {
            score += 15;
            factores.push(`Edad Inusual: ${age} años`);
        }

        // 4. Activity Risk (Example)
        const riskyActivities = ['Juegos/Apuestas', 'Metales/Joyas', 'Blindaje', 'Obras de Arte'];
        if (riskyActivities.some(act => (cliente.actividad || '').includes(act))) {
            score += 30;
            factores.push('Actividad Vulnerable');
        }

        // Normalization (Cap at 100)
        score = Math.min(score, 100);

        // Determine Level
        let nivel = 'Bajo';
        if (score >= 70) nivel = 'Alto';
        else if (score >= 40) nivel = 'Medio';

        return { nivel, score, factores };
    },

    calcularEdad(fecha) {
        if (!fecha) return 0;
        const hoy = new Date();
        const cumpleanos = new Date(fecha);
        let edad = hoy.getFullYear() - cumpleanos.getFullYear();
        const m = hoy.getMonth() - cumpleanos.getMonth();
        if (m < 0 || (m === 0 && hoy.getDate() < cumpleanos.getDate())) {
            edad--;
        }
        return edad;
    },

    // ========== DETECCIÓN DE PATRONES ==========

    /**
     * Detectar patrones inusuales en operaciones
     */
    async detectarPatrones(operaciones, config = {}) {
        const {
            umbralFraccionamiento = 10000, // Monto típico de fraccionamiento
            umbralIncrementoSospechoso = 3, // Incremento 3x respecto a promedio
            periodoAnalisis = 30 // Días
        } = config;

        const alertas = [];

        // Agrupar operaciones por cliente
        const opsPorCliente = new Map();
        operaciones.forEach(op => {
            if (!opsPorCliente.has(op.playercode)) {
                opsPorCliente.set(op.playercode, []);
            }
            opsPorCliente.get(op.playercode).push(op);
        });

        for (const [playercode, ops] of opsPorCliente) {
            const cliente = ops[0];

            // Patrón 1: Fraccionamiento (Smurfing)
            const fraccionamiento = this.detectarFraccionamiento(ops, umbralFraccionamiento);
            if (fraccionamiento.detectado) {
                alertas.push({
                    tipo: 'FRACCIONAMIENTO',
                    severidad: 'alta',
                    playercode,
                    nombre: `${cliente.firstname} ${cliente.lastname}`,
                    descripcion: `Posible fraccionamiento: ${fraccionamiento.operaciones} operaciones similares de $${fraccionamiento.montoPromedio.toFixed(0)}`,
                    detalle: fraccionamiento,
                    accion: 'Revisar y documentar en expediente'
                });
            }

            // Patrón 2: Incremento súbito de actividad
            const incremento = this.detectarIncrementoSubito(ops, umbralIncrementoSospechoso);
            if (incremento.detectado) {
                alertas.push({
                    tipo: 'INCREMENTO_SUBITO',
                    severidad: 'media',
                    playercode,
                    nombre: `${cliente.firstname} ${cliente.lastname}`,
                    descripcion: `Incremento ${incremento.factor.toFixed(1)}x respecto a promedio histórico`,
                    detalle: incremento,
                    accion: 'Verificar origen de fondos'
                });
            }

            // Patrón 3: Round-tripping (entrada y salida similar)
            const roundTrip = this.detectarRoundTripping(ops);
            if (roundTrip.detectado) {
                alertas.push({
                    tipo: 'ROUND_TRIPPING',
                    severidad: 'alta',
                    playercode,
                    nombre: `${cliente.firstname} ${cliente.lastname}`,
                    descripcion: `Posible round-tripping: depósitos y retiros similares (${roundTrip.porcentajeSimilitud}% similitud)`,
                    detalle: roundTrip,
                    accion: 'Investigar propósito de operaciones'
                });
            }

            // Patrón 4: Operaciones justo bajo umbral
            const underReporting = this.detectarUnderReporting(ops);
            if (underReporting.detectado) {
                alertas.push({
                    tipo: 'UNDER_REPORTING',
                    severidad: 'media',
                    playercode,
                    nombre: `${cliente.firstname} ${cliente.lastname}`,
                    descripcion: `${underReporting.operaciones} operaciones justo bajo el umbral de aviso`,
                    detalle: underReporting,
                    accion: 'Aplicar enfoque basado en riesgo'
                });
            }
        }

        return alertas;
    },

    /**
     * Detectar fraccionamiento (múltiples operaciones pequeñas)
     */
    detectarFraccionamiento(operaciones, umbral) {
        const opsPequenas = operaciones.filter(op =>
            op.monto >= umbral * 0.8 && op.monto <= umbral * 1.2
        );

        if (opsPequenas.length >= 3) {
            const total = opsPequenas.reduce((sum, op) => sum + op.monto, 0);
            return {
                detectado: true,
                operaciones: opsPequenas.length,
                montoTotal: total,
                montoPromedio: total / opsPequenas.length
            };
        }

        return { detectado: false };
    },

    /**
     * Detectar incremento súbito de actividad
     */
    detectarIncrementoSubito(operaciones, factorAlerta) {
        if (operaciones.length < 5) return { detectado: false };

        // Ordenar por fecha
        const sorted = [...operaciones].sort((a, b) =>
            new Date(a.fechaProceso) - new Date(b.fechaProceso)
        );

        // Calcular promedio histórico (primeros 70%)
        const corte = Math.floor(sorted.length * 0.7);
        const historico = sorted.slice(0, corte);
        const reciente = sorted.slice(corte);

        const promedioHistorico = historico.reduce((sum, op) => sum + op.monto, 0) / historico.length;
        const promedioReciente = reciente.reduce((sum, op) => sum + op.monto, 0) / reciente.length;

        if (promedioReciente > promedioHistorico * factorAlerta) {
            return {
                detectado: true,
                factor: promedioReciente / promedioHistorico,
                promedioHistorico,
                promedioReciente
            };
        }

        return { detectado: false };
    },

    /**
     * Detectar round-tripping (depósitos = retiros)
     */
    detectarRoundTripping(operaciones) {
        const depositos = operaciones.filter(op => op.tipo === 'deposito');
        const retiros = operaciones.filter(op => op.tipo === 'retiro');

        if (depositos.length === 0 || retiros.length === 0) {
            return { detectado: false };
        }

        const totalDepositos = depositos.reduce((sum, op) => sum + op.monto, 0);
        const totalRetiros = retiros.reduce((sum, op) => sum + op.monto, 0);

        // Calcular similitud (0-100%)
        const menor = Math.min(totalDepositos, totalRetiros);
        const mayor = Math.max(totalDepositos, totalRetiros);
        const similitud = (menor / mayor) * 100;

        if (similitud >= 80 && totalDepositos >= 50000) {
            return {
                detectado: true,
                totalDepositos,
                totalRetiros,
                porcentajeSimilitud: similitud.toFixed(1)
            };
        }

        return { detectado: false };
    },

    /**
     * Detectar operaciones justo bajo umbral de reporte
     */
    detectarUnderReporting(operaciones) {
        // Umbral de aviso en pesos (645 UMA * 113.14)
        const umbralPesos = 645 * 113.14; // ~73,000
        const margen = umbralPesos * 0.1; // 10% bajo el umbral

        const sospechosas = operaciones.filter(op =>
            op.monto >= (umbralPesos - margen) && op.monto < umbralPesos
        );

        if (sospechosas.length >= 2) {
            return {
                detectado: true,
                operaciones: sospechosas.length,
                montoTotal: sospechosas.reduce((sum, op) => sum + op.monto, 0),
                umbralPesos
            };
        }

        return { detectado: false };
    },

    // ========== DASHBOARD DE CUMPLIMIENTO ==========

    /**
     * Calcular métricas de cumplimiento
     */
    async calcularMetricas() {
        try {
            const reports = await dbService.getAll('reports');
            const operations = await dbService.getAll('operations');
            const audit = await dbService.getAll('audit_logs');

            // Métricas de reportes
            const reportesUltimos12Meses = reports.filter(r => {
                const fecha = new Date(r.fecha);
                const hace12Meses = new Date();
                hace12Meses.setMonth(hace12Meses.getMonth() - 12);
                return fecha >= hace12Meses;
            });

            // Calcular tasa de alertas
            const totalOps = operations.length;
            const opsAlerta = operations.filter(op => op.umaEq >= 645).length;
            const tasaAlertas = totalOps > 0 ? (opsAlerta / totalOps * 100) : 0;

            return {
                reportes: {
                    total: reports.length,
                    ultimos12Meses: reportesUltimos12Meses.length,
                    porMes: reportesUltimos12Meses.length / 12
                },
                operaciones: {
                    total: totalOps,
                    conAlerta: opsAlerta,
                    tasaAlertas: tasaAlertas.toFixed(2)
                },
                auditoría: {
                    acciones: audit.length,
                    ultimaAccion: audit.length > 0 ?
                        new Date(Math.max(...audit.map(a => new Date(a.fecha)))).toLocaleDateString() :
                        'Sin registro'
                },
                cumplimiento: {
                    score: this.calcularScoreCumplimiento(reports, operations),
                    estado: tasaAlertas < 5 ? 'Óptimo' : tasaAlertas < 15 ? 'Normal' : 'Requiere Atención'
                }
            };
        } catch (error) {
            console.error('Error calculando métricas:', error);
            return null;
        }
    },

    /**
     * Calcular score de cumplimiento (0-100)
     */
    calcularScoreCumplimiento(reports, operations) {
        let score = 100;

        // Penalizar si hay muchos meses sin reportes
        const mesesSinReporte = 12 - reports.filter(r => {
            const fecha = new Date(r.fecha);
            const hace12Meses = new Date();
            hace12Meses.setMonth(hace12Meses.getMonth() - 12);
            return fecha >= hace12Meses;
        }).length;

        score -= mesesSinReporte * 5;

        // Penalizar alta tasa de alertas no gestionadas
        const alertasNoGestionadas = operations.filter(op =>
            op.umaEq >= 645 && !op.reportado
        ).length;

        score -= alertasNoGestionadas * 2;

        return Math.max(0, Math.min(100, score));
    },

    // ========== LISTA PEP (Personas Políticamente Expuestas) ==========

    /**
     * Base de datos básica de PEPs mexicanos (se debe expandir)
     * En producción, esto debería venir de una API o base de datos externa
     */
    PEPS_CARGOS: [
        'PRESIDENTE', 'GOBERNADOR', 'SENADOR', 'DIPUTADO', 'MINISTRO',
        'SECRETARIO', 'MAGISTRADO', 'CONSEJERO', 'COMISIONADO', 'PROCURADOR',
        'FISCAL', 'EMBAJADOR', 'DIRECTOR GENERAL', 'PRESIDENTE MUNICIPAL'
    ],

    /**
     * Verificar si un cliente podría ser PEP basado en datos disponibles
     */
    verificarPEP(cliente) {
        const resultado = {
            esPEP: false,
            riesgo: 'bajo',
            indicadores: []
        };

        // Verificar por ocupación/cargo
        if (cliente.ocupacion) {
            const ocupacionUpper = cliente.ocupacion.toUpperCase();
            for (const cargo of this.PEPS_CARGOS) {
                if (ocupacionUpper.includes(cargo)) {
                    resultado.esPEP = true;
                    resultado.riesgo = 'alto';
                    resultado.indicadores.push(`Cargo público: ${cliente.ocupacion}`);
                    break;
                }
            }
        }

        // Verificar por monto de operaciones
        if (cliente.totalOperaciones > 1000000) {
            resultado.indicadores.push('Operaciones superiores a $1M');
            resultado.riesgo = resultado.esPEP ? 'muy-alto' : 'medio';
        }

        return resultado;
    },

    // ========== EXPEDIENTE DE CUMPLIMIENTO (SaaS Feature) ==========

    /**
     * Renderizar gestor de acuses
     */
    async renderAcusesManager() {
        const container = document.getElementById('acusesContainer');
        if (!container) return; // Should be in HTML or created dynamically

        container.innerHTML = `
            <div class="card mt-4">
                <div class="card-header bg-white d-flex justify-content-between align-items-center">
                    <h3 class="card-title">📂 Expediente de Cumplimiento (Acuses SAT)</h3>
                    <button class="btn btn-sm btn-primary" onclick="ComplianceService.showUploadModal()">⬆ Subir Acuse</button>
                </div>
                <div class="card-body">
                    <div id="acusesList" class="list-group list-group-flush">
                        <div class="text-center p-3">
                            <div class="spinner-border text-primary" role="status"></div>
                            <p class="mt-2 text-muted">Cargando acuses...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        await this.loadAcuses();
    },

    /**
     * Cargar acuses desde Firestore
     */
    async loadAcuses() {
        const listContainer = document.getElementById('acusesList');
        if (!listContainer) return;

        try {
            // In real app, query 'compliance_docs' collection
            const user = AuthService.getCurrentUser();
            let docs = [];

            if (user && user.empresaId) {
                docs = await dbService.getByIndex('compliance_docs', 'empresaId', user.empresaId);
            }

            // Sort by date desc
            docs.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

            if (docs.length === 0) {
                listContainer.innerHTML = `
                    <div class="text-center p-4 text-muted">
                        <p style="font-size: 2em;">📄</p>
                        <p>No hay acuses subidos aún.</p>
                        <small>Sube aquí tus acuses de aceptación del portal antilavado.</small>
                    </div>
                `;
                return;
            }

            listContainer.innerHTML = docs.map(doc => `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <strong>${doc.nombre}</strong>
                        <br>
                        <small class="text-muted">Mes: ${doc.mes}/${doc.anio} | Subido: ${new Date(doc.uploadedAt).toLocaleDateString()}</small>
                    </div>
                    <div>
                        <span class="badge badge-success">ACEPTADO</span>
                        <button class="btn btn-sm btn-outline-secondary ml-2" onclick="alert('Descargando ${doc.nombre}...')">⬇</button>
                    </div>
                </div>
            `).join('');

        } catch (error) {
            console.error(error);
            listContainer.innerHTML = '<p class="text-danger text-center">Error cargando acuses</p>';
        }
    },

    /**
     * Mostrar modal de carga
     */
    showUploadModal() {
        const modalHtml = `
            <div id="uploadAcuseModal" class="modal active" style="z-index: 10002;">
                <div class="modal-content">
                    <span class="close" onclick="document.getElementById('uploadAcuseModal').remove()">&times;</span>
                    <h3>Subir Acuse SAT</h3>
                    <form onsubmit="return false;">
                        <div class="form-group">
                            <label>Periodo</label>
                            <div class="d-flex gap-2">
                                <select id="acuseMes" class="form-control">
                                    <option value="1">Enero</option><option value="2">Febrero</option>
                                    <option value="3">Marzo</option><option value="4">Abril</option>
                                    <option value="5">Mayo</option><option value="6">Junio</option>
                                    <option value="7">Julio</option><option value="8">Agosto</option>
                                    <option value="9">Septiembre</option><option value="10">Octubre</option>
                                    <option value="11">Noviembre</option><option value="12">Diciembre</option>
                                </select>
                                <select id="acuseAnio" class="form-control">
                                    <option value="2025">2025</option>
                                    <option value="2024">2024</option>
                                    <option value="2023">2023</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Archivo PDF</label>
                            <input type="file" id="acuseFile" class="form-control" accept=".pdf">
                        </div>
                        <div class="mt-3 text-right">
                            <button class="btn btn-primary" onclick="ComplianceService.saveAcuse()">Guardar</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    /**
     * Guardar acuse (Simulado)
     */
    async saveAcuse() {
        const mes = document.getElementById('acuseMes').value;
        const anio = document.getElementById('acuseAnio').value;
        const fileInput = document.getElementById('acuseFile');

        if (fileInput.files.length === 0) {
            alert('Selecciona un archivo');
            return;
        }

        showLoading('Guardando acuse...');

        try {
            const user = AuthService.getCurrentUser();
            const doc = {
                id: `doc_${Date.now()}`,
                empresaId: user.empresaId,
                nombre: fileInput.files[0].name,
                tipo: 'acuse_sat',
                mes: mes,
                anio: anio,
                uploadedAt: new Date().toISOString(),
                uploadedBy: user.email,
                url: '#', // In real app: Storage URL
                fecha: new Date().toISOString() // Indexable date
            };

            await dbService.addItems('compliance_docs', [doc]);
            await AuthService.logAudit('SUBIR_ACUSE', `Acuse subido: ${doc.nombre}`);

            document.getElementById('uploadAcuseModal').remove();
            showToast('Acuse guardado correctamente', 'success');

            await this.loadAcuses();

        } catch (e) {
            console.error(e);
            showToast('Error al guardar', 'danger');
        } finally {
            hideLoading();
        }
    }
};

// Export for use in app.js
if (typeof window !== 'undefined') {
    window.ComplianceService = ComplianceService;
}
