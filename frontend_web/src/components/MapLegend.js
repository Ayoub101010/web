import React, { useState, useEffect } from 'react';
import './MapLegend.css';

const MapLegend = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [visibleTypes, setVisibleTypes] = useState(new Set());

  //  Configuration synchronisée avec MapContainer.js
  const legendItems = [
    // Infrastructures de transport
    {
      category: "Transport & Ouvrages",
      items: [
        { type: "pistes", label: "Pistes", icon: "road", color: "#FF6B00", isDashed: true },
        { type: "chaussees", label: "Chaussées", icon: "road", color: "#8e44ad", isLine: true },
        { type: "ponts", label: "Ponts", icon: "bridge", color: "#9B59B6" },
        { type: "buses", label: "Buses", icon: "dot-circle", color: "#7F8C8D" },
        { type: "dalots", label: "Dalots", icon: "water", color: "#3498DB" },
        { type: "bacs", label: "Bacs", icon: "ship", color: "#F39C12", showIcon: true },
        { type: "passages_submersibles", label: "Passages submersibles", icon: "water", color: "#1ABC9C", showIcon: true },
        { type: "points_coupures", label: "Points de coupure", icon: "times-circle", color: "#C0392B" },
        { type: "points_critiques", label: "Points critiques", icon: "exclamation-triangle", color: "#D35400" }
      ]
    },
    // Infrastructures rurales
    {
      category: "Infrastructures Rurales",
      items: [
        { type: "localites", label: "Localités", icon: "home", color: "#E67E22" },
        { type: "ecoles", label: "Écoles", icon: "graduation-cap", color: "#27AE60" },
        { type: "services_santes", label: "Services de santé", icon: "hospital", color: "#E74C3C" },
        { type: "marches", label: "Marchés", icon: "shopping-cart", color: "#F1C40F" },
        { type: "batiments_administratifs", label: "Bât. administratifs", icon: "building", color: "#34495E" },
        { type: "infrastructures_hydrauliques", label: "Infra. hydrauliques", icon: "tint", color: "#3498DB" },
        { type: "autres_infrastructures", label: "Autres infrastructures", icon: "map-pin", color: "#95A5A6" }
      ]
    },
    // Enquête
    {
      category: "Enquête",
      items: [
        { type: "ppr_itial", label: "site de plaine", icon: "dot-circle", color: "#000000" },
        { type: "enquete_polygone", label: "zones de plaine", icon: "draw-polygon", color: "#90EE90", isPolygon: true }
      ]
    }
  ];

  //  Surveiller les filtres actifs avec une meilleure synchronisation
  useEffect(() => {
    const updateVisibleTypes = () => {
      const checkedTypes = Array.from(
        document.querySelectorAll('.filter-checkbox-group input[type="checkbox"]:checked')
      ).map(cb => cb.id);

      setVisibleTypes(new Set(checkedTypes));
    };

    // Mise à jour initiale avec délai pour laisser les filtres s'initialiser
    const initialTimeout = setTimeout(updateVisibleTypes, 500);

    // Écouter les changements de filtres
    const filterInputs = document.querySelectorAll('.filter-checkbox-group input[type="checkbox"]');
    filterInputs.forEach(input => {
      input.addEventListener('change', updateVisibleTypes);
    });

    // Observer les mutations DOM pour détecter les changements dynamiques
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'checked') {
          setTimeout(updateVisibleTypes, 100);
        }
      });
    });

    // Observer tous les checkboxes
    filterInputs.forEach(input => {
      observer.observe(input, { attributes: true });
    });

    return () => {
      clearTimeout(initialTimeout);
      filterInputs.forEach(input => {
        input.removeEventListener('change', updateVisibleTypes);
      });
      observer.disconnect();
    };
  }, []);

  //  Forcer une mise à jour périodique pour détecter les changements
  useEffect(() => {
    const interval = setInterval(() => {
      const checkedTypes = Array.from(
        document.querySelectorAll('.filter-checkbox-group input[type="checkbox"]:checked')
      ).map(cb => cb.id);

      const currentVisible = new Set(checkedTypes);

      // Vérifier si l'état a changé
      if (currentVisible.size !== visibleTypes.size ||
        [...currentVisible].some(type => !visibleTypes.has(type))) {
        setVisibleTypes(currentVisible);
      }
    }, 2000); // Vérification toutes les 2 secondes

    return () => clearInterval(interval);
  }, [visibleTypes]);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const createLegendIcon = (item) => {
    //  Lignes pointillées pour pistes
    if (item.isDashed) {
      return (
        <div
          className="legend-line-icon"
          style={{
            width: '30px',
            height: '4px',
            background: `repeating-linear-gradient(
              to right,
              ${item.color} 0px,
              ${item.color} 6px,
              transparent 6px,
              transparent 12px
            )`,
            borderRadius: '2px'
          }}
        />
      );
    }

    // Ligne continue pour chaussées
    if (item.isLine) {
      return (
        <div
          className="legend-line-icon"
          style={{
            width: '30px',
            height: '4px',
            backgroundColor: item.color,
            borderRadius: '2px'
          }}
        />
      );
    }

    //  Icône + ligne pour bacs et passages
    if (item.showIcon) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div
            className="legend-icon"
            style={{ backgroundColor: item.color }}
          >
            <i className={`fas fa-${item.icon}`}></i>
          </div>
          <div
            style={{
              width: '10px',
              height: '2px',
              backgroundColor: item.color,
              borderRadius: '1px'
            }}
          />
        </div>
      );
    }

    // Icône normale
    return (
      <div
        className="legend-icon"
        style={{ backgroundColor: item.color }}
      >
        <i className={`fas fa-${item.icon}`}></i>
      </div>
    );
  };

  //  Fonction pour obtenir tous les types disponibles
  const getAllLegendTypes = () => {
    return legendItems.flatMap(category => category.items.map(item => item.type));
  };

  return (
    <div className={`map-legend ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Header avec bouton de réduction */}
      <div className="legend-header" onClick={toggleCollapse}>
        <div className="legend-title">
          <i className="fas fa-map-signs"></i>
          <span>Légende</span>
        </div>
        <button className="legend-toggle">
          <i className={`fas fa-chevron-${isCollapsed ? 'up' : 'down'}`}></i>
        </button>
      </div>

      {/* Contenu de la légende */}
      {!isCollapsed && (
        <div className="legend-content">
          {legendItems.map((category, categoryIndex) => (
            <div key={categoryIndex} className="legend-category">
              <div className="legend-category-title">
                {category.category}
              </div>

              <div className="legend-items">
                {category.items.map((item, itemIndex) => {
                  const isVisible = visibleTypes.has(item.type);

                  return (
                    <div
                      key={itemIndex}
                      className={`legend-item ${!isVisible ? 'disabled' : ''}`}
                      title={isVisible ? `${item.label} - Visible` : `${item.label} - Masqué`}
                    >
                      {createLegendIcon(item)}
                      <span className="legend-label">{item.label}</span>
                      {!isVisible && (
                        <i className="fas fa-eye-slash legend-hidden-icon"></i>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Footer avec info */}
          <div className="legend-footer">
            <small>
              <i className="fas fa-info-circle"></i>
              {visibleTypes.size} type(s) affiché(s) sur {getAllLegendTypes().length}
            </small>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapLegend;