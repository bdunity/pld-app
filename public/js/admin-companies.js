/**
 * PLD BDU v2 - Companies Management (Super Admin)
 */

const CompaniesService = {

    // SaaS Plans Configuration
    PLANS: {
        basic: { name: 'Básico', maxUsers: 2, price: 49.99, features: ['basic'] },
        pro: { name: 'Pro', maxUsers: 10, price: 99.99, features: ['all'] },
        enterprise: { name: 'Enterprise', maxUsers: 9999, price: 299.99, features: ['all', 'api', 'support'] }
    },

    /**
     * Load companies list into the table
     */
    /**
     * Load companies list into the grid (Monday.com style)
     */
    async loadCompanies() {
        const grid = document.getElementById('companiesGrid');
        if (!grid) return;

        try {
            const companies = await dbService.getAll('empresas');
            const users = await dbService.getAll('users');

            if (companies.length === 0) {
                grid.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">
                        <div style="font-size: 3em; margin-bottom: 15px;">📭</div>
                        <p>No hay espacios de trabajo creados.</p>
                        <button class="btn btn-primary" onclick="document.getElementById('modalNewCompany').classList.add('active')" style="margin-top: 15px;">
                            Crear Primer Espacio
                        </button>
                    </div>`;
                return;
            }

            grid.innerHTML = companies.map(c => {
                const userCount = users.filter(u => u.empresaId === c.id).length;
                const planKey = c.plan || 'basic';
                const plan = this.PLANS[planKey] || this.PLANS.basic;
                const maxUsers = c.maxUsers || plan.maxUsers;
                const usagePercent = Math.min(100, (userCount / maxUsers) * 100);

                const statusClass = c.activo ? 'active' : 'inactive';
                const statusText = c.activo ? 'Activo' : 'Archivado';

                // Determine icon based on sector (simple heuristic)
                const activities = Array.isArray(c.actividades) ? c.actividades : [c.sector || ''];
                let icon = '🏢';
                if (activities.some(a => a.includes('Casino') || a.includes('Juegos'))) icon = '🎰';
                else if (activities.some(a => a.includes('Inmobiliaria'))) icon = '🏠';
                else if (activities.some(a => a.includes('Vehículos'))) icon = '🚗';
                else if (activities.some(a => a.includes('Joyas'))) icon = '💎';

                return `
                <div class="workspace-card" onclick="CompaniesService.impersonate('${c.id}')">
                    <span class="plan-badge ${planKey}">${plan.name}</span>
                    
                    <div class="workspace-header">
                        <div class="workspace-icon">${c.logo ? `<img src="${c.logo}" alt="Logo" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">` : icon}</div>
                        <button class="workspace-menu-btn" onclick="event.stopPropagation(); CompaniesService.viewCompanyDetails('${c.id}')">
                            ⚙️
                        </button>
                    </div>

                    <div class="workspace-title">${c.razonSocial}</div>
                    
                    <div class="workspace-meta">
                        <div class="workspace-meta-item">
                            <span class="status-pill ${statusClass}">● ${statusText}</span>
                        </div>
                        <div class="workspace-meta-item">
                            👥 ${userCount}/${maxUsers}
                        </div>
                    </div>

                    <div class="usage-bar">
                        <div class="usage-fill" style="width: ${usagePercent}%"></div>
                    </div>

                    <div class="workspace-footer">
                        <small class="text-muted" style="font-size: 0.75em;">RFC: ${c.rfc}</small>
                        <button class="workspace-action-btn" onclick="event.stopPropagation(); CompaniesService.impersonate('${c.id}')">
                            Entrar ➔
                        </button>
                    </div>
                </div>`;
            }).join('');

        } catch (error) {
            console.error('Error loading companies:', error);
            grid.innerHTML = '<p class="text-danger">Error cargando espacios de trabajo</p>';
        }
    },

    /**
     * Create a new company
     */
    async createCompany(data) {
        if (!data.razonSocial || !data.rfc) {
            alert('Razón Social y RFC son obligatorios');
            return;
        }

        const id = 'emp_' + Date.now();
        const planKey = data.plan || 'basic';
        const plan = this.PLANS[planKey] || this.PLANS.basic;

        const newCompany = {
            id: id,
            razonSocial: data.razonSocial,
            nombreComercial: data.nombreComercial,
            rfc: data.rfc,
            sector: 'Múltiple',
            actividades: data.actividades || [],
            plan: planKey,
            maxUsers: plan.maxUsers, // Inherit from plan default
            activo: true,
            fechaRegistro: new Date().toISOString()
        };

        try {
            await dbService.addItems('empresas', [newCompany]);

            // Create default admin user for this company
            if (data.adminEmail) {
                const adminUser = {
                    email: data.adminEmail,
                    password: await AuthService.hashPassword('admin123'), // Default password
                    role: 'admin',
                    empresaId: id,
                    createdAt: new Date().toISOString()
                };
                await dbService.addItems('users', [adminUser]);
            }

            // showToast('Empresa creada exitosamente', 'success'); // Caller handles UI 
            return true;
        } catch (error) {
            console.error('Error creating company:', error);
            // showToast('Error al crear empresa', 'danger');
            return false;
        }
    },

    /**
     * Check if company reached user limit
     */
    async checkUserLimit(empresaId) {
        if (!empresaId) return false;
        const company = await dbService.get('empresas', empresaId);
        if (!company) return true; // Block if company not found

        const users = await dbService.getAll('users');
        const count = users.filter(u => u.empresaId === empresaId).length;

        // Enterprise (9999) effectively unlimited, but we check anyway
        return count >= (company.maxUsers || 2);
    },

    // Current company being edited
    currentEditingCompanyId: null,

    /**
     * View Company Details (Enhanced with Info, Users, Config, History)
     */
    async viewCompanyDetails(empresaId) {
        this.currentEditingCompanyId = empresaId;

        // 1. Get Company Info
        const company = await dbService.get('empresas', empresaId);
        if (!company) return;

        // Header
        document.getElementById('detailModalTitle').textContent = company.razonSocial;
        document.getElementById('detailModalSubtitle').textContent = `RFC: ${company.rfc}`;

        // Logo Preview in Header
        const logoPreview = document.getElementById('detailLogoPreview');
        if (company.logo) {
            logoPreview.innerHTML = `<img src="${company.logo}" alt="Logo">`;
        } else {
            logoPreview.innerHTML = '🏢';
        }

        // === INFO TAB ===
        document.getElementById('detailRazonSocial').value = company.razonSocial || '';
        document.getElementById('detailRFC').value = company.rfc || '';
        document.getElementById('detailPlan').value = company.plan || 'basic';

        // Logo Upload Area
        const logoArea = document.getElementById('logoPreviewLarge');
        if (company.logo) {
            logoArea.innerHTML = `<img src="${company.logo}" alt="Logo">`;
        } else {
            logoArea.innerHTML = `<span style="font-size: 3em;">📷</span><p style="margin-top: 8px; font-size: 0.85em;">Subir Logo</p>`;
        }

        // Activities
        const activities = Array.isArray(company.actividades) ? company.actividades : [];
        document.getElementById('detailActivities').innerHTML = activities.length > 0
            ? activities.map(a => `<span class="activity-tag">${a}</span>`).join('')
            : '<span class="text-muted">Sin actividades definidas</span>';

        // === USERS TAB ===
        const allUsers = await dbService.getAll('users');
        const companyUsers = allUsers.filter(u => u.empresaId === empresaId);

        document.getElementById('userCountLabel').textContent = `${companyUsers.length} usuario(s)`;

        const usersTbody = document.getElementById('detailUsersTable');
        usersTbody.innerHTML = companyUsers.map(u => {
            const roleName = AuthService.ROLES[u.role]?.name || u.role;
            return `
                <tr>
                    <td>${u.email}</td>
                    <td><span class="badge badge-secondary">${roleName}</span></td>
                    <td>${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '--'}</td>
                    <td>
                        <button class="btn btn-sm btn-ghost" onclick="CompaniesService.removeUser('${u.email}')">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('') || '<tr><td colspan="4" class="text-center">Sin usuarios</td></tr>';

        // === CONFIG TAB ===
        document.getElementById('detailUmbralAviso').value = company.umbralAviso || '';
        document.getElementById('detailUmbralId').value = company.umbralId || '';
        document.getElementById('detailApiKey').value = company.apiKey || '';
        document.getElementById('detailNotas').value = company.notas || '';

        // === HISTORY TAB ===
        const allLogs = await dbService.getAll('audit_logs');
        const userEmails = new Set(companyUsers.map(u => u.email));
        const companyLogs = allLogs.filter(log => userEmails.has(log.user) || log.empresaId === empresaId);
        companyLogs.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        const historyTbody = document.getElementById('detailHistoryTable');
        historyTbody.innerHTML = companyLogs.slice(0, 50).map(log => `
            <tr>
                <td>${new Date(log.fecha).toLocaleString()}</td>
                <td>${log.user}</td>
                <td><strong>${log.action}</strong></td>
                <td>${log.details}</td>
            </tr>
        `).join('') || '<tr><td colspan="4" class="text-center">Sin historial reciente</td></tr>';

        // Reset to Info tab and show modal
        switchDetailTab('info');
        document.getElementById('modalCompanyDetail').classList.add('active');
    },

    /**
     * Save Company Info (Info Tab)
     */
    async saveCompanyInfo() {
        if (!this.currentEditingCompanyId) return;

        const company = await dbService.get('empresas', this.currentEditingCompanyId);
        if (!company) return;

        company.razonSocial = document.getElementById('detailRazonSocial').value;
        company.plan = document.getElementById('detailPlan').value;

        // Update maxUsers based on plan
        const plan = this.PLANS[company.plan] || this.PLANS.basic;
        company.maxUsers = plan.maxUsers;

        await dbService.updateItem('empresas', company);
        showToast('Información guardada', 'success');
        this.loadCompanies();
    },

    /**
     * Save Company Config (Config Tab)
     */
    async saveCompanyConfig() {
        if (!this.currentEditingCompanyId) return;

        const company = await dbService.get('empresas', this.currentEditingCompanyId);
        if (!company) return;

        company.umbralAviso = parseInt(document.getElementById('detailUmbralAviso').value) || null;
        company.umbralId = parseInt(document.getElementById('detailUmbralId').value) || null;
        company.apiKey = document.getElementById('detailApiKey').value || null;
        company.notas = document.getElementById('detailNotas').value || null;

        await dbService.updateItem('empresas', company);
        showToast('Configuración guardada', 'success');
    },

    /**
     * Handle Logo Upload
     */
    async uploadLogo(file) {
        if (!this.currentEditingCompanyId || !file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64 = e.target.result;

            // Update preview
            document.getElementById('logoPreviewLarge').innerHTML = `<img src="${base64}" alt="Logo">`;
            document.getElementById('detailLogoPreview').innerHTML = `<img src="${base64}" alt="Logo">`;

            // Save to company
            const company = await dbService.get('empresas', this.currentEditingCompanyId);
            if (company) {
                company.logo = base64;
                await dbService.updateItem('empresas', company);
                showToast('Logo actualizado', 'success');
                this.loadCompanies();
            }
        };
        reader.readAsDataURL(file);
    },

    /**
     * Remove Logo
     */
    async removeLogo() {
        if (!this.currentEditingCompanyId) return;

        const company = await dbService.get('empresas', this.currentEditingCompanyId);
        if (company) {
            company.logo = null;
            await dbService.updateItem('empresas', company);

            document.getElementById('logoPreviewLarge').innerHTML = `<span style="font-size: 3em;">📷</span><p style="margin-top: 8px; font-size: 0.85em;">Subir Logo</p>`;
            document.getElementById('detailLogoPreview').innerHTML = '🏢';

            showToast('Logo eliminado', 'info');
            this.loadCompanies();
        }
    },

    /**
     * Remove User from Company
     */
    async removeUser(email) {
        if (!confirm(`¿Eliminar usuario ${email}?`)) return;

        const users = await dbService.getAll('users');
        const user = users.find(u => u.email === email);
        if (user) {
            await dbService.deleteItem('users', user.id || email);
            showToast('Usuario eliminado', 'success');
            this.viewCompanyDetails(this.currentEditingCompanyId);
        }
    },

    /**
     * Impersonate a company (Simulate login)
     */
    async impersonate(empresaId) {
        const users = await dbService.getAll('users');
        const targetUser = users.find(u => u.empresaId === empresaId && u.role === 'admin');

        if (targetUser) {
            if (confirm(`¿Deseas cambiar a la vista de ${targetUser.email}?`)) {
                const session = {
                    email: targetUser.email,
                    role: 'admin',
                    empresaId: empresaId,
                    loginTime: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                    isImpersonating: true
                };
                sessionStorage.setItem(AuthService.SESSION_KEY, JSON.stringify(session));
                window.location.reload();
            }
        } else {
            alert('No se encontró un usuario administrador para esta empresa.');
        }
    }
};

// Global Functions for Dashboard HTML
function switchDetailTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.detail-tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.detail-tab').forEach(el => el.classList.remove('active'));

    // Show selected tab
    document.getElementById(`detail-${tabName}`).style.display = 'block';
    document.querySelector(`.detail-tab[data-tab="${tabName}"]`).classList.add('active');
}

function handleLogoUpload(input) {
    if (input.files && input.files[0]) {
        CompaniesService.uploadLogo(input.files[0]);
    }
}

function removeLogo() {
    CompaniesService.removeLogo();
}

function saveCompanyInfo() {
    CompaniesService.saveCompanyInfo();
}

function saveCompanyConfig() {
    CompaniesService.saveCompanyConfig();
}

function showInviteToCompanyModal() {
    // Open the existing invite modal with context to the current company
    if (CompaniesService.currentEditingCompanyId) {
        // Set a hidden value or use the existing modal logic
        showInviteModal(); // This function should exist from prior implementation
    }
}

// Expose globally
window.CompaniesService = CompaniesService;

