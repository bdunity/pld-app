/**
 * PLD BDU - Super Admin Dashboard (SaaS Control Tower)
 * 
 * Configuración y lógica del panel de administración exclusivo
 * para el dueño de la plataforma.
 * 
 * @version 2.0.0
 * @date 2026-01-25
 */

// ============================================================================
// CONFIGURACIÓN DEL MENÚ LATERAL (SIDEBAR)
// ============================================================================

const ADMIN_NAVIGATION = {
    brand: {
        name: 'PLD BDU Admin',
        logo: '/assets/logo-admin.svg',
        role: 'Control Tower',
    },

    sections: [
        // -------------------------------------------------------------------------
        // SECCIÓN 1: MÉTRICAS Y KPIs
        // -------------------------------------------------------------------------
        {
            id: 'overview',
            title: 'Vista General',
            icon: 'chart-pie',
            items: [
                {
                    id: 'dashboard',
                    label: 'Dashboard',
                    path: '/admin/dashboard',
                    icon: 'home',
                    description: 'KPIs y métricas en tiempo real',
                },
                {
                    id: 'analytics',
                    label: 'Analíticas',
                    path: '/admin/analytics',
                    icon: 'chart-bar',
                    description: 'Gráficas de uso y tendencias',
                },
                {
                    id: 'alerts',
                    label: 'Alertas del Sistema',
                    path: '/admin/alerts',
                    icon: 'exclamation-triangle',
                    badge: { type: 'warning', countFrom: 'systemAlerts' },
                    description: 'Errores críticos y avisos',
                },
            ],
        },

        // -------------------------------------------------------------------------
        // SECCIÓN 2: GESTIÓN DE INQUILINOS
        // -------------------------------------------------------------------------
        {
            id: 'tenants',
            title: 'Gestión de Empresas',
            icon: 'building-office',
            items: [
                {
                    id: 'tenant-list',
                    label: 'Todas las Empresas',
                    path: '/admin/tenants',
                    icon: 'building-office-2',
                    description: 'Lista completa de tenants',
                },
                {
                    id: 'tenant-create',
                    label: 'Nueva Empresa',
                    path: '/admin/tenants/new',
                    icon: 'plus-circle',
                    description: 'Onboarding de nuevo cliente',
                },
                {
                    id: 'tenant-pending',
                    label: 'Pendientes de Activación',
                    path: '/admin/tenants?filter=pending',
                    icon: 'clock',
                    badge: { type: 'info', countFrom: 'pendingTenants' },
                },
                {
                    id: 'tenant-expired',
                    label: 'Suscripciones Vencidas',
                    path: '/admin/tenants?filter=expired',
                    icon: 'exclamation-circle',
                    badge: { type: 'danger', countFrom: 'expiredTenants' },
                },
            ],
        },

        // -------------------------------------------------------------------------
        // SECCIÓN 3: FACTURACIÓN Y PLANES
        // -------------------------------------------------------------------------
        {
            id: 'billing',
            title: 'Facturación',
            icon: 'credit-card',
            items: [
                {
                    id: 'plans',
                    label: 'Editor de Planes',
                    path: '/admin/plans',
                    icon: 'document-text',
                    description: 'Modificar límites y precios',
                },
                {
                    id: 'revenue',
                    label: 'Ingresos (MRR)',
                    path: '/admin/revenue',
                    icon: 'currency-dollar',
                    description: 'Revenue recurrente mensual',
                },
                {
                    id: 'invoices',
                    label: 'Facturas',
                    path: '/admin/invoices',
                    icon: 'document-duplicate',
                    description: 'Historial de facturación',
                },
            ],
        },

        // -------------------------------------------------------------------------
        // SECCIÓN 4: SISTEMA Y CONFIGURACIÓN
        // -------------------------------------------------------------------------
        {
            id: 'system',
            title: 'Sistema',
            icon: 'cog-6-tooth',
            items: [
                {
                    id: 'global-config',
                    label: 'Configuración Global',
                    path: '/admin/config',
                    icon: 'adjustments-horizontal',
                    description: 'UMA, Umbrales, Catálogos',
                },
                {
                    id: 'watchlists',
                    label: 'Listas de Control',
                    path: '/admin/watchlists',
                    icon: 'shield-exclamation',
                    description: 'SAT 69-B, OFAC, PEPs',
                },
                {
                    id: 'logs',
                    label: 'Logs de Auditoría',
                    path: '/admin/logs',
                    icon: 'document-magnifying-glass',
                    description: 'Historial de actividad',
                },
                {
                    id: 'functions',
                    label: 'Cloud Functions',
                    path: '/admin/functions',
                    icon: 'cloud',
                    description: 'Estado y métricas',
                },
            ],
        },
    ],

    // Acciones rápidas (Quick Actions)
    quickActions: [
        {
            id: 'impersonate',
            label: 'Iniciar Sesión como Cliente',
            icon: 'user-circle',
            action: 'openImpersonateModal',
            color: 'purple',
        },
        {
            id: 'broadcast',
            label: 'Enviar Notificación Global',
            icon: 'megaphone',
            action: 'openBroadcastModal',
            color: 'blue',
        },
    ],
};

