/**
 * PLD BDU v2 - Notifications & Document Management Service
 * Sistema de notificaciones y gestión de expedientes KYC
 */

const NotificationsService = {

    // Configuración de notificaciones
    config: {
        emailEnabled: false, // Requiere configuración de backend
        pushEnabled: false,
        inAppEnabled: true,
        reminderDays: [7, 3, 1, 0] // Días antes para recordatorios
    },

    // Cola de notificaciones pendientes
    notificationQueue: [],

    /**
     * Crear notificación
     */
    async create(notification) {
        const notif = {
            id: Date.now(),
            tipo: notification.tipo || 'info',
            titulo: notification.titulo,
            mensaje: notification.mensaje,
            fecha: new Date().toISOString(),
            leida: false,
            accion: notification.accion || null,
            prioridad: notification.prioridad || 'normal',
            empresaId: notification.empresaId || null
        };

        this.notificationQueue.push(notif);

        // Guardar en DB
        try {
            await dbService.addItems('notifications', [notif]);
        } catch (e) {
            console.log('Notifications store not available, using memory');
        }

        // Mostrar toast si está habilitado
        if (this.config.inAppEnabled && typeof showToast !== 'undefined') {
            const toastType = {
                'alerta': 'danger',
                'warning': 'warning',
                'success': 'success',
                'info': 'info'
            }[notif.tipo] || 'info';

            showToast(notif.mensaje, toastType);
        }

        return notif;
    },

    /**
     * Obtener notificaciones pendientes
     */
    async getPendientes() {
        try {
            const all = await dbService.getAll('notifications');
            return all.filter(n => !n.leida).sort((a, b) =>
                new Date(b.fecha) - new Date(a.fecha)
            );
        } catch {
            return this.notificationQueue.filter(n => !n.leida);
        }
    },

    /**
     * Marcar como leída
     */
    async marcarLeida(id) {
        try {
            const notif = await dbService.get('notifications', id);
            if (notif) {
                notif.leida = true;
                await dbService.addItems('notifications', [notif]);
            }
        } catch (e) {
            const notif = this.notificationQueue.find(n => n.id === id);
            if (notif) notif.leida = true;
        }
    },

    /**
     * Crear alerta de obligación próxima
     */
    async alertarObligacion(obligacion) {
        return await this.create({
            tipo: obligacion.diasRestantes <= 3 ? 'alerta' : 'warning',
            titulo: `⏰ ${obligacion.nombre}`,
            mensaje: `Vence en ${obligacion.diasRestantes} días - ${obligacion.accion}`,
            prioridad: obligacion.urgencia === 'critica' ? 'alta' : 'normal'
        });
    },

    /**
     * Crear alerta de patrón detectado
     */
    async alertarPatron(patron) {
        return await this.create({
            tipo: 'alerta',
            titulo: `🚨 Patrón ${patron.tipo} detectado`,
            mensaje: `Cliente: ${patron.nombre} - ${patron.descripcion}`,
            prioridad: 'alta',
            accion: patron.accion
        });
    },

    /**
     * Verificar y generar recordatorios automáticos
     */
    async verificarRecordatorios() {
        if (typeof ComplianceService === 'undefined') return;

        const obligaciones = ComplianceService.getObligacionesPendientes();

        for (const ob of obligaciones) {
            if (this.config.reminderDays.includes(ob.diasRestantes)) {
                await this.alertarObligacion(ob);
            }
        }
    }
};

// ========== GESTIÓN DOCUMENTAL ==========

