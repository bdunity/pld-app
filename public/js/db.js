/**
 * PLD BDU v2 - Database Service (Firebase Firestore)
 * Cloud-based storage with real-time sync
 */

const dbService = {
    db: null,
    initialized: false,

    init() {
        if (this.initialized) return this.db;

        // Wait for Firebase to be available
        if (typeof firestore === 'undefined') {
            console.error('❌ Firestore not initialized. Check firebase-config.js');
            throw new Error('Firestore not available');
        }

        this.db = firestore;
        this.initialized = true;
        console.log('✅ Firestore DB Connected (Multi-Tenant Mode)');
        return this.db;
    },

    /**
     * Get current tenant context
     * Returns { empresaId, isSuperAdmin }
     */
    getTenantContext() {
        if (typeof AuthService !== 'undefined') {
            const user = AuthService.getCurrentUser();
            if (user) {
                // Check for session with viewingEmpresaId (super_admin viewing specific company)
                try {
                    const session = sessionStorage.getItem('pld_bdu_session');
                    if (session) {
                        const sessionData = JSON.parse(session);
                        // If super_admin is viewing a specific empresa, use that for filtering
                        if (sessionData.viewingEmpresaId && user.role === 'super_admin') {
                            return {
                                empresaId: sessionData.viewingEmpresaId,
                                isSuperAdmin: true,
                                isViewingAs: true
                            };
                        }
                    }
                } catch (e) { /* ignore */ }

                return {
                    empresaId: user.empresaId,
                    isSuperAdmin: user.role === 'super_admin'
                };
            }
        }

        // Fallback to session storage if AuthService not fully loaded
        try {
            const session = sessionStorage.getItem('pld_bdu_session');
            if (session) {
                const user = JSON.parse(session);
                // Support viewingEmpresaId for super_admin
                if (user.viewingEmpresaId && user.role === 'super_admin') {
                    return {
                        empresaId: user.viewingEmpresaId,
                        isSuperAdmin: true,
                        isViewingAs: true
                    };
                }
                return {
                    empresaId: user.empresaId,
                    isSuperAdmin: user.role === 'super_admin'
                };
            }
        } catch (e) {
            console.warn('Error reading session for tenant context', e);
        }

        return { empresaId: null, isSuperAdmin: false };
    },

    /**
     * Helper to apply tenant filter to a query reference
     */
    applyTenantFilter(queryRef, collectionName) {
        // Collections that are global (shared across all tenants)
        const GLOBAL_COLLECTIONS = ['users', 'empresas', 'config', 'audit_logs']; // 'users' is special, handled separately usually

        if (GLOBAL_COLLECTIONS.includes(collectionName)) {
            return queryRef;
        }

        const { empresaId, isSuperAdmin } = this.getTenantContext();

        // If super admin, they can see all (or we could implement a "view as" mode later)
        // For now, let's assume Super Admin sees EVERYTHING from the raw DB view, 
        // but UI might filter. Or, safer: Super Admin also needs explicit context to see data.
        // Let's stick to the plan: "unless Super Admin".
        if (isSuperAdmin) {
            return queryRef;
        }

        if (empresaId) {
            return queryRef.where('empresaId', '==', empresaId);
        }

        // If no user and not global collection, maybe return empty or throw?
        // For safety, if no context, we shouldn't show sensitive data.
        console.warn(`Querying ${collectionName} without tenant context!`);
        return queryRef; // Fallback for now to avoid breaking login flow if called early
    },

    /**
     * Add or update items in a collection
     */
    async addItems(collectionName, items) {
        const batch = this.db.batch();

        for (const item of items) {
            // Determine document ID
            let docId;
            if (collectionName === 'users') {
                docId = item.email;
            } else if (collectionName === 'config') {
                docId = item.id || 'main';
            } else if (collectionName === 'empresas') {
                docId = item.id;
            } else if (collectionName === 'giros') {
                docId = item.id;
            } else if (collectionName === 'kyc') {
                docId = item.playercode;
            } else {
                docId = item.id?.toString() || Date.now().toString();
            }

            const { empresaId, isSuperAdmin } = this.getTenantContext();

            const docRef = this.db.collection(collectionName).doc(docId);
            const dataToSave = {
                ...item,
                updatedAt: new Date().toISOString()
            };

            // Enforce empresaId on save for tenant-specific collections
            const GLOBAL_COLLECTIONS = ['users', 'empresas', 'config', 'audit_logs'];
            if (!GLOBAL_COLLECTIONS.includes(collectionName) && !dataToSave.empresaId && empresaId) {
                dataToSave.empresaId = empresaId;
            }

            batch.set(docRef, dataToSave, { merge: true });
        }

        await batch.commit();
    },

    /**
     * Get all documents from a collection
     */
    async getAll(collectionName) {
        let query = this.db.collection(collectionName);
        query = this.applyTenantFilter(query, collectionName);

        const snapshot = await query.get();
        return snapshot.docs.map(doc => ({ ...doc.data(), _docId: doc.id }));
    },

    /**
     * Get a single document by ID
     */
    async get(collectionName, key) {
        const doc = await this.db.collection(collectionName).doc(key.toString()).get();
        if (doc.exists) {
            return { ...doc.data(), _docId: doc.id };
        }
        return null;
    },

    /**
     * Delete a document by ID
     */
    async delete(collectionName, key) {
        await this.db.collection(collectionName).doc(key.toString()).delete();
    },

    /**
     * Get documents by a field value
     */
    async getByIndex(collectionName, fieldName, value) {
        let query = this.db.collection(collectionName).where(fieldName, '==', value);
        query = this.applyTenantFilter(query, collectionName);

        const snapshot = await query.get();
        return snapshot.docs.map(doc => ({ ...doc.data(), _docId: doc.id }));
    },

    /**
     * Get operations by period range
     */
    async getByPeriodRange(startId, endId) {
        let query = this.db.collection('operations')
            .where('periodoId', '>=', startId)
            .where('periodoId', '<=', endId);

        query = this.applyTenantFilter(query, 'operations');

        const snapshot = await query.get();
        return snapshot.docs.map(doc => ({ ...doc.data(), _docId: doc.id }));
    },

    /**
     * Clear all documents in a collection
     */
    async clearStore(collectionName) {
        const snapshot = await this.db.collection(collectionName).get();
        const batch = this.db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    },

    /**
     * Count documents in a collection
     */
    async count(collectionName) {
        let query = this.db.collection(collectionName);
        query = this.applyTenantFilter(query, collectionName);

        const snapshot = await query.get();
        return snapshot.size;
    }
};

// Export
if (typeof window !== 'undefined') {
    window.dbService = dbService;
}
