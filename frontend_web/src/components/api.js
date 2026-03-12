
const API_BASE_URL = '/api';


// Cache intelligent au niveau module
class DataCache {
  constructor() {
    this.collectesData = null;
    this.loadingPromise = null;
    this.lastFetchTime = null;
    this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  }

  isValid() {
    if (!this.collectesData || !this.lastFetchTime) return false;
    return (Date.now() - this.lastFetchTime) < this.CACHE_DURATION;
  }

  clear() {
    this.collectesData = null;
    this.loadingPromise = null;
    this.lastFetchTime = null;
  }

  async getCollectesData() {
    if (this.isValid()) {

      return { success: true, data: this.collectesData };
    }

    if (this.loadingPromise) {

      return await this.loadingPromise;
    }

    this.loadingPromise = this._fetchCollectesData();

    try {
      const result = await this.loadingPromise;

      if (result.success) {
        this.collectesData = result.data;
        this.lastFetchTime = Date.now();

      }

      return result;
    } catch (error) {

      return { success: false, error: error.message };
    } finally {
      this.loadingPromise = null;
    }
  }

  async _fetchCollectesData() {
    // ✅ MODIFICATION : S'assurer qu'on charge TOUTES les données sans paramètres
    const url = `${API_BASE_URL}/collectes/`; // Sans aucun paramètre !

    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      throw new Error(`Erreur API collectes: ${error.message}`);
    }
  }
}

// Cache pour la hiérarchie géographique
class GeographyCache {
  constructor() {
    this.hierarchyData = null;
    this.loadingPromise = null;
    this.lastFetchTime = null;
    this.CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
  }

  isValid() {
    if (!this.hierarchyData || !this.lastFetchTime) return false;
    return (Date.now() - this.lastFetchTime) < this.CACHE_DURATION;
  }

  async getHierarchy() {
    if (this.isValid()) {

      return { success: true, data: this.hierarchyData };
    }

    if (this.loadingPromise) {

      return await this.loadingPromise;
    }

    this.loadingPromise = this._fetchHierarchy();

    try {
      const result = await this.loadingPromise;

      if (result.success) {
        this.hierarchyData = result.data;
        this.lastFetchTime = Date.now();

      }

      return result;
    } finally {
      this.loadingPromise = null;
    }
  }

  async _fetchHierarchy() {
    return apiCall('/geography/hierarchy/');
  }
}

// Instances des caches
const dataCache = new DataCache();
const geographyCache = new GeographyCache();

// Fonction utilitaire pour les autres appels API
const apiCall = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {

    return { success: false, error: error.message };
  }
};

// APIs - Déclarées APRÈS les caches
export const collectesAPI = {
  getAll: () => dataCache.getCollectesData(),
  refresh: () => {
    dataCache.clear();
    return dataCache.getCollectesData();
  }
};

export const geographyAPI = {
  getHierarchy: () => geographyCache.getHierarchy()
};

export const statistiquesAPI = {
  getStatsByType: async (filters = {}) => {
    try {


      const result = await dataCache.getCollectesData();

      if (!result.success || !result.data?.features) {
        return { success: false, error: result.error || 'Aucune donnée disponible' };
      }

      const stats = {};

      result.data.features.forEach(feature => {
        const type = feature.properties?.type;
        if (type) {
          stats[type] = (stats[type] || 0) + 1;
        }
      });



      return { success: true, data: stats };

    } catch (error) {

      return { success: false, error: error.message };
    }
  },
};

export const temporalAnalysisAPI = {
  getTemporalData: async (filters = {}) => {
    try {
      const params = new URLSearchParams();

      if (filters.period_type) params.append('period_type', filters.period_type);
      if (filters.days_back) params.append('days_back', filters.days_back);
      if (filters.commune_id) params.append('commune_id', filters.commune_id);
      if (filters.prefecture_id) params.append('prefecture_id', filters.prefecture_id);
      if (filters.region_id) params.append('region_id', filters.region_id);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
      if (filters.year) params.append('year', filters.year);
      if (filters.month) params.append('month', filters.month);
      if (filters.day) params.append('day', filters.day);

      if (filters.types && filters.types.length > 0) {
        filters.types.forEach(type => params.append('types', type));
      }

      return apiCall(`/temporal-analysis/?${params.toString()}`);
    } catch (error) {

      return { success: false, error: error.message };
    }
  }
};
// REMPLACEZ geographicAPI par ce code dans api.js :

export const geographicAPI = {
  getRegions: async () => {
    try {
      const result = await apiCall('/regions/');

      // L'API retourne : {success: true, data: {count, results: {features: [...]}}}
      if (result.success && result.data?.results?.features) {
        const regions = result.data.results.features.map(f => ({
          id: f.id,
          nom: f.properties?.nom || 'Sans nom'
        }));
        return { success: true, data: regions };
      }

      return { success: false, error: 'Format de données invalide', data: [] };
    } catch (error) {
      return { success: false, error: error.message, data: [] };
    }
  },

  getPrefectures: async (regionId) => {
    try {
      const url = regionId ? `/prefectures/?region_id=${regionId}` : '/prefectures/';
      const result = await apiCall(url);

      if (result.success && result.data?.results?.features) {
        const prefectures = result.data.results.features.map(f => ({
          id: f.id,
          nom: f.properties?.nom || 'Sans nom'
        }));
        return { success: true, data: prefectures };
      }

      return { success: false, error: 'Format de données invalide', data: [] };
    } catch (error) {
      return { success: false, error: error.message, data: [] };
    }
  },

  getCommunes: async (prefectureId) => {
    try {
      const url = prefectureId ? `/communes_rurales/?prefecture_id=${prefectureId}` : '/communes_rurales/';
      const result = await apiCall(url);

      if (result.success && result.data?.results?.features) {
        const communes = result.data.results.features.map(f => ({
          id: f.id,
          nom: f.properties?.nom || 'Sans nom'
        }));
        return { success: true, data: communes };
      }

      return { success: false, error: 'Format de données invalide', data: [] };
    } catch (error) {
      return { success: false, error: error.message, data: [] };
    }
  }
};

// Export par défaut - Déclaré À LA FIN
const api = {
  collectes: collectesAPI,
  statistiques: statistiquesAPI,
  temporalAnalysis: temporalAnalysisAPI,
  geography: geographyAPI,
  geographic: geographicAPI,
};

export default api;