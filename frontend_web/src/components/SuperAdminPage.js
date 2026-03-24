import React, { useEffect, useState, useRef } from "react";
import { useAuth } from "./AuthContext";

import "leaflet/dist/leaflet.css";
import TimeChart from "./TimeChart";
import InfrastructureDonut from "./InfrastructureDonut";

import BarChart from "./BarChart";
import MapContainer from "./MapContainer";
import Dashboard from "./DashBoard";
import GestionUserPage from "./GestionUserPage";
import "./SuperAdminPage.css";
import GeographicFilter from "./GeographicFilterWithZoom";
import DataTrackingPage from "./DataTrackingPage";
import CartographiePage from "./CartographiePage";
import { useIsMobile } from "../hooks/useIsMobile";
import authService from "./authService";
import ActivityLogPage from "./ActivityLogPage";

const SuperAdminPage = () => {
  const [currentView, setCurrentView] = useState(
    () => sessionStorage.getItem("currentView_superadmin") || "map",
  );
  const { logout, hasInterfaceAccess } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileRef = useRef(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [chartExpanded, setChartExpanded] = useState(false);
  const isMobile = useIsMobile(1024);

  const [pendingResetCount, setPendingResetCount] = useState(0);

  useEffect(() => {
    const fetchPendingResets = async () => {
      try {
        const headers = authService.getAuthHeader();
        const res = await fetch(
          "http://localhost:8000/api/password-reset-requests/",
          {
            headers,
          },
        );
        if (res.ok) {
          const data = await res.json();
          setPendingResetCount(data.pending_count || 0);
        }
      } catch (e) {}
    };
    fetchPendingResets();
    const interval = setInterval(fetchPendingResets, 60000);
    window.addEventListener("resetRequestUpdated", fetchPendingResets); // ← AJOUTER
    return () => {
      clearInterval(interval);
      window.removeEventListener("resetRequestUpdated", fetchPendingResets); // ← AJOUTER
    };
  }, []);

  // Récupérer les infos utilisateur depuis localStorage
  const getUserInfo = () => {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        const u = JSON.parse(userStr);
        return {
          nom: u.nom || u.last_name || "Utilisateur",
          prenom: u.prenom || u.first_name || "",
          email: u.email || "",
          role: u.role || "super_admin",
        };
      } catch (e) {}
    }
    return { nom: "Utilisateur", prenom: "", email: "", role: "super_admin" };
  };

  const [profile] = useState(getUserInfo());

  // Générer les initiales (2 premières lettres)
  const getInitials = () => {
    const firstLetter = profile.prenom
      ? profile.prenom.charAt(0).toUpperCase()
      : "";
    const secondLetter = profile.nom ? profile.nom.charAt(0).toUpperCase() : "";
    return firstLetter + secondLetter || "SA";
  };

  // État des filtres
  const [filters, setFilters] = useState({
    region: "",
    prefecture: "",
    commune: "",
    commune_id: "",
    types: new Set(),
  });

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const exportBtn = document.getElementById("exportBtn");
    const dropdown = document.querySelector(".export-dropdown");

    const toggleDropdown = () => {
      dropdown?.classList.toggle("show");
    };

    if (exportBtn) {
      exportBtn.addEventListener("click", toggleDropdown);
    }

    return () => {
      if (exportBtn) {
        exportBtn.removeEventListener("click", toggleDropdown);
      }
    };
  }, [currentView]);

  useEffect(() => {
    sessionStorage.setItem("currentView_superadmin", currentView);
  }, [currentView]);

  // ── Lien Carte ↔ Tableau de suivi ────────────────────────────────────────
  useEffect(() => {
    const handleGoToTable = () => {
      if (hasInterfaceAccess("suivi_donnees")) setCurrentView("data-tracking");
    };
    const handleGoToMap = () => setCurrentView("map");
    window.addEventListener("entitySelectedOnMap", handleGoToTable);
    window.addEventListener("showEntityOnMap", handleGoToMap);
    return () => {
      window.removeEventListener("entitySelectedOnMap", handleGoToTable);
      window.removeEventListener("showEntityOnMap", handleGoToMap);
    };
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem("currentView_superadmin");
    logout();
    window.location.href = "/";
  };

  // Déclencher le redimensionnement des charts Chart.js quand le panneau stats s'ouvre
  useEffect(() => {
    if (statsOpen) {
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
      }, 400); // après l'animation CSS (350ms)
      return () => clearTimeout(timer);
    }
  }, [statsOpen]);

  return (
    <div className="superadmin-wrapper">
      {/* Overlay export */}
      <div className="export-overlay" id="exportOverlay">
        <div className="export-loading">
          <div className="export-spinner"></div>
          <p>Génération de l'export en cours...</p>
        </div>
      </div>

      {/* Header */}
      <div className="header">
        <div className="nav-menu">
          <div
            className={`nav-item ${currentView === "map" ? "active" : ""}`}
            onClick={() => setCurrentView("map")}
          >
            <i className="fas fa-map"></i>
            <span>Carte</span>
          </div>

          {hasInterfaceAccess("tableau_bord") && (
            <div
              className={`nav-item ${currentView === "dashboard" ? "active" : ""}`}
              onClick={() => setCurrentView("dashboard")}
            >
              <i className="fas fa-chart-line"></i>
              <span>Tableau de bord</span>
            </div>
          )}

          {hasInterfaceAccess("gestion_utilisateurs") && (
            <div
              className={`nav-item ${currentView === "users" ? "active" : ""}`}
              onClick={() => setCurrentView("users")}
              style={{ position: "relative" }}
            >
              <i className="fas fa-users"></i>
              <span>Utilisateurs</span>
              {pendingResetCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: "2px",
                    right: "2px",
                    background: "#DC2626",
                    color: "#fff",
                    borderRadius: "50%",
                    width: "18px",
                    height: "18px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.65rem",
                    fontWeight: "700",
                    border: "2px solid #1e3c72",
                    animation: "pulse 2s infinite",
                  }}
                >
                  {pendingResetCount}
                </span>
              )}
            </div>
          )}

          {hasInterfaceAccess("suivi_donnees") && (
            <div
              className={`nav-item ${currentView === "data-tracking" ? "active" : ""}`}
              onClick={() => setCurrentView("data-tracking")}
            >
              <i className="fas fa-database"></i>
              <span>Données</span>
            </div>
          )}
          <div
            className={`nav-item ${currentView === "activity-log" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("activity-log");
              window.dispatchEvent(new Event("refreshActivityLog"));
            }}
          >
            <i className="fas fa-clipboard-list"></i>
            <span>Journal</span>
          </div>
          <div
            className={`nav-item ${currentView === "cartographie" ? "active" : ""}`}
            onClick={() => setCurrentView("cartographie")}
          >
            <i className="fas fa-map-marked-alt"></i>
            <span>Cartographie</span>
          </div>
        </div>

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
            <span>
              {profile.role
                .replace("_", " ")
                .replace(/\b\w/g, (l) => l.toUpperCase())}
            </span>
          </div>

          {showProfileMenu && (
            <div className="profile-dropdown">
              <ul>
                <li onClick={() => setShowLogoutModal(true)}>
                  <i className="fas fa-sign-out-alt"></i> Déconnexion
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {showLogoutModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowLogoutModal(false)}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()} // évite de fermer en cliquant dans la modale
          >
            <h2 className="modal-title">
              Êtes-vous sûr de vouloir vous déconnecter ?
            </h2>

            <div className="modal-buttons">
              <button
                type="button"
                onClick={handleLogout} // ✅ fonction que tu as déjà
              >
                Oui
              </button>

              <button
                type="button"
                onClick={() => setShowLogoutModal(false)} // ✅ ferme la modale
              >
                Non
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========= VUE CARTE ========= */}
      <div
        className="main-container"
        style={{ display: currentView === "map" ? "flex" : "none" }}
      >
        {/* Overlay mobile pour fermer le drawer */}
        {isMobile && (sidebarOpen || statsOpen) && (
          <div
            className="mobile-overlay"
            onClick={() => {
              setSidebarOpen(false);
              setStatsOpen(false);
            }}
          />
        )}

        {/* Sidebar / Drawer Filtres */}
        <div
          className={`sidebar ${isMobile && sidebarOpen ? "sidebar-open" : ""}`}
        >
          {/* Bouton fermer (mobile uniquement) */}
          {isMobile && (
            <div className="drawer-header">
              <span>
                <i className="fas fa-filter"></i> Filtres
              </span>
              <button
                className="drawer-close-btn"
                onClick={() => setSidebarOpen(false)}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
          )}

          {/* Filtres géographiques */}
          <div className="filter-section">
            <div className="filter-title">
              <i className="fas fa-map-marker-alt"></i> Localisation
            </div>
            <div className="filter-row">
              <GeographicFilter
                onFiltersChange={(geoFilters) => {
                  const currentFilters = {
                    region_id: filters.region_id,
                    prefecture_id: filters.prefecture_id,
                    commune_id: filters.commune_id,
                  };
                  if (
                    JSON.stringify(geoFilters) ===
                    JSON.stringify(currentFilters)
                  )
                    return;
                  setFilters((prev) => ({
                    ...prev,
                    region_id: geoFilters.region_id,
                    prefecture_id: geoFilters.prefecture_id,
                    commune_id: geoFilters.commune_id,
                  }));
                  setTimeout(() => {
                    window.dispatchEvent(
                      new CustomEvent("geographicFilterChanged", {
                        detail: geoFilters,
                      }),
                    );
                  }, 100);
                }}
                initialFilters={{
                  region_id: filters.region_id,
                  prefecture_id: filters.prefecture_id,
                  commune_id: filters.commune_id,
                }}
                showLabels={true}
              />
            </div>
          </div>

          <div className="filter-section">
            <div className="filter-title">
              <i className="fas fa-road"></i> Réseau Routier
            </div>
            <div className="filter-checkbox-group">
              <div className="checkbox-item">
                <input type="checkbox" id="pistes" defaultChecked />
                <label htmlFor="pistes">Pistes</label>
              </div>
              <div className="checkbox-item">
                <input type="checkbox" id="chaussees" defaultChecked />
                <label htmlFor="chaussees">Chaussées</label>
              </div>
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
                ["batiments_administratifs", "Bâtiments admin."],
                ["infrastructures_hydrauliques", "Hydrauliques"],
                ["services_santes", "Services santé"],
                ["autres_infrastructures", "Autres"],
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
                ["ppr_itial", "Site de plaine"],
                ["enquete_polygone", "Zones de plaine"],
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
            <button
              className="apply-filters-btn"
              onClick={() => setSidebarOpen(false)}
            >
              <i className="fas fa-check"></i> Appliquer les filtres
            </button>
          )}
        </div>

        {/* Carte */}
        <div className="map-container">
          <MapContainer />
        </div>

        {/* Panel Stats (desktop: toujours visible / mobile: bottom sheet) */}
        <div
          className={`right-panel ${isMobile && statsOpen ? "stats-open" : ""}`}
        >
          {isMobile && <div className="sheet-handle"></div>}
          {isMobile && (
            <div className="drawer-header">
              <span>
                <i className="fas fa-chart-bar"></i> Statistiques
              </span>
              <button
                className="drawer-close-btn"
                onClick={() => setStatsOpen(false)}
              >
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
            onClick={() => {
              setSidebarOpen(!sidebarOpen);
              setStatsOpen(false);
            }}
          >
            <i
              className={`fas ${sidebarOpen ? "fa-times" : "fa-sliders-h"}`}
            ></i>
            <span>{sidebarOpen ? "Fermer" : "Filtres"}</span>
          </button>
          <button
            className={`mobile-bottom-nav-btn${statsOpen ? " active" : ""}`}
            onClick={() => {
              setStatsOpen(!statsOpen);
              setSidebarOpen(false);
            }}
          >
            <i className={`fas ${statsOpen ? "fa-times" : "fa-chart-bar"}`}></i>
            <span>{statsOpen ? "Fermer" : "Statistiques"}</span>
          </button>
        </div>
      )}

      {/* SOLUTION 2: Vue Dashboard - Nouvelle classe spécialisée */}
      <div
        className="view-container dashboard-view"
        style={{ display: currentView === "dashboard" ? "block" : "none" }}
      >
        <Dashboard />
      </div>

      {/* SOLUTION 3: Vue Users - Nouvelle classe spécialisée */}
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
      {/* Vue Journal d'activité */}
      <div
        className="view-container"
        style={{ display: currentView === "activity-log" ? "block" : "none" }}
      >
        <ActivityLogPage />
      </div>
      {/* Vue Cartographie */}
      <div
        className="view-container cartographie-view"
        style={{ display: currentView === "cartographie" ? "block" : "none" }}
      >
        <CartographiePage filters={filters} />
      </div>
    </div>
  );
};

export default SuperAdminPage;
