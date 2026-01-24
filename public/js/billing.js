/**
 * PLD BDU v2 - Billing & Feature Service
 * Manages subscriptions, plans, and feature gating
 */

const PLANS = {
    FREE: {
        id: 'plan_free',
        name: 'Básico (Free)',
        price: 0,
        maxUsers: 2,
        maxOperations: 50,
        features: ['dashboard', 'kyc_basic']
    },
    PRO: {
        id: 'plan_pro',
        name: 'Profesional',
        price: 999, // MXN
        maxUsers: 5,
        maxOperations: 500,
        features: ['dashboard', 'kyc_full', 'reports', 'export']
    },
    ENTERPRISE: {
        id: 'plan_enterprise',
        name: 'Enterprise',
        price: 2499, // MXN
        maxUsers: 20,
        maxOperations: 10000,
        features: ['dashboard', 'kyc_full', 'reports', 'export', 'api_access', 'audit', 'compliance']
    }
};

const BillingService = {
    currentSubscription: null,

    /**
     * Initialize billing service
     */
    async init() {
        if (typeof AuthService === 'undefined' || !AuthService.getCurrentUser()) return;

        const user = AuthService.getCurrentUser();
        let empresaId = user.empresaId;

        // Check if super_admin is viewing a specific empresa
        if (user.role === 'super_admin') {
            try {
                const session = JSON.parse(sessionStorage.getItem('pld_bdu_session') || '{}');
                if (session.viewingEmpresaId) {
                    empresaId = session.viewingEmpresaId;
                }
            } catch (e) { /* ignore */ }
        }

        if (empresaId) {
            await this.loadSubscription(empresaId);
        }
    },

    /**
     * Load subscription for a company
     */
    async loadSubscription(empresaId) {
        // In a real app, we would query the 'subscriptions' collection
        // For now, let's look for a subscription document or default to FREE
        try {
            const subs = await dbService.getByIndex('subscriptions', 'empresaId', empresaId);
            if (subs && subs.length > 0) {
                this.currentSubscription = subs[0];
            } else {
                // Default fallback stub
                this.currentSubscription = {
                    planId: 'plan_free',
                    status: 'active',
                    empresaId: empresaId
                };
            }
        } catch (e) {
            console.error('Error loading subscription:', e);
            // Safe fallback
            this.currentSubscription = { planId: 'plan_free', status: 'active' };
        }

        console.log('💳 Subscription loaded:', this.getCurrentPlan().name);
    },

    /**
     * Get current plan details
     */
    getCurrentPlan() {
        const planId = this.currentSubscription?.planId || 'plan_free';
        // Find plan by ID (handling case-insensitive or slight mismatches if needed)
        const planKey = Object.keys(PLANS).find(key => PLANS[key].id === planId) || 'FREE';
        return PLANS[planKey];
    },

    /**
     * Redirect to OpenPay Checkout (Mock)
     */
    async startCheckout(planId) {
        console.log(`Starting OpenPay checkout for ${planId}...`);

        // OpenPay usually works with a tokenization form or a redirect 
        // depending on the implementation (Embedded vs Hosted).
        // For SaaS subscriptions, we typically create a 'Customer' and then a 'Subscription' in OpenPay.

        const plan = PLANS[Object.keys(PLANS).find(k => PLANS[k].id === planId)];

        const msg = `
💳 Redirigiendo a Pasarela de Pagos BBVA OpenPay...

Plan seleccionado: ${plan.name}
Monto: $${plan.price} MXN

(En producción, aquí se abriría el formulario de OpenPay o se redirigiría a su checkout hospedado)
        `;

        alert(msg);

        // Simulate successful payment after delay
        /*
        setTimeout(async () => {
            await this.upgradeSubscription(planId);
        }, 2000);
        */
    },

    /**
     * Check if subscription is active
     */
    isActive() {
        return this.currentSubscription &&
            ['active', 'trialing'].includes(this.currentSubscription.status);
    },

    /**
     * Render UI details in the config tab
     */
    async renderUI() {
        const plan = this.getCurrentPlan();
        if (!plan) return;

        // Render Plan Name
        const nameEl = document.getElementById('currentPlanName');
        if (nameEl) nameEl.textContent = plan.name;

        // Render Usage Stats (Mocked for now, normally would query DB)
        if (typeof dbService !== 'undefined') {
            const usersCount = await dbService.count('users');
            const maxUsers = plan.maxUsers;

            this.updateProgressBar('usersProgress', 'usersUsed', 'usersMax', usersCount, maxUsers);

            // Ops Count (This month)
            // const opsCount = await dbService.count('operations'); // approximate
            // this.updateProgressBar('opsProgress', 'opsUsed', 'opsMax', opsCount, plan.maxOperations);
            // Mocking ops for display
            this.updateProgressBar('opsProgress', 'opsUsed', 'opsMax', 12, plan.maxOperations);
        }
    },

    updateProgressBar(barId, usedId, maxId, used, max) {
        const bar = document.getElementById(barId);
        const usedEl = document.getElementById(usedId);
        const maxEl = document.getElementById(maxId);

        if (usedEl) usedEl.textContent = used;

        if (max === -1) {
            if (maxEl) maxEl.textContent = '/ Ilimitado';
            if (bar) bar.style.width = '10%';
        } else {
            if (maxEl) maxEl.textContent = `/ ${max}`;
            const pct = Math.min(100, (used / max) * 100);
            if (bar) bar.style.width = `${pct}%`;

            if (pct > 90 && bar) bar.style.backgroundColor = 'var(--color-danger)';
        }
    },

    /**
     * Show Upgrade Modal
     */
    showUpgradeModal() {
        // Simple alert for now, or build a modal dynamically
        const msg = `
✨ Mejora tu plan

1. Profesional ($999/mes)
   - Hasta 5 usuarios
   - 500 operaciones
   - Reportes y Exportación

2. Enterprise ($2,499/mes)
   - Hasta 20 usuarios
   - Operaciones Ilimitadas
   - API + Auditoría

¿Deseas contactar a ventas? (Simulación)
        `;
        if (confirm(msg)) {
            this.startCheckout('plan_pro');
        }
    }
};

const FeatureService = {
    /**
     * Check if current user/company has access to a feature
     * @param {string} featureKey - Key of the feature to check
     */
    can(featureKey) {
        if (typeof AuthService !== 'undefined') {
            const user = AuthService.getCurrentUser();
            if (user?.role === 'super_admin') return true; // Super admin has all access
        }

        const plan = BillingService.getCurrentPlan();

        // simple permission check
        // If the plan has 'all' or explicitly lists the feature
        if (plan.features.includes('all') || plan.features.includes(featureKey)) {
            return true;
        }

        return false;
    },

    /**
     * Check quotas (e.g. max users)
     * @param {string} quotaKey - 'maxUsers', 'maxOperations'
     * @param {number} currentUsage - Current count
     */
    checkQuota(quotaKey, currentUsage) {
        const plan = BillingService.getCurrentPlan();
        const limit = plan[quotaKey];

        if (limit === undefined || limit === -1) return true; // Unlimited

        return currentUsage < limit;
    }
};

// Export
if (typeof window !== 'undefined') {
    window.BillingService = BillingService;
    window.FeatureService = FeatureService;
    window.PLANS = PLANS;
}
