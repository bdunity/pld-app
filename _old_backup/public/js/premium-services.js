/**
 * PLD BDU - Módulo de Servicios Premium (Upsell UI)
 * 
 * Arquitectura de la vista /servicios-premium para venta
 * de servicios consultivos: Manual PLD y Capacitación Anual.
 * 
 * Estrategia de urgencia ética:
 * - Mostrar estado de cumplimiento real del cliente
 * - Citar artículos de ley específicos
 * - Dar fechas límite reales (no artificiales)
 * 
 * @version 2.0.0
 * @date 2026-01-25
 */

// ============================================================================
// CONFIGURACIÓN DE SERVICIOS PREMIUM
// ============================================================================

const PREMIUM_SERVICES_CONFIG = {

    // =========================================================================
    // SERVICIO 1: Manual de Cumplimiento PLD
    // =========================================================================
    manual_pld: {
        id: 'manual_pld',
        name_es: 'Manual de Cumplimiento PLD',
        category: 'DOCUMENTACION',

        // Iconos y visual
        icon: 'document-text',
        iconColor: '#3b82f6',
        badge: 'OBLIGATORIO',
        badgeColor: 'red',

        // Copy principal
        headline: 'Elaboración de Manual de Políticas PLD',
        subheadline: 'Cumple con el Art. 18 de la LFPIORPI',

        // Descripción del servicio
        description: [
            'Elaboramos tu Manual de Políticas de Identificación de Clientes y Usuarios a la medida de tu actividad vulnerable.',
            'Documento personalizado con todas las políticas, procedimientos y controles internos que exige la ley.',
        ],

        // ¿Qué incluye?
        features: [
            { icon: 'check', text: 'Diagnóstico de tu operación actual' },
            { icon: 'check', text: 'Políticas de identificación de clientes (KYC)' },
            { icon: 'check', text: 'Procedimientos de debida diligencia' },
            { icon: 'check', text: 'Matrices de riesgo personalizadas' },
            { icon: 'check', text: 'Formato listo para presentar ante SAT/UIF' },
            { icon: 'check', text: 'Actualización anual incluida' },
        ],

        // Precio indicativo
        pricing: {
            show: true,
            currency: 'MXN',
            from: 15000,
            to: 45000,
            period: null,
            note: 'Precio varía según actividad y complejidad',
        },

        // CTA
        cta: {
            primary: {
                text: 'Cotizar Manual Ahora',
                action: 'openRequestModal',
                color: 'blue',
            },
            secondary: {
                text: 'Ver ejemplo de manual',
                action: 'downloadSample',
                color: 'gray',
            },
        },

        // -------------------------------------------------------------------------
        // COMPLIANCE STATUS INDICATOR
        // Lee de: tenant_profile.has_manual
        // -------------------------------------------------------------------------
        complianceCheck: {
            field: 'has_manual',
            statuses: {
                // Si tiene manual
                true: {
                    type: 'success',
                    icon: 'check-circle',
                    color: 'green',
                    title: '✅ Tu empresa tiene un Manual registrado',
                    message: 'Recuerda actualizarlo cada año según el Art. 19 Fracción IV.',
                    showUrgency: false,
                    ctaText: 'Solicitar Actualización',
                },
                // Si NO tiene manual
                false: {
                    type: 'danger',
                    icon: 'exclamation-triangle',
                    color: 'red',
                    title: '⚠️ Riesgo de Multa: Sin Manual de Políticas',
                    message: 'Tu empresa no ha registrado un Manual de Cumplimiento PLD. Esto es obligatorio para todas las Actividades Vulnerables según el Art. 18 de la LFPIORPI.',
                    showUrgency: true,
                    urgencyDetails: {
                        legalBasis: 'Art. 18 LFPIORPI',
                        risk: 'Multa de 500 a 10,000 UMAs',
                        monetaryRange: '$54,175 a $1,083,500 MXN',
                    },
                    ctaText: 'Cotizar Manual Urgente',
                },
            },
        },

        // Formulario de solicitud
        requestForm: {
            title: 'Solicitar Cotización de Manual PLD',
            fields: [
                {
                    id: 'company_name',
                    type: 'text',
                    label: 'Razón Social',
                    prefill: 'tenant.company_name',
                    readonly: true,
                },
                {
                    id: 'rfc',
                    type: 'text',
                    label: 'RFC',
                    prefill: 'tenant.rfc',
                    readonly: true,
                },
                {
                    id: 'activity_type',
                    type: 'select',
                    label: 'Actividad Vulnerable',
                    prefill: 'workspace.activity_type',
                    options: 'ACTIVITY_TYPES',
                },
                {
                    id: 'employee_count',
                    type: 'number',
                    label: 'Número de empleados',
                    placeholder: 'Ej: 15',
                    required: true,
                },
                {
                    id: 'has_existing_manual',
                    type: 'radio',
                    label: '¿Cuenta con un manual actual?',
                    options: [
                        { value: 'yes', label: 'Sí, pero necesito actualizarlo' },
                        { value: 'no', label: 'No, es la primera vez' },
                    ],
                    required: true,
                },
                {
                    id: 'urgency',
                    type: 'select',
                    label: 'Urgencia',
                    options: [
                        { value: 'normal', label: 'Normal (5-7 días hábiles)' },
                        { value: 'urgent', label: 'Urgente (2-3 días hábiles) +30%' },
                        { value: 'express', label: 'Express (24 horas) +50%' },
                    ],
                },
                {
                    id: 'comments',
                    type: 'textarea',
                    label: 'Comentarios adicionales',
                    placeholder: 'Describe cualquier detalle relevante...',
                    rows: 3,
                },
            ],
        },
    },

    // =========================================================================
    // SERVICIO 2: Capacitación Anual Obligatoria
    // =========================================================================
    capacitacion_anual: {
        id: 'capacitacion_anual',
        name_es: 'Capacitación Anual PLD',
        category: 'CAPACITACION',

        icon: 'academic-cap',
        iconColor: '#10b981',
        badge: 'OBLIGATORIO 2026',
        badgeColor: 'amber',

        headline: 'Capacitación Anual en PLD/FT',
        subheadline: 'Cumple con el Art. 19 Fracción V de la LFPIORPI',

        description: [
            'Programa de capacitación diseñado específicamente para Actividades Vulnerables.',
            'Incluye constancias de capacitación para presentar ante el SAT.',
        ],

        features: [
            { icon: 'check', text: 'Capacitación presencial o virtual' },
            { icon: 'check', text: 'Material didáctico personalizado' },
            { icon: 'check', text: 'Evaluación de conocimientos' },
            { icon: 'check', text: 'Constancias DC-3 (STPS)' },
            { icon: 'check', text: 'Certificado de cumplimiento PLD' },
            { icon: 'check', text: 'Actualización de temas regulatorios 2026' },
        ],

        // Modalidades
        modalities: [
            {
                id: 'presencial',
                name: 'Presencial',
                description: 'En tus instalaciones o sala de capacitación',
                icon: 'users',
                minParticipants: 5,
                pricePerPerson: 1200,
            },
            {
                id: 'virtual',
                name: 'Virtual en Vivo',
                description: 'Sesión por Zoom/Meet con instructor',
                icon: 'video-camera',
                minParticipants: 3,
                pricePerPerson: 800,
            },
            {
                id: 'elearning',
                name: 'E-Learning',
                description: 'Plataforma autogestiva 24/7',
                icon: 'computer-desktop',
                minParticipants: 1,
                pricePerPerson: 500,
            },
        ],

        pricing: {
            show: true,
            currency: 'MXN',
            from: 500,
            to: null,
            period: 'por persona',
            note: 'Descuentos por volumen disponibles',
        },

        cta: {
            primary: {
                text: 'Solicitar Cotización de Curso',
                action: 'openRequestModal',
                color: 'green',
            },
            secondary: {
                text: 'Ver temario completo',
                action: 'downloadTemario',
                color: 'gray',
            },
        },

        // -------------------------------------------------------------------------
        // COMPLIANCE STATUS INDICATOR
        // Lee de: tenant_profile.training_2026_status
        // -------------------------------------------------------------------------
        complianceCheck: {
            field: 'training_2026_status',
            currentYear: 2026,
            statuses: {
                COMPLETE: {
                    type: 'success',
                    icon: 'check-circle',
                    color: 'green',
                    title: '✅ Capacitación 2026 Completada',
                    message: 'Tu equipo está al día con la capacitación obligatoria.',
                    showUrgency: false,
                    ctaText: 'Ver Constancias',
                },
                SCHEDULED: {
                    type: 'info',
                    icon: 'calendar',
                    color: 'blue',
                    title: '📅 Capacitación Programada',
                    message: 'Tienes una sesión de capacitación agendada.',
                    showUrgency: false,
                    ctaText: 'Ver Detalles',
                },
                IN_PROGRESS: {
                    type: 'warning',
                    icon: 'clock',
                    color: 'amber',
                    title: '⏳ Capacitación en Proceso',
                    message: 'Algunos miembros de tu equipo aún no completan la capacitación.',
                    showUrgency: true,
                    urgencyDetails: {
                        deadline: '2026-12-31',
                        remainingDays: calculateRemainingDays('2026-12-31'),
                    },
                    ctaText: 'Ver Progreso',
                },
                PENDING: {
                    type: 'danger',
                    icon: 'exclamation-triangle',
                    color: 'red',
                    title: '⚠️ Capacitación 2026 Pendiente',
                    message: 'No has realizado la capacitación anual obligatoria para este año. Evita sanciones del SAT.',
                    showUrgency: true,
                    urgencyDetails: {
                        legalBasis: 'Art. 19 Fracción V LFPIORPI',
                        deadline: '2026-12-31',
                        remainingDays: calculateRemainingDays('2026-12-31'),
                        risk: 'Multa de 200 a 2,000 UMAs',
                        monetaryRange: '$21,670 a $216,700 MXN',
                    },
                    ctaText: 'Programar Capacitación Ahora',
                },
                EXPIRED: {
                    type: 'danger',
                    icon: 'x-circle',
                    color: 'red',
                    title: '🚨 Capacitación Vencida',
                    message: 'El plazo para la capacitación 2025 ya pasó. Regulariza tu situación lo antes posible.',
                    showUrgency: true,
                    urgencyDetails: {
                        legalBasis: 'Art. 19 Fracción V LFPIORPI',
                        risk: 'Ya fuera de plazo - riesgo de multa activo',
                    },
                    ctaText: 'Regularizar Urgente',
                },
            },
        },

        requestForm: {
            title: 'Solicitar Cotización de Capacitación',
            fields: [
                {
                    id: 'company_name',
                    type: 'text',
                    label: 'Razón Social',
                    prefill: 'tenant.company_name',
                    readonly: true,
                },
                {
                    id: 'rfc',
                    type: 'text',
                    label: 'RFC',
                    prefill: 'tenant.rfc',
                    readonly: true,
                },
                {
                    id: 'participants_count',
                    type: 'number',
                    label: '¿Cuántos empleados requieren capacitación?',
                    placeholder: 'Ej: 10',
                    required: true,
                    min: 1,
                },
                {
                    id: 'modality',
                    type: 'select',
                    label: 'Modalidad preferida',
                    options: [
                        { value: 'presencial', label: 'Presencial (en sitio)' },
                        { value: 'virtual', label: 'Virtual en Vivo (Zoom/Meet)' },
                        { value: 'elearning', label: 'E-Learning (autogestivo)' },
                        { value: 'flexible', label: 'Cualquiera, la que mejor convenga' },
                    ],
                    required: true,
                },
                {
                    id: 'preferred_dates',
                    type: 'text',
                    label: 'Fechas preferidas',
                    placeholder: 'Ej: Primera semana de marzo',
                },
                {
                    id: 'location',
                    type: 'text',
                    label: 'Ciudad/Estado (para presencial)',
                    placeholder: 'Ej: Ciudad de México, CDMX',
                    showIf: { field: 'modality', value: 'presencial' },
                },
                {
                    id: 'comments',
                    type: 'textarea',
                    label: 'Comentarios adicionales',
                    placeholder: 'Horarios preferidos, necesidades especiales, etc.',
                    rows: 3,
                },
            ],
        },
    },
};

