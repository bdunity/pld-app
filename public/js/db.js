/**
 * PLD BDU v2 - Database Service (IndexedDB)
 * Preserves original functionality with modular structure
 */

const dbService = {
    db: null,
    DB_NAME: 'PLD_BDU_V2',
    DB_VERSION: 6,

    async init() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Config Store
                if (!db.objectStoreNames.contains('config')) {
                    db.createObjectStore('config', { keyPath: 'id' });
                }

                // KYC Store
                if (!db.objectStoreNames.contains('kyc')) {
                    const kycStore = db.createObjectStore('kyc', { keyPath: 'playercode' });
                    kycStore.createIndex('rfc', 'rfc', { unique: false });
                    kycStore.createIndex('estado', 'estado', { unique: false });
                    kycStore.createIndex('empresaId', 'empresaId', { unique: false });
                }

                // Operations Store
                if (!db.objectStoreNames.contains('operations')) {
                    const opStore = db.createObjectStore('operations', { keyPath: 'id', autoIncrement: true });
                    opStore.createIndex('periodoId', 'periodoId', { unique: false });
                    opStore.createIndex('playercode', 'playercode', { unique: false });
                    opStore.createIndex('fechaProceso', 'fechaProceso', { unique: false });
                    opStore.createIndex('tipo', 'tipo', { unique: false });
                    opStore.createIndex('empresaId', 'empresaId', { unique: false });
                }

                // Reports Store
                if (!db.objectStoreNames.contains('reports')) {
                    db.createObjectStore('reports', { keyPath: 'id' });
                }

                // Audit Logs Store
                if (!db.objectStoreNames.contains('audit_logs')) {
                    const auditStore = db.createObjectStore('audit_logs', { keyPath: 'id', autoIncrement: true });
                    auditStore.createIndex('fecha', 'fecha', { unique: false });
                    auditStore.createIndex('action', 'action', { unique: false });
                    auditStore.createIndex('empresaId', 'empresaId', { unique: false });
                }

                // Users Store
                if (!db.objectStoreNames.contains('users')) {
                    const userStore = db.createObjectStore('users', { keyPath: 'email' });
                    userStore.createIndex('role', 'role', { unique: false });
                    userStore.createIndex('empresaId', 'empresaId', { unique: false });
                }

                // ============ NEW: Multi-Tenant Stores ============

                // Empresas Store (Tenants)
                if (!db.objectStoreNames.contains('empresas')) {
                    const empresaStore = db.createObjectStore('empresas', { keyPath: 'id' });
                    empresaStore.createIndex('rfc', 'rfc', { unique: true });
                    empresaStore.createIndex('activo', 'activo', { unique: false });
                }

                // Giros Store (Vulnerable Activities Catalog)
                if (!db.objectStoreNames.contains('giros')) {
                    const giroStore = db.createObjectStore('giros', { keyPath: 'id' });
                    giroStore.createIndex('fraccion', 'fraccion', { unique: false });
                }

                // ============ NEW: Phase 3/4 Stores ============

                // Documentos Store (KYC Document Management)
                if (!db.objectStoreNames.contains('documentos')) {
                    const docStore = db.createObjectStore('documentos', { keyPath: 'id', autoIncrement: true });
                    docStore.createIndex('playercode', 'playercode', { unique: false });
                    docStore.createIndex('tipo', 'tipo', { unique: false });
                    docStore.createIndex('empresaId', 'empresaId', { unique: false });
                }

                // Notifications Store
                if (!db.objectStoreNames.contains('notifications')) {
                    const notifStore = db.createObjectStore('notifications', { keyPath: 'id', autoIncrement: true });
                    notifStore.createIndex('tipo', 'tipo', { unique: false });
                    notifStore.createIndex('leida', 'leida', { unique: false });
                    notifStore.createIndex('empresaId', 'empresaId', { unique: false });
                }

                // Tickets Store (Support System)
                if (!db.objectStoreNames.contains('tickets')) {
                    const ticketStore = db.createObjectStore('tickets', { keyPath: 'id' });
                    ticketStore.createIndex('numero', 'numero', { unique: true });
                    ticketStore.createIndex('estado', 'estado', { unique: false });
                    ticketStore.createIndex('creador', 'creador', { unique: false });
                    ticketStore.createIndex('empresaId', 'empresaId', { unique: false });
                }

                console.log('📦 DB Schema Created/Updated to v6 (Support System)');
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('✅ DB Connected');
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error('❌ DB Error:', event.target.error);
                reject(event.target.error);
            };
        });
    },

    async addItems(storeName, items) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readwrite');
            const store = tx.objectStore(storeName);
            items.forEach(item => store.put(item));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async get(storeName, key) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async delete(storeName, key) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async getByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readonly');
            const store = tx.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getByPeriodRange(startId, endId) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['operations'], 'readonly');
            const store = tx.objectStore('operations');
            const index = store.index('periodoId');
            const range = IDBKeyRange.bound(startId, endId);
            const request = index.getAll(range);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async clearStore(storeName) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readwrite');
            tx.objectStore(storeName).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    async count(storeName) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
};
