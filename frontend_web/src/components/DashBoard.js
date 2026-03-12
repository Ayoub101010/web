import React, { useState, useMemo, useEffect } from "react";
import "./DashBoard.css";
import useinfrastructuredata from "./useinfrastructuredata";
import { useAuth } from './AuthContext';
import TableExportButtons from './TableExportButtons';
import GeographicFilter from './GeographicFilterWithZoom';
import { useIsMobile } from '../hooks/useIsMobile';

const DashBoard = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const { user } = useAuth();
  const isMobile = useIsMobile(768);
  // ✅ Initialisation SYNC pour éviter un fetch vide au premier rendu
  const [geoFilters, setGeoFilters] = useState(() => {
    const initial = {
      region_id: [],
      prefecture_id: [],
      commune_id: []
    };

    if (user) {
      // Détecter region
      const rId = user.region_id || user.region?.id;
      if (rId) initial.region_id = [rId];

      // Détecter prefecture
      const pId = user.prefecture_id || user.prefecture?.id;
      if (pId) initial.prefecture_id = [pId];

      // Détecter commune
      const cId = user.commune_id || user.commune?.id;
      if (cId) initial.commune_id = [cId];
    }
    return initial;
  });

  // Initialiser les filtres avec la région/préfecture de l'utilisateur
  useEffect(() => {
    if (user) {
      const newFilters = {};
      let hasChanges = false;

      // Détecter region_id (soit propriété directe, soit objet)
      const userRegionId = user.region_id || user.region?.id;
      if (userRegionId && (!geoFilters.region_id.length || geoFilters.region_id[0] !== userRegionId)) {
        newFilters.region_id = [userRegionId];
        hasChanges = true;
      }

      // Détecter prefecture_id
      const userPrefectureId = user.prefecture_id || user.prefecture?.id;
      if (userPrefectureId && (!geoFilters.prefecture_id.length || geoFilters.prefecture_id[0] !== userPrefectureId)) {
        newFilters.prefecture_id = [userPrefectureId];
        hasChanges = true;
      }

      // Détecter commune_id
      const userCommuneId = user.commune_id || user.commune?.id;
      if (userCommuneId && (!geoFilters.commune_id.length || geoFilters.commune_id[0] !== userCommuneId)) {
        newFilters.commune_id = [userCommuneId];
        hasChanges = true;
      }

      if (hasChanges) {
        setGeoFilters(prev => ({
          ...prev,
          ...newFilters
        }));
      }
    }
  }, [user]);

  // Mapper les filtres Multi-select pour l'API (qui attend souvent des IDs simples ou multiples)
  const apiFilters = useMemo(() => {
    return {
      region_id: geoFilters.region_id?.length ? geoFilters.region_id : null,
      prefecture_id: geoFilters.prefecture_id?.length ? geoFilters.prefecture_id : null,
      commune_ids: geoFilters.commune_id?.length ? geoFilters.commune_id : null
    };
  }, [geoFilters]);

  const { pistesCounts, loading, error, reloadData, loadingProgress } =
    useinfrastructuredata(apiFilters);

  const data = useMemo(() => {
    if (!pistesCounts || Object.keys(pistesCounts).length === 0) {
      return [];
    }

    return Object.values(pistesCounts).map((piste) => ({
      code_piste: piste.code_piste,
      date: piste.created_at
        ? new Date(piste.created_at).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      utilisateur: piste.utilisateur || "Non assigne",
      localite: piste.commune || "N/A",
      prefecture: piste.prefecture_nom || "N/A",
      region: piste.region_nom || "N/A",
      kilometrage: parseFloat(piste.kilometrage || 0).toFixed(3),
      chaussees_count: piste.chaussees?.count || 0,
      chaussees_km: parseFloat(piste.chaussees?.km || 0).toFixed(3),
      chaussees_types: piste.chaussees?.types || {},
      buses: piste.buses || 0,
      ponts: piste.ponts || 0,
      dalots: piste.dalots || 0,
      bacs: piste.bacs || 0,
      ecoles: piste.ecoles || 0,
      marches: piste.marches || 0,
      services_sante: piste.services_santes || 0,
      autres: piste.autres_infrastructures || 0,
      batiments_admin: piste.batiments_administratifs || 0,
      hydrauliques: piste.infrastructures_hydrauliques || 0,
      localites: piste.localites || 0,
      passages: piste.passages_submersibles || 0,
      ppr_itial: piste.ppr_itial || 0,
      enquete_polygone: piste.enquete_polygone || 0,
      enquete_polygone_superficie: parseFloat(piste.enquete_polygone_superficie || 0).toFixed(2),
      points_coupures: piste.points_coupures || 0,
      points_critiques: piste.points_critiques || 0,
      region_id: piste.region_id,
      prefecture_id: piste.prefecture_id,
      commune_id: piste.commune_id
    }));
  }, [pistesCounts]);

  useEffect(() => {
    const tableContainer = document.querySelector(".dashboard-table");

    if (tableContainer) {
      const checkScroll = () => {
        const hasHorizontalScroll =
          tableContainer.scrollWidth > tableContainer.clientWidth;
        const hasVerticalScroll =
          tableContainer.scrollHeight > tableContainer.clientHeight;

        if (hasHorizontalScroll) {
          tableContainer.classList.add("has-horizontal-scroll");
        } else {
          tableContainer.classList.remove("has-horizontal-scroll");
        }

        if (hasVerticalScroll) {
          tableContainer.classList.add("has-vertical-scroll");
        } else {
          tableContainer.classList.remove("has-vertical-scroll");
        }
      };

      checkScroll();
      window.addEventListener("resize", checkScroll);

      return () => window.removeEventListener("resize", checkScroll);
    }
  }, [data]);

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      // Le filtrage géographique est déjà appliqué côté serveur via apiFilters.
      // Ici on filtre uniquement par terme de recherche.
      return (
        item.utilisateur.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.code_piste.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.localite.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [data, searchTerm]);

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dashboard-header">
          <h1>Tableau de Bord - Collectes</h1>
        </div>
        <div
          className="loading-container"
          style={{ textAlign: "center", padding: "2rem" }}
        >
          <div
            style={{
              border: "4px solid #f3f3f3",
              borderTop: "4px solid #3498db",
              borderRadius: "50%",
              width: "40px",
              height: "40px",
              animation: "spin 1s linear infinite",
              margin: "0 auto 1rem",
            }}
          ></div>
          <p>Chargement des donnees... {loadingProgress}%</p>
          <div
            style={{
              width: "200px",
              height: "10px",
              backgroundColor: "#f3f3f3",
              borderRadius: "5px",
              margin: "1rem auto",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${loadingProgress}%`,
                height: "100%",
                backgroundColor: "#3498db",
                transition: "width 0.3s",
              }}
            ></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard">
        <div className="dashboard-header">
          <h1>Tableau de Bord - Collectes</h1>
        </div>
        <div
          className="error-container"
          style={{ textAlign: "center", padding: "2rem" }}
        >
          <p style={{ color: "#dc3545" }}>Erreur: {error}</p>
          <button
            onClick={() => reloadData()}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Reessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header-blue">
        <div className="icon">
          <i className="fas fa-chart-line"></i>
        </div>
        <h1 className="title">Tableau de Bord - Collectes</h1>
        <p className="subtitle">
          Vue globale des pistes et Equipements collectées.
        </p>
      </div>

      <div className="dashboard-controls">
        <div className="filters-row" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="dashboard-geo-filters">
            <GeographicFilter
              onFiltersChange={setGeoFilters}
              initialFilters={geoFilters}
              showLabels={false}
              layout="horizontal"
            />
          </div>
          <input
            type="text"
            className="search-input"
            placeholder="Rechercher par code, utilisateur ou localité..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        <div className="actions-row">
          <button
            className="btn btn-green"
            onClick={() => reloadData()}
            title="Recharger les donnees depuis le serveur"
          >
            <span>Actualiser</span>
          </button>
        </div>
      </div>

      <div className="dashboard-stats">
        <div className="stats-card">
          <h3>{filteredData.length}</h3>
          <p>Total des pistes</p>
        </div>
        <div className="stats-card">
          <h3>
            {filteredData
              .reduce((sum, d) => sum + parseFloat(d.kilometrage || 0), 0)
              .toFixed(3)}{" "}
            km
          </h3>
          <p>Kilometrage total</p>
        </div>
        <div className="stats-card">
          <h3>
            {filteredData.reduce(
              (sum, d) =>
                sum +
                (parseInt(d.chaussees_count) || 0) +
                (parseInt(d.buses) || 0) +
                (parseInt(d.ponts) || 0) +
                (parseInt(d.dalots) || 0) +
                (parseInt(d.bacs) || 0) +
                (parseInt(d.ecoles) || 0) +
                (parseInt(d.marches) || 0) +
                (parseInt(d.services_sante) || 0) +
                (parseInt(d.autres) || 0) +
                (parseInt(d.batiments_admin) || 0) +
                (parseInt(d.hydrauliques) || 0) +
                (parseInt(d.localites) || 0) +
                (parseInt(d.passages) || 0) +
                (parseInt(d.ppr_itial) || 0) +
                (parseInt(d.enquete_polygone) || 0) +
                (parseInt(d.points_coupures) || 0) +
                (parseInt(d.points_critiques) || 0),
              0
            )}
          </h3>
          <p>Total Equipements</p>
        </div>
        <div className="stats-card">
          <h3>
            {filteredData.reduce((sum, d) => sum + (parseInt(d.enquete_polygone) || 0), 0)}
            <span style={{ fontSize: "1rem", fontWeight: "normal" }}>
              {" "}zones
            </span>
          </h3>
          <p>
            Zones de plaines —{" "}
            {filteredData
              .reduce((sum, d) => sum + parseFloat(d.enquete_polygone_superficie || 0), 0)
              .toFixed(2)}{" "}
            ha
          </p>
        </div>
      </div>


      <TableExportButtons pistesData={filteredData} />

      {/* Mode CARDS pour mobile */}
      <div className="dashboard-cards">
        {filteredData.map((item) => (
          <div className="dashboard-card" key={item.code_piste}>
            <div className="card-header">
              <h3>{item.code_piste}</h3>
              <span className="card-badge">Piste</span>
            </div>
            <div className="card-body">
              <div className="card-field">
                <span className="card-field-label">Date</span>
                <span className="card-field-value">{item.date}</span>
              </div>
              <div className="card-field">
                <span className="card-field-label">Utilisateur</span>
                <span className="card-field-value">{item.utilisateur}</span>
              </div>
              <div className="card-field">
                <span className="card-field-label">Localité</span>
                <span className="card-field-value">{item.localite}</span>
              </div>
              <div className="card-field">
                <span className="card-field-label">Kilométrage</span>
                <span className="card-field-value">{item.kilometrage} km</span>
              </div>
              <div className="card-field full-width">
                <span className="card-field-label">Chaussées ({item.chaussees_count})</span>
                <span className="card-field-value" style={{ fontSize: "0.9em" }}>
                  {Object.entries(item.chaussees_types).length > 0
                    ? Object.entries(item.chaussees_types).map(([type, d], i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                          <span>{d.count > 1 ? `${type} ×${d.count}` : type}</span>
                          <span style={{ color: "#555" }}>{parseFloat(d.km).toFixed(3)} km</span>
                        </div>
                      ))
                    : "—"}
                </span>
              </div>
              <div className="card-field">
                <span className="card-field-label">Buses</span>
                <span className="card-field-value">{item.buses}</span>
              </div>
              <div className="card-field">
                <span className="card-field-label">Ponts</span>
                <span className="card-field-value">{item.ponts}</span>
              </div>
              <div className="card-field">
                <span className="card-field-label">Dalots</span>
                <span className="card-field-value">{item.dalots}</span>
              </div>
              <div className="card-field">
                <span className="card-field-label">Bacs</span>
                <span className="card-field-value">{item.bacs}</span>
              </div>
              <div className="card-field">
                <span className="card-field-label">Écoles</span>
                <span className="card-field-value">{item.ecoles}</span>
              </div>
              <div className="card-field">
                <span className="card-field-label">Marchés</span>
                <span className="card-field-value">{item.marches}</span>
              </div>
              <div className="card-field">
                <span className="card-field-label">Services Santé</span>
                <span className="card-field-value">{item.services_sante}</span>
              </div>
              <div className="card-field">
                <span className="card-field-label">Autres</span>
                <span className="card-field-value">{item.autres}</span>
              </div>
              <div className="card-field">
                <span className="card-field-label">Bât. Admin</span>
                <span className="card-field-value">{item.batiments_admin}</span>
              </div>
              <div className="card-field">
                <span className="card-field-label">Hydrauliques</span>
                <span className="card-field-value">{item.hydrauliques}</span>
              </div>
              <div className="card-field">
                <span className="card-field-label">Localités</span>
                <span className="card-field-value">{item.localites}</span>
              </div>
              <div className="card-field">
                <span className="card-field-label">Passages Sub.</span>
                <span className="card-field-value">{item.passages}</span>
              </div>
              <div className="card-field">
                <span className="card-field-label">Sites Plaine</span>
                <span className="card-field-value">{item.ppr_itial}</span>
              </div>
              <div className="card-field">
                <span className="card-field-label">Pts Coupure</span>
                <span className="card-field-value">{item.points_coupures}</span>
              </div>
              <div className="card-field">
                <span className="card-field-label">Pts Critiques</span>
                <span className="card-field-value">{item.points_critiques}</span>
              </div>
              <div className="card-field">
                <span className="card-field-label">Zones Plaine</span>
                <span className="card-field-value">{item.enquete_polygone || 0}</span>
              </div>
              <div className="card-field">
                <span className="card-field-label">Superficie</span>
                <span className="card-field-value">
                  {parseFloat(item.enquete_polygone_superficie) > 0
                    ? `${item.enquete_polygone_superficie} ha`
                    : "—"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Mode TABLE pour desktop */}
      <div className="dashboard-table">
        <table>
          <thead>
            <tr>
              <th>Code Piste</th>
              <th>Date</th>
              <th>Région</th>
              <th>Préfecture</th>
              <th>Commune</th>
              <th>Km</th>
              <th>Zones Plaine</th>
              <th>Superficie</th>
              <th>Chaussées</th>
              <th>Types Ch.</th>
              <th>Km Ch.</th>
              <th>Buses</th>
              <th>Ponts</th>
              <th>Dalots</th>
              <th>Bacs</th>
              <th>Ecoles</th>
              <th>Marches</th>
              <th>Services Sante</th>
              <th>Autres</th>
              <th>Bat. Admin</th>
              <th>Hydrauliques</th>
              <th>Localites</th>
              <th>Passages Sub.</th>
              <th>Sites Plaine</th>
              <th>Pts Coupure</th>
              <th>Pts Critiques</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.flatMap((item, pisteIndex) => {
              const typeEntries = Object.entries(item.chaussees_types);
              const rowCount = typeEntries.length || 1;
              const bg = pisteIndex % 2 === 0 ? "#ffffff" : "#f0f4ff";
              const topBorder = pisteIndex > 0 ? "2px solid #b0bec5" : undefined;

              const sharedCellsStart = (span) => (
                <>
                  <td className="code-piste" rowSpan={span} style={{ background: bg, borderTop: topBorder }}>{item.code_piste}</td>
                  <td rowSpan={span} style={{ background: bg, borderTop: topBorder }}>{item.date}</td>
                  <td rowSpan={span} style={{ background: bg, borderTop: topBorder }}>{item.region}</td>
                  <td rowSpan={span} style={{ background: bg, borderTop: topBorder }}>{item.prefecture}</td>
                  <td rowSpan={span} style={{ background: bg, borderTop: topBorder }}>{item.localite}</td>
                  <td className="kilometrage-cell" rowSpan={span} style={{ background: bg, borderTop: topBorder }}>{item.kilometrage} km</td>
                  <td className="infra-count" rowSpan={span} style={{ background: bg, borderTop: topBorder }}>{item.enquete_polygone || 0}</td>
                  <td className="infra-count" rowSpan={span} style={{ background: bg, borderTop: topBorder }}>{parseFloat(item.enquete_polygone_superficie) > 0 ? `${item.enquete_polygone_superficie} ha` : "—"}</td>
                </>
              );

              const sharedCellsEnd = (span) => (
                <>
                  <td className="infra-count" rowSpan={span} style={{ background: bg, borderTop: topBorder }}>{item.buses}</td>
                  <td className="infra-count" rowSpan={span} style={{ background: bg, borderTop: topBorder }}>{item.ponts}</td>
                  <td className="infra-count" rowSpan={span} style={{ background: bg, borderTop: topBorder }}>{item.dalots}</td>
                  <td className="infra-count" rowSpan={span} style={{ background: bg, borderTop: topBorder }}>{item.bacs}</td>
                  <td className="infra-count" rowSpan={span} style={{ background: bg, borderTop: topBorder }}>{item.ecoles}</td>
                  <td className="infra-count" rowSpan={span} style={{ background: bg, borderTop: topBorder }}>{item.marches}</td>
                  <td className="infra-count" rowSpan={span} style={{ background: bg, borderTop: topBorder }}>{item.services_sante}</td>
                  <td className="infra-count" rowSpan={span} style={{ background: bg, borderTop: topBorder }}>{item.autres}</td>
                  <td className="infra-count" rowSpan={span} style={{ background: bg, borderTop: topBorder }}>{item.batiments_admin}</td>
                  <td className="infra-count" rowSpan={span} style={{ background: bg, borderTop: topBorder }}>{item.hydrauliques}</td>
                  <td className="infra-count" rowSpan={span} style={{ background: bg, borderTop: topBorder }}>{item.localites}</td>
                  <td className="infra-count" rowSpan={span} style={{ background: bg, borderTop: topBorder }}>{item.passages}</td>
                  <td className="infra-count" rowSpan={span} style={{ background: bg, borderTop: topBorder }}>{item.ppr_itial}</td>
                  <td className="infra-count" rowSpan={span} style={{ background: bg, borderTop: topBorder }}>{item.points_coupures}</td>
                  <td className="infra-count" rowSpan={span} style={{ background: bg, borderTop: topBorder }}>{item.points_critiques}</td>
                </>
              );

              if (typeEntries.length === 0) {
                return [
                  <tr key={item.code_piste}>
                    {sharedCellsStart(1)}
                    <td className="infra-count" style={{ background: bg, borderTop: topBorder }}>0</td>
                    <td className="infra-count" style={{ background: bg, borderTop: topBorder }}>—</td>
                    <td className="infra-count" style={{ background: bg, borderTop: topBorder }}>—</td>
                    {sharedCellsEnd(1)}
                  </tr>
                ];
              }

              return typeEntries.map(([type, d], typeIndex) => (
                <tr key={`${item.code_piste}-${typeIndex}`}>
                  {typeIndex === 0 && sharedCellsStart(rowCount)}
                  <td className="infra-count" style={{ background: bg, ...(typeIndex === 0 ? { borderTop: topBorder } : {}) }}>{d.count}</td>
                  <td className="infra-count" style={{ background: bg, textAlign: "left", whiteSpace: "nowrap", ...(typeIndex === 0 ? { borderTop: topBorder } : {}) }}>{type}</td>
                  <td className="infra-count" style={{ background: bg, textAlign: "right", whiteSpace: "nowrap", ...(typeIndex === 0 ? { borderTop: topBorder } : {}) }}>{parseFloat(d.km).toFixed(3)} km</td>
                  {typeIndex === 0 && sharedCellsEnd(rowCount)}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
      <div className="dashboard-pagination">
        <p>
          Affichage de {filteredData.length} sur {data.length} elements
        </p>
      </div>
    </div>
  );
};

export default DashBoard;