// ============================================================================
// UTILIDADES
// ============================================================================

function calculateRemainingDays(deadline) {
    const today = new Date();
    const deadlineDate = new Date(deadline);
    const diffTime = deadlineDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
}

// ============================================================================
// COMPONENTES DE URGENCIA (Copy Ético)
// ============================================================================

const URGENCY_COMPONENTS = {
    // Banner de multa
    penaltyBanner: {
        template: `
      <div class="urgency-banner urgency-banner--{severity}">
        <div class="urgency-banner__icon">
          <svg><!-- {icon} --></svg>
        </div>
        <div class="urgency-banner__content">
          <h4>{title}</h4>
          <p>{message}</p>
          {#if urgencyDetails}
            <div class="urgency-details">
              <span class="urgency-details__item">
                <strong>Base Legal:</strong> {urgencyDetails.legalBasis}
              </span>
              <span class="urgency-details__item">
                <strong>Riesgo:</strong> {urgencyDetails.risk}
              </span>
              {#if urgencyDetails.monetaryRange}
                <span class="urgency-details__item urgency-details__item--highlight">
                  <strong>Multa potencial:</strong> {urgencyDetails.monetaryRange}
                </span>
              {/if}
            </div>
          {/if}
        </div>
        <div class="urgency-banner__action">
          <button class="btn btn--{color}">{ctaText}</button>
        </div>
      </div>
    `,
    },

    // Contador de días restantes
    deadlineCounter: {
        template: `
      <div class="deadline-counter {class}">
        <div class="deadline-counter__number">{days}</div>
        <div class="deadline-counter__label">días restantes</div>
        <div class="deadline-counter__deadline">Fecha límite: {deadline}</div>
      </div>
    `,
        getClass: (days) => {
            if (days <= 7) return 'deadline-counter--critical';
            if (days <= 30) return 'deadline-counter--warning';
            return 'deadline-counter--normal';
        },
    },

    // Trust badges (prueba social)
    trustBadges: [
        {
            icon: 'shield-check',
            text: '+500 empresas protegidas',
        },
        {
            icon: 'users',
            text: '+2,000 empleados capacitados',
        },
        {
            icon: 'star',
            text: '4.9/5 satisfacción promedio',
        },
    ],
};

