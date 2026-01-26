/**
 * PLD BDU v2 - Billing & Feature Service
 * Manages subscriptions, plans, and feature gating with OpenPay Integration
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

    // OpenPay Sandbox Credentials (PUBLIC SANDBOX)
    // Replace with User's credentials in production
    OPENPAY_ID: 'm1xplo5l0aa7g83a9', // Example/Placeholder ID
    OPENPAY_PK: 'pk_c4f5k7n8j9',     // Example/Placeholder Key - User will update

    /**
     * Initialize billing service
     */
    async init() {
        if (typeof AuthService === 'undefined' || !AuthService.getCurrentUser()) return;

        // Configure OpenPay
        if (typeof OpenPay !== 'undefined') {
            OpenPay.setId('mx_merchant_id'); // Placeholder - User to configure
            OpenPay.setApiKey('pk_test_key'); // Placeholder - User to configure
            OpenPay.setSandboxMode(true);

            // Generate Device ID for fraud prevention
            this.deviceId = OpenPay.deviceData.setup();
        }

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
     * Load subscription
     */
    async loadSubscription(empresaId) {
        try {
            const subs = await dbService.getByIndex('subscriptions', 'empresaId', empresaId);
            if (subs && subs.length > 0) {
                this.currentSubscription = subs[0];
            } else {
                this.currentSubscription = {
                    planId: 'plan_free',
                    status: 'active', // Free tier is always active
                    empresaId: empresaId
                };
            }
        } catch (e) {
            console.error('Error loading subscription:', e);
            this.currentSubscription = { planId: 'plan_free', status: 'active' };
        }
    },

    /**
     * Get current plan details
     */
    getCurrentPlan() {
        const planId = this.currentSubscription?.planId || 'plan_free';
        const planKey = Object.keys(PLANS).find(key => PLANS[key].id === planId) || 'FREE';
        return PLANS[planKey];
    },

    /**
     * Render UI details in the config tab
     */
    async renderUI() {
        const plan = this.getCurrentPlan();
        if (!plan) return;

        // 1. Plan Overview
        const container = document.getElementById('billingContainer');
        if (!container && document.getElementById('tab-config')) {
            // Inject billing container if it doesn't exist yet in config
            // In a real refactor, this would be in the HTML
            const configTab = document.getElementById('tab-config');
            const billingSection = document.createElement('div');
            billingSection.id = 'billingContainer';
            billingSection.className = 'card mt-4';
            billingSection.innerHTML = `
                <div class="card-header bg-white">
                    <h3 class="card-title">Suscripción y Facturación</h3>
                </div>
                <div class="card-body" id="billingBody"></div>
            `;
            configTab.appendChild(billingSection);
        }

        const billingBody = document.getElementById('billingBody');
        if (billingBody) {
            const statusColor = this.isActive() ? 'success' : 'danger';

            billingBody.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 20px;">
                    <div>
                        <span class="badge badge-${statusColor} mb-2">${this.currentSubscription?.status?.toUpperCase() || 'ACTIVO'}</span>
                        <h4>Plan Actual: <span class="text-primary">${plan.name}</span></h4>
                        <p class="text-muted">
                            ${plan.price === 0 ? 'Gratis para siempre' : '$' + plan.price + ' MXN / mes'}
                        </p>
                        
                        <div class="mt-3">
                            <strong>Límites:</strong>
                            <ul style="list-style: none; padding-left: 0; margin-top: 5px;">
                                <li>👥 Usuarios: <strong>${plan.maxUsers === -1 ? 'Ilimitados' : plan.maxUsers}</strong></li>
                                <li>📊 Operaciones: <strong>${plan.maxOperations === -1 ? 'Ilimitadas' : plan.maxOperations}</strong></li>
                            </ul>
                        </div>
                    </div>

                    <div>
                        ${plan.id === 'plan_free' ?
                    `<button class="btn btn-primary" onclick="BillingService.showUpgradeModal()">⭐ Mejorar Plan</button>` :
                    `<button class="btn btn-outline-secondary" onclick="BillingService.managePaymentMethod()">Gestionar Pago</button>`
                }
                        <button class="btn btn-ghost ml-2" onclick="BillingService.showInvoices()">Ver Facturas</button>
                    </div>
                </div>
             `;
        }
    },

    /**
     * Show Upgrade Modal with OpenPay Form
     */
    showUpgradeModal() {
        const plansHtml = Object.keys(PLANS)
            .filter(k => PLANS[k].id !== 'plan_free')
            .map(k => {
                const p = PLANS[k];
                return `
                    <div class="plan-option" onclick="BillingService.selectPlanForCheckout('${p.id}')">
                        <div style="font-weight: bold; font-size: 1.1em;">${p.name}</div>
                        <div style="color: var(--primary-color); font-size: 1.2em; margin: 5px 0;">$${p.price} MXN</div>
                        <ul style="font-size: 0.9em; text-align: left; margin: 10px 0; padding-left: 20px;">
                            <li>Hasta ${p.maxUsers} usuarios</li>
                            <li>${p.maxOperations === -1 ? 'Operaciones Ilimitadas' : p.maxOperations + ' operaciones'}</li>
                            ${p.features.includes('api_access') ? '<li>✅ API Access</li>' : ''}
                        </ul>
                        <button class="btn btn-sm btn-outline-primary w-100">Seleccionar</button>
                    </div>
                `;
            }).join('');

        const modalHtml = `
            <div id="paymentModal" class="modal active" style="z-index: 10000;">
                <div class="modal-content" style="max-width: 800px;">
                    <span class="close" onclick="document.getElementById('paymentModal').remove()">&times;</span>
                    <h2>Mejorar Suscripción</h2>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
                        <!-- Plans Column -->
                        <div class="plans-list" style="display: flex; flex-direction: column; gap: 15px;">
                            ${plansHtml}
                        </div>

                        <!-- Checkout Column -->
                        <div id="checkoutFormContainer" style="background: #f8f9fa; padding: 20px; border-radius: 8px; display: none;">
                            <h4 id="selectedPlanTitle" class="mb-3">Completa tu pago</h4>
                            
                            <form id="payment-form" onsubmit="return false;">
                                <div class="form-group">
                                    <label>Titular de la tarjeta</label>
                                    <input type="text" id="holder_name" class="form-control" autocomplete="off" data-openpay-card="holder_name">
                                </div>
                                <div class="form-group">
                                    <label>Número de tarjeta</label>
                                    <input type="text" id="card_number" class="form-control" autocomplete="off" data-openpay-card="card_number">
                                </div>
                                <div class="row">
                                    <div class="col-6">
                                        <div class="form-group">
                                            <label>Fecha de expiración (MM/YY)</label>
                                            <div style="display: flex; gap: 5px;">
                                                <input type="text" id="expiration_month" class="form-control" placeholder="MM" data-openpay-card="expiration_month">
                                                <input type="text" id="expiration_year" class="form-control" placeholder="YY" data-openpay-card="expiration_year">
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-6">
                                        <div class="form-group">
                                            <label>CVV</label>
                                            <input type="text" id="cvv2" class="form-control" autocomplete="off" data-openpay-card="cvv2">
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="mt-3 text-right">
                                    <button type="button" class="btn btn-success w-100" id="pay-button" onclick="BillingService.processPayment()">Pagar y Suscribir</button>
                                </div>
                                <div class="mt-2 text-center text-muted" style="font-size: 0.8em;">
                                    🔒 Pagos seguros vía OpenPay
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing if any
        const existing = document.getElementById('paymentModal');
        if (existing) existing.remove();

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    /**
     * Show Invoices Modal
     */
    showInvoices() {
        const invoices = [
            { id: 'INV-2025-001', date: '2025-01-01', amount: 999.00, status: 'pagado' },
            { id: 'INV-2024-012', date: '2024-12-01', amount: 999.00, status: 'pagado' }
        ];

        const rows = invoices.map(inv => `
            <tr>
                <td>${inv.id}</td>
                <td>${inv.date}</td>
                <td>$${inv.amount.toFixed(2)}</td>
                <td><span class="badge badge-success">${inv.status.toUpperCase()}</span></td>
                <td>
                    <button class="btn btn-xs btn-outline-primary" onclick="alert('Descargando factura ${inv.id}...')">⬇ PDF</button>
                    <button class="btn btn-xs btn-outline-secondary" onclick="alert('Descargando XML ${inv.id}...')">⬇ XML</button>
                </td>
            </tr>
        `).join('');

        const modalHtml = `
            <div id="invoicesModal" class="modal active" style="z-index: 10001;">
                <div class="modal-content">
                    <span class="close" onclick="document.getElementById('invoicesModal').remove()">&times;</span>
                    <h3>Historial de Facturación</h3>
                    <div style="overflow-x: auto; margin-top: 15px;">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Folio</th>
                                    <th>Fecha</th>
                                    <th>Monto</th>
                                    <th>Estado</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows || '<tr><td colspan="5" class="text-center">No hay facturas disponibles</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        const existing = document.getElementById('invoicesModal');
        if (existing) existing.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    selectedPlanId: null,

    selectPlanForCheckout(planId) {
        this.selectedPlanId = planId;
        const plan = PLANS[Object.keys(PLANS).find(k => PLANS[k].id === planId)];

        document.getElementById('checkoutFormContainer').style.display = 'block';
        document.getElementById('selectedPlanTitle').innerHTML = `Suscripción ${plan.name} <br><small>$${plan.price} MXN/mes</small>`;

        // Highlight selection
        document.querySelectorAll('.plan-option').forEach(el => el.style.borderColor = '#ddd');
        event.currentTarget.style.borderColor = 'var(--primary-color)';
    },

    /**
     * Process OpenPay Payment (Tokenization)
     */
    processPayment() {
        if (!this.selectedPlanId) return;

        showLoading('Procesando pago seguro...');

        const payButton = document.getElementById('pay-button');
        payButton.disabled = true;

        OpenPay.token.extractFormAndCreate('payment-form',
            (response) => this.onSuccess(response),
            (response) => this.onError(response)
        );
    },

    async onSuccess(response) {
        const tokenId = response.data.id;
        const deviceId = this.deviceId || OpenPay.deviceData.setup();

        console.log('✅ OpenPay Token:', tokenId);

        // Here we would send tokenId, deviceId, and planId to our BACKEND
        // Since we are serverless/client-side demo for now, we SIMULATE the backend processing

        try {
            await this.simulateBackendSubscription(tokenId, this.selectedPlanId);

            document.getElementById('paymentModal').remove();
            showToast('¡Suscripción exitosa!', 'success');

            // Reload subscription and UI
            const user = AuthService.getCurrentUser();
            let empresaId = user.empresaId;
            // Check super admin context again
            if (user.role === 'super_admin') {
                const session = JSON.parse(sessionStorage.getItem('pld_bdu_session') || '{}');
                if (session.viewingEmpresaId) empresaId = session.viewingEmpresaId;
            }

            await this.loadSubscription(empresaId);
            this.renderUI();

        } catch (error) {
            console.error(error);
            showToast('Error procesando suscripción', 'danger');
        } finally {
            hideLoading();
        }
    },

    onError(response) {
        hideLoading();
        document.getElementById('pay-button').disabled = false;
        console.error('OpenPay Error:', response);
        alert('Error en el pago: ' + (response.data.description || response.message));
    },

    /**
     * SIMULATE Backend Subscription Creation
     */
    async simulateBackendSubscription(sourceId, planId) {
        // In real life: Call Firebase Cloud Function
        // For demo: Write directly to Firestore

        const user = AuthService.getCurrentUser();
        let empresaId = user.empresaId;
        if (user.role === 'super_admin') { // Handle impersonation context
            const session = JSON.parse(sessionStorage.getItem('pld_bdu_session') || '{}');
            if (session.viewingEmpresaId) empresaId = session.viewingEmpresaId;
        }

        const subscription = {
            id: 'sub_' + Date.now(),
            empresaId: empresaId,
            planId: planId,
            status: 'active',
            paymentSourceId: sourceId, // Token (in real backend we'd create a Customer first)
            currentPeriodStart: new Date().toISOString(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // +30 days
            provider: 'openpay'
        };

        // Update company plan ref
        await dbService.updateItem('empresas', {
            id: empresaId,
            plan: Object.keys(PLANS).find(k => PLANS[k].id === planId).toLowerCase()
        });

        // Save subscription
        await dbService.addItems('subscriptions', [subscription]);
        await AuthService.logAudit('SUSCRIPCION_CREADA', `Actualización a plan ${planId}`);
    },

    /**
     * Check if subscription is active
     */
    isActive() {
        if (!this.currentSubscription) return false;

        // Free plan never expires
        if (this.currentSubscription.planId === 'plan_free') return true;

        const now = new Date();
        const endDate = new Date(this.currentSubscription.currentPeriodEnd);

        // Check status AND date
        const isValidStatus = ['active', 'trialing'].includes(this.currentSubscription.status);
        const isNotExpired = endDate > now;

        if (!isNotExpired) {
            console.warn('⚠️ Subscription expired on:', endDate);
        }

        return isValidStatus && isNotExpired;
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
