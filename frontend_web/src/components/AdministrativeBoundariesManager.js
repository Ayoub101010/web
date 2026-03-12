// AdministrativeBoundariesManager.js
// Gestionnaire des limites administratives sur la carte Leaflet - VERSION FINALE CORRIGÉE

import L from 'leaflet';
import dataservice from './dataservice';

class AdministrativeBoundariesManager {
  constructor(map) {
    this.map = map;
    this.layers = {
      region: null,
      prefecture: null,
      commune: null
    };
    this.data = null;
    this.currentZoom = map.getZoom();
    this.enabled = {
      region: true,
      prefecture: true,
      commune: true
    };
    this.onBoundaryClick = null;
    this.lastFilterKey = null;

    // Styles pour chaque niveau
    this.styles = {
      region: {
        color: '#E74C3C',
        weight: 4,
        fillOpacity: 0,
        opacity: 1,
        dashArray: '10, 5'
      },
      prefecture: {
        color: '#3498DB',
        weight: 3,
        fillOpacity: 0,
        opacity: 1,
        dashArray: null
      },
      commune: {
        color: '#2ECC71',
        weight: 2,
        fillOpacity: 0,
        opacity: 1,
        dashArray: null
      }
    };

    // Plages de zoom pour chaque niveau - CORRIGÉES
    this.zoomRanges = {
      region: { min: 6, max: 9 },      // Visible zoom 6-9
      prefecture: { min: 8, max: 11 },  // Visible zoom 8-11
      commune: { min: 10, max: 18 }     // Visible zoom 10-18
    };
  }

  /**
   * Initialiser le gestionnaire
   */
  async initialize() {
    try {

      // Charger les données initiales
      await this.loadBoundaries();

      // Écouter les changements de zoom
      this.map.on('zoomend', () => {
        this.currentZoom = this.map.getZoom();
        this.updateVisibility();
      });

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Charger les limites depuis l'API
   */
  async loadBoundaries(regionId = null, prefectureId = null) {
    try {
      const zoom = this.map.getZoom();

      const result = await dataservice.loadAdministrativeBoundaries(zoom, null, null);

      if (result.success && result.data) {
        this.data = result.data;
        this.renderBoundaries();
      } else {
      }
    } catch (error) {
    }
  }



  /**
   * Afficher les limites sur la carte
   */
  renderBoundaries() {
    if (!this.data || !this.data.features) return;

    // Grouper les features par type
    const grouped = {
      region: [],
      prefecture: [],
      commune: []
    };

    this.data.features.forEach(feature => {
      const type = feature.properties.type;
      if (grouped[type]) {
        grouped[type].push(feature);
      }
    });

    // Créer les couches
    Object.keys(grouped).forEach(type => {
      if (grouped[type].length > 0) {
        this.createLayer(type, grouped[type]);
      }
    });

    // Mettre à jour la visibilité
    this.updateVisibility();
  }

  /**
   * Créer une couche Leaflet pour un type
   */
  createLayer(type, features) {
    // Supprimer l'ancienne couche si elle existe
    if (this.layers[type]) {
      try {
        // Vider la couche avant de la retirer
        if (this.layers[type].clearLayers && typeof this.layers[type].clearLayers === 'function') {
          this.layers[type].clearLayers();
        }

        // Retirer de la carte si elle existe toujours
        if (this.map && this.map._loaded && this.map.hasLayer(this.layers[type])) {
          this.map.removeLayer(this.layers[type]);
        }

        // Nettoyer le renderer
        const oldLayer = this.layers[type];
        if (oldLayer._renderer && oldLayer._renderer._container) {
          L.DomEvent.off(oldLayer._renderer._container);
        }

      } catch (error) {
      }
      this.layers[type] = null;
    }

    // Vérifier que la carte existe avant de créer
    if (!this.map || !this.map._loaded) {
      return;
    }

    // Créer la nouvelle couche
    try {
      this.layers[type] = L.geoJSON(features, {
        style: (feature) => this.styles[type],
        interactive: false, //  Empêcher de bloquer les clics sur les autres éléments
        onEachFeature: (feature, layer) => {
          this.bindEvents(feature, layer, type);
        }
      });
    } catch (error) {
    }
  }

  /**
   * Lier les événements à une feature
   */
  bindEvents(feature, layer, type) {
    const properties = feature.properties;

    // Afficher le label automatiquement
    const labelContent = properties.nom;

    try {
      layer.bindTooltip(labelContent, {
        permanent: true,
        direction: 'center',
        className: `boundary-label boundary-label-${type}`,
        opacity: 0.9
      });
    } catch (error) {
    }
  }

  /**
   * Mettre à jour la visibilité des couches selon le zoom - VERSION SIMPLIFIÉE
   */
  updateVisibility() {
    const zoom = this.currentZoom;

    Object.keys(this.layers).forEach(type => {
      const layer = this.layers[type];
      if (!layer) return;

      // Vérifier que la carte existe toujours
      if (!this.map || !this.map._loaded) {
        return;
      }

      const range = this.zoomRanges[type];
      const shouldShow = this.enabled[type] && zoom >= range.min && zoom <= range.max;
      const isCurrentlyVisible = this.map.hasLayer(layer);

      try {
        if (shouldShow && !isCurrentlyVisible) {
          this.map.addLayer(layer);
        } else if (!shouldShow && isCurrentlyVisible) {
          this.map.removeLayer(layer);
        }
      } catch (error) {
      }
    });
  }

  /**
   * Activer/désactiver un niveau
   */
  toggleLevel(type, enabled) {
    if (this.enabled[type] === enabled) return;

    // Vérifier que la carte existe
    if (!this.map || !this.map._loaded) {
      return;
    }

    this.enabled[type] = enabled;

    try {
      this.updateVisibility();
    } catch (error) {
    }
  }

  /**
   * Nettoyer toutes les couches
   */
  clearLayers() {
    Object.keys(this.layers).forEach(type => {
      const layer = this.layers[type];
      if (layer) {
        try {
          // ÉTAPE 1 : Vider la couche GeoJSON
          if (layer.clearLayers && typeof layer.clearLayers === 'function') {
            layer.clearLayers();
          }

          // ÉTAPE 2 : Retirer de la carte si présente ET si la carte existe
          if (this.map && this.map._loaded && this.map.hasLayer(layer)) {
            this.map.removeLayer(layer);
          }

          // ÉTAPE 3 : Nettoyer les références internes Leaflet
          if (layer._renderer && layer._renderer._container) {
            L.DomEvent.off(layer._renderer._container);
          }

        } catch (error) {
        }
        this.layers[type] = null;
      }
    });
  }

  /**
   * Détruire le gestionnaire
   */
  destroy() {
    try {
      this.clearLayers();
      if (this.map) {
        this.map.off('zoomend');
      }
    } catch (error) {
    }
  }
}

export default AdministrativeBoundariesManager;