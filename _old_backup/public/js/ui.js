/**
 * PLD BDU v2 - UI Helpers
 * Toast notifications, modals, loading states
 */

/**
 * Show loading overlay
 */
function showLoading(text = 'Cargando...') {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingOverlay').classList.remove('hidden');
}

/**
 * Hide loading overlay
 */
function hideLoading() {
    document.getElementById('loadingOverlay').classList.add('hidden');
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
        success: '✅',
        warning: '⚠️',
        danger: '❌',
        info: 'ℹ️'
    };

    toast.innerHTML = `
        <span>${icons[type] || icons.info}</span>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Show invite user modal
 */
function showInviteModal() {
    document.getElementById('inviteModal').classList.add('active');
    document.getElementById('inviteEmail').value = '';
    document.getElementById('inviteRole').value = 'user';
}

/**
 * Close invite user modal
 */
function closeInviteModal() {
    document.getElementById('inviteModal').classList.remove('active');
}

/**
 * Invite user
 */
async function inviteUser() {
    const email = document.getElementById('inviteEmail').value;
    const role = document.getElementById('inviteRole').value;

    if (!email || !email.includes('@')) {
        showToast('Ingresa un correo válido', 'warning');
        return;
    }

    try {
        const user = AuthService.getCurrentUser();
        const tempPassword = await AuthService.inviteUser(email, role, user.email);

        closeInviteModal();

        // Show temp password to admin
        alert(`Usuario invitado exitosamente!\n\nCorreo: ${email}\nContraseña temporal: ${tempPassword}\n\nEl usuario debe cambiar su contraseña en el primer inicio de sesión.`);

        showToast('Usuario invitado exitosamente', 'success');

    } catch (error) {
        showToast('Error: ' + error.message, 'danger');
    }
}

/**
 * Format number with locale
 */
function formatNumber(num) {
    return new Intl.NumberFormat('es-MX').format(num);
}

/**
 * Debounce function for search inputs
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Copiado al portapapeles', 'success');
    } catch (err) {
        showToast('Error al copiar', 'danger');
    }
}

/**
 * Confirm dialog wrapper
 */
function confirmAction(message) {
    return new Promise((resolve) => {
        resolve(confirm(message));
    });
}

/**
 * Initialize Chart.js defaults for dark theme
 */
if (typeof Chart !== 'undefined') {
    Chart.defaults.color = 'rgba(255, 255, 255, 0.7)';
    Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';
    Chart.defaults.font.family = "'Inter', sans-serif";
}

/**
 * Mobile sidebar toggle
 */
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
}

/**
 * Close sidebar on mobile when clicking outside
 */
document.addEventListener('click', (e) => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        if (!sidebar.contains(e.target) && !e.target.classList.contains('menu-toggle')) {
            sidebar.classList.remove('open');
        }
    }
});

/**
 * Keyboard shortcuts
 */
document.addEventListener('keydown', (e) => {
    // Escape to close modals
    if (e.key === 'Escape') {
        closeInviteModal();
    }
});