// ============================================================================
// CONFIGURACIÓN DE KPIs PARA DASHBOARD
// ============================================================================

const KPI_CONFIG = {
    // Fila 1: Métricas principales
    primaryMetrics: [
        {
            id: 'active_tenants',
            label: 'Empresas Activas',
            icon: 'building-office',
            color: 'blue',
            format: 'number',
            source: {
                collection: 'tenants',
                query: { field: 'status', operator: '==', value: 'active' },
                aggregate: 'count',
            },
            trend: { compare: 'previousMonth', label: 'vs mes anterior' },
        },
        {
            id: 'xmls_generated',
            label: 'XMLs Generados',
            sublabel: 'Este Mes',
            icon: 'document-text',
            color: 'green',
            format: 'number',
            source: {
                collection: 'global_config/usage_summary/monthly/{currentMonth}',
                field: 'totals.total_xmls_generated',
            },
            trend: { compare: 'previousMonth' },
        },
        {
            id: 'mrr',
            label: 'MRR Estimado',
            icon: 'currency-dollar',
            color: 'emerald',
            format: 'currency',
            currency: 'MXN',
            source: {
                type: 'calculated',
                calculation: 'sumPlanPrices',
            },
            trend: { compare: 'previousMonth' },
        },
        {
            id: 'system_alerts',
            label: 'Alertas Activas',
            icon: 'exclamation-triangle',
            color: 'red',
            format: 'number',
            source: {
                collection: 'admin_notifications',
                query: { field: 'status', operator: '==', value: 'pending' },
                aggregate: 'count',
            },
            critical: true,
            threshold: { warning: 5, danger: 10 },
        },
    ],

    // Fila 2: Métricas secundarias
    secondaryMetrics: [
        {
            id: 'total_records',
            label: 'Registros Procesados',
            sublabel: 'Este Mes',
            icon: 'document-duplicate',
            color: 'indigo',
            format: 'number',
            source: {
                collection: 'global_config/usage_summary/monthly/{currentMonth}',
                field: 'totals.total_records_created',
            },
        },
        {
            id: 'total_users',
            label: 'Usuarios Totales',
            icon: 'users',
            color: 'violet',
            format: 'number',
            source: {
                collection: 'users',
                aggregate: 'count',
            },
        },
        {
            id: 'trial_tenants',
            label: 'En Periodo de Prueba',
            icon: 'clock',
            color: 'amber',
            format: 'number',
            source: {
                collection: 'tenants',
                query: { field: 'subscription.status', operator: '==', value: 'TRIAL' },
                aggregate: 'count',
            },
        },
        {
            id: 'conversion_rate',
            label: 'Tasa de Conversión',
            sublabel: 'Trial → Pago',
            icon: 'arrow-trending-up',
            color: 'teal',
            format: 'percent',
            source: {
                type: 'calculated',
                calculation: 'trialConversionRate',
            },
        },
    ],
};

// ============================================================================
// CONFIGURACIÓN DE TABLA DE TENANTS
// ============================================================================

