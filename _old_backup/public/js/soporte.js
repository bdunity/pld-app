/**
 * PLD BDU v2 - Support System
 * Sistema de tickets, base de conocimientos y chat de soporte
 */

const SoporteService = {

    // Estados de tickets
    ESTADOS: {
        abierto: { nombre: 'Abierto', color: 'warning', icon: '🆕' },
        en_proceso: { nombre: 'En Proceso', color: 'info', icon: '🔄' },
        resuelto: { nombre: 'Resuelto', color: 'success', icon: '✅' },
        cerrado: { nombre: 'Cerrado', color: 'secondary', icon: '📁' }
    },

    // Categorías de tickets
    CATEGORIAS: {
        tecnico: { nombre: 'Problema Técnico', icon: '🔧' },
        xml: { nombre: 'Generación XML', icon: '📄' },
        kyc: { nombre: 'Padrón KYC', icon: '👥' },
        reportes: { nombre: 'Reportes', icon: '📊' },
        acceso: { nombre: 'Acceso/Permisos', icon: '🔐' },
        otro: { nombre: 'Otro', icon: '❓' }
    },

    // Base de conocimientos (FAQs)
    BASE_CONOCIMIENTOS: [
        {
            id: 1,
            categoria: 'xml',
            pregunta: '¿Cómo genero el XML para el SAT?',
            respuesta: `1. Ve a la pestaña "Exportar"\n2. Selecciona el periodo (mes/año)\n3. Haz clic en "Generar XML"\n4. El sistema creará automáticamente los archivos de depósitos y retiros\n5. Descarga y sube al portal SITI del SAT`
        },
        {
            id: 2,
            categoria: 'xml',
            pregunta: '¿Qué es el umbral de aviso (645 UMA)?',
            respuesta: 'El umbral de 645 UMA es el monto a partir del cual las operaciones deben reportarse al SAT. En 2025, equivale aproximadamente a $73,025 MXN. Cualquier operación igual o mayor a este monto genera un aviso automático.'
        },
        {
            id: 3,
            categoria: 'kyc',
            pregunta: '¿Cómo actualizo la información de un cliente?',
            respuesta: 'Actualmente, la información del padrón KYC se actualiza mediante la carga de archivos Excel. Asegúrate de que el archivo contenga el playercode correcto para que el sistema actualice los registros existentes.'
        },
        {
            id: 4,
            categoria: 'tecnico',
            pregunta: '¿Dónde se almacenan los datos?',
            respuesta: 'Todos los datos se almacenan localmente en tu navegador usando IndexedDB. Esto significa que los datos son privados y no salen de tu computadora. Recomendamos hacer respaldos periódicos desde la sección de Configuración.'
        },
        {
            id: 5,
            categoria: 'reportes',
            pregunta: '¿Qué tipos de reportes puedo generar?',
            respuesta: 'Puedes generar:\n- XML de Avisos (para SAT)\n- Excel de operaciones\n- Reporte de cumplimiento\n- Análisis de patrones\n- Verificación PEP/OFAC'
        },
        {
            id: 6,
            categoria: 'acceso',
            pregunta: '¿Cuáles son los roles disponibles?',
            respuesta: '**Administrador**: Acceso completo, puede invitar usuarios y configurar el sistema.\n**Usuario**: Puede ver operaciones, generar reportes y gestionar KYC.\n**Visitante**: Solo puede ver el dashboard con estadísticas agregadas.'
        },
        {
            id: 7,
            categoria: 'tecnico',
            pregunta: '¿Cómo hago un respaldo de mis datos?',
            respuesta: '1. Ve a Configuración (solo admins)\n2. En la sección "Respaldo", haz clic en "Descargar Backup"\n3. Se descargará un archivo JSON con todos tus datos\n4. Guárdalo en un lugar seguro'
        },
        {
            id: 8,
            categoria: 'xml',
            pregunta: '¿Qué significa "Informe en Cero"?',
            respuesta: 'Es el reporte que debes presentar al SAT cuando no hay operaciones que superen el umbral de aviso. El sistema lo genera automáticamente si no hay operaciones reportables en el periodo seleccionado.'
        }
    ],

    /**
     * Crear nuevo ticket
     */
    async crearTicket(ticket) {
        const nuevoTicket = {
            id: Date.now(),
            numero: `TKT-${Date.now().toString().slice(-6)}`,
            asunto: ticket.asunto,
            descripcion: ticket.descripcion,
            categoria: ticket.categoria || 'otro',
            prioridad: ticket.prioridad || 'normal',
            estado: 'abierto',
            creador: ticket.creador || AuthService.getCurrentUser()?.email,
            empresaId: ticket.empresaId || EmpresasService?.currentEmpresa?.id,
            fechaCreacion: new Date().toISOString(),
            fechaActualizacion: new Date().toISOString(),
            mensajes: [{
                id: 1,
                autor: ticket.creador || AuthService.getCurrentUser()?.email,
                mensaje: ticket.descripcion,
                fecha: new Date().toISOString(),
                esAdmin: false
            }]
        };

        try {
            await dbService.addItems('tickets', [nuevoTicket]);

            // Notificar
            if (typeof NotificationsService !== 'undefined') {
                await NotificationsService.create({
                    tipo: 'info',
                    titulo: '🎫 Ticket Creado',
                    mensaje: `Ticket ${nuevoTicket.numero} creado exitosamente`
                });
            }

            await AuthService.logAudit('TICKET_CREADO', `Ticket ${nuevoTicket.numero}: ${nuevoTicket.asunto}`);

            return nuevoTicket;
        } catch (e) {
            console.error('Error creando ticket:', e);
            throw e;
        }
    },

    /**
     * Obtener tickets del usuario actual
     */
    async getMisTickets() {
        const user = AuthService.getCurrentUser();
        if (!user) return [];

        try {
            const tickets = await dbService.getAll('tickets');
            return tickets.filter(t => t.creador === user.email)
                .sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));
        } catch {
            return [];
        }
    },

    /**
     * Obtener todos los tickets (admin)
     */
    async getTodosTickets() {
        if (!AuthService.hasPermission('admin')) return [];

        try {
            const tickets = await dbService.getAll('tickets');
            return tickets.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));
        } catch {
            return [];
        }
    },

    /**
     * Obtener tickets abiertos (admin)
     */
    async getTicketsAbiertos() {
        const tickets = await this.getTodosTickets();
        return tickets.filter(t => t.estado !== 'cerrado' && t.estado !== 'resuelto');
    },

    /**
     * Agregar mensaje a ticket
     */
    async agregarMensaje(ticketId, mensaje, esAdmin = false) {
        try {
            const ticket = await dbService.get('tickets', ticketId);
            if (!ticket) throw new Error('Ticket no encontrado');

            const nuevoMensaje = {
                id: ticket.mensajes.length + 1,
                autor: AuthService.getCurrentUser()?.email,
                mensaje: mensaje,
                fecha: new Date().toISOString(),
                esAdmin: esAdmin
            };

            ticket.mensajes.push(nuevoMensaje);
            ticket.fechaActualizacion = new Date().toISOString();

            // Si es admin respondiendo, cambiar estado
            if (esAdmin && ticket.estado === 'abierto') {
                ticket.estado = 'en_proceso';
            }

            await dbService.addItems('tickets', [ticket]);
            return ticket;
        } catch (e) {
            console.error('Error agregando mensaje:', e);
            throw e;
        }
    },

    /**
     * Cambiar estado de ticket
     */
    async cambiarEstado(ticketId, nuevoEstado) {
        try {
            const ticket = await dbService.get('tickets', ticketId);
            if (!ticket) throw new Error('Ticket no encontrado');

            ticket.estado = nuevoEstado;
            ticket.fechaActualizacion = new Date().toISOString();

            await dbService.addItems('tickets', [ticket]);
            await AuthService.logAudit('TICKET_ESTADO', `Ticket ${ticket.numero} cambiado a ${nuevoEstado}`);

            return ticket;
        } catch (e) {
            console.error('Error cambiando estado:', e);
            throw e;
        }
    },

    /**
     * Buscar en base de conocimientos
     */
    buscarFAQ(query) {
        if (!query) return this.BASE_CONOCIMIENTOS;

        const queryLower = query.toLowerCase();
        return this.BASE_CONOCIMIENTOS.filter(faq =>
            faq.pregunta.toLowerCase().includes(queryLower) ||
            faq.respuesta.toLowerCase().includes(queryLower) ||
            faq.categoria.includes(queryLower)
        );
    },

    /**
     * Obtener FAQs por categoría
     */
    getFAQPorCategoria(categoria) {
        if (!categoria) return this.BASE_CONOCIMIENTOS;
        return this.BASE_CONOCIMIENTOS.filter(faq => faq.categoria === categoria);
    },

    /**
     * Obtener estadísticas de tickets (admin)
     */
    async getEstadisticas() {
        const tickets = await this.getTodosTickets();

        return {
            total: tickets.length,
            abiertos: tickets.filter(t => t.estado === 'abierto').length,
            enProceso: tickets.filter(t => t.estado === 'en_proceso').length,
            resueltos: tickets.filter(t => t.estado === 'resuelto').length,
            cerrados: tickets.filter(t => t.estado === 'cerrado').length,
            hoy: tickets.filter(t => {
                const fecha = new Date(t.fechaCreacion);
                const hoy = new Date();
                return fecha.toDateString() === hoy.toDateString();
            }).length
        };
    }
};

// Export
if (typeof window !== 'undefined') {
    window.SoporteService = SoporteService;
}
