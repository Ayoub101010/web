// src/components/UserPage.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import InfrastructureDonut from "./InfrastructureDonut";
import BarChart from "./BarChart";
import MapContainer from "./MapContainer";
import "./SuperAdminPage.css";
import GeographicFilter from './GeographicFilterWithZoom';
import { useAuth } from './AuthContext';
import { useIsMobile } from "../hooks/useIsMobile";

const UserPage = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [currentView, setCurrentView] = useState(
    () => sessionStorage.getItem("currentView_user") || "map"
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [chartExpanded, setChartExpanded] = useState(false);
  const isMobile = useIsMobile(1024);

  //  Forcer la déconnexion pour l'accès public
  useEffect(() => {
    logout(); // Nettoie complètement l'authentification
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // État pour les filtres avec tous les types activés par défaut
  const [filters, setFilters] = useState({
    region_id: "",
    prefecture_id: "",
    commune_id: "",
    types: new Set([
      "pistes", "chaussees", "localites", "ecoles", "marches",
      "batiments_administratifs", "infrastructures_hydrauliques",
      "services_santes", "autres_infrastructures", "buses",
      "dalots", "ponts", "passages_submersibles", "bacs", "points_coupures", "points_critiques",
      "ppr_itial", "enquete_polygone"
    ])
  });

  // Utiliser useCallback pour éviter les re-créations de fonction
  const handleGeographicFiltersChange = React.useCallback((geoFilters) => {
    // Vérifier si les valeurs ont réellement changé
    setFilters((prev) => {
      if (
        prev.region_id === geoFilters.region_id &&
        prev.prefecture_id === geoFilters.prefecture_id &&
        prev.commune_id === geoFilters.commune_id
      ) {
        return prev; // Pas de changement, retourner l'état précédent
      }

      // Émettre l'événement seulement si les valeurs ont changé
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("geographicFilterChanged", {
            detail: geoFilters,
          })
        );
      }, 100);

      return {
        ...prev,
        region_id: geoFilters.region_id,
        prefecture_id: geoFilters.prefecture_id,
        commune_id: geoFilters.commune_id,
      };
    });
  }, []);

  // Gestion des changements de types d'infrastructures
  const handleTypeFilterChange = (typeId, checked) => {
    setFilters(prev => {
      const newTypes = new Set(prev.types);
      if (checked) {
        newTypes.add(typeId);
      } else {
        newTypes.delete(typeId);
      }
      return { ...prev, types: newTypes };
    });

    // Émettre l'événement pour les autres composants
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("typeFilterChanged", {
          detail: { typeId, checked },
        })
      );
    }, 100);
  };

  useEffect(() => {
    sessionStorage.setItem("currentView_user", currentView);
  }, [currentView]);

  // Déclencher le redimensionnement des charts Chart.js quand le panneau stats s'ouvre
  useEffect(() => {
    if (statsOpen) {
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [statsOpen]);

  // Retour à la page de connexion
  const handleBackToLogin = () => {
    navigate("/");
  };

  return (
    <div className="superadmin-wrapper">
      {/* Header */}
      <div className="header">

        <div className="nav-menu">
          <div
            className={`nav-item ${currentView === "map" ? "active" : ""}`}
            onClick={() => setCurrentView("map")}
          >
            <i className="fas fa-map"></i><span>Carte</span>
          </div>
        </div>

        <div className="user-profile">
          <div
            className="nav-item active"
            onClick={handleBackToLogin}
            style={{ cursor: 'pointer' }}
          >
            <i className="fas fa-sign-in-alt"></i><span>Connexion</span>
          </div>
        </div>
      </div>

      {/* Vue Carte */}
      <div
        className="main-container"
        style={{ display: currentView === "map" ? "flex" : "none" }}
      >
        {/* Overlay mobile pour fermer le drawer */}
        {isMobile && (sidebarOpen || statsOpen) && (
          <div
            className="mobile-overlay"
            onClick={() => { setSidebarOpen(false); setStatsOpen(false); }}
          />
        )}

        {/* Sidebar / Drawer Filtres */}
        <div className={`sidebar ${isMobile && sidebarOpen ? "sidebar-open" : ""}`}>
          {/* Bouton fermer (mobile uniquement) */}
          {isMobile && (
            <div className="drawer-header">
              <span><i className="fas fa-filter"></i> Filtres</span>
              <button className="drawer-close-btn" onClick={() => setSidebarOpen(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
          )}

          {/* Filtres géographiques */}
          <div className="filter-section">
            <div className="filter-title">
              <i className="fas fa-map-marker-alt"></i> Localisation
            </div>
            <GeographicFilter
              onFiltersChange={handleGeographicFiltersChange}
              initialFilters={{
                region_id: filters.region_id || "",
                prefecture_id: filters.prefecture_id || "",
                commune_id: filters.commune_id || "",
              }}
              showLabels={true}
            />
          </div>

          {/* Filtres voirie */}
          <div className="filter-section">
            <div className="filter-title">
              <i className="fas fa-road"></i> Réseau Routier
            </div>
            <div className="filter-checkbox-group">
              <div className="checkbox-item">
                <input
                  type="checkbox"
                  id="pistes"
                  checked={filters.types.has("pistes")}
                  onChange={(e) => handleTypeFilterChange("pistes", e.target.checked)}
                />
                <label htmlFor="pistes">Pistes</label>
              </div>
              <div className="checkbox-item">
                <input
                  type="checkbox"
                  id="chaussees"
                  checked={filters.types.has("chaussees")}
                  onChange={(e) => handleTypeFilterChange("chaussees", e.target.checked)}
                />
                <label htmlFor="chaussees">Chaussées</label>
              </div>
            </div>
          </div>

          {/* Filtres infrastructures */}
          <div className="filter-section">
            <div className="filter-title">
              <i className="fas fa-building"></i> Infrastructures
            </div>
            <div className="filter-checkbox-group">
              {[
                ["localites", "Localités"],
                ["ecoles", "Écoles"],
                ["marches", "Marchés"],
                ["batiments_administratifs", "Bâtiments administratifs"],
                ["infrastructures_hydrauliques", "Infrastructures hydrauliques"],
                ["services_santes", "Services de santé"],
                ["autres_infrastructures", "Autres infrastructures"],
              ].map(([id, label]) => (
                <div className="checkbox-item" key={id}>
                  <input
                    type="checkbox"
                    id={id}
                    checked={filters.types.has(id)}
                    onChange={(e) => handleTypeFilterChange(id, e.target.checked)}
                  />
                  <label htmlFor={id}>{label}</label>
                </div>
              ))}
            </div>
          </div>

          {/* Filtres ouvrages */}
          <div className="filter-section">
            <div className="filter-title">
              <i className="fas fa-tools"></i> Ouvrages
            </div>
            <div className="filter-checkbox-group">
              {[
                ["buses", "Buses"],
                ["dalots", "Dalots"],
                ["ponts", "Ponts"],
                ["passages_submersibles", "Passages submersibles"],
                ["bacs", "Bacs"],
              ].map(([id, label]) => (
                <div className="checkbox-item" key={id}>
                  <input
                    type="checkbox"
                    id={id}
                    checked={filters.types.has(id)}
                    onChange={(e) => handleTypeFilterChange(id, e.target.checked)}
                  />
                  <label htmlFor={id}>{label}</label>
                </div>
              ))}
            </div>
          </div>

          {/* Surveillance */}
          <div className="filter-section">
            <div className="filter-title">
              <i className="fas fa-exclamation-triangle"></i> Surveillance
            </div>
            <div className="filter-checkbox-group">
              {[
                ["points_coupures", "Points de coupure"],
                ["points_critiques", "Points critiques"],
              ].map(([id, label]) => (
                <div className="checkbox-item" key={id}>
                  <input
                    type="checkbox"
                    id={id}
                    checked={filters.types.has(id)}
                    onChange={(e) => handleTypeFilterChange(id, e.target.checked)}
                  />
                  <label htmlFor={id}>{label}</label>
                </div>
              ))}
            </div>
          </div>

          <div className="filter-section">
            <div className="filter-title">
              <i className="fas fa-file-alt"></i> Enquête
            </div>
            <div className="filter-checkbox-group">
              {[
                ["ppr_itial", "site de plaine"],
                ["enquete_polygone", "zones de plaine"],
              ].map(([id, label]) => (
                <div className="checkbox-item" key={id}>
                  <input
                    type="checkbox"
                    id={id}
                    checked={filters.types.has(id)}
                    onChange={(e) => handleTypeFilterChange(id, e.target.checked)}
                  />
                  <label htmlFor={id}>{label}</label>
                </div>
              ))}
            </div>
          </div>

          {/* Bouton appliquer (mobile) */}
          {isMobile && (
            <button className="apply-filters-btn" onClick={() => setSidebarOpen(false)}>
              <i className="fas fa-check"></i> Appliquer les filtres
            </button>
          )}
        </div>  {/* ← Fin sidebar */}

        {/* Contenu principal */}
        <div className="map-container">
          <MapContainer filters={filters} />
        </div>

        {/* Panel Stats (desktop: toujours visible / mobile: bottom sheet) */}
        <div className={`right-panel ${isMobile && statsOpen ? "stats-open" : ""}`}>
          {isMobile && <div className="sheet-handle"></div>}
          {isMobile && (
            <div className="drawer-header">
              <span><i className="fas fa-chart-bar"></i> Statistiques</span>
              <button className="drawer-close-btn" onClick={() => setStatsOpen(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
          )}
          <InfrastructureDonut filters={filters} onExpandedChange={setChartExpanded} />
          <BarChart filters={filters} onExpandedChange={setChartExpanded} />
        </div>
      </div>

      {/* Barre de navigation inférieure (mobile, vue carte uniquement) */}
      {isMobile && currentView === "map" && !chartExpanded && (
        <div className="mobile-bottom-nav">
          <button
            className={`mobile-bottom-nav-btn${sidebarOpen ? " active" : ""}`}
            onClick={() => { setSidebarOpen(!sidebarOpen); setStatsOpen(false); }}
          >
            <i className={`fas ${sidebarOpen ? "fa-times" : "fa-sliders-h"}`}></i>
            <span>{sidebarOpen ? "Fermer" : "Filtres"}</span>
          </button>
          <button
            className={`mobile-bottom-nav-btn${statsOpen ? " active" : ""}`}
            onClick={() => { setStatsOpen(!statsOpen); setSidebarOpen(false); }}
          >
            <i className={`fas ${statsOpen ? "fa-times" : "fa-chart-bar"}`}></i>
            <span>{statsOpen ? "Fermer" : "Statistiques"}</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default UserPage;
