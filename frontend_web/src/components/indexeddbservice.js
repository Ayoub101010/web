/**
 * Service de cache IndexedDB persistant
 * Permet de stocker de gros volumes de donnees sans limite de taille
 */

class IndexedDBService {
  constructor() {
    this.dbName = 'GeoPPRCache';
    this.version = 2;
    this.db = null;
    this.initPromise = null;
  }

  async init() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains('infrastructure')) {
          db.createObjectStore('infrastructure', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('processed')) {
          db.createObjectStore('processed', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache');
        }
      };
    });

    return this.initPromise;
  }

  async save(storeName, key, data) {
    try {
      if (!this.db) await this.init();

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put({
          id: key,
          data: data,
          timestamp: Date.now()
        });

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      return false;
    }
  }

  async get(storeName, key) {
    try {
      if (!this.db) await this.init();

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => {
          const result = request.result;
          resolve(result ? result.data : null);
        };

        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      return null;
    }
  }

  async clear() {
    try {
      if (!this.db) await this.init();

      const stores = ['infrastructure', 'processed'];

      for (const storeName of stores) {
        await new Promise((resolve, reject) => {
          const transaction = this.db.transaction([storeName], 'readwrite');
          const store = transaction.objectStore(storeName);
          const request = store.clear();

          request.onsuccess = () => resolve(true);
          request.onerror = () => reject(request.error);
        });
      }

      return true;
    } catch (error) {
      return false;
    }
  }
}

const indexeddbservice = new IndexedDBService();
export default indexeddbservice;