/**
 * PLD BDU v2 - Authentication Service
 * Firebase Authentication with role-based access control
 */

const AuthService = {
    SESSION_KEY: 'pld_bdu_session',
    currentUser: null,

    // Role definitions with permissions
    ROLES: {
        super_admin: {
            name: 'Super Admin BDUNITY',
            icon: '♾️',
            tabs: ['empresas', 'dashboard', 'billing', 'config', 'upload', 'operations', 'monitoring', 'kyc', 'compliance', 'export', 'reports', 'audit', 'soporte', 'ai_config'],
            permissions: ['read_all', 'write_all', 'admin', 'super_admin', 'users']
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
     * Initialize auth state listener
     */
    init() {
        firebaseAuth.onAuthStateChanged(async (user) => {
            if (user) {
                // Get user profile from Firestore
                const profile = await this.getUserProfile(user.email);
                if (profile) {
                    this.currentUser = {
                        email: user.email,
                        uid: user.uid,
                        role: profile.role,
                        empresaId: profile.empresaId,
                        emailVerified: user.emailVerified
                    };
                    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(this.currentUser));
                }
            } else {
                this.currentUser = null;
                sessionStorage.removeItem(this.SESSION_KEY);
            }
        });
    },

    /**
     * Login with email and password
     */
    async login(email, password, expectedRole) {
        try {
            // Authenticate with Firebase
            const result = await firebaseAuth.signInWithEmailAndPassword(email, password);

            // Get user profile from Firestore
            const profile = await this.getUserProfile(email);

            if (!profile) {
                await firebaseAuth.signOut();
                throw new Error('Perfil de usuario no encontrado');
            }

            // Validate role access
            if (expectedRole === 'admin' && profile.role !== 'admin' && profile.role !== 'super_admin') {
                await firebaseAuth.signOut();
                throw new Error('No tienes permisos de administrador');
            }
            if (expectedRole === 'super_admin' && profile.role !== 'super_admin') {
                await firebaseAuth.signOut();
                throw new Error('No tienes permisos de Super Admin');
            }

            // Create session
            this.currentUser = {
                email: email,
                uid: result.user.uid,
                role: profile.role,
                empresaId: profile.empresaId,
                emailVerified: result.user.emailVerified
            };

            sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(this.currentUser));
            await this.logAudit('LOGIN', `Usuario ${email} inició sesión como ${profile.role}`);

            return true;
        } catch (error) {
            console.error('Login error:', error);
            if (error.code === 'auth/user-not-found') {
                throw new Error('Usuario no encontrado');
            } else if (error.code === 'auth/wrong-password') {
                throw new Error('Contraseña incorrecta');
            } else if (error.code === 'auth/invalid-credential') {
                throw new Error('Credenciales inválidas');
            }
            throw error;
        }
    },

    /**
     * Logout current user
     */
    async logout() {
        const user = this.getCurrentUser();
        if (user) {
            await this.logAudit('LOGOUT', `Usuario ${user.email} cerró sesión`);
        }
        await firebaseAuth.signOut();
        sessionStorage.removeItem(this.SESSION_KEY);
        this.currentUser = null;
    },

    /**
     * Get user profile from Firestore
     */
    async getUserProfile(email) {
        const doc = await firestore.collection('users').doc(email).get();
        return doc.exists ? doc.data() : null;
    },

    /**
     * Get current logged-in user
     */
    getCurrentUser() {
        if (this.currentUser) return this.currentUser;

        const sessionData = sessionStorage.getItem(this.SESSION_KEY);
        if (!sessionData) return null;

        try {
            return JSON.parse(sessionData);
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

        // Super admin viewing a company has access to ALL tabs
        if (user.role === 'super_admin') {
            try {
                const session = sessionStorage.getItem(this.SESSION_KEY);
                if (session) {
                    const sessionData = JSON.parse(session);
                    if (sessionData.isImpersonating && sessionData.viewingEmpresaId) {
                        return true; // Super admin can access everything
                    }
                }
            } catch (e) { /* ignore */ }
        }

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
     * Check if super admin exists
     */
    async hasAdminUser() {
        const snapshot = await firestore.collection('users')
            .where('role', '==', 'super_admin')
            .limit(1)
            .get();
        return !snapshot.empty;
    },

    /**
     * Setup initial super admin user
     */
    async setupAdmin(email, password, securityQuestion, securityAnswer) {
        const hasSuperAdmin = await this.hasAdminUser();
        if (hasSuperAdmin) {
            throw new Error('Ya existe un Super Admin configurado');
        }

        try {
            // Create Firebase Auth user
            const result = await firebaseAuth.createUserWithEmailAndPassword(email, password);

            // Send verification email
            await result.user.sendEmailVerification();

            // Create user profile in Firestore
            await firestore.collection('users').doc(email).set({
                email: email,
                role: 'super_admin',
                securityQuestion: securityQuestion,
                securityAnswer: await this.hashPassword(securityAnswer.toLowerCase()),
                createdAt: new Date().toISOString(),
                uid: result.user.uid
            });

            await this.logAudit('SETUP_ADMIN', `Super Admin inicial creado: ${email}`);
            return true;
        } catch (error) {
            console.error('Setup admin error:', error);
            if (error.code === 'auth/email-already-in-use') {
                throw new Error('Este correo ya está registrado');
            }
            throw error;
        }
    },

    /**
     * Invite new user (admin only) - Uses EmailJS to send invitation
     */
    async inviteUser(email, role, invitedBy, empresaId = null) {
        if (!this.hasPermission('users')) {
            throw new Error('No tienes permisos para invitar usuarios');
        }

        const currentUser = this.getCurrentUser();

        // Super admin only can create other super_admins
        if (role === 'super_admin' && currentUser.role !== 'super_admin') {
            throw new Error('Solo un Super Admin puede crear otro Super Admin');
        }

        const targetEmpresaId = empresaId || currentUser.empresaId;

        // If not super admin, can only invite to own company
        if (currentUser.role !== 'super_admin' && currentUser.empresaId !== targetEmpresaId) {
            throw new Error('No puedes invitar usuarios a otra empresa');
        }

        // Check if user already exists
        const existingProfile = await this.getUserProfile(email);
        if (existingProfile) {
            throw new Error('El usuario ya existe');
        }

        // Check if there's already a pending invite
        const existingInvite = await firestore.collection('pending_invites')
            .where('email', '==', email)
            .get();

        if (!existingInvite.empty) {
            throw new Error('Ya existe una invitación pendiente para este correo');
        }

        // Check Plan Quotas (SaaS)
        if (typeof FeatureService !== 'undefined' && currentUser.role !== 'super_admin') {
            // Count current users + pending invites
            const usersCount = await dbService.count('users'); // Now filtered by tenant
            const pendingCount = await firestore.collection('pending_invites')
                .where('empresaId', '==', targetEmpresaId)
                .where('status', '==', 'pending')
                .get()
                .then(snap => snap.size);

            const totalUsers = usersCount + pendingCount;

            if (!FeatureService.checkQuota('maxUsers', totalUsers)) {
                throw new Error('Haz alcanzado el límite de usuarios de tu plan actual. Actualiza tu plan para invitar más usuarios.');
            }
        }

        try {
            // Generate invite token
            const inviteToken = this.generateInviteToken();

            // Save pending invite to Firestore
            await firestore.collection('pending_invites').add({
                email: email,
                role: role,
                empresaId: targetEmpresaId,
                invitedBy: invitedBy,
                token: inviteToken,
                createdAt: new Date().toISOString(),
                status: 'pending'
            });

            // Try to send email via EmailJS
            let emailSent = false;
            if (typeof EmailService !== 'undefined' && EmailService.isConfigured()) {
                try {
                    await EmailService.sendInvitation(email, role, invitedBy);
                    emailSent = true;
                } catch (emailError) {
                    console.warn('Could not send email:', emailError);
                }
            }

            await this.logAudit('INVITE_USER', `Usuario ${email} invitado como ${role} por ${invitedBy} (Empresa: ${targetEmpresaId})`);

            // Return info including registration link
            const registerLink = `${window.location.origin}/register.html?token=${inviteToken}&email=${encodeURIComponent(email)}`;

            return {
                success: true,
                emailSent,
                registerLink,
                message: emailSent
                    ? 'Invitación enviada por correo'
                    : 'Invitación creada. Comparte el link de registro manualmente.'
            };
        } catch (error) {
            console.error('Invite user error:', error);
            throw error;
        }
    },

    /**
     * Generate invite token
     */
    generateInviteToken() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let token = '';
        for (let i = 0; i < 32; i++) {
            token += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return token;
    },


    /**
     * Send password reset email
     */
    async sendPasswordReset(email) {
        try {
            await firebaseAuth.sendPasswordResetEmail(email);
            await this.logAudit('PASSWORD_RESET_REQUESTED', `Solicitud de reseteo para ${email}`);
            return true;
        } catch (error) {
            console.error('Password reset error:', error);
            if (error.code === 'auth/user-not-found') {
                throw new Error('No existe una cuenta con este correo');
            }
            throw error;
        }
    },

    /**
     * Get security question for password recovery (legacy support)
     */
    async getSecurityQuestion(email) {
        const profile = await this.getUserProfile(email);
        return profile?.securityQuestion || null;
    },

    /**
     * Hash password using SHA-256 (for security questions)
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
        for (let i = 0; i < 12; i++) {
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
            id: Date.now().toString(),
            fecha: new Date().toISOString(),
            user: user?.email || 'Sistema',
            empresaId: user?.empresaId || (user?.role === 'super_admin' ? null : null), // Assign empresaId if available
            action: action,
            details: details
        };

        try {
            await firestore.collection('audit_logs').doc(log.id).set(log);
        } catch (e) {
            console.error('Error logging audit:', e);
        }
    }
};

// Initialize on load
if (typeof firebaseAuth !== 'undefined') {
    AuthService.init();
}
