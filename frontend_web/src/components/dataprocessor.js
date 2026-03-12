/**
 * Service de traitement des donnees
 * Regroupe les infrastructures par code_piste et calcule les statistiques
 */

class DataProcessor {

  /**
   * Creer un mapping chaussee_id -> code_piste
   */
  createChausseesMapping(chaussees) {
    const mapping = {};

    if (!chaussees || !Array.isArray(chaussees)) {
      return mapping;
    }

    chaussees.forEach(chaussee => {
      const chausseeId = chaussee.fid || chaussee.id;
      const codePiste = chaussee.code_piste || chaussee.properties?.code_piste;

      if (chausseeId && codePiste) {
        mapping[chausseeId] = codePiste;
      }
    });

    return mapping;
  }

  /**
   * Extraire le code_piste d'un objet (GeoJSON ou JSON simple)
   */
  extractCodePiste(item) {
    return item.code_piste ||
      item.properties?.code_piste ||
      null;
  }

  /**
   * Calculer la longueur en km pour les chaussees
   */
  calculateChausseeLength(chaussee) {
    if (chaussee.length_km || chaussee.properties?.length_km) {
      return parseFloat(chaussee.length_km || chaussee.properties.length_km);
    }
    return 0;
  }

  /**
   * Regrouper les infrastructures par code_piste
   */
  groupByPiste(infrastructureData) {

    const pistesCounts = {};
    const pistesInfo = {};

    if (infrastructureData.pistes && Array.isArray(infrastructureData.pistes)) {
      infrastructureData.pistes.forEach(piste => {
        const codePiste = this.extractCodePiste(piste);
        if (!codePiste) return;

        pistesInfo[codePiste] = {
          id: piste.id || piste.properties?.id,
          code_piste: codePiste,
          created_at: piste.created_at || piste.properties?.created_at,
          utilisateur: this.extractUtilisateur(piste),
          commune: this.extractCommune(piste),
          prefecture_nom: piste.prefecture_nom || piste.properties?.prefecture_nom || "N/A",
          region_nom: piste.region_nom || piste.properties?.region_nom || "N/A",
          kilometrage: this.extractKilometrage(piste),
          region_id: parseInt(piste.region_id || piste.properties?.region_id) || null,
          prefecture_id: parseInt(piste.prefecture_id || piste.properties?.prefecture_id) || null,
          commune_id: parseInt(piste.commune_id || piste.properties?.commune_id || piste.properties?.communes_rurales_id || piste.properties?.commune_rural_id) || null
        };

        pistesCounts[codePiste] = {
          chaussees: { count: 0, km: 0, types: {} },
          buses: 0,
          dalots: 0,
          ponts: 0,
          passages_submersibles: 0,
          bacs: 0,
          ecoles: 0,
          marches: 0,
          services_santes: 0,
          batiments_administratifs: 0,
          infrastructures_hydrauliques: 0,
          localites: 0,
          autres_infrastructures: 0,
          ppr_itial: 0,
          enquete_polygone: 0,
          enquete_polygone_superficie: 0,
          points_coupures: 0,
          points_critiques: 0
        };
      });
    }


    // Compter les chaussees (avec km) groupé par type
    if (infrastructureData.chaussees && Array.isArray(infrastructureData.chaussees)) {
      infrastructureData.chaussees.forEach(item => {
        const codePiste = this.extractCodePiste(item);
        if (codePiste && pistesCounts[codePiste]) {
          const km = this.calculateChausseeLength(item);
          const type = item.type_chaus || item.properties?.type_chaus || 'N/A';
          pistesCounts[codePiste].chaussees.count++;
          pistesCounts[codePiste].chaussees.km += km;
          if (!pistesCounts[codePiste].chaussees.types[type]) {
            pistesCounts[codePiste].chaussees.types[type] = { count: 0, km: 0 };
          }
          pistesCounts[codePiste].chaussees.types[type].count++;
          pistesCounts[codePiste].chaussees.types[type].km += km;
        }
      });
    } else {
    }

    const typesToCount = [
      'buses', 'dalots', 'ponts', 'passages_submersibles', 'bacs',
      'ecoles', 'marches', 'services_santes', 'batiments_administratifs',
      'infrastructures_hydrauliques', 'localites', 'autres_infrastructures',
      'ppr_itial', 'points_coupures', 'points_critiques'
    ];

    typesToCount.forEach(type => {
      if (infrastructureData[type] && Array.isArray(infrastructureData[type])) {
        infrastructureData[type].forEach(item => {
          const codePiste = this.extractCodePiste(item);
          if (codePiste && pistesCounts[codePiste]) {
            pistesCounts[codePiste][type]++;
          }
        });
      }
    });

    // Traitement spécial enquete_polygone : count + cumul superficie
    if (infrastructureData.enquete_polygone && Array.isArray(infrastructureData.enquete_polygone)) {
      infrastructureData.enquete_polygone.forEach(item => {
        const codePiste = this.extractCodePiste(item);
        if (codePiste && pistesCounts[codePiste]) {
          pistesCounts[codePiste].enquete_polygone++;
          const superficie = parseFloat(
            item.superficie_en_ha || item.properties?.superficie_en_ha || 0
          );
          if (!isNaN(superficie)) {
            pistesCounts[codePiste].enquete_polygone_superficie += superficie;
          }
        }
      });
    }

    const result = {};
    Object.keys(pistesInfo).forEach(codePiste => {
      result[codePiste] = {
        ...pistesInfo[codePiste],
        ...pistesCounts[codePiste]
      };
    });

    return result;
  }

