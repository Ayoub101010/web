import authService from './authService';

const API_BASE_URL = "http://localhost:8000/api";

// Configuration des endpoints (sans /infrastructure/)
const ENDPOINTS = {
  // Base
  pistes: "/pistes/",

  // Voirie
  chaussees: "/chaussees/",

  // Ouvrages hydrauliques
  buses: "/buses/",
  dalots: "/dalots/",
  ponts: "/ponts/",
  passages_submersibles: "/passages_submersibles/",
  bacs: "/bacs/",

  // Infrastructures sociales
  ecoles: "/ecoles/",
  marches: "/marches/",
  services_santes: "/services_santes/",
  batiments_administratifs: "/batiments_administratifs/",
  infrastructures_hydrauliques: "/infrastructures_hydrauliques/",
  localites: "/localites/",
  autres_infrastructures: "/autres_infrastructures/",

  // Points de surveillance
  points_coupures: "/points_coupures/",
  points_critiques: "/points_critiques/",

  // Enquête
  ppr_itial: "/ppr_itial/",
  enquete_polygone: "/enquete_polygone/",

  // Dashboard spécifique
  pistes_web: "/pistes/web/",
};

// Types d'infrastructures communs (carte + dashboard + suivi données)
const INFRASTRUCTURE_TYPES = [
  "pistes",
  "chaussees",
  "buses",
  "dalots",
  "ponts",
  "passages_submersibles",
  "bacs",
  "ecoles",
  "marches",
  "services_santes",
  "batiments_administratifs",
  "infrastructures_hydrauliques",
  "localites",
  "autres_infrastructures",
  "points_coupures",
  "points_critiques",
  "ppr_itial",
  "enquete_polygone",
];

// Types pour la carte (identique — points_coupures/critiques inclus dans INFRASTRUCTURE_TYPES)
const MAP_TYPES = INFRASTRUCTURE_TYPES;

