import React, { useState, useEffect, useCallback } from "react";
import authService from "./authService";
import "./ActivityLogPage.css";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const ACTION_TYPES = [
  { id: "create", label: "Création", color: "#059669", bg: "#D1FAE5" },
  { id: "update", label: "Modification", color: "#EA580C", bg: "#FFEDD5" },
  { id: "delete", label: "Suppression", color: "#DC2626", bg: "#FEE2E2" },
  { id: "login", label: "Connexion", color: "#2563EB", bg: "#DBEAFE" },
  { id: "logout", label: "Déconnexion", color: "#6B7280", bg: "#F3F4F6" },
  { id: "sync_upload", label: "Sync", color: "#7C3AED", bg: "#EDE9FE" },
];

const TABLE_NAMES = [
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
  "site_enquete",
  "enquete_polygone",
];

const ActivityLogPage = () => {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [users, setUsers] = useState([]);
  const [exporting, setExporting] = useState(false);

  // Filtres
  const [filterUser, setFilterUser] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterTable, setFilterTable] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

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
      if (filterTable) params.append("table_name", filterTable);
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
  }, [
    page,
    filterUser,
    filterAction,
    filterTable,
    filterDateFrom,
    filterDateTo,
  ]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadActions();
  }, [loadActions]);

  const getActionStyle = (type) => {
    const found = ACTION_TYPES.find((a) => a.id === type);
    return found || { label: type, color: "#6B7280", bg: "#F3F4F6" };
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

  const formatTableName = (name) => {
    if (!name) return "—";
    return name.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const handleResetFilters = () => {
    setFilterUser("");
    setFilterAction("");
    setFilterTable("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setPage(1);
  };

  // ===== GÉNÉRATION DU TITRE + SOUS-TITRE D'EXPORT =====
  const getExportTitleParts = () => {
    const selectedUser = users.find((u) => String(u.id) === String(filterUser));

    // Titre principal
    let title = "Journal d'activités";
    if (selectedUser) {
      title = `Journal d'activités par l'agent ${selectedUser.prenom} ${selectedUser.nom}`;
    }

    // Sous-titre : actions sélectionnées
    const actionLabels = {
      create: "Création de données",
      update: "Modification de données",
      delete: "Suppression de données",
      login: "Connexions",
      logout: "Déconnexions",
      sync_upload: "Synchronisation de données",
    };

    let subtitle = "";
    if (filterAction) {
      let label = actionLabels[filterAction] || filterAction;
      if (filterTable) {
        const tableFr = formatTableName(filterTable);
        // "Création de données" → "Création des Pistes"
        label = label.replace("de données", `des ${tableFr}`);
        label = label.replace("Connexions", `Connexions`);
        label = label.replace("Déconnexions", `Déconnexions`);
      }
      subtitle = label;
    } else if (filterTable) {
      subtitle = `Données : ${formatTableName(filterTable)}`;
    }

    // Période
    let period = "";
    if (filterDateFrom && filterDateTo) {
      period = `Du ${filterDateFrom} au ${filterDateTo}`;
    } else if (filterDateFrom) {
      period = `À partir du ${filterDateFrom}`;
    } else if (filterDateTo) {
      period = `Jusqu'au ${filterDateTo}`;
    }

    return { title, subtitle, period };
  };

  // ===== Pour le nom de fichier =====
  const getExportTitle = () => {
    const parts = getExportTitleParts();
    return [parts.title, parts.subtitle, parts.period]
      .filter(Boolean)
      .join(" — ");
  };

  // ===== CHARGER TOUTES LES DONNÉES FILTRÉES (sans pagination) =====
  const fetchAllFiltered = async () => {
    const headers = authService.getAuthHeader();
    const params = new URLSearchParams();
    params.append("page", "1");
    params.append("per_page", "10000");
    if (filterUser) params.append("login_id", filterUser);
    if (filterAction) params.append("action_type", filterAction);
    if (filterTable) params.append("table_name", filterTable);
    if (filterDateFrom) params.append("date_from", filterDateFrom);
    if (filterDateTo) params.append("date_to", filterDateTo);

    const res = await fetch(
      `http://localhost:8000/api/action-history/?${params.toString()}`,
      { headers },
    );
    if (res.ok) {
      const data = await res.json();
      return data.results || [];
    }
    return [];
  };

  // ===== EXPORT EXCEL =====
  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const allData = await fetchAllFiltered();
      const title = getExportTitle();
      const selectedUser = users.find(
        (u) => String(u.id) === String(filterUser),
      );

      const wb = XLSX.utils.book_new();
      const wsData = [];

      // En-tête titre
      wsData.push([title]);
      wsData.push([
        `Exporté le ${new Date().toLocaleString("fr-FR")} — ${allData.length} actions`,
      ]);
      wsData.push([]);

      // Stats résumé (du filtre actif, pas global)
      // Stats résumé (seulement les types présents)
      const countByType = (type) =>
        allData.filter((a) => a.action_type === type).length;
      const allStats = [
        ["Créations", countByType("create")],
        ["Modifications", countByType("update")],
        ["Suppressions", countByType("delete")],
        ["Synchronisations", countByType("sync_upload")],
        ["Connexions", countByType("login")],
        ["Déconnexions", countByType("logout")],
      ].filter(([_, count]) => count > 0);

      wsData.push(["Résumé"]);
      allStats.forEach((row) => wsData.push(row));
      wsData.push(["Total", allData.length]);
      wsData.push([]);

      // En-tête tableau
      wsData.push([
        "Date / Heure",
        "Agent",
        "Rôle",
        "Action",
        "Table",
        "Détails",
        "Source",
      ]);

      // Données
      allData.forEach((a) => {
        wsData.push([
          formatDate(a.created_at),
          `${a.user_prenom || ""} ${a.user_nom || ""}`.trim(),
          a.user_role || "—",
          getActionStyle(a.action_type).label,
          formatTableName(a.table_name),
          a.record_label || "—",
          a.source || "—",
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Largeur colonnes
      ws["!cols"] = [
        { wch: 22 },
        { wch: 20 },
        { wch: 14 },
        { wch: 16 },
        { wch: 22 },
        { wch: 40 },
        { wch: 10 },
      ];

      // Fusionner le titre sur toute la largeur
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Journal");

      const filename = `journal-activite-${selectedUser ? selectedUser.nom : "complet"}-${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (e) {
      console.error("Erreur export Excel:", e);
      alert("Erreur lors de l'export Excel");
    }
    setExporting(false);
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const allData = await fetchAllFiltered();
      const { title, subtitle, period } = getExportTitleParts();
      const countByType = (type) =>
        allData.filter((a) => a.action_type === type).length;

      const doc = new jsPDF({ orientation: "landscape" });
      const pageWidth = doc.internal.pageSize.width;

      // ===== EN-TÊTE CENTRÉ =====
      // Titre principal
      doc.setFontSize(18);
      doc.setTextColor(30, 60, 114);
      doc.text(title, pageWidth / 2, 20, { align: "center" });

      // Sous-titre (actions)
      let yPos = 28;
      if (subtitle) {
        doc.setFontSize(12);
        doc.setTextColor(80, 80, 80);
        doc.text(subtitle, pageWidth / 2, yPos, { align: "center" });
        yPos += 7;
      }

      // Période
      if (period) {
        doc.setFontSize(9);
        doc.setTextColor(120, 120, 120);
        doc.text(period, pageWidth / 2, yPos, { align: "center" });
        yPos += 6;
      }

      // Stats (seulement les non-zéro)
      const allStatsArr = [
        ["Créations", countByType("create")],
        ["Modifications", countByType("update")],
        ["Suppressions", countByType("delete")],
        ["Synchronisations", countByType("sync_upload")],
        ["Connexions", countByType("login")],
      ].filter(([_, count]) => count > 0);

      if (allStatsArr.length > 0) {
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        const statsText = allStatsArr
          .map(([label, count]) => `${label}: ${count}`)
          .join("  |  ");
        doc.text(statsText, pageWidth / 2, yPos, { align: "center" });
        yPos += 4;
      }

      // Info export
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `${allData.length} entrées  •  Exporté le ${new Date().toLocaleString("fr-FR")}`,
        pageWidth / 2,
        yPos + 3,
        { align: "center" },
      );
      yPos += 6;

      // Ligne de séparation
      doc.setDrawColor(30, 60, 114);
      doc.setLineWidth(0.5);
      doc.line(14, yPos, pageWidth - 14, yPos);

      // ===== TABLEAU =====

      const refLabel =
        filterTable === "pistes"
          ? "Code Piste"
          : filterTable === "chaussees"
            ? "Code Chaussée"
            : "Référence";

      const tableRows = allData.map((a) => [
        formatDate(a.created_at),
        `${a.user_prenom || ""} ${a.user_nom || ""}`.trim(),
        a.region_nom || "—",
        a.prefecture_nom || "—",
        a.commune_nom || "—",
        getActionStyle(a.action_type).label,
        formatTableName(a.table_name),
        a.record_label || "—",
      ]);

      autoTable(doc, {
        startY: yPos + 4,
        head: [
          [
            "Date / Heure",
            "Agent",
            "Région",
            "Préfecture",
            "Commune",
            "Action",
            "Table",
            refLabel,
          ],
        ],
        body: tableRows,
        styles: { fontSize: 7, cellPadding: 2.5 },
        headStyles: {
          fillColor: [30, 60, 114],
          textColor: 255,
          fontStyle: "bold",
          fontSize: 7.5,
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 34 },
          1: { cellWidth: 30 },
          2: { cellWidth: 28 },
          3: { cellWidth: 28 },
          4: { cellWidth: 28 },
          5: { cellWidth: 24 },
          6: { cellWidth: 24 },
          7: { cellWidth: 46 },
        },
        didParseCell: function (data) {
          if (data.section === "body" && data.column.index === 5) {
            const val = data.cell.raw;
            if (val === "Création") {
              data.cell.styles.textColor = [5, 150, 105];
              data.cell.styles.fontStyle = "bold";
            }
            if (val === "Modification") {
              data.cell.styles.textColor = [234, 88, 12];
              data.cell.styles.fontStyle = "bold";
            }
            if (val === "Suppression") {
              data.cell.styles.textColor = [220, 38, 38];
              data.cell.styles.fontStyle = "bold";
            }
            if (val === "Connexion") {
              data.cell.styles.textColor = [37, 99, 235];
              data.cell.styles.fontStyle = "bold";
            }
            if (val === "Sync") {
              data.cell.styles.textColor = [124, 58, 237];
              data.cell.styles.fontStyle = "bold";
            }
          }
        },
      });

      // Pied de page
      const pageCount = doc.internal.getNumberOfPages();
      const footerText = subtitle
        ? `GeoDNGR — ${title} — ${subtitle}`
        : `GeoDNGR — ${title}`;
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(
          `${footerText} — Page ${i}/${pageCount}`,
          14,
          doc.internal.pageSize.height - 8,
        );
      }

      const selectedUser = users.find(
        (u) => String(u.id) === String(filterUser),
      );
      const filename = `journal-activite-${selectedUser ? selectedUser.nom : "complet"}-${new Date().toISOString().split("T")[0]}.pdf`;
      doc.save(filename);
    } catch (e) {
      console.error("Erreur export PDF:", e);
      alert("Erreur lors de l'export PDF : " + e.message);
    }
    setExporting(false);
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

      {/* Stats — 6 cartes */}
      <div className="activity-log-stats">
        <div className="activity-stat-card">
          <div className="activity-stat-value">{stats.total_today || 0}</div>
          <div className="activity-stat-label">Aujourd'hui</div>
        </div>
        <div className="activity-stat-card green">
          <div className="activity-stat-value">{stats.creates_today || 0}</div>
          <div className="activity-stat-label">Créations</div>
        </div>
        <div className="activity-stat-card orange">
          <div className="activity-stat-value">{stats.updates_today || 0}</div>
          <div className="activity-stat-label">Modifications</div>
        </div>
        <div className="activity-stat-card red">
          <div className="activity-stat-value">{stats.deletes_today || 0}</div>
          <div className="activity-stat-label">Suppressions</div>
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

        <select
          value={filterTable}
          onChange={(e) => {
            setFilterTable(e.target.value);
            setPage(1);
          }}
          className="activity-filter-select"
        >
          <option value="">Toutes les tables</option>
          {TABLE_NAMES.map((t) => (
            <option key={t} value={t}>
              {formatTableName(t)}
            </option>
          ))}
        </select>

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

        {/* Boutons Export */}
        <div className="activity-export-buttons">
          <button
            onClick={handleExportExcel}
            disabled={exporting}
            className="activity-export-btn excel"
          >
            📊 Excel
          </button>
          <button
            onClick={handleExportPDF}
            disabled={exporting}
            className="activity-export-btn pdf"
          >
            📄 PDF
          </button>
        </div>
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
                <th>Action</th>
                <th>Table</th>
                <th>Détails</th>
                <th>Source</th>
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
                    <td>
                      <span
                        className="activity-badge"
                        style={{ background: style.bg, color: style.color }}
                      >
                        {style.label.toUpperCase()}
                      </span>
                    </td>
                    <td>{formatTableName(action.table_name)}</td>
                    <td className="activity-details">
                      {action.record_label || "—"}
                    </td>
                    <td>
                      <span className={`activity-source ${action.source}`}>
                        {action.source === "mobile" ? "📱" : "🖥️"}{" "}
                        {action.source}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {actions.length === 0 && (
                <tr>
                  <td
                    colSpan="6"
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
    </div>
  );
};

export default ActivityLogPage;
