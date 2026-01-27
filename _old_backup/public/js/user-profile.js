/**
 * PLD BDU v2 - User Profile Service
 * Manage user profiles with avatar and contact information
 */

const UserProfileService = {
    // Default avatar placeholder
    DEFAULT_AVATAR: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMTAwIDEwMCI+PGNpcmNsZSBjeD0iNTAiIGN5PSI1MCIgcj0iNTAiIGZpbGw9IiMzYTNhNGEiLz48Y2lyY2xlIGN4PSI1MCIgY3k9IjM1IiByPSIxOCIgZmlsbD0iIzZhNmE3YSIvPjxlbGxpcHNlIGN4PSI1MCIgY3k9Ijg1IiByeD0iMzAiIHJ5PSIyNSIgZmlsbD0iIzZhNmE3YSIvPjwvc3ZnPg==',

    /**
     * Get user profile from Firestore
     */
    async getProfile(email) {
        if (!email) return null;

        try {
            const doc = await firestore.collection('users').doc(email).get();
            if (doc.exists) {
                return {
                    email: email,
                    ...doc.data(),
                    avatar: doc.data().avatar || this.DEFAULT_AVATAR
                };
            }
            return null;
        } catch (error) {
            console.error('Error getting profile:', error);
            return null;
        }
    },

    /**
     * Update user profile
     */
    async updateProfile(email, data) {
        if (!email) {
            throw new Error('Email es requerido');
        }

        // Clean undefined values (Firestore doesn't accept them)
        const cleanData = {};
        Object.keys(data).forEach(key => {
            if (data[key] !== undefined) {
                cleanData[key] = data[key];
            }
        });

        try {
            await firestore.collection('users').doc(email).set({
                ...cleanData,
                updatedAt: new Date().toISOString()
            }, { merge: true });

            return true;
        } catch (error) {
            console.error('Error updating profile:', error);
            throw error;
        }
    },

    /**
     * Upload avatar as base64 (stored in Firestore)
     * For larger files, consider Firebase Storage
     */
    async uploadAvatar(email, file) {
        if (!file) return null;

        return new Promise((resolve, reject) => {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                reject(new Error('Solo se permiten imágenes'));
                return;
            }

            // Validate file size (max 500KB for Firestore)
            if (file.size > 500 * 1024) {
                reject(new Error('La imagen debe ser menor a 500KB'));
                return;
            }

            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64 = e.target.result;

                try {
                    await this.updateProfile(email, { avatar: base64 });
                    resolve(base64);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('Error leyendo archivo'));
            reader.readAsDataURL(file);
        });
    },

    /**
     * Remove avatar
     */
    async removeAvatar(email) {
        await this.updateProfile(email, { avatar: null });
        return this.DEFAULT_AVATAR;
    },

    /**
     * Get initials from name
     */
    getInitials(name) {
        if (!name) return '?';
        const parts = name.trim().split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return parts[0].substring(0, 2).toUpperCase();
    },

    /**
     * Render avatar HTML
     */
    renderAvatar(profile, size = 40) {
        const avatar = profile?.avatar || this.DEFAULT_AVATAR;
        const name = profile?.displayName || profile?.email || '';

        if (avatar && avatar !== this.DEFAULT_AVATAR) {
            return `<img src="${avatar}" alt="${name}" style="width: ${size}px; height: ${size}px; border-radius: 50%; object-fit: cover;">`;
        }

        // Show initials if no avatar
        const initials = this.getInitials(name);
        return `
            <div style="width: ${size}px; height: ${size}px; border-radius: 50%; background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: ${size * 0.4}px;">
                ${initials}
            </div>
        `;
    }
};

// Export globally
if (typeof window !== 'undefined') {
    window.UserProfileService = UserProfileService;
}
