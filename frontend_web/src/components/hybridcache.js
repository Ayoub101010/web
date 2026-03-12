/**
 * Cache hybride: IndexedDB (capacité) + comportement sessionStorage (se vide à la fermeture)
 * Utilise un flag dans sessionStorage pour savoir si c'est une nouvelle session
 */

const DB_NAME = 'GeoPPRCache';
const DB_VERSION = 2;
const SESSION_FLAG_KEY = 'geoppr_session_active';

class HybridCacheService {
  constructor() {
    this.db = null;
    this.initPromise = null;
    this.version = DB_VERSION;

    // Vérifier si c'est une nouvelle session
    this.isNewSession = !sessionStorage.getItem(SESSION_FLAG_KEY);

    if (this.isNewSession) {
      sessionStorage.setItem(SESSION_FLAG_KEY, 'true');
    } else {
    }
  }

  async init() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, this.version);

      request.onerror = () => reject(request.error);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Créer les stores
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache');
        }

        if (!db.objectStoreNames.contains('infrastructure')) {
          db.createObjectStore('infrastructure', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('processed')) {
          db.createObjectStore('processed', { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;

        // ✅ TOUJOURS attendre que la DB soit prête (nouvelle session OU pas)
        // Car même en session existante, les transactions peuvent échouer si appelées trop tôt
        const finishInit = () => {
          if (this.isNewSession) {
            // Nouvelle session: vider le cache
            this.clearAll().then(() => {
              this.isNewSession = false;
              resolve(this.db);
            }).catch((err) => {
              resolve(this.db);
            });
          } else {
            // Session existante: juste résoudre
            resolve(this.db);
          }
        };

        // ✅ Attendre 200ms dans TOUS les cas pour que la DB soit stable
        setTimeout(finishInit, 200);
      };
    });

    return this.initPromise;
  }

  async save(key, data) {
    try {
      if (!this.db) await this.init();

      return new Promise((resolve, reject) => {
        try {
          const transaction = this.db.transaction(['cache'], 'readwrite');
          const store = transaction.objectStore('cache');
          const request = store.put({
            data: data,
            timestamp: Date.now()
          }, key);

          request.onsuccess = () => {
            resolve(true);
          };
          request.onerror = () => reject(request.error);
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      return false;
    }
  }

  async get(key) {
    try {
      if (!this.db) await this.init();

      return new Promise((resolve, reject) => {
        try {
          const transaction = this.db.transaction(['cache'], 'readonly');
          const store = transaction.objectStore('cache');
          const request = store.get(key);

          request.onsuccess = () => {
            const result = request.result;
            if (result) {
              resolve(result.data);
            } else {
              resolve(null);
            }
          };
          request.onerror = () => reject(request.error);
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      return null;
    }
  }

  async clearAll() {
    try {
      if (!this.db) {
        return true;
      }

      if (!this.db.objectStoreNames.contains('cache')) {
        return true;
      }

      return new Promise((resolve, reject) => {
        try {
          const transaction = this.db.transaction(['cache'], 'readwrite');
          const store = transaction.objectStore('cache');
          const request = store.clear();

          request.onsuccess = () => {
            resolve(true);
          };
          request.onerror = () => {
            reject(request.error);
          };
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      return false;
    }
  }

  // ==================== API simplifiée ====================

  async saveInfrastructureData(data) {
    return await this.save('infrastructure_data', data);
  }

  async getInfrastructureData() {
    return await this.get('infrastructure_data');
  }

  async saveDashboardData(pistesCounts, globalStats) {
    return await this.save('dashboard_data', {
      pistesCounts,
      globalStats,
      timestamp: Date.now()
    });
  }

  async getDashboardData() {
    return await this.get('dashboard_data');
  }

  async saveMapData(geoJsonData) {
    return await this.save('map_data', geoJsonData);
  }

  async getMapData() {
    return await this.get('map_data');
  }

  async saveHierarchy(hierarchy) {
    return await this.save('hierarchy', hierarchy);
  }

  async getHierarchy() {
    return await this.get('hierarchy');
  }
}

const hybridCache = new HybridCacheService();
export default hybridCache;