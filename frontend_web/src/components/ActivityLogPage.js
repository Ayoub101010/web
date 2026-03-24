import React, { useState, useEffect, useCallback } from "react";
import authService from "./authService";
import "./ActivityLogPage.css";

const ACTION_TYPES = [
  {
    id: "sync_upload",
    label: "Synchronisation",
    color: "#7C3AED",
    bg: "#EDE9FE",
  },
  { id: "update", label: "Modification", color: "#EA580C", bg: "#FFEDD5" },
  { id: "login", label: "Connexion", color: "#2563EB", bg: "#DBEAFE" },
  { id: "logout", label: "Déconnexion", color: "#6B7280", bg: "#F3F4F6" },
];

const TABLE_FR = {
  pistes: "Pistes",
  chaussees: "Chaussées",
  buses: "Buses",
  dalots: "Dalots",
  ponts: "Ponts",
  passages_submersibles: "Passages submersibles",
  bacs: "Bacs",
  ecoles: "Écoles",
  marches: "Marchés",
  services_santes: "Services de santé",
  batiments_administratifs: "Bâtiments administratifs",
  infrastructures_hydrauliques: "Infrastructures hydrauliques",
  localites: "Localités",
  autres_infrastructures: "Autres infrastructures",
  points_coupures: "Points de coupures",
  points_critiques: "Points critiques",
  site_enquete: "Sites d'enquête",
  enquete_polygone: "Zones d'enquête",
  login: "Utilisateurs",
};

