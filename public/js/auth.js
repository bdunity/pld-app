/**
 * PLD BDU v2 - Authentication Service
 * Multi-role authentication with Admin, User, and Visitor roles
 */

const AuthService = {
    SESSION_KEY: 'pld_bdu_session',

    // Role definitions with permissions
    ROLES: {
        super_admin: {
            name: 'Super Admin BDUNITY',
            icon: '♾️',
            tabs: ['empresas', 'dashboard', 'config', 'upload', 'operations', 'monitoring', 'kyc', 'compliance', 'export', 'reports', 'audit', 'soporte', 'ai_config'],
            permissions: ['read_all', 'write_all', 'admin', 'super_admin']
        },
        admin: {
            name: 'Administrador',
            icon: '👑',
            tabs: ['config', 'upload', 'operations', 'monitoring', 'kyc', 'compliance', 'export', 'reports', 'audit', 'soporte'],
            permissions: ['read', 'write', 'delete', 'admin', 'users']
        },
        user: {
            name: 'Usuario',
            icon: '👤',
            tabs: ['operations', 'monitoring', 'kyc', 'compliance', 'export', 'reports', 'soporte'],
            permissions: ['read', 'write']
        },
        visitor: {
            name: 'Visitante',
            icon: '👁️',
            tabs: ['dashboard'],
            permissions: ['read_aggregate']
        }
    },

    /**
     * Login with email, password, and role
     */
    async login(email, password, role) {
        const user = await dbService.get('users', email);

        if (!user) {
            throw new Error('Usuario no encontrado');
        }

        if (user.password !== await this.hashPassword(password)) {
            throw new Error('Contraseña incorrecta');
        }

        // Validate role access
        if (role === 'admin') {
            if (user.role !== 'admin' && user.role !== 'super_admin') {
                throw new Error('No tienes permisos de administrador');
            }
        } else if (role === 'super_admin') {
            if (user.role !== 'super_admin') {
                throw new Error('No tienes permisos de Super Admin');
            }
        }

        // Create session
        const session = {
            email: user.email,
            role: user.role, // Always store actual role
            empresaId: user.empresaId, // Store empresaId if present
            loginTime: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
        };

        sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(session));

        // Log action
        await this.logAudit('LOGIN', `Usuario ${email} inició sesión como ${role}`);

        return true;
    },

    /**
     * Logout current user
     */
    async logout() {
        const user = this.getCurrentUser();
        if (user) {
            await this.logAudit('LOGOUT', `Usuario ${user.email} cerró sesión`);
        }
        sessionStorage.removeItem(this.SESSION_KEY);
    },

    /**
     * Get current logged-in user
     */
    getCurrentUser() {
        const sessionData = sessionStorage.getItem(this.SESSION_KEY);
        if (!sessionData) return null;

        try {
            const session = JSON.parse(sessionData);

            // Check expiration
            if (new Date(session.expiresAt) < new Date()) {
                sessionStorage.removeItem(this.SESSION_KEY);
                return null;
            }

            return session;
        } catch {
            return null;
        }
    },

    /**
     * Check if user has specific permission
     */
    hasPermission(permission) {
        const user = this.getCurrentUser();
        if (!user) return false;

        const roleConfig = this.ROLES[user.role];
        return roleConfig?.permissions.includes(permission) || false;
    },

    /**
     * Check if user can access a specific tab
     */
    canAccessTab(tabId) {
        const user = this.getCurrentUser();
        if (!user) return false;

        const roleConfig = this.ROLES[user.role];
        return roleConfig?.tabs.includes(tabId) || false;
    },

    /**
     * Get tabs available for current user
     */
    getAvailableTabs() {
        const user = this.getCurrentUser();
        if (!user) return [];

        return this.ROLES[user.role]?.tabs || [];
    },

    /**
     * Check if admin user exists
     */
    async hasAdminUser() {
        const users = await dbService.getAll('users');
        return users.some(u => u.role === 'admin');
    },

    /**
     * Setup initial admin user
     */
    async setupAdmin(email, password, securityQuestion, securityAnswer) {
        const users = await dbService.getAll('users');
        const hasSuperAdmin = users.some(u => u.role === 'super_admin');

        if (hasSuperAdmin) {
            throw new Error('Ya existe un Super Admin configurado');
        }

        const user = {
            email: email,
            password: await this.hashPassword(password),
            role: 'super_admin',
            securityQuestion: securityQuestion,
            securityAnswer: await this.hashPassword(securityAnswer.toLowerCase()),
            createdAt: new Date().toISOString()
        };

        await dbService.addItems('users', [user]);
        await this.logAudit('SETUP_ADMIN', `Administrador inicial creado: ${email}`);

        return true;
    },

    /**
     * Invite new user (admin only)
     */
    /**
     * Invite new user (admin only)
     */
    async inviteUser(email, role, invitedBy, empresaId = null) {
        if (!this.hasPermission('users')) {
            throw new Error('No tienes permisos para invitar usuarios');
        }

        const currentUser = this.getCurrentUser();
        const targetEmpresaId = empresaId || currentUser.empresaId;

        // If not super admin, can only invite to own company
        if (currentUser.role !== 'super_admin' && currentUser.empresaId !== targetEmpresaId) {
            throw new Error('No puedes invitar usuarios a otra empresa');
        }

        const existingUser = await dbService.get('users', email);
        if (existingUser) {
            throw new Error('El usuario ya existe');
        }

        // Check plan limits (if applicable, implemented in higher layer or here)
        // For now, we trust the caller (admin-companies.js or UI) to check limits

        // Create user with temporary password
        const tempPassword = this.generateTempPassword();
        const user = {
            email: email,
            password: await this.hashPassword(tempPassword),
            role: role,
            invitedBy: invitedBy,
            empresaId: targetEmpresaId, // Critical fix: save empresaId
            mustChangePassword: true,
            createdAt: new Date().toISOString()
        };

        await dbService.addItems('users', [user]);
        await this.logAudit('INVITE_USER', `Usuario ${email} invitado como ${role} por ${invitedBy} (Empresa: ${targetEmpresaId})`);

        return tempPassword;
    },

    /**
     * Get security question for password recovery
     */
    async getSecurityQuestion(email) {
        const user = await dbService.get('users', email);
        if (!user || !user.securityQuestion) {
            return null;
        }
        return user.securityQuestion;
    },

    /**
     * Reset password with security answer
     */
    async resetPassword(email, securityAnswer, newPassword) {
        const user = await dbService.get('users', email);
        if (!user) {
            throw new Error('Usuario no encontrado');
        }

        if (user.securityAnswer !== this.hashPassword(securityAnswer.toLowerCase())) {
            throw new Error('Respuesta de seguridad incorrecta');
        }

        user.password = this.hashPassword(newPassword);
        user.mustChangePassword = false;
        await dbService.addItems('users', [user]);

        await this.logAudit('RESET_PASSWORD', `Contraseña restablecida para ${email}`);

        return true;
    },

    /**
     * Simple hash function (for demo - use bcrypt in production)
     */
    /**
     * Hash password using SHA-256 (Web Crypto API)
     */
    async hashPassword(password) {
        const msgBuffer = new TextEncoder().encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    },

    /**
     * Generate temporary password
     */
    generateTempPassword() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let password = '';
        for (let i = 0; i < 8; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    },

    /**
     * Log audit action
     */
    async logAudit(action, details) {
        const user = this.getCurrentUser();
        const log = {
            id: Date.now(),
            fecha: new Date().toISOString(),
            user: user?.email || 'Sistema',
            action: action,
            details: details
        };

        try {
            await dbService.addItems('audit_logs', [log]);
        } catch (e) {
            console.error('Error logging audit:', e);
        }
    }
};