class DataService {
  /**
   * Charger un endpoint spécifique avec filtres optionnels
   */
  async fetchEndpoint(type, filters = {}) {
    const params = new URLSearchParams();

    // Ajouter les filtres géographiques s'ils existent (Support Simple ou Array)
    const appendFilter = (key, value) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach(v => { if (v) params.append(key, v); });
      } else {
        params.append(key, value);
      }
    };

    appendFilter('region_id', filters.region_id || filters.region_ids);
    appendFilter('prefecture_id', filters.prefecture_id || filters.prefecture_ids);
    appendFilter('commune_id', filters.commune_id || filters.commune_ids);

    const queryStr = params.toString();
    const url = `${API_BASE_URL}${ENDPOINTS[type]}${queryStr ? `?${queryStr}` : ''}`;

    try {

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...authService.getAuthHeader(),
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const count = data.length || data.features?.length || 0;


      if (type === 'sites' || type === 'site_enquete') {
      }

      return {
        type,
        success: true,
        data: data.features || data,
        count,
      };
    } catch (error) {
      return {
        type,
        success: false,
        error: error.message,
        data: [],
        count: 0
      };
    }
  }

  /**
   * Charger toutes les infrastructures (14 types - Dashboard + Suivi données)
   */
  async loadAllInfrastructures(filters = {}) {
    const startTime = performance.now();

    try {
      const promises = INFRASTRUCTURE_TYPES.map((type) =>
        this.fetchEndpoint(type, filters)
      );
      const results = await Promise.all(promises);

      const endTime = performance.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);

      const organizedData = {};
      let totalCount = 0;
      let successCount = 0;

      results.forEach((result) => {
        organizedData[result.type] = result.data;
        if (result.success) {
          successCount++;
          totalCount += result.count;
        }
      });

      return {
        success: successCount > 0,
        duration,
        totalCount,
        data: organizedData,
        details: results,
      };
    } catch (error) {
      return {
        success: false,
        duration: 0,
        totalCount: 0,
        data: {},
        error: error.message,
      };
    }
  }

  /**
   * Charger UN SEUL type d'infrastructure avec filtres
   */
  async fetchInfrastructureData(type, filters = {}) {
    if (!ENDPOINTS[type]) {
      return {
        success: false,
        error: "Type inconnu",
        data: [],
      };
    }
    return this.fetchEndpoint(type, filters);
  }

  /**
   * Charger toutes les données pour la carte (APIs séparées en parallèle)
   */
  async loadMapData(filters = {}) {
    const startTime = performance.now();

    try {
      // Charger tous les types (carte = 16 infra + 2 surveillance) en parallèle
      const promises = MAP_TYPES.map((type) => this.fetchEndpoint(type, filters));
      const results = await Promise.all(promises);

      // Fusionner en une seule FeatureCollection GeoJSON avec properties.type
      const allFeatures = [];
      let successCount = 0;

      results.forEach((result) => {
        if (result.success && Array.isArray(result.data)) {
          successCount++;
          result.data.forEach((feature) => {
            // Ajouter properties.type pour que MapContainer identifie le type
            const props = feature.properties
              ? { ...feature.properties, type: result.type }
              : { type: result.type };
            allFeatures.push({ ...feature, properties: props });
          });
        }
      });

      const geojson = { type: 'FeatureCollection', features: allFeatures };
      const duration = ((performance.now() - startTime) / 1000).toFixed(2);


      return {
        success: successCount > 0,
        isGeoJSON: true,
        data: geojson,
        totalCount: allFeatures.length,
        duration,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        data: { type: 'FeatureCollection', features: [] },
      };
    }
  }

  /**
   * Recharger UNIQUEMENT un type (pour refresh partiel) avec filtres
   */
  async reloadType(type, filters = {}) {
    if (!ENDPOINTS[type]) {
      return {
        success: false,
        error: "Type inconnu",
        data: [],
      };
    }
    return this.fetchEndpoint(type, filters);
  }

  async reloadAll(filters = {}) {
    return this.loadAllInfrastructures(filters);
  }

  /**
   * Charger les limites administratives avec cache sessionStorage
   */
  async loadAdministrativeBoundaries(zoom, regionId = null, prefectureId = null) {
    const params = new URLSearchParams();
    if (zoom) params.append('zoom', zoom);
    if (regionId) params.append('region_id', regionId);
    if (prefectureId) params.append('prefecture_id', prefectureId);

    // ✅ CLÉ DE CACHE
    const cacheKey = `admin_boundaries_${regionId || 'all'}_${prefectureId || 'all'}`;

    const url = `${API_BASE_URL}/geography/boundaries/?${params.toString()}`;

    try {

      // ✅ VÉRIFIER LE CACHE SESSION
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          const count = cachedData.features?.length || 0;
          return {
            success: true,
            data: cachedData,
            count,
          };
        } catch (parseError) {
          sessionStorage.removeItem(cacheKey);
        }
      }


      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...authService.getAuthHeader(),
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const count = data.features?.length || 0;


      // ✅ METTRE EN CACHE SESSION
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(data));
      } catch (storageError) {
      }

      return {
        success: true,
        data: data,
        count,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        data: { type: 'FeatureCollection', features: [] },
        count: 0,
      };
    }
  }
}

/**
 * Mettre à jour une ligne d'une table via l'API générique :
 * PUT /api/update/<table>/<id>/
 */
export async function updateRow(table, id, updatedFields) {
  const url = `${API_BASE_URL}/update/${table}/${id}/`;


  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...authService.getAuthHeader(),
      },
      body: JSON.stringify(updatedFields),
    });

    const result = await response.json();

    if (!response.ok) {
      return { success: false, error: result.error || "Erreur inconnue" };
    }

    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

const dataservice = new DataService();
export default dataservice;
export { INFRASTRUCTURE_TYPES, MAP_TYPES, ENDPOINTS };