/**
 * PLD BDU v2 - Application Logic
 * Main business logic preserving original functionality
 */

// Global state
let appConfig = {
    rfc: 'SPE091216B35',
    razonSocial: '10BET CASINO EN LÍNEA',
    nombreComercial: '',
    claveSujetoObligado: '',
    year: 2025,
    uma: 113.14,
    giros: ['juegos_sorteos'], // Array of active giro IDs
    giroPrincipal: 'juegos_sorteos', // Primary giro for reporting
    aviso: 645,
    monitoreo: 325,
    avisoOverride: null,
    monitoreoOverride: null
};

let currentData = {
    depositos: [],
    retiros: []
};

let lastFilteredResults = {
    depositos: [],
    retiros: []
};

let activeCardFilter = 'all';
let dashboardChart = null;

/**
 * Initialize Dashboard
 */
async function initDashboard() {
    try {
        // Check authentication
        const user = AuthService.getCurrentUser();
        if (!user) {
            window.location.href = 'index.html';
            return;
        }

        // Initialize DB
        await dbService.init();

        // Initialize Multi-Tenant System with context awareness
        if (typeof EmpresasService !== 'undefined') {
            await EmpresasService.init();

            // Check if super_admin is viewing a specific empresa
            const session = JSON.parse(sessionStorage.getItem('pld_bdu_session') || '{}');
            const viewingEmpresaId = session.viewingEmpresaId;

            if (viewingEmpresaId && user.role === 'super_admin') {
                // Super admin viewing specific company - load THAT empresa
                await EmpresasService.selectEmpresa(viewingEmpresaId);
                console.log('🔍 Super Admin viendo empresa:', session.viewingEmpresaName || viewingEmpresaId);
            } else if (user.empresaId) {
                // Regular user - load their empresa
                await EmpresasService.selectEmpresa(user.empresaId);
            }

            const empresa = EmpresasService.getCurrentEmpresa();
            if (empresa) {
                console.log('🏢 Empresa activa:', empresa.nombreComercial || empresa.razonSocial);

                // Load dynamic thresholds based on empresa's giro
                const giroParams = await EmpresasService.getMainGiroParams(appConfig.year);
                if (giroParams) {
                    appConfig.aviso = giroParams.umbralAvisoUMA;
                    appConfig.monitoreo = giroParams.umbralIdentificacionUMA;
                    console.log('📊 Giro:', giroParams.giro.nombre);
                    console.log('📊 Umbral Aviso:', giroParams.umbralAvisoUMA, 'UMA');
                }

                // Update appConfig with empresa data
                appConfig.rfc = empresa.rfc || appConfig.rfc;
                appConfig.razonSocial = empresa.razonSocial || appConfig.razonSocial;
                appConfig.nombreComercial = empresa.nombreComercial || '';
            }
        }

        // Initialize SaaS Billing
        if (typeof BillingService !== 'undefined') {
            await BillingService.init();
        }

        // Setup UI based on role
        setupUIForRole(user);

        // Load config
        await loadConfig();

        // Load initial data (Parallel)
        await Promise.all([
            loadPeriods(),
            loadKYC(),
            loadAudit(),
            updateStats(),
            loadNotifications(),
            initEmpresaSelector() // Admin specific
        ]);

        // Show first available tab
        const tabs = AuthService.getAvailableTabs();
        if (tabs.length > 0) {
            switchTab(tabs[0]);
        }

        // Setup file input listener
        const fileInput = document.getElementById('fileExcel');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    document.getElementById('fileInfo').classList.remove('hidden');
                    document.getElementById('fileName').textContent = `📄 ${file.name}`;
                }
            });
        }

    } catch (error) {
        console.error('Init error:', error);
        showToast('Error inicializando: ' + error.message, 'danger');
    }
}

/**
 * Setup UI based on user role - SaaS Multi-Tenant Navigation
 */
function setupUIForRole(user) {
    const role = AuthService.ROLES[user.role];
    const isSuperAdmin = user.role === 'super_admin';
    const isAdmin = user.role === 'admin';
    const session = JSON.parse(sessionStorage.getItem(AuthService.SESSION_KEY) || '{}');
    const isViewingCompany = session.isImpersonating && session.viewingEmpresaId;

    // Update user info in sidebar
    document.getElementById('userName').textContent = user.email.split('@')[0];
    document.getElementById('userRole').textContent = role.icon + ' ' + role.name;
    document.getElementById('userAvatar').textContent = user.email.charAt(0).toUpperCase();

    if (document.getElementById('currentUserEmail')) {
        document.getElementById('currentUserEmail').textContent = user.email;
    }

    // All available menu items
    const menuItems = {
        // Platform modules (Super Admin only)
        empresas: { icon: '🏢', label: 'Mis Empresas' }, // Renamed for clarity
        dashboard: { icon: '📊', label: 'Monitor Global' },
        billing: { icon: '💳', label: 'Suscripciones' },
        ai_config: { icon: '🤖', label: 'IA Central' },

        // Tenant modules (per-company)
        config: { icon: '⚙️', label: 'Configuración' },
        upload: { icon: '📁', label: 'Carga de Datos' },
        operations: { icon: '📊', label: 'Operaciones' },
        monitoring: { icon: '📈', label: 'Monitoreo 6 Meses' },
        kyc: { icon: '🔍', label: 'Padrón KYC' },
        compliance: { icon: '✅', label: 'Cumplimiento' },
        export: { icon: '📤', label: 'Exportar XML CNBV' },
        reports: { icon: '📋', label: 'Reportes PLD' },
        audit: { icon: '🛡️', label: 'Bitácora' },
        soporte: { icon: '🎫', label: 'Ayuda y Soporte' }
    };

    // Build sections based on role and context
    let sections = [];

    if (isSuperAdmin) {
        if (isViewingCompany) {
            // === IMPERSONATION MODE ===
            // Show Company Context and Operational Modules FIRST

            sections.push({
                type: 'context',
                empresaId: session.viewingEmpresaId,
                empresaName: session.viewingEmpresaName
            });

            sections.push({
                title: 'OPERACIÓN DE EMPRESA',
                items: ['config', 'upload', 'operations', 'monitoring', 'kyc', 'compliance', 'export', 'reports', 'audit'],
                requiresTab: false, // Bypass role tab check (Super Admin has all access)
                forceAccess: true   // Explicit flag to force showing these items
            });

            sections.push({
                title: 'ADMINISTRACIÓN GLOBAL',
                items: ['empresas', 'dashboard', 'billing'],
                requiresTab: true
            });

        } else {
            // === GLOBAL PLATFORM MODE ===
            sections.push({
                title: 'PLATAFORMA SAAS',
                items: ['empresas', 'dashboard', 'billing', 'ai_config'],
                requiresTab: true
            });

            sections.push({
                title: 'HERRAMIENTAS',
                items: ['soporte'],
                requiresTab: true
            });
        }

    } else if (isAdmin) {
        // === TENANT ADMIN MODE ===
        // Clean layout for SaaS customers
        sections.push({
            title: 'GESTIÓN',
            items: ['config'],
            requiresTab: true
        });
        sections.push({
            title: 'CUMPLIMIENTO PLD',
            items: ['upload', 'operations', 'monitoring', 'kyc', 'compliance', 'export', 'reports', 'audit'],
            requiresTab: true
        });
        sections.push({
            title: 'SOPORTE',
            items: ['soporte'],
            requiresTab: true
        });

    } else {
        // === REGULAR USER / VISITOR ===
        sections.push({
            title: 'MÓDULOS',
            items: role.tabs,
            requiresTab: true
        });
    }

    // Render sidebar
    const sidebarMenu = document.getElementById('sidebarMenu');
    sidebarMenu.innerHTML = '';

    sections.forEach(section => {
        // Context indicator (special type for viewing company)
        if (section.type === 'context') {
            const empresaName = section.empresaName || section.empresaId;
            sidebarMenu.innerHTML += `
                <li class="sidebar-context-indicator">
                    <div class="context-badge active-context">
                        <div class="context-details">
                            <span class="context-label">ESPACIO DE TRABAJO</span>
                            <span class="context-empresa" title="${empresaName}">${empresaName}</span>
                            <span class="context-role">Modo Super Admin</span>
                        </div>
                        <button class="btn-exit-context" onclick="exitImpersonation()" title="Volver al Dashboard Global">
                            ➜ Salir
                        </button>
                    </div>
                </li>
            `;
            return;
        }

        // Section header
        if (section.title) {
            sidebarMenu.innerHTML += `
                <li class="sidebar-section-header">
                    <span>${section.title}</span>
                </li>
            `;
        }

        // Section items
        section.items.forEach(tabId => {
            const item = menuItems[tabId];

            // Access check:
            // 1. Is the item defined?
            // 2. FORCE ACCESS (for Super Admin in Impersonation) OR Role Check
            const hasAccess = item && (section.forceAccess || !section.requiresTab || role.tabs.includes(tabId));

            if (hasAccess) {
                sidebarMenu.innerHTML += `
                    <li class="sidebar-item">
                        <a href="#" class="sidebar-link" data-tab="${tabId}" onclick="switchTab('${tabId}'); return false;">
                            <span class="sidebar-link-icon">${item.icon}</span>
                            ${item.label}
                        </a>
                    </li>
                `;
            }
        });
    });
}

/**
 * Get empresa name by ID (helper)
 */
function getEmpresaName(empresaId) {
    // Try to get from cache or session
    const cached = sessionStorage.getItem('empresa_name_' + empresaId);
    if (cached) return cached;

    // Fallback: will be updated async
    dbService.get('empresas', empresaId).then(empresa => {
        if (empresa) {
            sessionStorage.setItem('empresa_name_' + empresaId, empresa.razonSocial || empresa.nombreComercial || empresaId);
        }
    });

    return empresaId; // Temporary until async completes
}

/**
 * Exit impersonation mode and return to super admin view
 */
function exitImpersonation() {
    const user = AuthService.getCurrentUser();
    if (!user) return;

    // 1. Clear EmpresasService context
    if (typeof EmpresasService !== 'undefined') {
        EmpresasService.currentEmpresa = null;
    }

    // 2. Clear cached empresa IDs
    sessionStorage.removeItem('currentEmpresaId');

    // 3. Restore super admin session without impersonation
    const session = {
        email: user.email,
        role: 'super_admin',
        loginTime: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        isImpersonating: false,
        viewingEmpresaId: null,
        viewingEmpresaName: null
    };
    sessionStorage.setItem(AuthService.SESSION_KEY, JSON.stringify(session));

    showToast('Volviendo a vista global...', 'info');
    setTimeout(() => window.location.reload(), 300);
}

/**
 * Switch active tab
 */
function switchTab(tabId) {
    // Check permission
    if (!AuthService.canAccessTab(tabId)) {
        showToast('No tienes acceso a esta sección', 'warning');
        return;
    }

    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabId);
    });

    // Update sidebar links
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.classList.toggle('active', link.dataset.tab === tabId);
    });

    // Show/hide tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none'; // Force hide
    });

    const tabContent = document.getElementById(`tab-${tabId}`);
    if (tabContent) {
        tabContent.classList.add('active');
        tabContent.style.display = 'block'; // Force show
    }

    // Update page title
    const titles = {
        config: ['Configuración', 'Parámetros del sistema'],
        upload: ['Carga de Datos', 'Importar archivos Excel'],
        operations: ['Operaciones', 'Análisis por periodo'],
        monitoring: ['Monitoreo 6 Meses', 'Acumulados por cliente'],
        kyc: ['Padrón KYC', 'Información de clientes'],
        compliance: ['Cumplimiento', 'Calendario, alertas y métricas'],
        export: ['Exportar', 'Generar reportes'],
        reports: ['Banco de Reportes', 'Historial de reportes generados'],
        audit: ['Bitácora', 'Registro de acciones'],
        soporte: ['Soporte', 'Centro de ayuda y tickets'],
        dashboard: ['Dashboard', 'Resumen general'],
        empresas: ['Espacios de Trabajo', 'Gestiona empresas clientes'],
        ai_config: ['Configuración IA', 'Ajustes de inteligencia artificial']
    };

    if (titles[tabId]) {
        document.getElementById('pageTitle').textContent = titles[tabId][0];
        document.getElementById('pageSubtitle').textContent = titles[tabId][1];
    }

    // Load Data based on Tab
    if (tabId === 'kyc') {
        setTimeout(() => loadKYC(), 100);
    } else if (tabId === 'compliance') {
        setTimeout(() => {
            loadCompliance();
            if (window.GraphService) {
                GraphService.init('networkGraph');
            }
        }, 100);
    } else if (tabId === 'empresas' && window.CompaniesService) {
        setTimeout(() => CompaniesService.loadCompanies(), 100);
    } else if (tabId === 'soporte' && typeof loadSoporte === 'function') {
        setTimeout(() => loadSoporte(), 100);
    } else if (tabId === 'upload') {
        setTimeout(() => loadUploadEmpresaContext(), 100);
    }

    // Load export giros when switching to export tab
    if (tabId === 'export') {
        setTimeout(() => loadExportGiros(), 100);
    }
}

/**
 * Load empresa context for upload section
 */