const TENANT_TABLE_CONFIG = {
    columns: [
        { id: 'company_name', label: 'Empresa', sortable: true, primary: true },
        { id: 'rfc', label: 'RFC', sortable: true },
        { id: 'subscription.plan_id', label: 'Plan', sortable: true, type: 'badge' },
        { id: 'subscription.status', label: 'Estado', sortable: true, type: 'status' },
        { id: 'current_usage.records_count', label: 'Registros/Mes', sortable: true, type: 'number' },
        { id: 'subscription.current_period_end', label: 'Vence', sortable: true, type: 'date' },
        { id: 'created_at', label: 'Alta', sortable: true, type: 'date' },
        { id: 'actions', label: 'Acciones', type: 'actions' },
    ],

    actions: [
        {
            id: 'view',
            label: 'Ver Detalles',
            icon: 'eye',
            action: 'navigateToDetail',
        },
        {
            id: 'impersonate',
            label: 'Iniciar Sesión Como',
            icon: 'user-circle',
            action: 'impersonateTenant',
            color: 'purple',
            requireConfirm: true,
        },
        {
            id: 'edit',
            label: 'Editar',
            icon: 'pencil',
            action: 'openEditModal',
        },
        {
            id: 'suspend',
            label: 'Suspender',
            icon: 'pause-circle',
            action: 'suspendTenant',
            color: 'amber',
            requireConfirm: true,
            confirmMessage: '¿Suspender el servicio de esta empresa? Los usuarios no podrán acceder.',
        },
        {
            id: 'delete',
            label: 'Eliminar',
            icon: 'trash',
            action: 'deleteTenant',
            color: 'red',
            requireConfirm: true,
            confirmMessage: 'ADVERTENCIA: Esta acción es irreversible. ¿Eliminar todos los datos de esta empresa?',
        },
    ],

    filters: [
        {
            id: 'status',
            label: 'Estado',
            type: 'select',
            options: [
                { value: 'all', label: 'Todos' },
                { value: 'active', label: 'Activo' },
                { value: 'trial', label: 'Prueba' },
                { value: 'suspended', label: 'Suspendido' },
                { value: 'expired', label: 'Expirado' },
            ],
        },
        {
            id: 'plan',
            label: 'Plan',
            type: 'select',
            options: [
                { value: 'all', label: 'Todos' },
                { value: 'plan_demo', label: 'Demo' },
                { value: 'plan_pro', label: 'Pro' },
                { value: 'plan_enterprise', label: 'Enterprise' },
            ],
        },
        {
            id: 'search',
            label: 'Buscar',
            type: 'search',
            placeholder: 'Nombre, RFC o email...',
        },
    ],

    bulkActions: [
        { id: 'export', label: 'Exportar CSV', icon: 'arrow-down-tray' },
        { id: 'notify', label: 'Notificar', icon: 'envelope' },
        { id: 'extend', label: 'Extender Periodo', icon: 'calendar-plus' },
    ],
};

// ============================================================================
// PROTECCIÓN DE RUTAS (MIDDLEWARE)
// ============================================================================

/**
 * Middleware de protección para rutas de Super Admin.
 * 
 * Debe ejecutarse ANTES de cargar cualquier componente del módulo /admin.
 * Verifica:
 * 1. Usuario autenticado
 * 2. Token con custom claim role === 'SUPER_ADMIN'
 * 3. No está en modo impersonación
 */
