/**
 * Service de cache simple avec sessionStorage
 * Se vide automatiquement à la fermeture du navigateur
 * Partagé entre Dashboard et MapContainer
 */

class SessionCacheService {
  constructor() {
    this.KEYS = {
      // Données brutes API (partagées)
      INFRASTRUCTURE_DATA: 'infra_raw_data',
      
      // Données traitées Dashboard
      DASHBOARD_DATA: 'dashboard_processed',
      
      // Données carte (GeoJSON)
      MAP_DATA: 'map_geojson',
      
      // Hiérarchie géographique
      HIERARCHY: 'geo_hierarchy',
      
      // Flag de chargement
      LOADING: 'is_loading'
    };
  }

  // ==================== INFRASTRUCTURE DATA (brut API) ====================
  
  saveInfrastructureData(data) {
    try {
      sessionStorage.setItem(
        this.KEYS.INFRASTRUCTURE_DATA,
        JSON.stringify({
          data,
          timestamp: Date.now()
        })
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  getInfrastructureData() {
    try {
      const cached = sessionStorage.getItem(this.KEYS.INFRASTRUCTURE_DATA);
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.data;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  // ==================== DASHBOARD DATA (traité) ====================
  
  saveDashboardData(pistesCounts, globalStats) {
    try {
      sessionStorage.setItem(
        this.KEYS.DASHBOARD_DATA,
        JSON.stringify({
          pistesCounts,
          globalStats,
          timestamp: Date.now()
        })
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  getDashboardData() {
    try {
      const cached = sessionStorage.getItem(this.KEYS.DASHBOARD_DATA);
      if (cached) {
        return JSON.parse(cached);
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  // ==================== MAP DATA (GeoJSON) ====================
  
  saveMapData(geoJsonData) {
    try {
      sessionStorage.setItem(
        this.KEYS.MAP_DATA,
        JSON.stringify({
          data: geoJsonData,
          timestamp: Date.now()
        })
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  getMapData() {
    try {
      const cached = sessionStorage.getItem(this.KEYS.MAP_DATA);
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.data;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  // ==================== HIERARCHY ====================
  
  saveHierarchy(hierarchy) {
    try {
      sessionStorage.setItem(
        this.KEYS.HIERARCHY,
        JSON.stringify({
          data: hierarchy,
          timestamp: Date.now()
        })
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  getHierarchy() {
    try {
      const cached = sessionStorage.getItem(this.KEYS.HIERARCHY);
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.data;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  // ==================== LOADING LOCK ====================
  
  setLoading(isLoading) {
    sessionStorage.setItem(this.KEYS.LOADING, isLoading ? 'true' : 'false');
  }

  isLoading() {
    return sessionStorage.getItem(this.KEYS.LOADING) === 'true';
  }

  // ==================== UTILITIES ====================
  
  /**
   * Vérifier si toutes les données essentielles existent
   */
  hasCompleteCache() {
    return this.getInfrastructureData() !== null &&
           this.getMapData() !== null &&
           this.getHierarchy() !== null;
  }

  /**
   * Vider tout le cache
   */
  clear() {
    try {
      Object.values(this.KEYS).forEach(key => {
        sessionStorage.removeItem(key);
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Info sur le cache
   */
  getInfo() {
    return {
      hasInfraData: this.getInfrastructureData() !== null,
      hasDashboardData: this.getDashboardData() !== null,
      hasMapData: this.getMapData() !== null,
      hasHierarchy: this.getHierarchy() !== null,
      isLoading: this.isLoading()
    };
  }
}

const sessionCache = new SessionCacheService();
export default sessionCache;