async function loadUploadEmpresaContext() {
    const empresa = EmpresasService?.getCurrentEmpresa();

    // Update empresa info
    const nameEl = document.getElementById('uploadEmpresaName');
    const rfcEl = document.getElementById('uploadEmpresaRFC');
    const girosEl = document.getElementById('uploadEmpresaGiros');

    if (!empresa) {
        if (nameEl) nameEl.textContent = 'No hay empresa seleccionada';
        if (rfcEl) rfcEl.textContent = 'Selecciona una empresa primero';
        return;
    }

    // Populate empresa info
    if (nameEl) nameEl.textContent = empresa.razonSocial || empresa.nombreComercial || 'Empresa';
    if (rfcEl) rfcEl.textContent = `RFC: ${empresa.rfc || 'N/A'}`;

    // Load and display giros (activities)
    if (girosEl && typeof GirosCatalogo !== 'undefined') {
        const giroIds = empresa.giros || ['juegos_sorteos'];
        const badges = giroIds.map(giroId => {
            const giro = GirosCatalogo.getById(giroId);
            const nombre = giro?.nombre || giroId;
            return `<span class="badge badge-info" style="font-size: 0.75em; padding: 6px 10px;">${giro?.icono || '📋'} ${nombre}</span>`;
        }).join('');
        girosEl.innerHTML = badges || '<span class="text-muted">Sin giros registrados</span>';
    }

    // Load upload history
    if (typeof CargasService !== 'undefined') {
        const cargas = await CargasService.getAll();
        const container = document.getElementById('uploadHistoryContainer');

        if (container) {
            if (cargas.length === 0) {
                container.innerHTML = '<p class="text-muted text-center">Sin cargas recientes para esta empresa</p>';
            } else {
                const recentCargas = cargas.slice(-5).reverse();
                container.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${recentCargas.map(c => `
                            <div style="display: flex; align-items: center; gap: 12px; padding: 8px; background: var(--surface-elevated); border-radius: 8px;">
                                <span style="font-size: 1.2em;">📄</span>
                                <div style="flex: 1;">
                                    <strong>${c.archivoNombre || 'Archivo'}</strong>
                                    <br><small class="text-muted">Periodo: ${c.periodoId || 'N/A'} | ${c.totalRegistros || 0} registros</small>
                                </div>
                                <span class="badge badge-success">✓</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        }
    }
}

/**
 * Load configuration (per-empresa config)
 */
async function loadConfig() {
    // Get config ID based on current empresa context
    const empresa = EmpresasService?.getCurrentEmpresa();
    const configId = empresa ? `config_${empresa.id}` : 'main';

    const config = await dbService.get('config', configId);
    if (config) {
        appConfig = { ...appConfig, ...config };
    }

    // Render giros checkboxes
    renderGirosCheckboxes();

    // Update UI with config values
    if (document.getElementById('cfgRFC')) {
        document.getElementById('cfgRFC').value = appConfig.rfc || '';
        document.getElementById('cfgRazonSocial').value = appConfig.razonSocial || '';
        document.getElementById('cfgNombreComercial').value = appConfig.nombreComercial || '';
        document.getElementById('cfgClaveSO').value = appConfig.claveSujetoObligado || '';
        document.getElementById('cfgYear').value = appConfig.year || 2025;
        document.getElementById('cfgUMA').value = appConfig.uma || 113.14;

        // Set giro principal
        if (appConfig.giroPrincipal) {
            updateGiroPrincipalSelect();
            document.getElementById('cfgGiroPrincipal').value = appConfig.giroPrincipal;
        }

        // Set override values if they exist
        if (appConfig.avisoOverride) {
            document.getElementById('cfgAvisoOverride').value = appConfig.avisoOverride;
        }
        if (appConfig.monitoreoOverride) {
            document.getElementById('cfgMonitoreoOverride').value = appConfig.monitoreoOverride;
        }

        // Mark selected giros
        if (appConfig.giros && appConfig.giros.length > 0) {
            appConfig.giros.forEach(giroId => {
                const checkbox = document.querySelector(`input[data-giro-id="${giroId}"]`);
                if (checkbox) checkbox.checked = true;
            });
            updateGiroPrincipalSelect();
        }

        // Update umbrales display
        updateUmbralesGiro();

        // Render Billing UI
        if (typeof BillingService !== 'undefined') {
            BillingService.renderUI();
        }
    }
}

/**
 * Save configuration
 */
async function saveConfig() {
    // Get selected giros
    const selectedGiros = [];
    document.querySelectorAll('input[data-giro-id]:checked').forEach(cb => {
        selectedGiros.push(cb.getAttribute('data-giro-id'));
    });

    if (selectedGiros.length === 0) {
        showToast('Selecciona al menos un giro', 'warning');
        return;
    }

    const giroPrincipal = document.getElementById('cfgGiroPrincipal').value;
    if (!giroPrincipal) {
        showToast('Selecciona un giro principal', 'warning');
        return;
    }

    // Get thresholds from selected giro
    const giro = typeof GirosCatalogo !== 'undefined' ? GirosCatalogo.getById(giroPrincipal) : null;
    const avisoOverride = document.getElementById('cfgAvisoOverride')?.value;
    const monitoreoOverride = document.getElementById('cfgMonitoreoOverride')?.value;

    // Get config ID based on current empresa context
    const empresa = EmpresasService?.getCurrentEmpresa();
    const configId = empresa ? `config_${empresa.id}` : 'main';

    appConfig = {
        id: configId, // Use empresa-specific config ID
        rfc: document.getElementById('cfgRFC').value,
        razonSocial: document.getElementById('cfgRazonSocial').value,
        nombreComercial: document.getElementById('cfgNombreComercial')?.value || '',
        claveSujetoObligado: document.getElementById('cfgClaveSO')?.value || '',
        year: parseInt(document.getElementById('cfgYear').value),
        uma: parseFloat(document.getElementById('cfgUMA').value),
        giros: selectedGiros,
        giroPrincipal: giroPrincipal,
        // Use override if provided, otherwise use giro's standard threshold
        aviso: avisoOverride ? parseInt(avisoOverride) : (giro?.umbralAviso || 645),
        monitoreo: monitoreoOverride ? parseInt(monitoreoOverride) : (giro?.umbralIdentificacion || 325),
        avisoOverride: avisoOverride ? parseInt(avisoOverride) : null,
        monitoreoOverride: monitoreoOverride ? parseInt(monitoreoOverride) : null
    };

    await dbService.addItems('config', [appConfig]);
    await AuthService.logAudit('GUARDAR_CONFIG', `Configuración actualizada: ${selectedGiros.length} giros, principal: ${giroPrincipal}`);
    showToast('Configuración guardada correctamente', 'success');
}

/**
 * Render giros checkboxes
 */
function renderGirosCheckboxes() {
    const container = document.getElementById('girosCheckboxContainer');
    if (!container || typeof GirosCatalogo === 'undefined') return;

    const giros = GirosCatalogo.getActive();

    container.innerHTML = giros.map(giro => {
        const uma = appConfig.uma || 113.14;
        const montoAviso = (giro.umbralAviso * uma).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

        return `
            <label style="display: flex; gap: 10px; padding: 12px; background: var(--surface-secondary); border-radius: var(--radius-md); cursor: pointer; border: 1px solid var(--border-color);">
                <input type="checkbox" data-giro-id="${giro.id}" onchange="onGiroChange()">
                <div>
                    <strong>Fr. ${giro.fraccion} - ${giro.nombre}</strong>
                    <div style="font-size: 0.8em; color: var(--text-muted);">
                        Umbral: ${giro.umbralAviso} UMA (${montoAviso})
                    </div>
                </div>
            </label>
        `;
    }).join('');
}

/**
 * Handle giro selection change
 */
function onGiroChange() {
    updateGiroPrincipalSelect();
    updateUmbralesGiro();
}

/**
 * Update giro principal select options
 */
function updateGiroPrincipalSelect() {
    const select = document.getElementById('cfgGiroPrincipal');
    if (!select || typeof GirosCatalogo === 'undefined') return;

    const selectedGiros = [];
    document.querySelectorAll('input[data-giro-id]:checked').forEach(cb => {
        selectedGiros.push(cb.getAttribute('data-giro-id'));
    });

    if (selectedGiros.length === 0) {
        select.innerHTML = '<option value="">-- Selecciona giros primero --</option>';
        return;
    }

    select.innerHTML = selectedGiros.map(giroId => {
        const giro = GirosCatalogo.getById(giroId);
        return `<option value="${giroId}">${giro?.nombre || giroId}</option>`;
    }).join('');

    // Keep current selection if still valid
    if (appConfig.giroPrincipal && selectedGiros.includes(appConfig.giroPrincipal)) {
        select.value = appConfig.giroPrincipal;
    }
}

/**
 * Update umbrales display based on selected giro
 */
function updateUmbralesGiro() {
    const giroId = document.getElementById('cfgGiroPrincipal')?.value;
    if (!giroId || typeof GirosCatalogo === 'undefined') return;

    const giro = GirosCatalogo.getById(giroId);
    if (!giro) return;

    const uma = parseFloat(document.getElementById('cfgUMA')?.value) || 113.14;

    // Update display
    document.getElementById('umbralIdUMA').textContent = giro.umbralIdentificacion;
    document.getElementById('umbralIdMXN').textContent = (giro.umbralIdentificacion * uma).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    document.getElementById('umbralAvisoUMA').textContent = giro.umbralAviso;
    document.getElementById('umbralAvisoMXN').textContent = (giro.umbralAviso * uma).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

    // Update appConfig thresholds (if no override)
    if (!document.getElementById('cfgAvisoOverride')?.value) {
        appConfig.aviso = giro.umbralAviso;
    }
    if (!document.getElementById('cfgMonitoreoOverride')?.value) {
        appConfig.monitoreo = giro.umbralIdentificacion;
    }
}

/**
 * Update UMA value based on year selection
 */
function updateUMAValue() {
    const year = parseInt(document.getElementById('cfgYear').value);
    const umaValue = typeof Utils !== 'undefined' ? Utils.getUMAValue(year) : 113.14;
    document.getElementById('cfgUMA').value = umaValue;
    appConfig.uma = umaValue;

    // Re-render umbrales with new UMA
    updateUmbralesGiro();
    renderGirosCheckboxes();
}

/**
 * Load available periods
 */
async function loadPeriods() {
    const selector = document.getElementById('periodoSelector');
    if (!selector) return;

    selector.innerHTML = '<option value="">Selecciona Periodo...</option>';

    const year = appConfig.year || 2025;
    for (let i = 1; i <= 12; i++) {
        const pid = year * 100 + i;
        selector.innerHTML += `<option value="${pid}">${i}/${year}</option>`;
    }
}

/**
 * Load operations for selected period
 */
async function loadOperations() {
    const pid = parseInt(document.getElementById('periodoSelector').value);
    if (!pid) return;

    showLoading('Cargando operaciones...');

    try {
        let ops = await dbService.getByIndex('operations', 'periodoId', pid);

        // Filter by company for non-super-admins
        const user = AuthService.getCurrentUser();
        if (user && user.role !== 'super_admin' && user.empresaId) {
            ops = ops.filter(o => o.empresaId === user.empresaId);
        }

        currentData.depositos = ops.filter(o => o.tipo === 'deposito');
        currentData.retiros = ops.filter(o => o.tipo === 'retiro');

        // Update stats
        document.getElementById('statDeposits').textContent = currentData.depositos.length;
        document.getElementById('statWithdrawals').textContent = currentData.retiros.length;

        const alerts = ops.filter(o => o.umaEq >= appConfig.aviso).length;
        const monitoring = ops.filter(o => o.umaEq >= appConfig.monitoreo && o.umaEq < appConfig.aviso).length;

        document.getElementById('statAlerts').textContent = alerts;
        document.getElementById('statMonitoring').textContent = monitoring;

        // Reset filters
        activeCardFilter = 'all';
        applyFilters();

        // Update chart
        updateDashboardChart();

    } catch (error) {
        showToast('Error cargando operaciones: ' + error.message, 'danger');
    } finally {
        hideLoading();
    }
}

/**
 * Filter operations by type
 */
function filterOperations(filterType) {
    activeCardFilter = filterType;

    if (filterType === 'all') {
        document.getElementById('searchOps').value = '';
        document.getElementById('filterStatus').value = '';
    }

    applyFilters();

    // Update card styles
    document.querySelectorAll('.stat-card').forEach(card => {
        card.classList.remove('active');
    });

    if (filterType !== 'all') {
        const cardClass = {
            deposito: 'deposits',
            retiro: 'withdrawals',
            aviso: 'alerts',
            monitoreo: 'monitoring'
        };
        const activeCard = document.querySelector(`.stat-card--${cardClass[filterType]}`);
        if (activeCard) activeCard.classList.add('active');
    }
}

/**
 * Apply all filters to operations
 */
function applyFilters() {
    const searchText = (document.getElementById('searchOps')?.value || '').toLowerCase().trim();
    const statusVal = document.getElementById('filterStatus')?.value || '';

    const filterFn = (list) => {
        return list.filter(r => {
            if (!r) return false;

            // Calculate status
            const val = r.umaEq || 0;
            let status = 'normal';
            if (val >= appConfig.aviso) status = 'aviso';
            else if (val >= appConfig.monitoreo) status = 'monitoreo';

            // Search filter
            if (searchText) {
                const txt = ((r.username || '') + (r.playercode || '') + (r.rfc || '')).toLowerCase();
                if (!txt.includes(searchText)) return false;
            }

            // Status filter
            if (statusVal && status !== statusVal) return false;

            // Card filters
            if (activeCardFilter === 'deposito' && r.tipo !== 'deposito') return false;
            if (activeCardFilter === 'retiro' && r.tipo !== 'retiro') return false;
            if (activeCardFilter === 'aviso' && val < appConfig.aviso) return false;
            if (activeCardFilter === 'monitoreo' && (val < appConfig.monitoreo || val >= appConfig.aviso)) return false;

            return true;
        });
    };

    let visibleDeps = filterFn(currentData.depositos);
    let visibleRets = filterFn(currentData.retiros);

    // Render tables
    renderOperationsTable('tableDeposits', visibleDeps);
    renderOperationsTable('tableWithdrawals', visibleRets);

    // Store for export
    lastFilteredResults = { depositos: visibleDeps, retiros: visibleRets };
}

/**
 * Clear all filters
 */
function clearFilters() {
    document.getElementById('searchOps').value = '';
    document.getElementById('filterStatus').value = '';
    activeCardFilter = 'all';
    applyFilters();

    document.querySelectorAll('.stat-card').forEach(card => {
        card.classList.remove('active');
    });
}

/**
 * Render operations table
 */
function renderOperationsTable(tableId, data) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Sin datos</td></tr>';
        return;
    }

    tbody.innerHTML = data.slice(0, 100).map(op => {
        const status = op.umaEq >= appConfig.aviso ? 'danger' :
            op.umaEq >= appConfig.monitoreo ? 'warning' : 'success';
        const statusText = op.umaEq >= appConfig.aviso ? 'AVISO' :
            op.umaEq >= appConfig.monitoreo ? 'MONITOREO' : 'NORMAL';

        return `
            <tr>
                <td>${op.username || '--'}</td>
                <td>${op.firstname || ''} ${op.lastname || ''}</td>
                <td>${op.rfc || '--'}</td>
                <td>${Utils.formatCurrency(op.monto)}</td>
                <td>${op.umaEq?.toFixed(2) || '0'}</td>
                <td><span class="badge badge-${status}">${statusText}</span></td>
            </tr>
        `;
    }).join('');
}

/**
 * Update dashboard chart
 */
function updateDashboardChart() {
    const ctx = document.getElementById('dashboardChart');
    if (!ctx) return;

    if (dashboardChart) {
        dashboardChart.destroy();
    }

    const data = {
        labels: ['Depósitos', 'Retiros', 'Avisos', 'Monitoreo'],
        datasets: [{
            data: [
                currentData.depositos.length,
                currentData.retiros.length,
                [...currentData.depositos, ...currentData.retiros].filter(o => o.umaEq >= appConfig.aviso).length,
                [...currentData.depositos, ...currentData.retiros].filter(o => o.umaEq >= appConfig.monitoreo && o.umaEq < appConfig.aviso).length
            ],
            backgroundColor: [
                'rgba(16, 185, 129, 0.8)',
                'rgba(59, 130, 246, 0.8)',
                'rgba(239, 68, 68, 0.8)',
                'rgba(245, 158, 11, 0.8)'
            ],
            borderColor: [
                'rgb(16, 185, 129)',
                'rgb(59, 130, 246)',
                'rgb(239, 68, 68)',
                'rgb(245, 158, 11)'
            ],
            borderWidth: 2
        }]
    };

    dashboardChart = new Chart(ctx, {
        type: 'bar',
        data: data,
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: 'rgba(255,255,255,0.7)' }
                },
                x: {
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: 'rgba(255,255,255,0.7)' }
                }
            }
        }
    });
}

/**
 * Process uploaded Excel file
 */
async function processFile() {
    const fileInput = document.getElementById('fileExcel');
    if (!fileInput.files.length) {
        showToast('Selecciona un archivo primero', 'warning');
        return;
    }

    showLoading('Procesando archivo...');

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });

            let newOps = [];
            let newClients = new Map();

            // Parse Deposits
            if (workbook.SheetNames.includes('Deposits')) {
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets['Deposits'], { range: 5, blankrows: false, defval: '' });
                newOps.push(...parseOperations(rows, 'deposito'));
            }

            // Parse Withdrawals
            if (workbook.SheetNames.includes('Withdrawals')) {
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets['Withdrawals'], { range: 2, blankrows: false, defval: '' });
                newOps.push(...parseOperations(rows, 'retiro'));
            }

            if (newOps.length === 0) {
                throw new Error('No se encontraron operaciones en el archivo');
            }

            // Extract KYC data
            newOps.forEach(op => {
                if (!newClients.has(op.playercode)) {
                    newClients.set(op.playercode, extractKYC(op));
                }
            });

            // Verify SaaS Quotas
            if (typeof FeatureService !== 'undefined' && typeof BillingService !== 'undefined') {
                const currentOpsCount = await dbService.count('operations');
                const totalOps = currentOpsCount + newOps.length;

                if (!FeatureService.checkQuota('maxOperations', totalOps)) {
                    const plan = BillingService.getCurrentPlan();
                    throw new Error(`🛑 Límite de plan excedido. Tu plan ${plan.name} permite ${plan.maxOperations} operaciones. (Intentas subir ${newOps.length}, Total sería ${totalOps})`);
                }
            }

            // Save to DB
            await dbService.addItems('operations', newOps);
            await dbService.addItems('kyc', Array.from(newClients.values()));

            await AuthService.logAudit('CARGA_MASIVA', `Procesados ${newOps.length} registros desde Excel`);

            showToast(`Guardado: ${newOps.length} operaciones`, 'success');

            // Refresh UI
            await loadPeriods();
            await loadKYC();

            // Auto-select period
            if (newOps.length > 0) {
                const pid = newOps[0].periodoId;
                document.getElementById('periodoSelector').value = pid;
                loadOperations();
                switchTab('operations');
            }

        } catch (error) {
            showToast('Error: ' + error.message, 'danger');
        } finally {
            hideLoading();
            fileInput.value = '';
            document.getElementById('fileInfo').classList.add('hidden');
        }
    };

    reader.readAsArrayBuffer(file);
}

/**
 * Parse operations from Excel rows
 */
function parseOperations(rows, tipo) {
    return rows.map(r => {
        const monto = parseFloat(tipo === 'deposito' ? (r['Monthly Depostis'] || r.H) : (r['Monthly Withdrawals'] || r.H)) || 0;
        if (monto <= 0) return null;

        const year = parseInt(r['Period Year'] || r.E || appConfig.year);
        const month = parseInt(r['Period Month'] || r.F || 1);

        const username = String(r.USERNAME || r.C || '');
        const playercode = String(r['playercode'] || r.B || '');
        const nombre = String(r.FIRSTNAME || (tipo === 'deposito' ? r.K : r.J) || '').toUpperCase().trim();
        const apellido = String(r.LASTNAME || (tipo === 'deposito' ? r.L : r.K) || '').toUpperCase().trim();

        // Parse DOB
        let dobRaw = (r.DOB || (tipo === 'deposito' ? r.O : r.N));
        let dob;
        if (typeof dobRaw === 'number') {
            dob = new Date(Math.round((dobRaw - 25569) * 86400 * 1000));
        } else {
            dob = new Date(dobRaw);
        }
        if (isNaN(dob.getTime())) dob = new Date();

        // RFC
        let rfc = String(r.RFC || (tipo === 'deposito' ? r.Z : r.Y) || '').toUpperCase().trim();
        if (!rfc || rfc.length < 10 || rfc.startsWith('XAXX')) {
            const parts = apellido.split(' ');
            const paterno = parts[0] || 'X';
            const materno = parts.slice(1).join(' ') || '';
            rfc = Utils.calcularRFC(nombre, paterno, materno, dob);
        }

        return {
            playercode,
            username,
            firstname: nombre,
            lastname: apellido,
            email: String(r.EMAIL || (tipo === 'deposito' ? r.S : r.R)).toLowerCase(),
            phone: String(r.PHONE || (tipo === 'deposito' ? r.T : r.S)),
            rfc,
            curp: String(r.CURP || (tipo === 'deposito' ? r.AA : r.Z)),
            address: String(r.ADDRESS || (tipo === 'deposito' ? r.P : r.O)),
            zip: String(r.ZIP || (tipo === 'deposito' ? r.Q : r.P)),
            dob: dob.toISOString(),
            tipo,
            monto,
            umaEq: monto / appConfig.uma,
            periodoId: year * 100 + month,
            year,
            month,
            fechaProceso: new Date().toISOString(),
            estadoDir: Utils.getStateFromCP(String(r.ZIP || (tipo === 'deposito' ? r.Q : r.P))),
            ocupacion: String(r.OCCUPATION || r.ACTIVIDAD || r.JOB || '').toUpperCase().trim()
        };
    }).filter(Boolean);
}

/**
 * Extract KYC data from operation
 */
function extractKYC(op) {
    return {
        playercode: op.playercode,
        username: op.username,
        nombre: op.firstname,
        apellido: op.lastname,
        email: op.email,
        phone: op.phone,
        rfc: op.rfc,
        curp: op.curp,
        direccion: op.address,
        cp: op.zip,
        dob: op.dob,
        ocupacion: op.ocupacion,
        estado: op.estadoDir,
        updated: new Date().toISOString()
    };
}

/**
 * Load KYC data and render demographics
 */
async function loadKYC() {
    const user = AuthService.getCurrentUser();
    let clients = [];

    if (user.role === 'super_admin') {
        clients = await dbService.getAll('kyc');
    } else if (user.empresaId) {
        clients = await dbService.getByIndex('kyc', 'empresaId', user.empresaId);
    } else {
        // Fallback for legacy users without empresaId (or show empty)
        // For migration: maybe show all if db has no companies?
        // Safe default: Show empty to force migration
        console.warn('Usuario sin empresaId asignado');
        clients = [];
    }

    // Update count
    if (document.getElementById('kycCount')) {
        document.getElementById('kycCount').textContent = `${clients.length} clientes`;
    }

    if (clients.length === 0) {
        renderKYCTable([]);
        return;
    }

    // Calculate demographics
    const stateMap = {};
    const sexMap = { 'H': 0, 'M': 0, '?': 0 };
    const ageMap = { '18-25': 0, '26-35': 0, '36-45': 0, '46-60': 0, '60+': 0, 'N/A': 0 };
    const riskMap = { 'Alto': 0, 'Medio': 0, 'Bajo': 0 };
    const highRiskStates = {};
    const medRiskStates = {};
    const lowRiskStates = {};

    clients.forEach(c => {
        // State
        const state = c.estado || Utils.getStateFromCP(c.cp) || 'Desconocido';
        stateMap[state] = (stateMap[state] || 0) + 1;

        // Sex - infer from CURP if not available
        let s = '?';
        if (c.sexoRaw) {
            if (c.sexoRaw === 'M' || c.sexoRaw === 'MALE') s = 'H';
            else if (c.sexoRaw === 'F' || c.sexoRaw === 'FEMALE') s = 'M';
        } else if (c.curp && c.curp.length >= 11) {
            s = c.curp.charAt(10).toUpperCase();
            if (s !== 'H' && s !== 'M') s = '?';
        }
        sexMap[s]++;

        // Age
        let age = null;
        if (c.dob) {
            const d = new Date(c.dob);
            if (!isNaN(d.getTime())) {
                age = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
            }
        }

        let ageGroup = 'N/A';
        if (typeof age === 'number' && age > 0) {
            if (age >= 18 && age <= 25) ageGroup = '18-25';
            else if (age >= 26 && age <= 35) ageGroup = '26-35';
            else if (age >= 36 && age <= 45) ageGroup = '36-45';
            else if (age >= 46 && age <= 60) ageGroup = '46-60';
            else if (age > 60) ageGroup = '60+';
        }
        ageMap[ageGroup]++;

        // Risk level
        const riskLevel = Utils.getRiskState(state);
        riskMap[riskLevel]++;

        if (riskLevel === 'Alto') highRiskStates[state] = (highRiskStates[state] || 0) + 1;
        else if (riskLevel === 'Medio') medRiskStates[state] = (medRiskStates[state] || 0) + 1;
        else lowRiskStates[state] = (lowRiskStates[state] || 0) + 1;
    });

    // Render Demographics Charts
    renderDemographicsCharts(stateMap, sexMap, ageMap, riskMap, highRiskStates, medRiskStates, lowRiskStates, clients);

    // Render table
    renderKYCTable(clients);
}

/**
 * Render all demographics charts
 */
function renderDemographicsCharts(stateMap, sexMap, ageMap, riskMap, highRiskStates, medRiskStates, lowRiskStates, clients) {
    // Chart defaults for dark theme
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: 'rgba(255,255,255,0.7)' } } },
        scales: {
            x: { ticks: { color: 'rgba(255,255,255,0.7)' }, grid: { color: 'rgba(255,255,255,0.1)' } },
            y: { ticks: { color: 'rgba(255,255,255,0.7)' }, grid: { color: 'rgba(255,255,255,0.1)' } }
        }
    };

    // 1. State Chart (Horizontal Bar - Top 10)
    const ctxState = document.getElementById('chartStates');
    if (ctxState) {
        if (window.chartStateInst) window.chartStateInst.destroy();
        const sortedStates = Object.entries(stateMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
        window.chartStateInst = new Chart(ctxState, {
            type: 'bar',
            data: {
                labels: sortedStates.map(x => x[0]),
                datasets: [{ label: 'Usuarios', data: sortedStates.map(x => x[1]), backgroundColor: '#00AEEF', borderRadius: 4 }]
            },
            options: { ...chartOptions, indexAxis: 'y', plugins: { legend: { display: false } } }
        });
    }

    // 2. Sex Chart (Doughnut)
    const ctxSex = document.getElementById('chartSex');
    if (ctxSex) {
        if (window.chartSexInst) window.chartSexInst.destroy();
        window.chartSexInst = new Chart(ctxSex, {
            type: 'doughnut',
            data: {
                labels: ['Hombres', 'Mujeres', 'Desc'],
                datasets: [{ data: [sexMap['H'], sexMap['M'], sexMap['?']], backgroundColor: ['#3b82f6', '#ec4899', '#64748b'] }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.7)' } } } }
        });
    }

    // 3. Age Chart (Bar)
    const ctxAge = document.getElementById('chartAges');
    if (ctxAge) {
        if (window.chartAgeInst) window.chartAgeInst.destroy();
        window.chartAgeInst = new Chart(ctxAge, {
            type: 'bar',
            data: {
                labels: Object.keys(ageMap),
                datasets: [{ label: 'Usuarios', data: Object.values(ageMap), backgroundColor: '#10b981', borderRadius: 4 }]
            },
            options: { ...chartOptions, plugins: { legend: { display: false } } }
        });
    }

    // 4. Risk Global (Doughnut)
    const ctxRiskGlobal = document.getElementById('chartRiskGlobal');
    if (ctxRiskGlobal) {
        if (window.chartRiskGlobalInst) window.chartRiskGlobalInst.destroy();
        window.chartRiskGlobalInst = new Chart(ctxRiskGlobal, {
            type: 'doughnut',
            data: {
                labels: ['Alto', 'Medio', 'Bajo'],
                datasets: [{ data: [riskMap['Alto'], riskMap['Medio'], riskMap['Bajo']], backgroundColor: ['#ef4444', '#f59e0b', '#10b981'] }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.7)' } } } }
        });
    }

    // 5. High Risk States (Bar)
    const ctxRiskHigh = document.getElementById('chartRiskHigh');
    if (ctxRiskHigh) {
        if (window.chartRiskHighInst) window.chartRiskHighInst.destroy();
        const sortedHigh = Object.entries(highRiskStates).sort((a, b) => b[1] - a[1]).slice(0, 5);
        window.chartRiskHighInst = new Chart(ctxRiskHigh, {
            type: 'bar',
            data: {
                labels: sortedHigh.map(x => x[0]),
                datasets: [{ label: 'Usuarios', data: sortedHigh.map(x => x[1]), backgroundColor: '#ef4444', borderRadius: 4 }]
            },
            options: { ...chartOptions, indexAxis: 'y', plugins: { legend: { display: false } } }
        });
    }

    // 6. Medium Risk States (Bar)
    const ctxRiskMed = document.getElementById('chartRiskMed');
    if (ctxRiskMed) {
        if (window.chartRiskMedInst) window.chartRiskMedInst.destroy();
        const sortedMed = Object.entries(medRiskStates).sort((a, b) => b[1] - a[1]).slice(0, 5);
        window.chartRiskMedInst = new Chart(ctxRiskMed, {
            type: 'bar',
            data: {
                labels: sortedMed.map(x => x[0]),
                datasets: [{ label: 'Usuarios', data: sortedMed.map(x => x[1]), backgroundColor: '#f59e0b', borderRadius: 4 }]
            },
            options: { ...chartOptions, indexAxis: 'y', plugins: { legend: { display: false } } }
        });
    }

    // 7. Low Risk States (Bar)
    const ctxRiskLow = document.getElementById('chartRiskLow');
    if (ctxRiskLow) {
        if (window.chartRiskLowInst) window.chartRiskLowInst.destroy();
        const sortedLow = Object.entries(lowRiskStates).sort((a, b) => b[1] - a[1]).slice(0, 5);
        window.chartRiskLowInst = new Chart(ctxRiskLow, {
            type: 'bar',
            data: {
                labels: sortedLow.map(x => x[0]),
                datasets: [{ label: 'Usuarios', data: sortedLow.map(x => x[1]), backgroundColor: '#10b981', borderRadius: 4 }]
            },
            options: { ...chartOptions, indexAxis: 'y', plugins: { legend: { display: false } } }
        });
    }

    // 8. GeoChart Map
    renderGeoChart(clients);
}

/**
 * Render Google GeoChart for Mexico
 */
function renderGeoChart(clients) {
    if (typeof google === 'undefined' || !google.charts) {
        console.log('Google Charts not loaded');
        return;
    }

    google.charts.load('current', { 'packages': ['geochart'] });
    google.charts.setOnLoadCallback(() => {
        const mapDiv = document.getElementById('regions_div');
        if (!mapDiv) return;

        const mapDataArray = [['Estado', 'Usuarios', { role: 'tooltip', p: { html: true } }]];
        const isoMap = {};

        clients.forEach(c => {
            const state = c.estado || Utils.getStateFromCP(c.cp);
            if (!state) return;
            const iso = Utils.getStateISO(state);
            if (iso) {
                if (!isoMap[iso]) isoMap[iso] = { count: 0, name: state, risk: Utils.getRiskState(state) };
                isoMap[iso].count++;
            }
        });

        Object.keys(isoMap).forEach(iso => {
            const item = isoMap[iso];
            const pct = ((item.count / clients.length) * 100).toFixed(1);
            const tt = `<div style="padding:10px; min-width:150px;"><strong>${item.name}</strong><br>Usuarios: <b>${item.count}</b> (${pct}%)<br>Riesgo: <b>${item.risk}</b></div>`;
            mapDataArray.push([{ v: iso, f: item.name }, item.count, tt]);
        });

        const data = google.visualization.arrayToDataTable(mapDataArray);
        const options = {
            region: 'MX',
            resolution: 'provinces',
            colorAxis: { colors: ['#10b981', '#f59e0b', '#ef4444'] },
            backgroundColor: '#111d32',
            datalessRegionColor: '#1e293b',
            defaultColor: '#1e293b',
            tooltip: { isHtml: true }
        };

        const chart = new google.visualization.GeoChart(mapDiv);
        chart.draw(data, options);
    });
}

/**
 * Render KYC table
 */
function renderKYCTable(clients) {
    const tbody = document.querySelector('#tableKYC tbody');
    if (!tbody) return;

    if (clients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Sin clientes</td></tr>';
        return;
    }

    tbody.innerHTML = clients.slice(0, 100).map(c => {
        const state = c.estado || Utils.getStateFromCP(c.cp) || 'Desconocido';

        // Dynamic Risk Calculation
        const riskData = ComplianceService.calcularRiesgo(c);
        const ratio = riskData.score;
        let color = '#10b981'; // Green
        if (ratio >= 70) color = '#ef4444'; // Red
        else if (ratio >= 40) color = '#f59e0b'; // Amber

        // Calculate age
        let age = '--';
        if (c.dob) {
            const d = new Date(c.dob);
            if (!isNaN(d.getTime())) {
                age = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
            }
        }

        // Get sex from CURP
        let sex = '?';
        if (c.curp && c.curp.length >= 11) {
            sex = c.curp.charAt(10).toUpperCase();
            if (sex !== 'H' && sex !== 'M') sex = '?';
        }

        return `
            <tr>
                <td>${c.playercode || '--'}</td>
                <td>
                    <div style="font-weight: 600;">${c.nombre || ''} ${c.apellido || ''}</div>
                    <small class="text-muted" style="font-size: 0.75rem;">${c.email || ''}</small>
                </td>
                <td>${state}</td>
                <td>${age} / ${sex}</td>
                <td>${c.rfc || '--'}<br><small style="color: var(--text-muted);">${c.curp || '--'}</small></td>
                <td style="width: 150px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                        <span style="font-size: 0.75em; font-weight: 700; color: ${color};">${riskData.nivel}</span>
                        <span style="font-size: 0.7rem; opacity: 0.7;">${ratio}/100</span>
                    </div>
                    <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
                        <div style="width: ${ratio}%; height: 100%; background: ${color}; border-radius: 4px; transition: width 0.5s ease;"></div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Filter KYC table
 */
function filterKYC() {
    const search = (document.getElementById('searchKYC')?.value || '').toLowerCase();

    dbService.getAll('kyc').then(clients => {
        const filtered = clients.filter(c => {
            if (!search) return true;
            const txt = `${c.nombre} ${c.apellido} ${c.rfc} ${c.email} ${c.playercode} ${c.estado}`.toLowerCase();
            return txt.includes(search);
        });
        renderKYCTable(filtered);
    });
}

/**
 * Clear all KYC data
 */
async function clearKYC() {
    if (!confirm('⚠️ ¿Estás seguro de borrar todo el padrón KYC? Esta acción no se puede deshacer.')) {
        return;
    }

    await dbService.clearStore('kyc');
    await AuthService.logAudit('BORRAR_KYC', 'Padrón KYC eliminado completamente');
    showToast('Padrón KYC borrado', 'success');
    await loadKYC();
}

/**
 * Calculate 6-month monitoring
 */
async function calculateMonitoring() {
    const periodoSel = document.getElementById('periodoSelector')?.value;

    let endDate = new Date();
    if (periodoSel) {
        const y = Math.floor(periodoSel / 100);
        const m = periodoSel % 100;
        endDate = new Date(y, m, 0);
    }

    const startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - 5);
    startDate.setDate(1);

    const endId = endDate.getFullYear() * 100 + (endDate.getMonth() + 1);
    const startId = startDate.getFullYear() * 100 + (startDate.getMonth() + 1);

    showLoading('Calculando monitoreo...');

    try {
        const ops = await dbService.getByPeriodRange(startId, endId);

        // Aggregate by user
        const alerts = new Map();
        ops.forEach(op => {
            if (!alerts.has(op.playercode)) {
                alerts.set(op.playercode, {
                    playercode: op.playercode,
                    username: op.username,
                    firstname: op.firstname,
                    lastname: op.lastname,
                    totalDep: 0,
                    totalRet: 0,
                    opsCount: 0
                });
            }

            const client = alerts.get(op.playercode);
            if (op.tipo === 'deposito') client.totalDep += op.umaEq;
            if (op.tipo === 'retiro') client.totalRet += op.umaEq;
            client.opsCount++;
        });

        // Filter and sort
        const results = Array.from(alerts.values())
            .filter(c => Math.max(c.totalDep, c.totalRet) >= appConfig.monitoreo * 0.5)
            .sort((a, b) => Math.max(b.totalDep, b.totalRet) - Math.max(a.totalDep, a.totalRet));

        renderMonitoringTable(results);

    } catch (error) {
        showToast('Error: ' + error.message, 'danger');
    } finally {
        hideLoading();
    }
}

/**
 * Render monitoring table
 */
function renderMonitoringTable(results) {
    const tbody = document.querySelector('#tableMonitoring tbody');
    if (!tbody) return;

    if (results.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Sin alertas de monitoreo</td></tr>';
        return;
    }

    tbody.innerHTML = results.map(r => {
        const maxUma = Math.max(r.totalDep, r.totalRet);
        const progress = Math.min((maxUma / appConfig.aviso) * 100, 100);
        const status = maxUma >= appConfig.aviso ? 'danger' : maxUma >= appConfig.monitoreo ? 'warning' : 'success';
        const statusText = maxUma >= appConfig.aviso ? 'AVISO' : maxUma >= appConfig.monitoreo ? 'MONITOREO' : 'NORMAL';

        return `
            <tr>
                <td>${r.username || '--'}</td>
                <td>${r.firstname || ''} ${r.lastname || ''}</td>
                <td>${r.totalDep.toFixed(2)}</td>
                <td>${r.totalRet.toFixed(2)}</td>
                <td>
                    <div class="progress" style="width: 120px;">
                        <div class="progress-bar" style="width: ${progress}%; background: var(--${status})"></div>
                    </div>
                    <small>${progress.toFixed(0)}%</small>
                </td>
                <td><span class="badge badge-${status}">${statusText}</span></td>
            </tr>
        `;
    }).join('');
}

/**
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Sin reportes</td></tr>';
        return;
    }

    tbody.innerHTML = reports.map(r => `
        <tr>
            <td>${Utils.formatDateTime(r.fecha)}</td>
            <td>${r.tipo}</td>
            <td>${r.archivo}</td>
            <td>-</td>
        </tr>
    `).join('');
}

/**
 * Load audit logs
 */
async function loadAudit() {
    const logs = await dbService.getAll('audit_logs');
    logs.sort((a, b) => b.id - a.id);

    const tbody = document.querySelector('#tableAudit tbody');
    if (!tbody) return;

    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Sin registros</td></tr>';
        return;
    }

    tbody.innerHTML = logs.slice(0, 100).map(log => `
        <tr>
            <td>${Utils.formatDateTime(log.fecha)}</td>
            <td>${log.user}</td>
            <td><span class="badge badge-info">${log.action}</span></td>
            <td>${log.details}</td>
        </tr>
    `).join('');
}

/**
 * Update global stats
 */
async function updateStats() {
    const ops = await dbService.getAll('operations');
    const clients = await dbService.getAll('kyc');

    // For visitor dashboard
    if (document.getElementById('dashTotalOps')) {
        document.getElementById('dashTotalOps').textContent = ops.length;
    }
    if (document.getElementById('dashTotalClients')) {
        document.getElementById('dashTotalClients').textContent = clients.length;
    }
    if (document.getElementById('dashAlertRate')) {
        const alerts = ops.filter(o => o.umaEq >= appConfig.aviso).length;
        const rate = ops.length > 0 ? ((alerts / ops.length) * 100).toFixed(1) : 0;
        document.getElementById('dashAlertRate').textContent = rate + '%';
    }
}

/**
 * Generate XML for UIF
 */
async function generateXML() {
    if (!currentData.depositos.length && !currentData.retiros.length) {
        showToast('Carga operaciones primero', 'warning');
        return;
    }

    const periodo = document.getElementById('periodoSelector').value;
    if (!periodo) {
        showToast('Selecciona un periodo', 'warning');
        return;
    }

    const avsDeps = currentData.depositos.filter(o => o.umaEq >= appConfig.aviso);
    const avsRets = currentData.retiros.filter(o => o.umaEq >= appConfig.aviso);

    if (avsDeps.length) downloadXML(avsDeps, 'DEPOSITOS', periodo);
    if (avsRets.length) downloadXML(avsRets, 'RETIROS', periodo);

    if (!avsDeps.length && !avsRets.length) {
        showToast(`Ninguna operación supera el umbral de aviso (${appConfig.aviso} UMA)`, 'info');
    }
}

/**
 * Download XML file
 */
async function downloadXML(ops, tipo, periodo) {
    // Group by client
    const opsByClient = new Map();
    ops.forEach(op => {
        if (!opsByClient.has(op.playercode)) opsByClient.set(op.playercode, []);
        opsByClient.get(op.playercode).push(op);
    });

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<archivo xmlns="http://www.uif.shcp.gob.mx/recepcion/jys" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.uif.shcp.gob.mx/recepcion/jys jys.xsd">\n';
    xml += '  <informe>\n';
    xml += `    <mes_reportado>${periodo}</mes_reportado>\n`;
    xml += '    <sujeto_obligado>\n';
    xml += `      <clave_sujeto_obligado>${appConfig.rfc}</clave_sujeto_obligado>\n`;
    xml += '      <clave_actividad>JYS</clave_actividad>\n';
    xml += '    </sujeto_obligado>\n';
    xml += '    <aviso>\n';
    xml += `      <referencia_aviso>${periodo}_${tipo}</referencia_aviso>\n`;
    xml += '      <prioridad>1</prioridad>\n';
    xml += '      <alerta>\n';
    xml += '        <tipo_alerta>100</tipo_alerta>\n';
    xml += '      </alerta>\n';

    for (const [playercode, clientOps] of opsByClient) {
        const profile = clientOps[0];
        const apellidos = profile.lastname.split(' ');

        xml += '      <persona_aviso>\n';
        xml += '        <tipo_persona>\n';
        xml += '          <persona_fisica>\n';
        xml += `            <nombre>${Utils.escapeXML(profile.firstname)}</nombre>\n`;
        xml += `            <apellido_paterno>${Utils.escapeXML(apellidos[0])}</apellido_paterno>\n`;
        xml += `            <apellido_materno>${Utils.escapeXML(apellidos.slice(1).join(' ') || 'X')}</apellido_materno>\n`;
        xml += `            <fecha_nacimiento>${Utils.formatDateXML(profile.dob)}</fecha_nacimiento>\n`;
        xml += '            <pais_nacionalidad>MX</pais_nacionalidad>\n';
        xml += '            <actividad_economica>8230300</actividad_economica>\n';
        xml += '          </persona_fisica>\n';
        xml += '        </tipo_persona>\n';

        if (profile.address) {
            xml += '        <tipo_domicilio>\n';
            xml += '          <nacional>\n';
            xml += `            <calle>${Utils.escapeXML(profile.address)}</calle>\n`;
            xml += `            <codigo_postal>${profile.zip || '00000'}</codigo_postal>\n`;
            xml += '          </nacional>\n';
            xml += '        </tipo_domicilio>\n';
        }

        xml += '        <telefono>\n';
        xml += '          <clave_pais>MX</clave_pais>\n';
        xml += `          <numero_telefono>${profile.phone || '0000000000'}</numero_telefono>\n`;
        xml += `          <correo_electronico>${Utils.escapeXML(profile.email)}</correo_electronico>\n`;
        xml += '        </telefono>\n';

        xml += '        <detalle_operaciones>\n';
        xml += '          <datos_operacion>\n';

        clientOps.forEach(op => {
            const lastDay = new Date(op.year, op.month, 0).getDate();
            const fechaPago = `${op.year}${String(op.month).padStart(2, '0')}${String(lastDay).padStart(2, '0')}`;

            xml += '            <datos_liquidacion>\n';
            xml += '              <liquidacion_numerario>\n';
            xml += `                <fecha_pago>${fechaPago}</fecha_pago>\n`;
            xml += '                <instrumento_monetario>8</instrumento_monetario>\n';
            xml += '                <moneda>1</moneda>\n';
            xml += `                <monto_operacion>${op.monto.toFixed(2)}</monto_operacion>\n`;
            xml += '              </liquidacion_numerario>\n';
            xml += '            </datos_liquidacion>\n';
        });

        xml += '          </datos_operacion>\n';
        xml += '        </detalle_operaciones>\n';
        xml += '      </persona_aviso>\n';
    }

    xml += '    </aviso>\n';
    xml += '  </informe>\n';
    xml += '</archivo>';

    // Download
    const blob = new Blob([xml], { type: 'text/xml' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Aviso_${tipo}_${periodo}.xml`;
    a.click();

    // Save record
    await dbService.addItems('reports', [{
        id: Date.now(),
        tipo,
        archivo: a.download,
        fecha: new Date().toISOString()
    }]);

    await AuthService.logAudit('GENERAR_XML', `Generado reporte XML: ${a.download}`);
    await loadReports();

    showToast(`XML generado: ${a.download}`, 'success');
}

/**
 * Export to Excel
 */
async function exportToExcel() {
    const data = lastFilteredResults;
    if (!data.depositos.length && !data.retiros.length) {
        showToast('No hay datos para exportar', 'warning');
        return;
    }

    const formatData = (list) => list.map(item => ({
        Usuario: item.username,
        Nombre: `${item.firstname} ${item.lastname}`,
        RFC: item.rfc,
        Monto: item.monto,
        'Veces Umbral': (item.umaEq / appConfig.monitoreo).toFixed(2) + 'x',
        UMA: item.umaEq.toFixed(2),
        Fecha: Utils.formatDate(item.fechaProceso),
        Email: item.email,
        Telefono: item.phone,
        'Entidad Federativa': item.estadoDir || 'Desconocido',
        Estado: item.umaEq >= appConfig.aviso ? 'AVISO' : (item.umaEq >= appConfig.monitoreo ? 'MONITOREO' : 'NORMAL')
    }));

    const wb = XLSX.utils.book_new();

    if (data.depositos.length) {
        const ws = XLSX.utils.json_to_sheet(formatData(data.depositos));
        XLSX.utils.book_append_sheet(wb, ws, "Depositos_Filtrados");
    }
    if (data.retiros.length) {
        const ws = XLSX.utils.json_to_sheet(formatData(data.retiros));
        XLSX.utils.book_append_sheet(wb, ws, "Retiros_Filtrados");
    }

    XLSX.writeFile(wb, `Reporte_PLD_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('Excel exportado exitosamente', 'success');
}

/**
 * Export backup
 */
async function exportBackup() {
    showLoading('Generando respaldo...');

    try {
        const backup = {
            config: await dbService.getAll('config'),
            kyc: await dbService.getAll('kyc'),
            operations: await dbService.getAll('operations'),
            reports: await dbService.getAll('reports'),
            timestamp: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `PLD_Backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();

        await AuthService.logAudit('EXPORTAR_BACKUP', 'Respaldo de base de datos generado');
        showToast('Respaldo generado exitosamente', 'success');

    } catch (error) {
        showToast('Error: ' + error.message, 'danger');
    } finally {
        hideLoading();
    }
}

/**
 * Import backup
 */
async function importBackup(input) {
    const file = input.files[0];
    if (!file) return;

    if (!confirm('⚠️ ADVERTENCIA: Al restaurar se eliminarán los datos actuales. ¿Continuar?')) {
        input.value = '';
        return;
    }

    showLoading('Restaurando respaldo...');

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);

            await dbService.clearStore('config');
            await dbService.clearStore('kyc');
            await dbService.clearStore('operations');
            await dbService.clearStore('reports');

            if (data.config) await dbService.addItems('config', data.config);
            if (data.kyc) await dbService.addItems('kyc', data.kyc);
            if (data.operations) await dbService.addItems('operations', data.operations);
            if (data.reports) await dbService.addItems('reports', data.reports);

            await AuthService.logAudit('RESTAURAR_BACKUP', `Sistema restaurado desde: ${file.name}`);
            showToast('Restauración completa', 'success');

            setTimeout(() => location.reload(), 1500);

        } catch (error) {
            showToast('Error al restaurar: ' + error.message, 'danger');
        } finally {
            hideLoading();
        }
    };
    reader.readAsText(file);
}

/**
 * Handle logout
 */
async function handleLogout() {
    await AuthService.logout();
    window.location.href = 'index.html';
}

// ========== COMPLIANCE FUNCTIONS ==========

/**
 * Load and render compliance data
 */
async function loadCompliance() {
    try {
        // Render obligaciones
        renderObligaciones();

        // Get and display metrics
        if (typeof ComplianceService !== 'undefined') {
            const metricas = await ComplianceService.calcularMetricas();
            if (metricas) {
                document.getElementById('complianceScore').textContent = metricas.cumplimiento.score;
                document.getElementById('metricReportes').textContent = metricas.reportes.ultimos12Meses;
                document.getElementById('metricOps').textContent = metricas.operaciones.total;
                document.getElementById('metricAlertas').textContent = metricas.operaciones.conAlerta;
                document.getElementById('metricTasa').textContent = metricas.operaciones.tasaAlertas + '%';
            }
        }
    } catch (error) {
        console.error('Error loading compliance:', error);
    }
}

/**
 * Render obligaciones pendientes
 */
function renderObligaciones() {
    const container = document.getElementById('obligacionesContainer');
    if (!container || typeof ComplianceService === 'undefined') return;

    const obligaciones = ComplianceService.getObligacionesPendientes();

    if (obligaciones.length === 0) {
        container.innerHTML = '<div class="card"><p class="text-muted text-center">No hay obligaciones pendientes</p></div>';
        return;
    }

    container.innerHTML = obligaciones.map(ob => {
        const urgenciaColor = {
            'critica': 'danger',
            'vencida': 'danger',
            'alta': 'warning',
            'media': 'info',
            'baja': 'success'
        }[ob.urgencia] || 'info';

        const urgenciaIcon = {
            'critica': '🚨',
            'vencida': '⚠️',
            'alta': '⚡',
            'media': '📌',
            'baja': '✅'
        }[ob.urgencia] || '📋';

        return `
            <div class="card">
                <div class="flex" style="justify-content: space-between; align-items: start;">
                    <div>
                        <h4 style="margin-bottom: 8px;">${urgenciaIcon} ${ob.nombre}</h4>
                        <p class="text-muted" style="font-size: 0.9em;">${ob.descripcion}</p>
                        <p style="margin-top: 8px;"><strong>Acción:</strong> ${ob.accion}</p>
                    </div>
                    <div style="text-align: right;">
                        <span class="badge badge-${urgenciaColor}">${ob.diasRestantes} días</span>
                        <p class="text-muted" style="font-size: 0.8em; margin-top: 4px;">
                            ${ob.fechaLimite.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </p>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Refresh compliance data
 */
async function refreshCompliance() {
    showLoading('Actualizando cumplimiento...');
    await loadCompliance();
    hideLoading();
    showToast('Datos actualizados', 'success');
}

/**
 * Detect unusual patterns in operations
 */
async function detectarPatrones() {
    const container = document.getElementById('alertasContainer');
    if (!container) return;

    showLoading('Analizando patrones...');

    try {
        const operations = await dbService.getAll('operations');

        if (operations.length === 0) {
            container.innerHTML = '<div class="card text-center text-muted"><p>No hay operaciones para analizar</p></div>';
            hideLoading();
            return;
        }

        if (typeof ComplianceService === 'undefined') {
            container.innerHTML = '<div class="card text-center text-muted"><p>Servicio de cumplimiento no disponible</p></div>';
            hideLoading();
            return;
        }

        const alertas = await ComplianceService.detectarPatrones(operations);

        if (alertas.length === 0) {
            container.innerHTML = `
                <div class="card" style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.05)); border: 1px solid var(--color-success);">
                    <div class="text-center">
                        <div style="font-size: 3rem; margin-bottom: 8px;">✅</div>
                        <h4 style="color: var(--color-success);">No se detectaron patrones inusuales</h4>
                        <p class="text-muted">Se analizaron ${operations.length} operaciones</p>
                    </div>
                </div>
            `;
        } else {
            container.innerHTML = alertas.map(alerta => {
                const severidadBadge = {
                    'alta': 'danger',
                    'media': 'warning',
                    'baja': 'info'
                }[alerta.severidad] || 'warning';

                const tipoIcon = {
                    'FRACCIONAMIENTO': '💰',
                    'INCREMENTO_SUBITO': '📈',
                    'ROUND_TRIPPING': '🔄',
                    'UNDER_REPORTING': '⚠️'
                }[alerta.tipo] || '🔍';

                return `
                    <div class="card" style="border-left: 4px solid var(--color-${severidadBadge}); margin-bottom: 12px;">
                        <div class="flex" style="justify-content: space-between; align-items: start;">
                            <div>
                                <span class="badge badge-${severidadBadge}">${alerta.tipo}</span>
                                <h4 style="margin: 8px 0;">${tipoIcon} ${alerta.nombre}</h4>
                                <p style="margin-bottom: 8px;">${alerta.descripcion}</p>
                                <p class="text-muted" style="font-size: 0.9em;"><strong>Acción recomendada:</strong> ${alerta.accion}</p>
                            </div>
                            <div style="text-align: right;">
                                <code style="font-size: 0.8em;">${alerta.playercode}</code>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        await AuthService.logAudit('ANALISIS_PATRONES', `Analizado ${operations.length} operaciones, ${alertas.length} alertas detectadas`);

    } catch (error) {
        console.error('Error detectando patrones:', error);
        container.innerHTML = '<div class="card text-center text-muted"><p>Error al analizar: ' + error.message + '</p></div>';
    }

    hideLoading();
}

/**
 * Validate XML input (from file or text)
 */
let uploadedXMLContent = null; // Store uploaded XML content

function validateXMLInput() {
    const resultDiv = document.getElementById('xmlValidationResult');
    if (!resultDiv) return;

    // Get XML content from file upload OR text input
    const textInput = document.getElementById('xmlValidatorInput');
    const xmlString = uploadedXMLContent || (textInput?.value?.trim() || '');

    if (!xmlString) {
        resultDiv.innerHTML = '<div class="badge badge-warning">Carga un archivo XML o pega el contenido</div>';
        return;
    }

    if (typeof XMLGenerator === 'undefined') {
        resultDiv.innerHTML = '<div class="badge badge-danger">Servicio de validación no disponible</div>';
        return;
    }

    const result = XMLGenerator.validateXML(xmlString);

    if (result.isValid) {
        resultDiv.innerHTML = `
            <div style="padding: 16px; background: rgba(16, 185, 129, 0.1); border-radius: var(--radius-md); border: 1px solid var(--color-success);">
                <h4 style="color: var(--color-success); margin-bottom: 8px;">✅ ${result.summary}</h4>
                ${result.warnings.length > 0 ? `
                    <ul style="margin: 0; padding-left: 20px;">
                        ${result.warnings.map(w => `<li style="color: var(--color-warning);">⚠️ ${w}</li>`).join('')}
                    </ul>
                ` : '<p class="text-muted">No hay advertencias</p>'}
            </div>
        `;
    } else {
        resultDiv.innerHTML = `
            <div style="padding: 16px; background: rgba(239, 68, 68, 0.1); border-radius: var(--radius-md); border: 1px solid var(--color-danger);">
                <h4 style="color: var(--color-danger); margin-bottom: 8px;">❌ ${result.summary}</h4>
                <ul style="margin: 0; padding-left: 20px;">
                    ${result.errors.map(e => `<li style="color: var(--color-danger);">❌ ${e}</li>`).join('')}
                </ul>
                ${result.warnings.length > 0 ? `
                    <hr style="margin: 12px 0; border-color: var(--border-color);">
                    <p style="margin-bottom: 4px;"><strong>Advertencias:</strong></p>
                    <ul style="margin: 0; padding-left: 20px;">
                        ${result.warnings.map(w => `<li style="color: var(--color-warning);">⚠️ ${w}</li>`).join('')}
                    </ul>
                ` : ''}
            </div>
        `;
    }
}

/**
 * Handle XML file upload
 */
function handleXMLFileUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        uploadedXMLContent = e.target.result;

        // Show file name
        document.getElementById('xmlFileName').classList.remove('hidden');
        document.getElementById('xmlFileNameText').textContent = `📄 ${file.name}`;

        // Auto-validate
        validateXMLInput();
    };
    reader.onerror = function () {
        showToast('Error al leer el archivo', 'danger');
    };
    reader.readAsText(file);
}

/**
 * Clear uploaded XML file
 */
function clearXMLFile() {
    uploadedXMLContent = null;
    document.getElementById('xmlFileInput').value = '';
    document.getElementById('xmlFileName').classList.add('hidden');
    document.getElementById('xmlValidationResult').innerHTML = '';
}

/**
 * Generate XML using new XMLGenerator (replacing old function)
 */
async function generateXML() {
    if (!currentData.depositos?.length && !currentData.retiros?.length) {
        return showToast('Carga operaciones primero', 'warning');
    }

    const periodo = document.getElementById('periodoSelector')?.value;
    if (!periodo) {
        return showToast('Selecciona un periodo', 'warning');
    }

    showLoading('Generando XML...');

    try {
        const umbralAviso = appConfig.aviso * appConfig.uma;

        // Filter operations above threshold
        const avsDeps = currentData.depositos.filter(o => o.umaEq >= appConfig.aviso);
        const avsRets = currentData.retiros.filter(o => o.umaEq >= appConfig.aviso);

        if (!avsDeps.length && !avsRets.length) {
            // Generate informe en cero
            const xmlCero = XMLGenerator.generateInformeCero({
                mesReportado: periodo,
                rfcSujetoObligado: appConfig.rfc
            });

            XMLGenerator.download(xmlCero, `Informe_Cero_${periodo}.xml`);
            await AuthService.logAudit('GENERAR_XML', `Informe en cero generado: ${periodo}`);
            showToast('Informe en cero generado (sin operaciones sobre umbral)', 'info');
        } else {
            // Generate full XML
            if (avsDeps.length) {
                const personas = preparePersonasForXML(avsDeps);
                const xmlDeps = XMLGenerator.generateJYS({
                    mesReportado: periodo,
                    rfcSujetoObligado: appConfig.rfc,
                    referencia: `${periodo}_DEPOSITOS`,
                    personas,
                    cpSucursal: '00000'
                });
                XMLGenerator.download(xmlDeps, `Aviso_DEPOSITOS_${periodo}.xml`);
            }

            if (avsRets.length) {
                const personas = preparePersonasForXML(avsRets);
                const xmlRets = XMLGenerator.generateJYS({
                    mesReportado: periodo,
                    rfcSujetoObligado: appConfig.rfc,
                    referencia: `${periodo}_RETIROS`,
                    personas,
                    cpSucursal: '00000'
                });
                XMLGenerator.download(xmlRets, `Aviso_RETIROS_${periodo}.xml`);
            }

            await AuthService.logAudit('GENERAR_XML', `XML generado: ${periodo} (Deps: ${avsDeps.length}, Rets: ${avsRets.length})`);
            showToast(`XML generado: ${avsDeps.length} depósitos, ${avsRets.length} retiros`, 'success');
        }

        // Save report record
        await dbService.addItems('reports', [{
            id: Date.now(),
            tipo: 'XML',
            archivo: `Aviso_${periodo}.xml`,
            fecha: new Date().toISOString(),
            depositos: avsDeps.length,
            retiros: avsRets.length
        }]);

        await loadReports();

    } catch (error) {
        console.error('Error generating XML:', error);
        showToast('Error al generar XML: ' + error.message, 'danger');
    }

    hideLoading();
}

/**
 * Prepare personas array for XML generation
 */
function preparePersonasForXML(operations) {
    const personasMap = new Map();

    operations.forEach(op => {
        if (!personasMap.has(op.playercode)) {
            // Extract apellidos from lastname
            const apellidos = (op.lastname || 'X X').split(' ');

            personasMap.set(op.playercode, {
                nombre: op.firstname || 'X',
                apellidoPaterno: apellidos[0] || 'X',
                apellidoMaterno: apellidos.slice(1).join(' ') || 'X',
                fechaNacimiento: op.dob,
                rfc: op.rfc,
                curp: op.curp,
                paisNacionalidad: 'MX',
                actividadEconomica: '8230300', // Casinos
                domicilio: op.address ? {
                    colonia: op.colonia || 'NO DISPONIBLE',
                    calle: op.address || 'NO DISPONIBLE',
                    numeroExterior: op.numExt || 'SN',
                    cp: op.zip || op.cp || '00000'
                } : null,
                telefono: op.phone,
                email: op.email,
                operaciones: []
            });
        }

        personasMap.get(op.playercode).operaciones.push({
            fecha: op.fechaProceso || new Date(),
            tipo: op.tipo,
            monto: op.monto,
            tipoOperacion: op.tipo === 'deposito' ? '101' : '102',
            lineaNegocio: '2', // Apuestas remotas
            medioOperacion: '2' // En línea
        });
    });

    return Array.from(personasMap.values());
}

// ========== EMPRESA SELECTOR & NOTIFICATIONS ==========

/**
 * Initialize empresa selector for admin users
 */
async function initEmpresaSelector() {
    const user = AuthService.getCurrentUser();
    if (!user || user.role !== 'admin') return;

    const container = document.getElementById('empresaSelectorContainer');
    const selector = document.getElementById('empresaSelector');
    if (!container || !selector) return;

    try {
        const empresas = await dbService.getAll('empresas');
        if (empresas.length > 1) {
            container.classList.remove('hidden');
            selector.innerHTML = empresas.map(e =>
                `<option value="${e.id}" ${e.id === EmpresasService?.currentEmpresa?.id ? 'selected' : ''}>
                    🏢 ${e.nombreComercial || e.razonSocial}
                </option>`
            ).join('');
        }
    } catch (e) {
        console.error('Error loading empresas:', e);
    }
}

/**
 * Change active empresa
 */
async function changeEmpresa(empresaId) {
    if (typeof EmpresasService !== 'undefined') {
        await EmpresasService.select(empresaId);
        showToast('Empresa cambiada', 'success');
        // Reload data for new empresa
        await loadKYC();
        await loadReports();
        await updateStats();
    }
}

/**
 * Toggle notifications panel
 */
function toggleNotificationsPanel() {
    const panel = document.getElementById('notificationsPanel');
    if (panel) {
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
            loadNotifications();
        }
    }
}

/**
 * Load and render notifications
 */
async function loadNotifications() {
    const list = document.getElementById('notificationsList');
    const badge = document.getElementById('notificationsBadge');
    if (!list) return;

    try {
        let notificaciones = [];

        if (typeof NotificationsService !== 'undefined') {
            notificaciones = await NotificationsService.getPendientes();
        }

        // Update badge
        if (badge) {
            if (notificaciones.length > 0) {
                badge.textContent = notificaciones.length > 9 ? '9+' : notificaciones.length;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

        // Render list
        if (notificaciones.length === 0) {
            list.innerHTML = '<p class="text-muted text-center" style="padding: 24px;">No hay notificaciones pendientes</p>';
            return;
        }

        list.innerHTML = notificaciones.slice(0, 10).map(n => {
            const typeIcon = { 'alerta': '🚨', 'warning': '⚠️', 'success': '✅', 'info': 'ℹ️' }[n.tipo] || '📌';
            const typeColor = { 'alerta': 'danger', 'warning': 'warning', 'success': 'success' }[n.tipo] || 'info';
            return `
                <div class="card" style="margin-bottom: 8px; padding: 12px; border-left: 3px solid var(--color-${typeColor});">
                    <div style="font-size: 0.85em;">
                        ${typeIcon} <strong>${n.titulo || 'Notificación'}</strong>
                    </div>
                    <p class="text-muted" style="font-size: 0.8em; margin: 4px 0 0 0;">${n.mensaje}</p>
                    <small class="text-muted">${new Date(n.fecha).toLocaleString('es-MX')}</small>
                </div>
            `;
        }).join('');

    } catch (e) {
        console.error('Error loading notifications:', e);
        list.innerHTML = '<p class="text-muted text-center">Error cargando notificaciones</p>';
    }
}

/**
 * Mark all notifications as read
 */
async function markAllNotificationsRead() {
    if (typeof NotificationsService !== 'undefined') {
        const notifs = await NotificationsService.getPendientes();
        for (const n of notifs) {
            await NotificationsService.marcarLeida(n.id);
        }
        await loadNotifications();
        showToast('Notificaciones marcadas como leídas', 'success');
    }
    toggleNotificationsPanel();
}

// ========== RFC & CURP VALIDATION ==========

/**
 * Validate Mexican RFC format
 * @param {string} rfc - RFC to validate
 * @returns {object} - { valid: boolean, type: 'fisica'|'moral', message: string }
 */
function validateRFC(rfc) {
    if (!rfc) return { valid: false, type: null, message: 'RFC vacío' };

    const rfcClean = rfc.toUpperCase().trim();

    // Persona Física: 4 letters + 6 digits + 3 homoclave (13 chars)
    const regexFisica = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/;

    // Persona Moral: 3 letters + 6 digits + 3 homoclave (12 chars)
    const regexMoral = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/;

    if (regexFisica.test(rfcClean)) {
        // Validate date portion (positions 4-9)
        const dateStr = rfcClean.substring(4, 10);
        if (isValidRFCDate(dateStr)) {
            return { valid: true, type: 'fisica', message: 'RFC válido (Persona Física)' };
        }
        return { valid: false, type: 'fisica', message: 'Fecha de nacimiento inválida en RFC' };
    }

    if (regexMoral.test(rfcClean)) {
        const dateStr = rfcClean.substring(3, 9);
        if (isValidRFCDate(dateStr)) {
            return { valid: true, type: 'moral', message: 'RFC válido (Persona Moral)' };
        }
        return { valid: false, type: 'moral', message: 'Fecha de constitución inválida en RFC' };
    }

    return { valid: false, type: null, message: 'Formato de RFC incorrecto' };
}

/**
 * Validate RFC date portion (YYMMDD)
 */
function isValidRFCDate(dateStr) {
    const year = parseInt(dateStr.substring(0, 2));
    const month = parseInt(dateStr.substring(2, 4));
    const day = parseInt(dateStr.substring(4, 6));

    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;

    return true;
}

/**
 * Validate Mexican CURP format
 * @param {string} curp - CURP to validate
 * @returns {object} - { valid: boolean, data: object, message: string }
 */
function validateCURP(curp) {
    if (!curp) return { valid: false, data: null, message: 'CURP vacío' };

    const curpClean = curp.toUpperCase().trim();

    // CURP format: 18 characters
    // AAAA YYMMDD H SS CCC NN D
    // 4 letters + 6 digits (date) + 1 letter (sex) + 2 letters (state) + 3 consonants + 2 chars
    const regexCURP = /^[A-Z]{4}\d{6}[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9]\d$/;

    if (!regexCURP.test(curpClean)) {
        return { valid: false, data: null, message: 'Formato de CURP incorrecto' };
    }

    // Extract data
    const dateStr = curpClean.substring(4, 10);
    const sex = curpClean.charAt(10);
    const state = curpClean.substring(11, 13);

    // Validate date
    const year = parseInt(dateStr.substring(0, 2));
    const month = parseInt(dateStr.substring(2, 4));
    const day = parseInt(dateStr.substring(4, 6));

    if (month < 1 || month > 12 || day < 1 || day > 31) {
        return { valid: false, data: null, message: 'Fecha de nacimiento inválida en CURP' };
    }

    // Valid Mexican state codes
    const validStates = ['AS', 'BC', 'BS', 'CC', 'CL', 'CM', 'CS', 'CH', 'DF', 'DG', 'GT', 'GR', 'HG', 'JC', 'MC', 'MN', 'MS', 'NT', 'NL', 'OC', 'PL', 'QT', 'QR', 'SP', 'SL', 'SR', 'TC', 'TS', 'TL', 'VZ', 'YN', 'ZS', 'NE'];

    if (!validStates.includes(state)) {
        return { valid: false, data: null, message: `Código de estado inválido: ${state}` };
    }

    return {
        valid: true,
        data: {
            sexo: sex === 'H' ? 'Hombre' : 'Mujer',
            estado: state,
            fechaNacimiento: `${year > 30 ? '19' : '20'}${dateStr.substring(0, 2)}-${dateStr.substring(2, 4)}-${dateStr.substring(4, 6)}`
        },
        message: 'CURP válido'
    };
}

/**
 * Verify client against PEP/OFAC lists
 */
async function verificarClienteListas(playercode) {
    const cliente = await dbService.get('kyc', playercode);
    if (!cliente) {
        showToast('Cliente no encontrado', 'danger');
        return null;
    }

    if (typeof ListasControlService === 'undefined') {
        showToast('Servicio de listas no disponible', 'warning');
        return null;
    }

    const resultado = await ListasControlService.verificacionCompleta(cliente);

    // Log audit
    await AuthService.logAudit('VERIFICACION_LISTAS',
        `Verificado ${cliente.firstname} ${cliente.lastname}: ${resultado.riesgoGlobal}`);

    return resultado;
}

/**
 * Verify all clients against PEP list
 */
async function verificarTodosPEP() {
    const resultDiv = document.getElementById('pepVerificationResult');
    if (!resultDiv) return;

    showLoading('Verificando clientes contra lista PEP...');

    try {
        const clientes = await dbService.getAll('kyc');

        if (clientes.length === 0) {
            resultDiv.innerHTML = '<p class="text-muted">No hay clientes para verificar</p>';
            hideLoading();
            return;
        }

        if (typeof ListasControlService === 'undefined') {
            resultDiv.innerHTML = '<span class="badge badge-danger">Servicio de listas no disponible</span>';
            hideLoading();
            return;
        }

        const pepEncontrados = [];

        for (const cliente of clientes) {
            const check = ListasControlService.verificarPEP(cliente);
            if (check.esPEP || check.indicadores.length > 0) {
                pepEncontrados.push({
                    playercode: cliente.playercode,
                    nombre: `${cliente.firstname} ${cliente.lastname}`,
                    ...check
                });
            }
        }

        await AuthService.logAudit('VERIFICACION_PEP_MASIVA',
            `Verificados ${clientes.length} clientes, ${pepEncontrados.length} PEP detectados`);

        if (pepEncontrados.length === 0) {
            resultDiv.innerHTML = `
                <div style="padding: 12px; background: rgba(16, 185, 129, 0.1); border-radius: var(--radius-sm); border: 1px solid var(--color-success);">
                    ✅ <strong>No se detectaron PEPs</strong> entre los ${clientes.length} clientes verificados
                </div>
            `;
        } else {
            resultDiv.innerHTML = `
                <div style="padding: 12px; background: rgba(239, 68, 68, 0.1); border-radius: var(--radius-sm); border: 1px solid var(--color-danger); margin-bottom: 12px;">
                    🚨 <strong>${pepEncontrados.length} posibles PEP detectados</strong> de ${clientes.length} clientes
                </div>
                <div class="table-container" style="max-height: 200px; overflow-y: auto;">
                    <table class="table" style="font-size: 0.85em;">
                        <thead><tr><th>Cliente</th><th>Nivel</th><th>Indicadores</th></tr></thead>
                        <tbody>
                            ${pepEncontrados.map(p => `
                                <tr>
                                    <td><strong>${p.nombre}</strong><br><small>${p.playercode}</small></td>
                                    <td><span class="badge badge-danger">${p.nivel || p.riesgo}</span></td>
                                    <td>${p.indicadores.join('<br>')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

    } catch (error) {
        console.error('Error en verificación PEP:', error);
        resultDiv.innerHTML = `<span class="badge badge-danger">Error: ${error.message}</span>`;
    }

    hideLoading();
}

/**
 * Check clients from high-risk countries
 */
async function verificarPaisesRiesgo() {
    const resultDiv = document.getElementById('pepVerificationResult');
    if (!resultDiv) return;

    showLoading('Verificando países de riesgo...');

    try {
        const clientes = await dbService.getAll('kyc');

        if (typeof ListasControlService === 'undefined') {
            resultDiv.innerHTML = '<span class="badge badge-danger">Servicio no disponible</span>';
            hideLoading();
            return;
        }

        const riesgo = [];

        for (const cliente of clientes) {
            const pais = cliente.paisNacionalidad || cliente.country || 'MX';
            const check = ListasControlService.verificarPais(pais);

            if (check.esRiesgo) {
                riesgo.push({
                    nombre: `${cliente.firstname} ${cliente.lastname}`,
                    playercode: cliente.playercode,
                    pais: pais
                });
            }
        }

        await AuthService.logAudit('VERIFICACION_PAISES',
            `Verificados ${clientes.length} clientes, ${riesgo.length} en países de riesgo`);

        if (riesgo.length === 0) {
            resultDiv.innerHTML = `
                <div style="padding: 12px; background: rgba(16, 185, 129, 0.1); border-radius: var(--radius-sm); border: 1px solid var(--color-success);">
                    ✅ <strong>No se detectaron clientes de países de alto riesgo</strong>
                </div>
            `;
        } else {
            resultDiv.innerHTML = `
                <div style="padding: 12px; background: rgba(251, 191, 36, 0.1); border-radius: var(--radius-sm); border: 1px solid var(--color-warning); margin-bottom: 12px;">
                    ⚠️ <strong>${riesgo.length} clientes de países GAFI alto riesgo</strong>
                </div>
                <div class="table-container" style="max-height: 150px; overflow-y: auto;">
                    <table class="table" style="font-size: 0.85em;">
                        <thead><tr><th>Cliente</th><th>País</th></tr></thead>
                        <tbody>
                            ${riesgo.map(r => `
                                <tr>
                                    <td><strong>${r.nombre}</strong></td>
                                    <td><span class="badge badge-warning">${r.pais}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

    } catch (error) {
        console.error('Error verificando países:', error);
        resultDiv.innerHTML = `<span class="badge badge-danger">Error: ${error.message}</span>`;
    }

    hideLoading();
}

// ========== SOPORTE / TICKETS UI ==========

/**
 * Load soporte tab
 */
async function loadSoporte() {
    // Load FAQs
    renderFAQs();

    // Load user's tickets
    await loadMisTickets();

    // If admin, show admin section and load all tickets
    const user = AuthService.getCurrentUser();
    if (user && user.role === 'admin') {
        document.getElementById('adminTicketsSection').style.display = 'block';
        await loadAllTickets();
    }
}

/**
 * Render FAQs in knowledge base
 */
function renderFAQs(faqs = null) {
    const container = document.getElementById('faqContainer');
    if (!container) return;

    const faqList = faqs || (typeof SoporteService !== 'undefined' ? SoporteService.BASE_CONOCIMIENTOS : []);

    if (faqList.length === 0) {
        container.innerHTML = '<p class="text-muted">No hay FAQs disponibles</p>';
        return;
    }

    container.innerHTML = faqList.map(faq => {
        const categoria = SoporteService?.CATEGORIAS?.[faq.categoria] || { icon: '❓', nombre: faq.categoria };
        return `
            <details style="margin-bottom: 12px; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0;">
                <summary style="padding: 12px; cursor: pointer; background: var(--surface-secondary); border-radius: var(--radius-md);">
                    <span class="badge badge-secondary" style="margin-right: 8px;">${categoria.icon}</span>
                    <strong>${faq.pregunta}</strong>
                </summary>
                <div style="padding: 16px; border-top: 1px solid var(--border-color);">
                    <p style="white-space: pre-line; margin: 0;">${faq.respuesta}</p>
                </div>
            </details>
        `;
    }).join('');
}

/**
 * Search FAQs
 */
function searchFAQ() {
    const query = document.getElementById('searchFAQ')?.value || '';
    if (typeof SoporteService === 'undefined') return;

    const resultados = SoporteService.buscarFAQ(query);
    renderFAQs(resultados);
}

/**
 * Create new ticket
 */
async function crearTicket() {
    const asunto = document.getElementById('ticketAsunto')?.value?.trim();
    const descripcion = document.getElementById('ticketDescripcion')?.value?.trim();
    const categoria = document.getElementById('ticketCategoria')?.value;
    const prioridad = document.getElementById('ticketPrioridad')?.value;

    if (!asunto || !descripcion) {
        showToast('Por favor completa todos los campos', 'warning');
        return;
    }

    if (typeof SoporteService === 'undefined') {
        showToast('Servicio de soporte no disponible', 'danger');
        return;
    }

    try {
        showLoading('Creando ticket...');

        const ticket = await SoporteService.crearTicket({
            asunto,
            descripcion,
            categoria,
            prioridad
        });

        // Clear form
        document.getElementById('ticketAsunto').value = '';
        document.getElementById('ticketDescripcion').value = '';

        showToast(`Ticket ${ticket.numero} creado exitosamente`, 'success');

        // Reload tickets list
        await loadMisTickets();

    } catch (error) {
        console.error('Error creando ticket:', error);
        showToast('Error al crear ticket: ' + error.message, 'danger');
    }

    hideLoading();
}

/**
 * Load user's tickets
 */
async function loadMisTickets() {
    const container = document.getElementById('misTicketsContainer');
    if (!container) return;

    try {
        if (typeof SoporteService === 'undefined') {
            container.innerHTML = '<p class="text-muted">Servicio no disponible</p>';
            return;
        }

        const tickets = await SoporteService.getMisTickets();

        if (tickets.length === 0) {
            container.innerHTML = '<p class="text-muted text-center">No tienes tickets creados</p>';
            return;
        }

        container.innerHTML = tickets.map(t => {
            const estado = SoporteService.ESTADOS[t.estado] || { nombre: t.estado, color: 'secondary', icon: '📋' };
            const categoria = SoporteService.CATEGORIAS[t.categoria] || { nombre: t.categoria, icon: '❓' };

            return `
                <div class="card" style="margin-bottom: 12px; border-left: 4px solid var(--color-${estado.color}); cursor: pointer;" onclick="openChatModal(${t.id})">
                    <div style="display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: 8px;">
                        <div>
                            <span class="badge badge-${estado.color}">${estado.icon} ${estado.nombre}</span>
                            <span class="badge badge-secondary">${categoria.icon} ${categoria.nombre}</span>
                            <h4 style="margin: 8px 0 4px 0;">${t.asunto}</h4>
                            <small class="text-muted">${t.numero} • ${new Date(t.fechaCreacion).toLocaleDateString('es-MX')}</small>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <span class="badge badge-info">${t.mensajes?.length || 1} 💬</span>
                            <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); openChatModal(${t.id})">💬 Abrir Chat</button>
                        </div>
                    </div>
                    <p style="margin-top: 12px; font-size: 0.9em;">${t.descripcion.slice(0, 150)}${t.descripcion.length > 150 ? '...' : ''}</p>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading tickets:', error);
        container.innerHTML = '<p class="text-muted">Error cargando tickets</p>';
    }
}

/**
 * Load all tickets (admin only)
 */
async function loadAllTickets() {
    const container = document.getElementById('adminTicketsContainer');
    const statsSpan = document.getElementById('ticketStats');
    if (!container) return;

    try {
        if (typeof SoporteService === 'undefined') {
            container.innerHTML = '<p class="text-muted">Servicio no disponible</p>';
            return;
        }

        const tickets = await SoporteService.getTodosTickets();
        const stats = await SoporteService.getEstadisticas();

        if (statsSpan) {
            statsSpan.textContent = `${stats.abiertos} abiertos • ${stats.enProceso} en proceso`;
        }

        if (tickets.length === 0) {
            container.innerHTML = '<p class="text-muted text-center">No hay tickets</p>';
            return;
        }

        container.innerHTML = tickets.map(t => {
            const estado = SoporteService.ESTADOS[t.estado] || { nombre: t.estado, color: 'secondary', icon: '📋' };
            const prioridadBadge = { alta: 'danger', normal: 'warning', baja: 'info' }[t.prioridad] || 'secondary';

            return `
                <div class="card" style="margin-bottom: 12px; border-left: 4px solid var(--color-${estado.color});">
                    <div style="display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: 8px;">
                        <div>
                            <span class="badge badge-${estado.color}">${estado.icon} ${estado.nombre}</span>
                            <span class="badge badge-${prioridadBadge}">${t.prioridad}</span>
                            <span class="badge badge-info">${t.mensajes?.length || 1} 💬</span>
                            <h4 style="margin: 8px 0 4px 0;">${t.asunto}</h4>
                            <small class="text-muted">${t.numero} • ${t.creador} • ${new Date(t.fechaCreacion).toLocaleDateString('es-MX')}</small>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <button class="btn btn-primary btn-sm" onclick="openChatModal(${t.id})">💬 Responder</button>
                            ${t.estado !== 'cerrado' ? `
                                <select class="form-select" style="font-size: 0.8em; padding: 4px 8px;" onchange="cambiarEstadoTicket(${t.id}, this.value)">
                                    <option value="abierto" ${t.estado === 'abierto' ? 'selected' : ''}>🆕 Abierto</option>
                                    <option value="en_proceso" ${t.estado === 'en_proceso' ? 'selected' : ''}>🔄 En Proceso</option>
                                    <option value="resuelto" ${t.estado === 'resuelto' ? 'selected' : ''}>✅ Resuelto</option>
                                    <option value="cerrado" ${t.estado === 'cerrado' ? 'selected' : ''}>📁 Cerrado</option>
                                </select>
                            ` : ''}
                        </div>
                    </div>
                    <p style="margin-top: 12px; font-size: 0.9em;">${t.descripcion.slice(0, 200)}${t.descripcion.length > 200 ? '...' : ''}</p>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading all tickets:', error);
        container.innerHTML = '<p class="text-muted">Error cargando tickets</p>';
    }
}

/**
 * Change ticket status (admin only)
 */
async function cambiarEstadoTicket(ticketId, nuevoEstado) {
    try {
        await SoporteService.cambiarEstado(ticketId, nuevoEstado);
        showToast(`Ticket actualizado a: ${nuevoEstado}`, 'success');
        await loadAllTickets();
    } catch (error) {
        showToast('Error actualizando ticket', 'danger');
    }
}

// ========== MULTI-GIRO EXPORT ==========

/**
 * Load export giro selector with configured giros
 */
function loadExportGiros() {
    const selector = document.getElementById('exportGiroSelector');
    const periodoSelector = document.getElementById('exportPeriodoSelector');
    if (!selector) return;

    // Get giros from config
    const giros = appConfig.giros || ['juegos_sorteos'];

    if (giros.length === 0) {
        selector.innerHTML = '<option value="">-- Configura giros primero --</option>';
        return;
    }

    // Populate giro selector
    selector.innerHTML = giros.map(giroId => {
        const giro = typeof GirosCatalogo !== 'undefined' ? GirosCatalogo.getById(giroId) : null;
        return `<option value="${giroId}">${giro?.nombre || giroId}</option>`;
    }).join('');

    // Set default to primary giro
    if (appConfig.giroPrincipal && giros.includes(appConfig.giroPrincipal)) {
        selector.value = appConfig.giroPrincipal;
    }

    // Populate periodo selector
    if (periodoSelector) {
        const year = appConfig.year || 2025;
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        periodoSelector.innerHTML = meses.map((mes, i) => {
            const periodo = `${year}${String(i + 1).padStart(2, '0')}`;
            return `<option value="${periodo}">${mes} ${year}</option>`;
        }).join('');

        // Select current month
        const now = new Date();
        const currentPeriodo = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        periodoSelector.value = currentPeriodo;
    }

    // Update info panel
    updateExportGiroInfo();

    // Show multi-giro summary if multiple giros
    if (giros.length > 1) {
        showMultiGiroSummary();
    }
}

/**
 * Update export giro info panel
 */
function updateExportGiroInfo() {
    const giroId = document.getElementById('exportGiroSelector')?.value;
    const infoPanel = document.getElementById('exportGiroInfo');

    if (!giroId || !infoPanel || typeof GirosCatalogo === 'undefined') {
        if (infoPanel) infoPanel.style.display = 'none';
        return;
    }

    const giro = GirosCatalogo.getById(giroId);
    if (!giro) return;

    const uma = appConfig.uma || 113.14;
    const umbralMXN = giro.umbralAviso * uma;

    // Count operations above threshold
    const allOps = [...(currentData.depositos || []), ...(currentData.retiros || [])];
    const opsReportables = allOps.filter(op => op.monto >= umbralMXN).length;

    // Update display
    document.getElementById('exportGiroFraccion').textContent = `Fr. ${giro.fraccion}`;
    document.getElementById('exportGiroUmbral').textContent = `${giro.umbralAviso} UMA`;
    document.getElementById('exportGiroUmbralMXN').textContent = umbralMXN.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    document.getElementById('exportGiroOpsCount').textContent = `${opsReportables} operaciones`;

    infoPanel.style.display = 'block';
}

/**
 * Show multi-giro summary table
 */
function showMultiGiroSummary() {
    const container = document.getElementById('multiGiroSummary');
    const tableContainer = document.getElementById('multiGiroTable');
    if (!container || !tableContainer) return;

    const giros = appConfig.giros || [];
    if (giros.length <= 1) {
        container.classList.add('hidden');
        return;
    }

    const uma = appConfig.uma || 113.14;
    const allOps = [...(currentData.depositos || []), ...(currentData.retiros || [])];

    const rows = giros.map(giroId => {
        const giro = typeof GirosCatalogo !== 'undefined' ? GirosCatalogo.getById(giroId) : null;
        if (!giro) return '';

        const umbralMXN = giro.umbralAviso * uma;
        const opsReportables = allOps.filter(op => op.monto >= umbralMXN).length;
        const isPrimary = giroId === appConfig.giroPrincipal;

        return `
            <tr ${isPrimary ? 'style="background: var(--accent-soft);"' : ''}>
                <td>${isPrimary ? '⭐' : ''} ${giro.nombre}</td>
                <td>Fr. ${giro.fraccion}</td>
                <td>${giro.umbralAviso} UMA</td>
                <td>${umbralMXN.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</td>
                <td><strong>${opsReportables}</strong> ops</td>
            </tr>
        `;
    }).join('');

    tableContainer.innerHTML = `
        <table class="table" style="font-size: 0.9em;">
            <thead>
                <tr>
                    <th>Giro</th>
                    <th>Fracción</th>
                    <th>Umbral UMA</th>
                    <th>Umbral MXN</th>
                    <th>Ops Reportables</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;

    container.classList.remove('hidden');
}

/**
 * Generate XML for selected giro
 */
async function generateXMLForGiro() {
    const giroId = document.getElementById('exportGiroSelector')?.value;
    const periodo = document.getElementById('exportPeriodoSelector')?.value;

    if (!giroId) {
        showToast('Selecciona un giro', 'warning');
        return;
    }

    if (!periodo) {
        showToast('Selecciona un periodo', 'warning');
        return;
    }

    const giro = typeof GirosCatalogo !== 'undefined' ? GirosCatalogo.getById(giroId) : null;
    if (!giro) {
        showToast('Giro no encontrado', 'danger');
        return;
    }

    showLoading(`Generando XML para ${giro.nombre}...`);

    try {
        const uma = appConfig.uma || 113.14;
        const umbralMXN = giro.umbralAviso * uma;

        // Filter operations above this giro's threshold
        const depositos = (currentData.depositos || []).filter(op => op.monto >= umbralMXN);
        const retiros = (currentData.retiros || []).filter(op => op.monto >= umbralMXN);

        if (depositos.length === 0 && retiros.length === 0) {
            hideLoading();
            const genCero = confirm(`No hay operaciones por encima del umbral de ${umbralMXN.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} para ${giro.nombre}.\n\n¿Deseas generar un Informe en Cero?`);
            if (genCero) {
                await generateXMLInformeCeroForGiro(giroId, periodo);
            }
            return;
        }

        // Generate XML using XMLGenerator
        if (typeof XMLGenerator !== 'undefined') {
            if (depositos.length > 0) {
                const personasDeps = preparePersonasForXML(depositos);
                const xmlDeps = XMLGenerator.generateJYS({
                    mesReportado: periodo,
                    rfcSujetoObligado: appConfig.rfc,
                    referencia: `${periodo}_DEPOSITOS_${giroId}`,
                    personas: personasDeps,
                    cpSucursal: '00000'
                });
                XMLGenerator.download(xmlDeps, `Aviso_DEPOSITOS_${periodo}_${giroId}.xml`);
            }

            if (retiros.length > 0) {
                const personasRets = preparePersonasForXML(retiros);
                const xmlRets = XMLGenerator.generateJYS({
                    mesReportado: periodo,
                    rfcSujetoObligado: appConfig.rfc,
                    referencia: `${periodo}_RETIROS_${giroId}`,
                    personas: personasRets,
                    cpSucursal: '00000'
                });
                XMLGenerator.download(xmlRets, `Aviso_RETIROS_${periodo}_${giroId}.xml`);
            }

            // Save report record
            await dbService.addItems('reports', [{
                id: Date.now(),
                tipo: 'XML',
                giro: giroId,
                giroNombre: giro.nombre,
                periodo: periodo,
                depositos: depositos.length,
                retiros: retiros.length,
                umbral: giro.umbralAviso,
                fecha: new Date().toISOString()
            }]);

            await AuthService.logAudit('GENERAR_XML', `XML generado para ${giro.nombre} periodo ${periodo}: ${depositos.length} depósitos, ${retiros.length} retiros`);

            showToast(`XML generado: ${depositos.length} depósitos, ${retiros.length} retiros`, 'success');
        } else {
            showToast('XMLGenerator no disponible', 'danger');
        }

    } catch (error) {
        console.error('Error generating XML:', error);
        showToast('Error generando XML: ' + error.message, 'danger');
    }

    hideLoading();
}

/**
 * Generate Informe en Cero for selected giro
 */
async function generateXMLInformeCero() {
    const giroId = document.getElementById('exportGiroSelector')?.value;
    const periodo = document.getElementById('exportPeriodoSelector')?.value;

    if (!giroId || !periodo) {
        showToast('Selecciona giro y periodo', 'warning');
        return;
    }

    await generateXMLInformeCeroForGiro(giroId, periodo);
}

async function generateXMLInformeCeroForGiro(giroId, periodo) {
    const giro = typeof GirosCatalogo !== 'undefined' ? GirosCatalogo.getById(giroId) : null;
    if (!giro) return;

    showLoading(`Generando Informe en Cero para ${giro.nombre}...`);

    try {
        if (typeof XMLGenerator !== 'undefined') {
            const xmlCero = XMLGenerator.generateInformeCero({
                mesReportado: periodo,
                rfcSujetoObligado: appConfig.rfc,
                giro: giroId
            });

            XMLGenerator.download(xmlCero, `InformeCero_${periodo}_${giroId}.xml`);

            await AuthService.logAudit('INFORME_CERO', `Informe en cero generado para ${giro.nombre} periodo ${periodo}`);

            showToast(`Informe en Cero generado para ${giro.nombre}`, 'success');
        }
    } catch (error) {
        console.error('Error generating informe cero:', error);
        showToast('Error: ' + error.message, 'danger');
    }

    hideLoading();
}

/**
 * Export to Excel for selected giro
 */
function exportToExcelForGiro() {
    const giroId = document.getElementById('exportGiroSelector')?.value;

    if (!giroId) {
        showToast('Selecciona un giro', 'warning');
        return;
    }

    const giro = typeof GirosCatalogo !== 'undefined' ? GirosCatalogo.getById(giroId) : null;
    if (!giro) return;

    const uma = appConfig.uma || 113.14;
    const umbralMXN = giro.umbralAviso * uma;

    // Filter operations above this giro's threshold
    const depositos = (currentData.depositos || []).filter(op => op.monto >= umbralMXN);
    const retiros = (currentData.retiros || []).filter(op => op.monto >= umbralMXN);

    if (depositos.length === 0 && retiros.length === 0) {
        showToast('No hay operaciones para exportar con este umbral', 'warning');
        return;
    }

    // Use existing exportToExcel with filtered data
    exportToExcel([...depositos, ...retiros], `Operaciones_${giro.id}`);
    showToast(`Excel exportado para ${giro.nombre}`, 'success');
}

// ========== CHAT SUPPORT SYSTEM ==========

let currentChatTicketId = null;

/**
 * Open chat modal for a specific ticket
 */
async function openChatModal(ticketId) {
    currentChatTicketId = ticketId;

    try {
        const ticket = await dbService.get('tickets', ticketId);
        if (!ticket) {
            showToast('Ticket no encontrado', 'danger');
            return;
        }

        // Update header
        document.getElementById('chatTicketTitle').textContent = `💬 ${ticket.asunto}`;
        document.getElementById('chatTicketNumber').textContent = ticket.numero;

        // Render messages
        renderChatMessages(ticket);

        // Show modal
        const modal = document.getElementById('chatModal');
        modal.classList.remove('hidden');
        modal.style.display = 'flex';

        // Focus input
        document.getElementById('chatInput').focus();

        // Update status bar
        const estado = SoporteService?.ESTADOS?.[ticket.estado] || { nombre: ticket.estado };
        document.getElementById('chatStatusBar').innerHTML = `Estado: <strong>${estado.nombre}</strong> • ${ticket.mensajes?.length || 0} mensaje(s)`;

    } catch (error) {
        console.error('Error opening chat:', error);
        showToast('Error abriendo chat', 'danger');
    }
}

/**
 * Close chat modal
 */
function closeChatModal() {
    const modal = document.getElementById('chatModal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
    currentChatTicketId = null;
}

/**
 * Render chat messages
 */
function renderChatMessages(ticket) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    const currentUser = AuthService.getCurrentUser()?.email;
    const messages = ticket.mensajes || [];

    if (messages.length === 0) {
        container.innerHTML = '<p class="text-muted text-center" style="padding: 40px;">No hay mensajes aún</p>';
        return;
    }

    container.innerHTML = messages.map(msg => {
        const isMe = msg.autor === currentUser;
        const isAdmin = msg.esAdmin;

        return `
            <div style="display: flex; justify-content: ${isMe ? 'flex-end' : 'flex-start'}; margin-bottom: 12px;">
                <div style="max-width: 80%; padding: 12px 16px; border-radius: 16px; ${isMe
                ? 'background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); color: white; border-bottom-right-radius: 4px;'
                : 'background: var(--surface-primary); border: 1px solid var(--border-color); border-bottom-left-radius: 4px;'}">
                    <div style="font-size: 0.75em; opacity: 0.8; margin-bottom: 4px;">
                        ${isAdmin ? '🎧 Soporte' : (isMe ? 'Tú' : msg.autor.split('@')[0])} • ${formatChatTime(msg.fecha)}
                    </div>
                    <div style="white-space: pre-wrap;">${msg.mensaje}</div>
                </div>
            </div>
        `;
    }).join('');

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

/**
 * Format chat timestamp
 */
function formatChatTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Ahora';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;

    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

/**
 * Send chat message
 */
async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();

    if (!message || !currentChatTicketId) return;

    try {
        const user = AuthService.getCurrentUser();
        const isAdmin = user?.role === 'admin';

        await SoporteService.agregarMensaje(currentChatTicketId, message, isAdmin);

        // Clear input
        input.value = '';

        // Reload ticket and re-render
        const ticket = await dbService.get('tickets', currentChatTicketId);
        renderChatMessages(ticket);

        // Update status bar
        document.getElementById('chatStatusBar').innerHTML = `✅ Mensaje enviado • ${ticket.mensajes?.length || 0} mensaje(s)`;

        // Refresh tickets list in background
        await loadMisTickets();
        if (isAdmin) await loadAllTickets();

    } catch (error) {
        console.error('Error sending message:', error);
        showToast('Error enviando mensaje', 'danger');
    }
}

/**
 * Open last active ticket chat
 */
async function openLastTicketChat() {
    try {
        const tickets = await SoporteService.getMisTickets();
        if (tickets.length > 0) {
            await openChatModal(tickets[0].id);
        } else {
            showToast('No tienes tickets activos', 'info');
        }
    } catch (error) {
        console.error('Error opening last ticket:', error);
    }
}

/**
 * Check for new messages and show floating button
 */
async function checkNewMessages() {
    const floatingBtn = document.getElementById('floatingChatBtn');
    const badge = document.getElementById('floatingChatBadge');
    if (!floatingBtn || !badge) return;

    try {
        const tickets = await SoporteService.getMisTickets();
        const activeTickets = tickets.filter(t => t.estado !== 'cerrado');

        if (activeTickets.length > 0) {
            floatingBtn.classList.remove('hidden');

            // Count unread (admin messages)
            const user = AuthService.getCurrentUser()?.email;
            let unread = 0;
            activeTickets.forEach(t => {
                const msgs = t.mensajes || [];
                msgs.forEach(m => {
                    if (m.esAdmin && m.autor !== user) unread++;
                });
            });

            if (unread > 0) {
                badge.textContent = unread > 9 ? '9+' : unread;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        } else {
            floatingBtn.classList.add('hidden');
        }
    } catch (error) {
        // Silent error
    }
}

// Call check periodically
setInterval(checkNewMessages, 30000); // Every 30 seconds

// ========== AI ASSISTANT FUNCTIONS ==========

let aiChatHistory = [];

/**
 * Initialize AI Service
 */
async function initAI() {
    if (typeof AIService === 'undefined') return;

    const isConfigured = await AIService.init();
    updateAIStatus(isConfigured);

    // Load available settings
    const apiKeyInput = document.getElementById('cfgGeminiApiKey');
    if (apiKeyInput && AIService.apiKey) {
        apiKeyInput.value = AIService.apiKey;
    }

    const demoCheck = document.getElementById('cfgAiDemoMode');
    if (demoCheck) {
        demoCheck.checked = AIService.demoMode;
    }
}

/**
 * Toggle AI Demo Mode
 */
async function toggleAiDemoMode() {
    const checkbox = document.getElementById('cfgAiDemoMode');
    if (!checkbox || typeof AIService === 'undefined') return;

    await AIService.setDemoMode(checkbox.checked);
    updateAIStatus(AIService.isConfigured());

    if (checkbox.checked) {
        showToast('Modo Demo Activado (Respuestas simuladas)', 'info');
    } else {
        showToast('Modo Demo Desactivado', 'info');
    }
}

/**
 * Clear AI Chat
 */
function clearAIChat() {
    aiChatHistory = [];
    const container = document.getElementById('aiChatMessages');
    if (container) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                <div style="font-size: 2em; margin-bottom: 8px;">🤖</div>
                <p>¡Hola! Soy BDUNITY AI, tu asistente experto en PLD/FT.</p>
                <p style="font-size: 0.9em;">Pregúntame sobre umbrales, generación de XML, KYC,
                    o cualquier duda sobre el sistema.</p>
            </div>
        `;
    }
}

/**
 * Update AI status indicators
 */
function updateAIStatus(isConfigured) {
    const badge = document.getElementById('aiStatusBadge');
    const statuses = ['aiSoporteStatus', 'aiRiesgoStatus', 'aiNarrativaStatus', 'aiAnomaliasStatus'];

    if (badge) {
        if (isConfigured) {
            badge.className = 'badge badge-success';
            badge.textContent = '✅ Configurado';
        } else {
            badge.className = 'badge badge-secondary';
            badge.textContent = '⚪ No configurado';
        }
    }

    statuses.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = isConfigured ? '🟢' : '⚪';
        }
    });
}

/**
 * Save Gemini API Key
 */
async function saveGeminiApiKey() {
    const apiKey = document.getElementById('cfgGeminiApiKey')?.value?.trim();

    if (!apiKey) {
        showToast('Ingresa una API key válida', 'warning');
        return;
    }

    if (typeof AIService === 'undefined') {
        showToast('Servicio de IA no disponible', 'danger');
        return;
    }

    try {
        await AIService.setApiKey(apiKey);
        updateAIStatus(true);
        showToast('API Key guardada correctamente', 'success');
    } catch (error) {
        showToast('Error guardando API Key: ' + error.message, 'danger');
    }
}

/**
 * Toggle API key visibility
 */
function toggleApiKeyVisibility() {
    const input = document.getElementById('cfgGeminiApiKey');
    if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
    }
}

/**
 * Test Gemini connection
 */
async function testGeminiConnection() {
    const resultDiv = document.getElementById('geminiTestResult');

    if (typeof AIService === 'undefined') {
        resultDiv.innerHTML = '<span class="badge badge-danger">Servicio no disponible</span>';
        return;
    }

    // Update API key first
    const apiKey = document.getElementById('cfgGeminiApiKey')?.value?.trim();
    if (apiKey) {
        await AIService.setApiKey(apiKey);
    }

    resultDiv.innerHTML = '<span class="badge badge-info">⏳ Probando conexión...</span>';

    try {
        await AIService.testConnection();
        resultDiv.innerHTML = '<span class="badge badge-success">✅ Conexión exitosa! API funcionando correctamente.</span>';
        updateAIStatus(true);
    } catch (error) {
        console.error('Gemini Test detected error:', error);
        resultDiv.innerHTML = `<div class="alert alert-danger" style="margin-top: 10px; text-align: left;">
            <strong>❌ Error de Conexión:</strong><br>
            ${error.message || 'Error desconocido'}
            ${error.message?.includes('403') ? '<br><small>Verifica que tu API Key sea válida y tenga permisos.</small>' : ''}
        </div>`;
    }
}

/**
 * Send message to AI assistant
 */
async function sendAIMessage() {
    const input = document.getElementById('aiChatInput');
    const mensaje = input?.value?.trim();

    if (!mensaje) return;

    if (typeof AIService === 'undefined' || !AIService.isConfigured()) {
        showToast('Configura la API de Gemini primero en Configuración', 'warning');
        return;
    }

    // Add user message to chat
    addAIChatMessage(mensaje, 'user');
    input.value = '';

    // Show loading
    const btn = document.getElementById('btnAISend');
    const icon = document.getElementById('aiSendIcon');
    if (btn) btn.disabled = true;
    if (icon) icon.textContent = '⏳';

    try {
        const contexto = {
            empresa: appConfig.razonSocial,
            rol: AuthService.getCurrentUser()?.role,
            giro: GirosCatalogo?.getById(appConfig.giroPrincipal)?.nombre
        };

        const respuesta = await AIService.chatSoporte(mensaje, contexto);

        addAIChatMessage(respuesta, 'ai');

    } catch (error) {
        addAIChatMessage('Lo siento, ocurrió un error: ' + error.message, 'ai', true);
    }

    if (btn) btn.disabled = false;
    if (icon) icon.textContent = '📤';
}

/**
 * Add message to AI chat
 */
function addAIChatMessage(mensaje, tipo, isError = false) {
    const container = document.getElementById('aiChatMessages');
    if (!container) return;

    // Clear welcome message if first real message
    if (aiChatHistory.length === 0) {
        container.innerHTML = '';
    }

    aiChatHistory.push({ tipo, mensaje, fecha: new Date() });

    const isUser = tipo === 'user';
    const msgDiv = document.createElement('div');
    msgDiv.style.cssText = `display: flex; justify-content: ${isUser ? 'flex-end' : 'flex-start'}; margin-bottom: 12px;`;

    msgDiv.innerHTML = `
        <div style="max-width: 85%; padding: 12px 16px; border-radius: 16px; ${isUser
            ? 'background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); color: white; border-bottom-right-radius: 4px;'
            : `background: ${isError ? 'rgba(239, 68, 68, 0.1)' : 'var(--surface-primary)'}; border: 1px solid ${isError ? 'var(--color-danger)' : 'var(--border-color)'}; border-bottom-left-radius: 4px;`}">
            <div style="font-size: 0.75em; opacity: 0.8; margin-bottom: 4px;">
                ${isUser ? '👤 Tú' : '🤖 BDUNITY AI'} • ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div style="white-space: pre-wrap; line-height: 1.5;">${formatAIResponse(mensaje)}</div>
        </div>
    `;

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

/**
 * Format AI response (handle markdown-like formatting)
 */
function formatAIResponse(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code style="background: var(--surface-secondary); padding: 2px 6px; border-radius: 4px;">$1</code>')
        .replace(/\n- /g, '\n• ');
}

/**
 * Ask pre-defined AI question
 */
function askAIQuestion(pregunta) {
    document.getElementById('aiChatInput').value = pregunta;
    sendAIMessage();
}

/**
 * Analyze client risk with AI
 */
async function analyzeClientRisk(cliente) {
    if (typeof AIService === 'undefined' || !AIService.isConfigured()) {
        showToast('Configura la API de Gemini primero', 'warning');
        return null;
    }

    showLoading('Analizando riesgo con IA...');

    try {
        const resultado = await AIService.analizarRiesgoCliente(cliente);
        hideLoading();
        return resultado;
    } catch (error) {
        hideLoading();
        showToast('Error en análisis: ' + error.message, 'danger');
        return null;
    }
}

/**
 * Generate narrative with AI
 */
async function generateNarrative(operacion, cliente, motivo) {
    if (typeof AIService === 'undefined' || !AIService.isConfigured()) {
        showToast('Configura la API de Gemini primero', 'warning');
        return null;
    }

    showLoading('Generando narrativa con IA...');

    try {
        const narrativa = await AIService.generarNarrativa(operacion, cliente, motivo);
        hideLoading();
        return narrativa;
    } catch (error) {
        hideLoading();
        showToast('Error generando narrativa: ' + error.message, 'danger');
        return null;
    }
}

/**
 * Detect anomalies with AI
 */
async function detectAnomalies() {
    if (typeof AIService === 'undefined' || !AIService.isConfigured()) {
        showToast('Configura la API de Gemini primero', 'warning');
        return null;
    }

    const operaciones = [...(currentData.depositos || []), ...(currentData.retiros || [])];

    if (operaciones.length === 0) {
        showToast('No hay operaciones para analizar', 'warning');
        return null;
    }

    showLoading('Detectando anomalías con IA...');

    try {
        const resultado = await AIService.detectarAnomalias(operaciones, appConfig.aviso);
        hideLoading();

        if (resultado.anomaliasDetectadas?.length > 0) {
            showToast(`Se detectaron ${resultado.anomaliasDetectadas.length} anomalías`, 'warning');
        } else {
            showToast('No se detectaron anomalías significativas', 'success');
        }

        return resultado;
    } catch (error) {
        hideLoading();
        showToast('Error detectando anomalías: ' + error.message, 'danger');
        return null;
    }
}

// Initialize AI on load
setTimeout(initAI, 1000);

// ==========================================
// Floating Chat Widget Logic
// ==========================================

function toggleFloatingChat() {
    const chatWindow = document.getElementById('floatingChatWindow');
    const btn = document.getElementById('floatingAiBtn');

    if (chatWindow.classList.contains('hidden')) {
        chatWindow.classList.remove('hidden');
        chatWindow.classList.add('animate-slideInUp');
        btn.innerHTML = '✕'; // Close icon
        btn.style.transform = 'rotate(90deg)';

        // Focus input
        setTimeout(() => document.getElementById('floatingChatInput').focus(), 100);
    } else {
        chatWindow.classList.add('hidden');
        btn.innerHTML = '🤖'; // Robot icon
        btn.style.transform = 'rotate(0deg)';
    }
}

async function sendFloatingMessage() {
    const input = document.getElementById('floatingChatInput');
    const message = input.value.trim();
    if (!message) return;

    // Add user message
    addFloatingMessage(message, 'user');
    input.value = '';

    // Show loading
    const loadingId = addFloatingLoading();

    try {
        // Call Gemini
        // Prepare context
        const context = `Usuario: ${document.getElementById('userName').textContent}, Rol: ${document.getElementById('userRole').textContent}`;
        const response = await AIService.chatSoporte(message, context);

        // Remove loading
        removeFloatingMessage(loadingId);

        // Add AI response
        addFloatingMessage(response, 'ai');
    } catch (error) {
        removeFloatingMessage(loadingId);
        addFloatingMessage('Lo siento, hubo un error al procesar tu mensaje: ' + error.message, 'ai');
    }
}

function addFloatingMessage(text, sender) {
    const container = document.getElementById('floatingChatMessages');
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.justifyContent = sender === 'user' ? 'flex-end' : 'flex-start';
    div.style.marginBottom = '12px';
    div.classList.add('animate-fadeIn');

    const bubble = document.createElement('div');
    bubble.style.maxWidth = '85%';
    bubble.style.padding = '12px 16px';
    bubble.style.borderRadius = '16px';
    bubble.style.fontSize = '0.9em';

    if (sender === 'user') {
        bubble.style.background = 'var(--accent-primary)';
        bubble.style.color = 'white';
        bubble.style.borderBottomRightRadius = '4px';
    } else {
        bubble.style.background = 'var(--bg-secondary)';
        bubble.style.border = '1px solid var(--glass-border)';
        bubble.style.borderBottomLeftRadius = '4px';
    }

    // Header for AI
    if (sender === 'ai') {
        bubble.innerHTML = `<div style="font-size: 0.75em; opacity: 0.8; margin-bottom: 4px;">🤖 BDUNITY AI</div>`;
    }

    const content = document.createElement('div');
    content.style.lineHeight = '1.4';

    // Check if markdown-like
    if (sender === 'ai') {
        // Simple bold formatting
        content.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    } else {
        content.textContent = text;
    }

    bubble.appendChild(content);
    div.appendChild(bubble);
    container.appendChild(div);

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;

    return div.id = 'msg-' + Date.now();
}

function addFloatingLoading() {
    const container = document.getElementById('floatingChatMessages');
    const div = document.createElement('div');
    div.id = 'loading-' + Date.now();
    div.style.display = 'flex';
    div.style.justifyContent = 'flex-start';
    div.style.marginBottom = '12px';

    div.innerHTML = `
        <div style="padding: 12px 16px; border-radius: 16px; background: var(--bg-secondary); border: 1px solid var(--glass-border); border-bottom-left-radius: 4px;">
            <div style="display: flex; gap: 4px; align-items: center;">
                <div class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
                <span style="font-size: 0.8em; opacity: 0.7;">Escribiendo...</span>
            </div>
        </div>
    `;

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div.id;
}

function removeFloatingMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function handleFloatingInput(e) {
    if (e.key === 'Enter') sendFloatingMessage();
}

function askAiFloating(text) {
    document.getElementById('floatingChatInput').value = text;
    sendFloatingMessage();
}