const adminRouteGuard = {
    /**
     * Verifica si el usuario actual puede acceder a rutas admin
     * @param {Object} user - Usuario de Firebase Auth
     * @param {Object} userClaims - Custom claims del token
     * @returns {Object} { allowed: boolean, reason?: string, redirect?: string }
     */
    checkAccess: async function (user, userClaims) {
        // 1. Usuario no autenticado
        if (!user) {
            return {
                allowed: false,
                reason: 'NOT_AUTHENTICATED',
                redirect: '/login',
                message: 'Debe iniciar sesión para acceder.',
            };
        }

        // 2. Obtener custom claims
        const claims = userClaims || await user.getIdTokenResult().then(r => r.claims);

        // 3. Verificar rol
        if (claims.role !== 'SUPER_ADMIN') {
            // Log de intento no autorizado
            console.warn(`[AdminGuard] Acceso denegado: ${user.email} intentó acceder a /admin`);

            return {
                allowed: false,
                reason: 'NOT_ADMIN',
                redirect: '/dashboard',
                message: 'No tienes permisos para acceder a esta sección.',
            };
        }

        // 4. Verificar si está en modo impersonación
        if (claims.impersonating) {
            return {
                allowed: false,
                reason: 'IMPERSONATING',
                redirect: '/dashboard',
                message: 'No puedes acceder al panel admin mientras estás en modo cliente.',
            };
        }

        // 5. Acceso permitido
        return {
            allowed: true,
        };
    },

    /**
     * Registra acceso exitoso para auditoría
     */
    logAccess: async function (user, path) {
        try {
            await firebase.firestore().collection('admin_access_logs').add({
                user_id: user.uid,
                email: user.email,
                path: path,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                user_agent: navigator.userAgent,
            });
        } catch (e) {
            console.error('[AdminGuard] Error logging access:', e);
        }
    },
};

// ============================================================================
// IMPLEMENTACIÓN DEL GUARD EN ROUTER
// ============================================================================

/**
 * Ejemplo de uso con React Router:
 * 
 * import { AdminRouteGuard } from './admin-config';
 * 
 * function ProtectedAdminRoute({ children }) {
 *   const { user, claims } = useAuth();
 *   const navigate = useNavigate();
 *   const [checking, setChecking] = useState(true);
 * 
 *   useEffect(() => {
 *     async function checkAccess() {
 *       const result = await AdminRouteGuard.checkAccess(user, claims);
 *       
 *       if (!result.allowed) {
 *         toast.error(result.message);
 *         navigate(result.redirect);
 *       } else {
 *         AdminRouteGuard.logAccess(user, location.pathname);
 *         setChecking(false);
 *       }
 *     }
 *     
 *     checkAccess();
 *   }, [user, claims]);
 * 
 *   if (checking) return <LoadingSpinner />;
 *   return children;
 * }
 */

// ============================================================================
// FUNCIONES DE ACCIÓN DEL ADMIN
// ============================================================================

const adminActions = {
    /**
     * Suspende un tenant inmediatamente
     */
    suspendTenant: async function (tenantId, reason) {
        const result = await firebase.functions().httpsCallable('suspendTenant')({
            tenantId,
            reason,
        });

        return result.data;
    },

    /**
     * Inicia sesión como cliente (impersonación)
     */
    impersonateTenant: async function (tenantId) {
        const result = await firebase.functions().httpsCallable('impersonateTenant')({
            tenantId,
        });

        if (result.data.success) {
            // Forzar refresh del token
            await firebase.auth().currentUser.getIdToken(true);

            // Redirigir al dashboard del tenant
            window.location.href = '/dashboard';
        }

        return result.data;
    },

    /**
     * Actualiza límites de un plan
     */
    updatePlanLimits: async function (planId, newLimits) {
        await firebase.firestore()
            .collection('global_config')
            .doc(planId)
            .update({
                limits: newLimits,
                updated_at: firebase.firestore.FieldValue.serverTimestamp(),
                updated_by: firebase.auth().currentUser.uid,
            });

        console.log(`[Admin] Plan ${planId} actualizado`);
    },

    /**
     * Crea un nuevo tenant
     */
    createTenant: async function (tenantData) {
        const result = await firebase.functions().httpsCallable('createTenant')(tenantData);
        return result.data;
    },
};

// ============================================================================
// EXPORTS
// ============================================================================

// Para uso en navegador
if (typeof window !== 'undefined') {
    window.ADMIN_NAVIGATION = ADMIN_NAVIGATION;
    window.KPI_CONFIG = KPI_CONFIG;
    window.TENANT_TABLE_CONFIG = TENANT_TABLE_CONFIG;
    window.adminRouteGuard = adminRouteGuard;
    window.adminActions = adminActions;
}

// Para uso en Node.js/módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ADMIN_NAVIGATION,
        KPI_CONFIG,
        TENANT_TABLE_CONFIG,
        adminRouteGuard,
        adminActions,
    };
}