  /**
   * Calculer les statistiques globales
   */
  calculateGlobalStats(infrastructureData) {

    const stats = {
      pistes: 0,
      chaussees: 0,
      buses: 0,
      dalots: 0,
      ponts: 0,
      passages_submersibles: 0,
      bacs: 0,
      ecoles: 0,
      marches: 0,
      services_santes: 0,
      batiments_administratifs: 0,
      infrastructures_hydrauliques: 0,
      localites: 0,
      autres_infrastructures: 0,
      ppr_itial: 0,
      enquete_polygone: 0,
      points_coupures: 0,
      points_critiques: 0
    };

    Object.keys(stats).forEach(type => {
      if (infrastructureData[type] && Array.isArray(infrastructureData[type])) {
        stats[type] = infrastructureData[type].length;
      }
    });

    return stats;
  }

  /**
   * Normaliser les donnees (convertir GeoJSON FeatureCollection en objet categorise si necessaire)
   */
  normalizeData(data) {
    if (!data) return {};

    // Si c'est deja le format categorise { pistes: [], chaussees: [], ... }
    if (!data.type || data.type !== 'FeatureCollection') {
      return data;
    }

    const organized = {};

    if (Array.isArray(data.features)) {
      data.features.forEach(feature => {
        const type = feature.properties?.type;
        if (type) {
          if (!organized[type]) organized[type] = [];
          organized[type].push(feature);
        }
      });
    }

    return organized;
  }

  /**
   * Traiter toutes les donnees
   */
  processAll(rawData) {
    const startTime = performance.now();

    try {
      const infrastructureData = this.normalizeData(rawData);
      const chausseesMapping = this.createChausseesMapping(infrastructureData.chaussees);
      const pistesCounts = this.groupByPiste(infrastructureData);
      const globalStats = this.calculateGlobalStats(infrastructureData);

      const endTime = performance.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);


      return {
        success: true,
        pistesCounts,
        globalStats,
        chausseesMapping,
        duration
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Extraire les informations utilisateur
   */
  extractUtilisateur(piste) {
    const obj = piste.properties || piste;

    if (obj.utilisateur) {
      return obj.utilisateur;
    }

    if (obj.login_id) {
      const login = obj.login_id;
      if (typeof login === 'object') {
        return `${login.nom || ''} ${login.prenom || ''}`.trim();
      }
    }

    return "Non assigne";
  }

  /**
   * Extraire les informations de commune
   */
  extractCommune(piste) {
    const obj = piste.properties || piste;

    // 1. Check direct name property (GeoJSON format)
    if (obj.commune_nom) {
      return obj.commune_nom;
    }

    // 2. Check commune object or legacy field
    if (obj.commune) {
      return obj.commune;
    }

    // 3. Check nested relationship object
    if (obj.communes_rurales_id) {
      const commune = obj.communes_rurales_id;
      if (typeof commune === 'object') {
        return commune.nom || 'N/A';
      }
    }

    return "N/A";
  }

  /**
   * Extraire le kilometrage
   */

  /**
     * Helper: Calculate distance between two points (Haversine formula)
     */
  getDist(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Helper: Calculate total length of a geometry
   */
  calculateGeoLength(geometry) {
    if (!geometry || !geometry.coordinates) return 0;

    let totalKm = 0;
    const type = geometry.type;
    const coords = geometry.coordinates;

    const calcLine = (points) => {
      let dist = 0;
      for (let i = 0; i < points.length - 1; i++) {
        // GeoJSON is [lng, lat]
        dist += this.getDist(points[i][1], points[i][0], points[i + 1][1], points[i + 1][0]);
      }
      return dist;
    };

    if (type === 'LineString') {
      totalKm = calcLine(coords);
    } else if (type === 'MultiLineString') {
      coords.forEach(line => {
        totalKm += calcLine(line);
      });
    }

    return totalKm;
  }

  extractKilometrage(piste) {
    const obj = piste.properties || piste;

    // 1. Try DB properties first
    if (obj.kilometrage !== undefined && obj.kilometrage !== null) {
      return parseFloat(obj.kilometrage) || 0;
    }

    if (obj.length_km !== undefined && obj.length_km !== null) {
      return parseFloat(obj.length_km) || 0;
    }

    // 2. If no DB property, calculate from Geometry
    if (piste.geometry) {
      return this.calculateGeoLength(piste.geometry);
    }

    return 0;
  }

  /**
   * Filtrer les donnees par commune
   */
  filterByCommune(pistesCounts, communeId) {
    if (!communeId) return pistesCounts;

    const filtered = {};
    Object.keys(pistesCounts).forEach(codePiste => {
      const piste = pistesCounts[codePiste];
      if (piste.commune_id === communeId) {
        filtered[codePiste] = piste;
      }
    });

    return filtered;
  }

  /**
   * Convertir pistesCounts en array pour le Dashboard
   */
  pistesCountsToArray(pistesCounts) {
    return Object.values(pistesCounts);
  }
}

const dataprocessor = new DataProcessor();
export default dataprocessor;