const DocumentosService = {

    /**
     * Tipos de documentos KYC requeridos
     */
    TIPOS_DOCUMENTO: {
        identificacion: {
            nombre: 'Identificación Oficial',
            requerido: true,
            descripcion: 'INE, Pasaporte o Cédula Profesional',
            vigencia: 10 // años
        },
        comprobante_domicilio: {
            nombre: 'Comprobante de Domicilio',
            requerido: true,
            descripcion: 'Recibo de servicios no mayor a 3 meses',
            vigencia: 0.25 // 3 meses
        },
        constancia_rfc: {
            nombre: 'Constancia de Situación Fiscal',
            requerido: false,
            descripcion: 'RFC con homoclave del SAT',
            vigencia: 1
        },
        curp: {
            nombre: 'CURP',
            requerido: false,
            descripcion: 'Clave Única de Registro de Población',
            vigencia: null // No expira
        },
        acta_constitutiva: {
            nombre: 'Acta Constitutiva',
            requerido: false, // Solo para personas morales
            descripcion: 'Escritura pública de constitución',
            vigencia: null
        },
        poder_notarial: {
            nombre: 'Poder Notarial',
            requerido: false,
            descripcion: 'Poder del representante legal',
            vigencia: null
        },
        declaracion_origen_fondos: {
            nombre: 'Declaración Origen de Fondos',
            requerido: true,
            descripcion: 'Declaración jurada del origen de recursos',
            vigencia: 1
        },
        cuestionario_pep: {
            nombre: 'Cuestionario PEP',
            requerido: true,
            descripcion: 'Declaración de exposición política',
            vigencia: 1
        }
    },

    /**
     * Obtener expediente de cliente
     */
    async getExpediente(playercode) {
        try {
            const docs = await dbService.getByIndex('documentos', 'playercode', playercode);
            return {
                playercode,
                documentos: docs || [],
                completo: this.verificarExpedienteCompleto(docs || [])
            };
        } catch {
            return { playercode, documentos: [], completo: false };
        }
    },

    /**
     * Verificar si expediente tiene todos los documentos requeridos
     */
    verificarExpedienteCompleto(documentos) {
        const requeridos = Object.entries(this.TIPOS_DOCUMENTO)
            .filter(([_, config]) => config.requerido)
            .map(([tipo, _]) => tipo);

        const tiposEnExpediente = documentos.map(d => d.tipo);

        return {
            completo: requeridos.every(r => tiposEnExpediente.includes(r)),
            faltantes: requeridos.filter(r => !tiposEnExpediente.includes(r)),
            porcentaje: Math.round((tiposEnExpediente.filter(t => requeridos.includes(t)).length / requeridos.length) * 100)
        };
    },

    /**
     * Agregar documento al expediente
     */
    async agregarDocumento(playercode, documento) {
        const doc = {
            id: Date.now(),
            playercode,
            tipo: documento.tipo,
            nombre: documento.nombre || this.TIPOS_DOCUMENTO[documento.tipo]?.nombre,
            archivo: documento.archivo, // Base64 o URL
            fechaCarga: new Date().toISOString(),
            fechaVigencia: documento.fechaVigencia || null,
            verificado: false,
            notas: documento.notas || ''
        };

        try {
            await dbService.addItems('documentos', [doc]);

            // Log de auditoría
            if (typeof AuthService !== 'undefined') {
                await AuthService.logAudit('DOCUMENTO_AGREGADO',
                    `Documento ${doc.tipo} agregado para cliente ${playercode}`);
            }
        } catch (e) {
            console.error('Error guardando documento:', e);
        }

        return doc;
    },

    /**
     * Verificar documentos próximos a vencer
     */
    async verificarVigencias() {
        const alertas = [];
        const hoy = new Date();
        const en30Dias = new Date(hoy.getTime() + 30 * 24 * 60 * 60 * 1000);

        try {
            const docs = await dbService.getAll('documentos');

            for (const doc of docs) {
                if (doc.fechaVigencia) {
                    const vencimiento = new Date(doc.fechaVigencia);

                    if (vencimiento <= hoy) {
                        alertas.push({
                            tipo: 'vencido',
                            documento: doc,
                            mensaje: `${doc.nombre} VENCIDO para cliente ${doc.playercode}`
                        });
                    } else if (vencimiento <= en30Dias) {
                        alertas.push({
                            tipo: 'por_vencer',
                            documento: doc,
                            mensaje: `${doc.nombre} vence pronto para cliente ${doc.playercode}`,
                            diasRestantes: Math.ceil((vencimiento - hoy) / (24 * 60 * 60 * 1000))
                        });
                    }
                }
            }
        } catch (e) {
            console.error('Error verificando vigencias:', e);
        }

        return alertas;
    },

    /**
     * Generar reporte de expedientes incompletos
     */
    async reporteExpedientesIncompletos() {
        const incompletos = [];

        try {
            const clientes = await dbService.getAll('kyc');

            for (const cliente of clientes) {
                const expediente = await this.getExpediente(cliente.playercode);
                const status = this.verificarExpedienteCompleto(expediente.documentos);

                if (!status.completo) {
                    incompletos.push({
                        playercode: cliente.playercode,
                        nombre: `${cliente.firstname} ${cliente.lastname}`,
                        porcentaje: status.porcentaje,
                        faltantes: status.faltantes.map(f =>
                            this.TIPOS_DOCUMENTO[f]?.nombre || f
                        )
                    });
                }
            }
        } catch (e) {
            console.error('Error generando reporte:', e);
        }

        return incompletos.sort((a, b) => a.porcentaje - b.porcentaje);
    }
};

// Export
if (typeof window !== 'undefined') {
    window.NotificationsService = NotificationsService;
    window.DocumentosService = DocumentosService;
}
