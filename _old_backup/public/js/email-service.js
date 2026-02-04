/**
 * PLD BDU v2 - Email Service (EmailJS)
 * Sends invitation emails using EmailJS
 */

const EmailService = {
    // EmailJS Configuration
    PUBLIC_KEY: 'szdxFP4tv5bv-Kebv',
    SERVICE_ID: 'service_tq12ql5',
    TEMPLATE_ID: 'template_tsxxql8',

    initialized: false,

    /**
     * Initialize EmailJS
     */
    init() {
        if (this.initialized) return;

        if (typeof emailjs === 'undefined') {
            console.error('❌ EmailJS SDK not loaded');
            return;
        }

        if (this.PUBLIC_KEY === 'YOUR_PUBLIC_KEY') {
            console.warn('⚠️ EmailJS not configured. Update EMAIL_CONFIG in email-service.js');
            return;
        }

        emailjs.init(this.PUBLIC_KEY);
        this.initialized = true;
        console.log('📧 EmailJS initialized');
    },

    /**
     * Check if EmailJS is configured
     */
    isConfigured() {
        return this.PUBLIC_KEY !== 'YOUR_PUBLIC_KEY' &&
            this.SERVICE_ID !== 'YOUR_SERVICE_ID' &&
            this.TEMPLATE_ID !== 'YOUR_TEMPLATE_ID';
    },

    /**
     * Send invitation email
     */
    async sendInvitation(toEmail, role, inviterName) {
        if (!this.isConfigured()) {
            console.warn('⚠️ EmailJS not configured. Skipping email.');
            return { success: false, reason: 'not_configured' };
        }

        if (!this.initialized) {
            this.init();
        }

        // Generate unique invitation token
        const inviteToken = this.generateInviteToken();
        const registerLink = `${window.location.origin}/register.html?token=${inviteToken}&email=${encodeURIComponent(toEmail)}`;

        // Role name in Spanish
        const roleNames = {
            'super_admin': 'Super Administrador',
            'admin': 'Administrador',
            'user': 'Usuario',
            'visitor': 'Visitante'
        };

        try {
            const result = await emailjs.send(this.SERVICE_ID, this.TEMPLATE_ID, {
                to_email: toEmail,
                role: roleNames[role] || role,
                register_link: registerLink,
                inviter_name: inviterName,
                app_name: 'PLD BDU',
                expire_days: '7'
            });

            console.log('✅ Invitation email sent:', result);
            return { success: true, inviteToken };
        } catch (error) {
            console.error('❌ Failed to send invitation email:', error);
            throw new Error('Error al enviar el correo de invitación');
        }
    },

    /**
     * Generate unique invitation token
     */
    generateInviteToken() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let token = '';
        for (let i = 0; i < 32; i++) {
            token += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return token;
    }
};

// Export
if (typeof window !== 'undefined') {
    window.EmailService = EmailService;
}
