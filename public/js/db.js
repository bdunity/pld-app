/**
 * PLD BDU v2 - Database Service (Firebase Firestore)
 * Cloud-based storage with real-time sync
 */

const dbService = {
    db: null,
    initialized: false,

    async init() {
        if (this.initialized) return this.db;

        // Wait for Firebase to be available
        if (typeof firestore === 'undefined') {
            console.error('❌ Firestore not initialized. Check firebase-config.js');
            throw new Error('Firestore not available');
        }

        this.db = firestore;
        this.initialized = true;
        console.log('✅ Firestore DB Connected');
        return this.db;
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

            const docRef = this.db.collection(collectionName).doc(docId);
            batch.set(docRef, {
                ...item,
                updatedAt: new Date().toISOString()
            }, { merge: true });
        }

        await batch.commit();
    },

    /**
     * Get all documents from a collection
     */
    async getAll(collectionName) {
        const snapshot = await this.db.collection(collectionName).get();
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
        const snapshot = await this.db.collection(collectionName)
            .where(fieldName, '==', value)
            .get();
        return snapshot.docs.map(doc => ({ ...doc.data(), _docId: doc.id }));
    },

    /**
     * Get operations by period range
     */
    async getByPeriodRange(startId, endId) {
        const snapshot = await this.db.collection('operations')
            .where('periodoId', '>=', startId)
            .where('periodoId', '<=', endId)
            .get();
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
        const snapshot = await this.db.collection(collectionName).get();
        return snapshot.size;
    }
};

// Export
if (typeof window !== 'undefined') {
    window.dbService = dbService;
}