// ============================================================================
// ESTILOS RECOMENDADOS (CSS Variables)
// ============================================================================

const URGENCY_STYLES = `
/* Paleta de colores para urgencia */
:root {
  --urgency-danger: #dc2626;
  --urgency-danger-bg: #fef2f2;
  --urgency-danger-border: #fecaca;
  
  --urgency-warning: #d97706;
  --urgency-warning-bg: #fffbeb;
  --urgency-warning-border: #fde68a;
  
  --urgency-success: #059669;
  --urgency-success-bg: #ecfdf5;
  --urgency-success-border: #a7f3d0;
  
  --urgency-info: #2563eb;
  --urgency-info-bg: #eff6ff;
  --urgency-info-border: #bfdbfe;
}

/* Banner de urgencia */
.urgency-banner {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem 1.5rem;
  border-radius: 0.75rem;
  border-left: 4px solid;
  margin-bottom: 1.5rem;
}

.urgency-banner--danger {
  background: var(--urgency-danger-bg);
  border-color: var(--urgency-danger);
}

.urgency-banner--warning {
  background: var(--urgency-warning-bg);
  border-color: var(--urgency-warning);
}

/* Animación de pulso para elementos críticos */
@keyframes pulse-warning {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.urgency-pulse {
  animation: pulse-warning 2s ease-in-out infinite;
}

/* Contador de deadline */
.deadline-counter {
  text-align: center;
  padding: 1rem;
  border-radius: 0.5rem;
}

.deadline-counter--critical {
  background: var(--urgency-danger-bg);
  color: var(--urgency-danger);
}

.deadline-counter--critical .deadline-counter__number {
  font-size: 2.5rem;
  font-weight: 700;
  animation: pulse-warning 1s ease-in-out infinite;
}
`;