const ActivityLogPage = () => {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [users, setUsers] = useState([]);

  // Filtres
  const [filterUser, setFilterUser] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Modal
  const [selectedAction, setSelectedAction] = useState(null);

  const loadUsers = useCallback(async () => {
    try {
      const headers = authService.getAuthHeader();
      const res = await fetch("http://localhost:8000/api/users/", { headers });
      if (res.ok) {
        const data = await res.json();
        const list = data.users || data;
        setUsers(Array.isArray(list) ? list : []);
      }
    } catch (e) {}
  }, []);

  const loadActions = useCallback(async () => {
    setLoading(true);
    try {
      const headers = authService.getAuthHeader();
      const params = new URLSearchParams();
      params.append("page", page);
      params.append("per_page", "20");
      if (filterUser) params.append("login_id", filterUser);
      if (filterAction) params.append("action_type", filterAction);
      if (filterDateFrom) params.append("date_from", filterDateFrom);
      if (filterDateTo) params.append("date_to", filterDateTo);

      const res = await fetch(
        `http://localhost:8000/api/action-history/?${params.toString()}`,
        { headers },
      );
      if (res.ok) {
        const data = await res.json();
        setActions(data.results || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
        setStats(data.stats || {});
      }
    } catch (e) {
      console.error("Erreur chargement historique:", e);
    }
    setLoading(false);
  }, [page, filterUser, filterAction, filterDateFrom, filterDateTo]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);
  useEffect(() => {
    loadActions();
  }, [loadActions]);

  const getActionStyle = (type) => {
    return (
      ACTION_TYPES.find((a) => a.id === type) || {
        label: type,
        color: "#6B7280",
        bg: "#F3F4F6",
      }
    );
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatTableName = (name) => TABLE_FR[name] || name || "—";

  const handleResetFilters = () => {
    setFilterUser("");
    setFilterAction("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setPage(1);
  };

  // ===== PARSER LES DETAILS JSON =====
  const parseJSON = (str) => {
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  };

  // ===== RENDU DES DÉTAILS PAR TYPE =====
  const renderDetailsCell = (action) => {
    const type = action.action_type;

    if (type === "login") {
      const details = parseJSON(action.details);
      const mode = details?.mode === "offline" ? "hors-ligne" : "en ligne";
      return (
        <span style={{ color: "#2563EB", fontSize: "0.82rem" }}>
          Connexion {mode}
        </span>
      );
    }

    if (type === "logout") {
      return (
        <span style={{ color: "#6B7280", fontSize: "0.82rem" }}>
          Déconnexion
        </span>
      );
    }

    // Sync ou Modification → bouton "Voir les détails"
    return (
      <button
        className="activity-detail-btn"
        onClick={() => setSelectedAction(action)}
      >
        📋 Voir les détails
      </button>
    );
  };

  // ===== MODAL MODIFICATION =====
  const renderModificationModal = (action) => {
    const oldVals = parseJSON(action.old_values) || {};
    const newVals = parseJSON(action.new_values) || {};
    const changedFields = parseJSON(action.details) || Object.keys(newVals);

    // Trouver les champs qui ont vraiment changé
    const allFields = Object.keys(oldVals);

    return (
      <>
        <div className="activity-modal-info">
          <div className="activity-modal-info-item">
            <strong>Table :</strong>{" "}
            <span>{formatTableName(action.table_name)}</span>
          </div>
          {action.code_piste && (
            <div className="activity-modal-info-item">
              <strong>Code Piste :</strong> <span>{action.code_piste}</span>
            </div>
          )}
          {action.region_nom && (
            <div className="activity-modal-info-item">
              <strong>Région :</strong> <span>{action.region_nom}</span>
            </div>
          )}
          {action.prefecture_nom && (
            <div className="activity-modal-info-item">
              <strong>Préfecture :</strong> <span>{action.prefecture_nom}</span>
            </div>
          )}
          {action.commune_nom && (
            <div className="activity-modal-info-item">
              <strong>Commune :</strong> <span>{action.commune_nom}</span>
            </div>
          )}
          <div className="activity-modal-info-item">
            <strong>Modifié par :</strong>
            <span>
              {action.user_prenom} {action.user_nom} ({action.user_role})
            </span>
          </div>
          <div className="activity-modal-info-item">
            <strong>Date :</strong> <span>{formatDate(action.created_at)}</span>
          </div>
        </div>

        <table className="activity-diff-table">
          <thead>
            <tr>
              <th>Champ</th>
              <th>Ancienne valeur</th>
              <th>Nouvelle valeur</th>
            </tr>
          </thead>
          <tbody>
            {allFields.map((field) => {
              if (["fid", "id", "geom", "sqlite_id"].includes(field))
                return null;

              const oldVal = oldVals[field];
              const newVal = newVals[field];
              const isChanged =
                changedFields.includes(field) &&
                String(oldVal ?? "") !== String(newVal ?? "");

              return (
                <tr key={field}>
                  <td style={{ fontWeight: 500, color: "#334155" }}>
                    {field
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (l) => l.toUpperCase())}
                  </td>
                  <td
                    className={
                      isChanged
                        ? "activity-diff-old"
                        : "activity-diff-unchanged"
                    }
                  >
                    {oldVal != null ? String(oldVal) : "—"}
                  </td>
                  <td
                    className={
                      isChanged
                        ? "activity-diff-new"
                        : "activity-diff-unchanged"
                    }
                  >
                    {newVal != null ? String(newVal) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </>
    );
  };

  // ===== MODAL SYNCHRONISATION =====
  const renderSyncModal = (action) => {
    const details = parseJSON(action.details) || {};
    const summary = details.sync_summary || {};
    const totalItems = details.total_items || 0;

    return (
      <>
        <div className="activity-modal-info">
          <div className="activity-modal-info-item">
            <strong>Agent :</strong>
            <span>
              {action.user_prenom} {action.user_nom} ({action.user_role})
            </span>
          </div>
          <div className="activity-modal-info-item">
            <strong>Date :</strong> <span>{formatDate(action.created_at)}</span>
          </div>
          <div className="activity-modal-info-item">
            <strong>Total synchronisé :</strong>
            <span style={{ fontWeight: 700, color: "#7C3AED" }}>
              {totalItems} données
            </span>
          </div>
        </div>

        {/* Badges résumé */}
        <div className="activity-sync-summary">
          {Object.entries(summary).map(([table, count]) => (
            <span key={table} className="activity-sync-badge">
              {count} {formatTableName(table)}
            </span>
          ))}
        </div>

        {Object.keys(summary).length === 0 && (
          <p style={{ color: "#64748b", textAlign: "center", padding: "1rem" }}>
            Aucun détail de synchronisation disponible
          </p>
        )}
      </>
    );
  };

  // ===== MODAL PRINCIPAL =====
  const renderModal = () => {
    if (!selectedAction) return null;

    const type = selectedAction.action_type;
    const style = getActionStyle(type);

    let modalTitle = "Détails de l'action";
    if (type === "update") modalTitle = "Détails de la modification";
    if (type === "sync_upload") modalTitle = "Détails de la synchronisation";

    return (
      <div
        className="activity-modal-overlay"
        onClick={() => setSelectedAction(null)}
      >
        <div className="activity-modal" onClick={(e) => e.stopPropagation()}>
          <div className="activity-modal-header">
            <h3>
              <span
                className="activity-badge"
                style={{
                  background: style.bg,
                  color: style.color,
                  marginRight: "8px",
                }}
              >
                {style.label.toUpperCase()}
              </span>
              {modalTitle}
            </h3>
            <button
              className="activity-modal-close"
              onClick={() => setSelectedAction(null)}
            >
              ✕
            </button>
          </div>
          <div className="activity-modal-body">
            {type === "update" && renderModificationModal(selectedAction)}
            {type === "sync_upload" && renderSyncModal(selectedAction)}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="activity-log-wrapper">
      {/* Header */}
      <div className="activity-log-header">
        <div className="activity-log-header-icon">📋</div>
        <h1 className="activity-log-title">Journal d'activité</h1>
        <p className="activity-log-subtitle">
          Suivi des actions des agents terrain et administrateurs
        </p>
      </div>

      {/* Stats — 3 cartes */}
      <div
        className="activity-log-stats"
        style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
      >
        <div className="activity-stat-card orange">
          <div className="activity-stat-value">{stats.updates_today || 0}</div>
          <div className="activity-stat-label">Modifications</div>
        </div>
        <div className="activity-stat-card purple">
          <div className="activity-stat-value">{stats.syncs_today || 0}</div>
          <div className="activity-stat-label">Synchronisations</div>
        </div>
        <div className="activity-stat-card blue">
          <div className="activity-stat-value">{stats.logins_today || 0}</div>
          <div className="activity-stat-label">Connexions</div>
        </div>
      </div>

      {/* Filtres */}
      <div className="activity-log-filters">
        <select
          value={filterUser}
          onChange={(e) => {
            setFilterUser(e.target.value);
            setPage(1);
          }}
          className="activity-filter-select"
        >
          <option value="">Tous les agents</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.prenom} {u.nom}
            </option>
          ))}
        </select>

        <div className="activity-filter-chips">
          {ACTION_TYPES.map((a) => (
            <button
              key={a.id}
              className={`activity-chip ${filterAction === a.id ? "active" : ""}`}
              style={{
                borderColor: a.color,
                color: filterAction === a.id ? "#fff" : a.color,
                background: filterAction === a.id ? a.color : "transparent",
              }}
              onClick={() => {
                setFilterAction(filterAction === a.id ? "" : a.id);
                setPage(1);
              }}
            >
              {a.label}
            </button>
          ))}
        </div>

        <input
          type="date"
          value={filterDateFrom}
          onChange={(e) => {
            setFilterDateFrom(e.target.value);
            setPage(1);
          }}
          className="activity-filter-date"
        />
        <input
          type="date"
          value={filterDateTo}
          onChange={(e) => {
            setFilterDateTo(e.target.value);
            setPage(1);
          }}
          className="activity-filter-date"
        />

        <button onClick={handleResetFilters} className="activity-reset-btn">
          Réinitialiser
        </button>
      </div>

      {/* Tableau */}
      {loading ? (
        <div className="activity-loading">Chargement...</div>
      ) : (
        <div className="activity-table-container">
          <table className="activity-table">
            <thead>
              <tr>
                <th>Date / Heure</th>
                <th>Agent</th>
                <th>Rôle</th>
                <th>Action</th>
                <th>Détails</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((action) => {
                const style = getActionStyle(action.action_type);
                return (
                  <tr key={action.id}>
                    <td className="activity-date">
                      {formatDate(action.created_at)}
                    </td>
                    <td className="activity-user">
                      {action.user_prenom} {action.user_nom}
                    </td>
                    <td style={{ fontSize: "0.82rem", color: "#64748b" }}>
                      {action.user_role || "—"}
                    </td>
                    <td>
                      <span
                        className="activity-badge"
                        style={{ background: style.bg, color: style.color }}
                      >
                        {style.label.toUpperCase()}
                      </span>
                    </td>
                    <td>{renderDetailsCell(action)}</td>
                  </tr>
                );
              })}
              {actions.length === 0 && (
                <tr>
                  <td
                    colSpan="5"
                    style={{
                      textAlign: "center",
                      padding: "2rem",
                      color: "#999",
                    }}
                  >
                    Aucune action trouvée
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="activity-pagination">
        <span className="activity-pagination-info">
          Page {page} / {totalPages} — {total} actions au total
        </span>
        <div className="activity-pagination-buttons">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="activity-page-btn"
          >
            ← Précédent
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="activity-page-btn"
          >
            Suivant →
          </button>
        </div>
      </div>

      {/* Modal */}
      {renderModal()}
    </div>
  );
};

export default ActivityLogPage;
