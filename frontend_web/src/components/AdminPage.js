import React, { useEffect, useState, useRef } from "react";
import "leaflet/dist/leaflet.css";
import InfrastructureDonut from "./InfrastructureDonut";
import BarChart from "./BarChart";
import MapContainer from "./MapContainer";
import TimeChart from "./TimeChart";
import Dashboard from "./DashBoard";
import GeographicFilterWithZoom from "./GeographicFilterWithZoom";
import "./SuperAdminPage.css"; // Réutilise les mêmes styles
import { useAuth } from "./AuthContext";
import GestionUserPage from "./GestionUserPage";
import DataTrackingPage from "./DataTrackingPage";
import { useIsMobile } from "../hooks/useIsMobile";

const AdminPage = () => {
  const [currentView, setCurrentView] = useState(
    () => sessionStorage.getItem("currentView_admin") || "map"
  );
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileRef = useRef(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const { user, logout, hasInterfaceAccess } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [chartExpanded, setChartExpanded] = useState(false);
  const isMobile = useIsMobile(1024);

  // Récupérer les infos utilisateur
  const getUserInfo = () => {
    // Priorité 1: Context
    if (user) {
      return {
        nom: user.nom || user.last_name || "Utilisateur",
        prenom: user.prenom || user.first_name || "",
        email: user.mail || user.email || "",
        role: user.role || "admin",
      };
    }

    // Priorité 2: localStorage
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        const userData = JSON.parse(userStr);
        return {
          nom: userData.nom || userData.last_name || "Utilisateur",
          prenom: userData.prenom || userData.first_name || "",
          email: userData.mail || userData.email || "",
          role: userData.role || "admin",
        };
      } catch (e) { }
    }

    return { nom: "Utilisateur", prenom: "", email: "", role: "admin" };
  };

  const [profile] = useState(getUserInfo());

  // Générer les initiales (2 premières lettres)
  const getInitials = () => {
    const firstLetter = profile.prenom
      ? profile.prenom.charAt(0).toUpperCase()
      : "";
    const secondLetter = profile.nom ? profile.nom.charAt(0).toUpperCase() : "";
    return firstLetter + secondLetter || "AD";
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Déclencher le redimensionnement des charts Chart.js quand le panneau stats s'ouvre
  useEffect(() => {
    if (statsOpen) {
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [statsOpen]);

  useEffect(() => {
    sessionStorage.setItem("currentView_admin", currentView);
  }, [currentView]);

  // ── Lien Carte ↔ Tableau de suivi ────────────────────────────────────────
  useEffect(() => {
    const handleGoToTable = () => {
      if (hasInterfaceAccess('suivi_donnees')) setCurrentView("data-tracking");
    };
    const handleGoToMap   = () => setCurrentView("map");
    window.addEventListener("entitySelectedOnMap", handleGoToTable);
    window.addEventListener("showEntityOnMap",     handleGoToMap);
    return () => {
      window.removeEventListener("entitySelectedOnMap", handleGoToTable);
      window.removeEventListener("showEntityOnMap",     handleGoToMap);
    };
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem("currentView_admin");
    logout();
    window.location.href = "/";
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
            <i className="fas fa-map-marked-alt"></i><span>Carte</span>
          </div>

          {hasInterfaceAccess("tableau_bord") && (
            <div
              className={`nav-item ${currentView === "dashboard" ? "active" : ""}`}
              onClick={() => setCurrentView("dashboard")}
            >
              <i className="fas fa-chart-line"></i><span>Tableau de Bord</span>
            </div>
          )}

          {hasInterfaceAccess("gestion_utilisateurs") && (
            <div
              className={`nav-item ${currentView === "users" ? "active" : ""}`}
              onClick={() => setCurrentView("users")}
            >
              <i className="fas fa-users"></i><span>Utilisateurs</span>
            </div>
          )}

          {hasInterfaceAccess("suivi_donnees") && (
            <div
              className={`nav-item ${currentView === "data-tracking" ? "active" : ""}`}
              onClick={() => setCurrentView("data-tracking")}
            >
              <i className="fas fa-database"></i><span>Données</span>
            </div>
          )}
        </div>

        {/* Profil */}
        <div className="user-profile" ref={profileRef}>
          <div
            className="profile-pic"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            style={{ cursor: "pointer" }}
          >
            {getInitials()}
          </div>
          <div className="user-info">
            <h4>
              {profile.prenom} {profile.nom}
            </h4>
            <span>{profile.role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
          </div>

          {showProfileMenu && (
            <div className="profile-dropdown">
              <ul>
                <li
                  onClick={() => {
                    setShowLogoutModal(true);
                    setShowProfileMenu(false);
                  }}
                >
                  <i className="fas fa-sign-out-alt"></i> Déconnexion
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Modal déconnexion */}
      {showLogoutModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowLogoutModal(false)}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="modal-title">
              Êtes-vous sûr de vouloir vous déconnecter ?
            </h2>
            <div className="modal-buttons">
              <button type="button" onClick={handleLogout}>Oui</button>
              <button type="button" onClick={() => setShowLogoutModal(false)}>Non</button>
            </div>
          </div>
        </div>
      )}

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

          {/* Section géographique avec événement personnalisé */}
          <div className="filter-section">
            <div className="filter-title">
              <i className="fas fa-map-marker-alt"></i> Localisation
            </div>
            <GeographicFilterWithZoom
              onFiltersChange={(geoFilters) => {
                // Déclencher l'événement pour MapContainer
                setTimeout(() => {
                  window.dispatchEvent(
                    new CustomEvent("geographicFilterChanged", {
                      detail: geoFilters,
                    })
                  );
                }, 100);
              }}
              showLabels={true}
            />
          </div>

          <div className="filter-section">
            <div className="filter-title">
              <i className="fas fa-road"></i> Réseau Routier
            </div>
            <div className="filter-checkbox-group">
              {[
                ["pistes", "Pistes"],
                ["chaussees", "Chaussées"],
              ].map(([id, label]) => (
                <div className="checkbox-item" key={id}>
                  <input type="checkbox" id={id} defaultChecked />
                  <label htmlFor={id}>{label}</label>
                </div>
              ))}
            </div>
          </div>

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
                [
                  "infrastructures_hydrauliques",
                  "Infrastructures hydrauliques",
                ],
                ["services_santes", "Services de santé"],
                ["autres_infrastructures", "Autres infrastructures"],
              ].map(([id, label]) => (
                <div className="checkbox-item" key={id}>
                  <input type="checkbox" id={id} defaultChecked />
                  <label htmlFor={id}>{label}</label>
                </div>
              ))}
            </div>
          </div>

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
                  <input type="checkbox" id={id} defaultChecked />
                  <label htmlFor={id}>{label}</label>
                </div>
              ))}
            </div>
          </div>

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
                  <input type="checkbox" id={id} defaultChecked />
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
                  <input type="checkbox" id={id} defaultChecked />
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
        </div>

        {/* Carte */}
        <div className="map-container">
          <MapContainer />
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
          <TimeChart />
          <InfrastructureDonut onExpandedChange={setChartExpanded} />
          <BarChart onExpandedChange={setChartExpanded} />
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

      {/* Vue Dashboard */}
      <div
        className="view-container dashboard-view"
        style={{ display: currentView === "dashboard" ? "block" : "none" }}
      >
        <Dashboard />
      </div>

      {/* Vue Users */}
      <div
        className="view-container users-view"
        style={{ display: currentView === "users" ? "block" : "none" }}
      >
        <GestionUserPage />
      </div>

      {/* Vue Suivi des données */}
      <div
        className="view-container data-tracking-view"
        style={{ display: currentView === "data-tracking" ? "block" : "none" }}
      >
        <DataTrackingPage />
      </div>
    </div>
  );
};

export default AdminPage;