// ============================================================================
// LÓGICA DE SOLICITUD (Cloud Function)
// ============================================================================

const REQUEST_SUBMISSION_CONFIG = {
    collectionName: 'service_requests',

    // Estructura del documento
    documentSchema: {
        request_id: 'auto',
        tenant_id: 'from_auth',
        service_id: 'from_form',

        // Datos del formulario
        form_data: {},

        // Estado
        status: 'PENDING', // PENDING | CONTACTED | QUOTED | ACCEPTED | REJECTED | COMPLETED

        // Seguimiento
        assigned_to: null,
        notes: [],
        quotes: [],

        // Timestamps
        created_at: 'serverTimestamp',
        updated_at: null,
        contacted_at: null,
        closed_at: null,
    },

    // Notificación al equipo de ventas
    notifyOnSubmit: {
        email: 'ventas@pld-bdu.mx',
        slack: true,
        slackChannel: '#ventas-leads',
    },
};

// ============================================================================
// EXPORTS
// ============================================================================

// Para uso en navegador
if (typeof window !== 'undefined') {
    window.PREMIUM_SERVICES_CONFIG = PREMIUM_SERVICES_CONFIG;
    window.URGENCY_COMPONENTS = URGENCY_COMPONENTS;
    window.URGENCY_STYLES = URGENCY_STYLES;
    window.REQUEST_SUBMISSION_CONFIG = REQUEST_SUBMISSION_CONFIG;
}

// Para uso en Node.js/módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PREMIUM_SERVICES_CONFIG,
        URGENCY_COMPONENTS,
        URGENCY_STYLES,
        REQUEST_SUBMISSION_CONFIG,
        calculateRemainingDays,
    };
}
