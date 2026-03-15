import React, { useState, useEffect } from "react";
import userManagementService from "./userManagementService";
import "./GestionUserPage.css";
import authService from "./authService";
import { useIsMobile } from "../hooks/useIsMobile";
import CustomSelect from "./CustomSelect";

const INTERFACES = [
  { id: "carte_globale", label: "Carte Globale" },
  { id: "gestion_donnees", label: "Gestion des Données" },
  { id: "tableau_bord", label: "Tableau de Bord" },
  { id: "gestion_utilisateurs", label: "Gestion Utilisateurs" },
  { id: "suivi_donnees", label: "Suivi des Données" },
  { id: "export_carte", label: "Export Carte (Image/PDF)" },
];

const GestionUserPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [actionType, setActionType] = useState(""); // "view", "edit", "delete"
  const [showPassword, setShowPassword] = useState(false);
  const [resetRequests, setResetRequests] = useState([]);
  const [pendingResetCount, setPendingResetCount] = useState(0);
  const [visibleResetMdp, setVisibleResetMdp] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const isMobile = useIsMobile(768);

  const [regions, setRegions] = useState([]);
  const [prefectures, setPrefectures] = useState([]);

  const [newUser, setNewUser] = useState({
    nom: "",
    prenom: "",
    mail: "",
    mdp: "",
    role: "BTGR",
    region_ids: [],
    prefecture_ids: [],
    interface_names: ["carte_globale", "gestion_donnees", "tableau_bord"],
  });

  const [spgrRegionId, setSpgrRegionId] = useState("");

  // Statistiques
  const [stats, setStats] = useState({
    BTGR: 0,
    SPGR: 0,
    Admin: 0,
    Super_admin: 0,
  });

  const loadGeography = React.useCallback(async () => {
    try {
      const headers = authService.getAuthHeader();

      // Charger les régions
      const regRes = await fetch("http://localhost:8000/api/regions/", {
        headers,
      });

      if (regRes.ok) {
        const data = await regRes.json();

        // Extraction de la liste (Gestion du cas Paginated GeoJSON: results.features)
        let list = [];
        if (data.results) {
          list =
            data.results.features ||
            (Array.isArray(data.results) ? data.results : []);
        } else if (data.features) {
          list = data.features;
        } else if (Array.isArray(data)) {
          list = data;
        }

        // Normalisation: si GeoJSON, extraire properties
        const normalized = list.map((item) => {
          if (item.type === "Feature" && item.properties) {
            return { ...item.properties, id: item.properties.id || item.id };
          }
          return item;
        });

        setRegions(normalized);
      } else {
        const errorText = await regRes.text();
      }

      // Charger les préfectures
      const prefRes = await fetch("http://localhost:8000/api/prefectures/", {
        headers,
      });

      if (prefRes.ok) {
        const data = await prefRes.json();

        let list = [];
        if (data.results) {
          list =
            data.results.features ||
            (Array.isArray(data.results) ? data.results : []);
        } else if (data.features) {
          list = data.features;
        } else if (Array.isArray(data)) {
          list = data;
        }

        const normalized = list.map((item) => {
          if (item.type === "Feature" && item.properties) {
            return { ...item.properties, id: item.properties.id || item.id };
          }
          return item;
        });

        setPrefectures(normalized);
      } else {
        const errorText = await prefRes.text();
      }
    } catch (err) {}
  }, []);

  const calculateStats = React.useCallback((usersList) => {
    const total = usersList.length;
    const btgr = usersList.filter((u) => u.role === "BTGR").length;
    const spgr = usersList.filter((u) => u.role === "SPGR").length;
    const admins = usersList.filter((u) => u.role === "Admin").length;
    const super_admins = usersList.filter(
      (u) => u.role === "Super_admin",
    ).length;

    setStats({
      total,
      BTGR: btgr,
      SPGR: spgr,
      Admin: admins,
      Super_admin: super_admins,
    });
  }, []);

  const loadUsers = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await userManagementService.getUsers();
      if (response.success) {
        const usersList = response.data.users || response.data;
        setUsers(usersList);
        calculateStats(usersList);
      }
    } catch (error) {}
    setLoading(false);
  }, [calculateStats]);

  // ===== NOUVEAU : Charger les demandes de reset MDP =====
  const loadResetRequests = async () => {
    try {
      const headers = authService.getAuthHeader();
      const response = await fetch(
        "http://localhost:8000/api/password-reset-requests/?status=all",
        {
          headers,
        },
      );
      if (response.ok) {
        const data = await response.json();
        setResetRequests(data.results || []);
        setPendingResetCount(data.pending_count || 0);
      }
    } catch (error) {
      console.error("Erreur chargement demandes reset:", error);
    }
  };

  const handleMarkResetHandled = async (requestId) => {
    try {
      const headers = authService.getAuthHeader();
      const response = await fetch(
        "http://localhost:8000/api/password-reset-requests/",
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ request_id: requestId }),
        },
      );
      if (response.ok) {
        loadResetRequests();
      }
    } catch (error) {
      console.error("Erreur:", error);
    }
  };
  useEffect(() => {
    loadUsers();
    loadGeography();
    loadResetRequests();
  }, [loadUsers, loadGeography]);

  const handleAddUser = async () => {
    if (!newUser.nom || !newUser.prenom || !newUser.mail || !newUser.mdp) {
      alert("Nom, prénom, email et mot de passe sont obligatoires");
      return;
    }

    setLoading(true);
    try {
      const response = await userManagementService.createUser(newUser);
      if (response.success) {
        alert("Utilisateur créé avec succès !");
        setShowAddModal(false);
        setNewUser({
          nom: "",
          prenom: "",
          mail: "",
          mdp: "",
          role: "BTGR",
          communes_rurales_id: "",
          region_ids: [],
          prefecture_ids: [],
          interface_names: ["carte_globale", "gestion_donnees", "tableau_bord"],
        });
        loadUsers();
      } else {
        alert(
          "Erreur: " + (response.error || "Impossible de créer l'utilisateur"),
        );
      }
    } catch (error) {
      alert("Erreur lors de la création de l'utilisateur");
    }
    setLoading(false);
  };

  const handleEditUser = async () => {
    if (!selectedUser) return;

    setLoading(true);
    try {
      const updateData = {
        nom: selectedUser.nom,
        prenom: selectedUser.prenom,
        mail: selectedUser.mail,
        role: selectedUser.role,
        is_active:
          selectedUser.is_active !== undefined ? selectedUser.is_active : true,
        region_ids:
          selectedUser.region_ids ||
          (selectedUser.assigned_regions
            ? selectedUser.assigned_regions.map((r) => r.region_id)
            : []),
        prefecture_ids:
          selectedUser.prefecture_ids ||
          (selectedUser.assigned_prefectures
            ? selectedUser.assigned_prefectures.map((p) => p.prefecture_id)
            : []),
        interface_names:
          selectedUser.interface_names || selectedUser.allowed_interfaces || [],
      };

      const response = await userManagementService.updateUser(
        selectedUser.id,
        updateData,
      );
      if (response.success) {
        alert("Utilisateur modifié avec succès !");
        setActionType("");
        setSelectedUser(null);
        loadUsers();
      } else {
        alert(
          "Erreur: " +
            (response.error || "Impossible de modifier l'utilisateur"),
        );
      }
    } catch (error) {
      alert("Erreur lors de la modification");
    }
    setLoading(false);
  };

  const handleDeleteUser = async (userId) => {
    if (
      !window.confirm("Êtes-vous sûr de vouloir supprimer cet utilisateur ?")
    ) {
      return;
    }

    setLoading(true);
    try {
      const response = await userManagementService.deleteUser(userId);
      if (response.success) {
        alert("Utilisateur supprimé avec succès !");
        loadUsers();
      } else {
        alert("Erreur lors de la suppression");
      }
    } catch (error) {
      alert("Erreur lors de la suppression");
    }
    setLoading(false);
  };

  const handleAction = (user, type) => {
    setSelectedUser({ ...user });
    setActionType(type);
    setShowPassword(false);
  };

  const closeModal = () => {
    setSelectedUser(null);
    setActionType("");
  };

  // Filtrage des utilisateurs
  const filteredUsers = users.filter((user) => {
    const lower = searchTerm.toLowerCase();
    const matchesSearch =
      user.nom.toLowerCase().includes(lower) ||
      user.prenom.toLowerCase().includes(lower) ||
      user.mail.toLowerCase().includes(lower) ||
      (user.commune_nom && user.commune_nom.toLowerCase().includes(lower));

    const matchesRole = roleFilter === "" || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getRoleLabel = (role) => {
    switch (role) {
      case "Super_admin":
        return "Super Admin";
      case "Admin":
        return "Administrateur";
      case "BTGR":
        return "BTGR (Régional)";
      case "SPGR":
        return "SPGR (Préfectoral)";
      default:
        return role;
    }
  };

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case "Super_admin":
        return "green";
      case "Admin":
        return "blue";
      case "BTGR":
        return "orange";
      case "SPGR":
        return "purple";
      default:
        return "gray";
    }
  };

  return (
    <div className="gestion-user-wrapper">
      <div className="gestion-header">
        <img
          src="https://img.icons8.com/ios-filled/50/security-checked.png"
          alt="icon"
        />
        <h1>Gestion des Utilisateurs</h1>
        <p>Système de gestion des comptes utilisateurs - Guinée</p>
      </div>

      {/* Statistiques */}
      <div className="dashboard-stats">
        <div className="stat-card">
          <div className="stat-label">Total Utilisateurs</div>
          <div className="stat-value">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">BTGR</div>
          <div className="stat-value">{stats.BTGR}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">SPGR</div>
          <div className="stat-value">{stats.SPGR}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Admins</div>
          <div className="stat-value">{stats.Admin}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Super Admins</div>
          <div className="stat-value">{stats.Super_admin}</div>
        </div>
      </div>

      {/* ===== Bandeau demandes de reset MDP ===== */}
      {resetRequests.length > 0 && (
        <div
          style={{
            background: "linear-gradient(135deg, #FEF2F2, #FFF7ED)",
            border: "1px solid #FECACA",
            borderRadius: "12px",
            padding: "1rem 1.25rem",
            marginBottom: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              {pendingResetCount > 0 && (
                <span
                  style={{
                    background: "#DC2626",
                    color: "#fff",
                    borderRadius: "50%",
                    width: "24px",
                    height: "24px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.75rem",
                    fontWeight: "700",
                  }}
                >
                  {pendingResetCount}
                </span>
              )}
              <strong style={{ color: "#991B1B", fontSize: "0.95rem" }}>
                Demandes de mot de passe
                {pendingResetCount > 0
                  ? ` (${pendingResetCount} en attente)`
                  : " (toutes traitées)"}
              </strong>
            </div>
          </div>
          <div
            style={{
              maxHeight: "250px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            {resetRequests.map((req) => {
              const isPending = req.status === "pending";
              const mdpVisible = visibleResetMdp[req.id] || false;

              return (
                <div
                  key={req.id}
                  style={{
                    background: isPending ? "#fff" : "#F0FDF4",
                    borderRadius: "8px",
                    padding: "0.75rem 1rem",
                    border: isPending
                      ? "1px solid #E5E7EB"
                      : "1px solid #BBF7D0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    opacity: isPending ? 1 : 0.85,
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <strong style={{ color: "#1E293B" }}>
                        {req.user_prenom} {req.user_nom}
                      </strong>
                      <span style={{ color: "#64748B", fontSize: "0.85rem" }}>
                        {req.email}
                      </span>
                      {!isPending && (
                        <span
                          style={{
                            background: "#D1FAE5",
                            color: "#065F46",
                            fontSize: "0.7rem",
                            fontWeight: "700",
                            padding: "2px 8px",
                            borderRadius: "999px",
                          }}
                        >
                          ✓ TRAITÉ
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "#64748B",
                        marginTop: "3px",
                      }}
                    >
                      📞 <strong>{req.telephone}</strong>
                      &nbsp;·&nbsp; 🔑 MDP :&nbsp;
                      <code
                        style={{
                          background: "#F1F5F9",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontSize: "0.85rem",
                          fontWeight: "600",
                          letterSpacing: mdpVisible ? "0.5px" : "2px",
                        }}
                      >
                        {mdpVisible ? req.user_mdp || "—" : "••••••"}
                      </code>
                      <button
                        type="button"
                        onClick={() =>
                          setVisibleResetMdp((prev) => ({
                            ...prev,
                            [req.id]: !prev[req.id],
                          }))
                        }
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "0.8rem",
                          marginLeft: "4px",
                          color: mdpVisible ? "#DC2626" : "#0284C7",
                        }}
                      >
                        {mdpVisible ? "🙈" : "👁️"}
                      </button>
                      &nbsp;·&nbsp; 🕐{" "}
                      {new Date(req.created_at).toLocaleString("fr-FR")}
                      {!isPending && req.handled_at && (
                        <>
                          &nbsp;·&nbsp; ✅ traité le{" "}
                          {new Date(req.handled_at).toLocaleString("fr-FR")}
                        </>
                      )}
                    </div>
                  </div>

                  {isPending ? (
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            `Avez-vous bien communiqué le mot de passe à ${req.user_prenom} ${req.user_nom} ?`,
                          )
                        ) {
                          handleMarkResetHandled(req.id);
                        }
                      }}
                      style={{
                        background: "#059669",
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        padding: "0.4rem 0.8rem",
                        fontSize: "0.8rem",
                        fontWeight: "600",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      ✅ Marquer comme traité
                    </button>
                  ) : (
                    <span
                      style={{
                        color: "#059669",
                        fontSize: "0.8rem",
                        fontWeight: "600",
                      }}
                    >
                      ✅ Résolu
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* Contrôles */}
      <div className="gestion-controls">
        <input
          type="text"
          placeholder="🔍 Rechercher par nom, email, commune..."
          className="search-input"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <div className="btn-group">
          <CustomSelect
            className="role-filter-select cselect-fullwidth"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">Tous les rôles</option>
            <option value="BTGR">BTGR</option>
            <option value="SPGR">SPGR</option>
            <option value="Admin">Administrateurs</option>
            <option value="Super_admin">Super Admins</option>
          </CustomSelect>
          <button
            className="btn green"
            onClick={() => {
              loadGeography(); // Forcer le rafraîchissement des données avant d'ouvrir
              setShowAddModal(true);
            }}
          >
            ➕ Nouvel utilisateur
          </button>
        </div>
      </div>

      {/* Table des utilisateurs */}
      <div className="users-table-container">
        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.2rem", color: "#666" }}>
              Chargement des utilisateurs...
            </div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>
                  <input type="checkbox" />
                </th>
                <th>Utilisateur</th>
                <th>Email</th>
                <th>Rôle</th>
                <th>Couverture Géographique</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    <input type="checkbox" />
                  </td>
                  <td>
                    <strong>
                      {user.nom} {user.prenom}
                    </strong>
                    <br />
                    <small style={{ color: "#666" }}>ID: {user.id}</small>
                  </td>
                  <td>{user.mail}</td>
                  <td>
                    <span className={`badge ${getRoleBadgeClass(user.role)}`}>
                      {getRoleLabel(user.role)}
                    </span>
                  </td>
                  <td>
                    {user.role === "BTGR" ? (
                      <div>
                        <strong>
                          {user.assigned_regions?.length || 0} Région(s)
                        </strong>
                        <div
                          style={{
                            fontSize: "0.8rem",
                            color: "#666",
                            maxWidth: "200px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {user.assigned_regions
                            ?.map((r) => r.region_nom)
                            .join(", ")}
                        </div>
                      </div>
                    ) : user.role === "SPGR" ? (
                      <div>
                        <strong>
                          {user.assigned_prefectures?.length || 0} Préfecture(s)
                        </strong>
                        <div
                          style={{
                            fontSize: "0.8rem",
                            color: "#666",
                            maxWidth: "200px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {user.assigned_prefectures
                            ?.map((p) => p.prefecture_nom)
                            .join(", ")}
                        </div>
                      </div>
                    ) : user.role === "Super_admin" || user.role === "Admin" ? (
                      <span style={{ color: "#38a169", fontWeight: "600" }}>
                        Toute la Guinée
                      </span>
                    ) : (
                      <>
                        <strong>{user.commune_nom || "Non assignée"}</strong>
                        {user.prefecture_nom && (
                          <div style={{ fontSize: "0.8rem", color: "#666" }}>
                            {user.prefecture_nom}, {user.region_nom}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td className="actions">
                    <button
                      className="voir"
                      onClick={() => handleAction(user, "view")}
                    >
                      👁️ Voir
                    </button>
                    <button
                      className="modifier"
                      onClick={() => handleAction(user, "edit")}
                    >
                      ✏️ Modifier
                    </button>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan="6"
                    style={{
                      textAlign: "center",
                      padding: "2rem",
                      color: "#666",
                    }}
                  >
                    Aucun utilisateur trouvé
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Layout Card Mobile */}
      <div className="users-cards">
        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.2rem", color: "#666" }}>
              Chargement des utilisateurs...
            </div>
          </div>
        ) : (
          filteredUsers.map((user) => (
            <div className="user-card" key={user.id}>
              <div className="user-card-header">
                <h3>
                  {user.nom} {user.prenom}
                </h3>
                <span className={`badge ${getRoleBadgeClass(user.role)}`}>
                  {getRoleLabel(user.role)}
                </span>
              </div>

              <div className="user-card-body">
                <div className="user-card-field">
                  <span className="user-card-field-label">ID</span>
                  <span className="user-card-field-value">{user.id}</span>
                </div>

                <div className="user-card-field">
                  <span className="user-card-field-label">Email</span>
                  <span className="user-card-field-value">{user.mail}</span>
                </div>

                <div className="user-card-field full-width">
                  <span className="user-card-field-label">
                    Couverture Géographique
                  </span>
                  <span className="user-card-field-value">
                    {user.role === "BTGR" ? (
                      <div>
                        <strong>
                          {user.assigned_regions?.length || 0} Région(s)
                        </strong>
                        <div
                          style={{
                            fontSize: "0.85rem",
                            color: "#666",
                            marginTop: "4px",
                          }}
                        >
                          {user.assigned_regions
                            ?.map((r) => r.region_nom)
                            .join(", ")}
                        </div>
                      </div>
                    ) : user.role === "SPGR" ? (
                      <div>
                        <strong>
                          {user.assigned_prefectures?.length || 0} Préfecture(s)
                        </strong>
                        <div
                          style={{
                            fontSize: "0.85rem",
                            color: "#666",
                            marginTop: "4px",
                          }}
                        >
                          {user.assigned_prefectures
                            ?.map((p) => p.prefecture_nom)
                            .join(", ")}
                        </div>
                      </div>
                    ) : user.role === "Super_admin" || user.role === "Admin" ? (
                      <span style={{ color: "#38a169", fontWeight: "600" }}>
                        Toute la Guinée
                      </span>
                    ) : (
                      <>
                        <strong>{user.commune_nom || "Non assignée"}</strong>
                        {user.prefecture_nom && (
                          <div
                            style={{
                              fontSize: "0.85rem",
                              color: "#666",
                              marginTop: "4px",
                            }}
                          >
                            {user.prefecture_nom}, {user.region_nom}
                          </div>
                        )}
                      </>
                    )}
                  </span>
                </div>

                <div className="user-card-actions">
                  <button
                    className="voir"
                    onClick={() => handleAction(user, "view")}
                  >
                    👁️ Voir
                  </button>
                  <button
                    className="modifier"
                    onClick={() => handleAction(user, "edit")}
                  >
                    ✏️ Modifier
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
        {filteredUsers.length === 0 && !loading && (
          <div
            style={{
              textAlign: "center",
              padding: "2rem",
              color: "#666",
              background: "white",
              borderRadius: "12px",
              marginTop: "1rem",
            }}
          >
            Aucun utilisateur trouvé
          </div>
        )}
      </div>

      {/* ========= MODALES UTILISATEUR (VOIR / EDIT / DELETE) — hors table/cards pour être toujours visibles ========= */}
      {selectedUser && (
        <div className="modal-overlay">
          <div className="modal-shell">
            <div className="modal-inner">
              <div className="modal-inner-header">
                <h2>
                  {actionType === "view" && "Détails de l'utilisateur"}
                  {actionType === "edit" && "Modifier l'utilisateur"}
                  {actionType === "delete" && "Confirmation de suppression"}
                </h2>
              </div>

              <div className="modal-inner-body">
                {/* MODE LECTURE */}
                {actionType === "view" && (
                  <div className="modal-view-content">
                    <p>
                      <strong>Nom :</strong> {selectedUser.nom}{" "}
                      {selectedUser.prenom}
                    </p>
                    <p>
                      <strong>Email :</strong> {selectedUser.mail}
                    </p>
                    <p>
                      <strong>Rôle :</strong> {getRoleLabel(selectedUser.role)}
                    </p>

                    {/* ===== Affichage du mot de passe ===== */}
                    <div
                      style={{
                        marginTop: "1rem",
                        padding: "0.8rem 1rem",
                        background: "#f8fafc",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.5rem",
                        }}
                      >
                        <div>
                          <strong
                            style={{ fontSize: "0.85rem", color: "#64748b" }}
                          >
                            Mot de passe :
                          </strong>
                          <span
                            style={{
                              marginLeft: "0.5rem",
                              fontFamily: "monospace",
                              fontSize: "1rem",
                              fontWeight: "600",
                              color: "#1e293b",
                              letterSpacing: showPassword ? "0.5px" : "2px",
                            }}
                          >
                            {showPassword
                              ? selectedUser.mdp || "Non disponible"
                              : "••••••••"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          style={{
                            background: showPassword ? "#fee2e2" : "#e0f2fe",
                            color: showPassword ? "#dc2626" : "#0284c7",
                            border: "none",
                            borderRadius: "6px",
                            padding: "0.35rem 0.75rem",
                            fontSize: "0.8rem",
                            fontWeight: "600",
                            cursor: "pointer",
                            transition: "all 0.2s",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {showPassword ? "🙈 Masquer" : "👁️ Révéler"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* MODE ÉDITION */}
                {actionType === "edit" && (
                  <form
                    className="edit-form"
                    onSubmit={(e) => e.preventDefault()}
                  >
                    <label>Nom</label>
                    <input
                      type="text"
                      value={selectedUser.nom}
                      onChange={(e) =>
                        setSelectedUser({
                          ...selectedUser,
                          nom: e.target.value,
                        })
                      }
                    />

                    <label>Prénom</label>
                    <input
                      type="text"
                      value={selectedUser.prenom}
                      onChange={(e) =>
                        setSelectedUser({
                          ...selectedUser,
                          prenom: e.target.value,
                        })
                      }
                    />

                    <label>Email</label>
                    <input
                      type="email"
                      value={selectedUser.mail}
                      onChange={(e) =>
                        setSelectedUser({
                          ...selectedUser,
                          mail: e.target.value,
                        })
                      }
                    />

                    <label>Rôle</label>
                    <CustomSelect
                      className="cselect-form"
                      value={selectedUser.role}
                      onChange={(e) =>
                        setSelectedUser({
                          ...selectedUser,
                          role: e.target.value,
                        })
                      }
                    >
                      <option value="BTGR">BTGR (Régional)</option>
                      <option value="SPGR">SPGR (Préfectoral)</option>
                      <option value="Admin">Administrateur</option>
                      <option value="Super_admin">Super Administrateur</option>
                    </CustomSelect>

                    {selectedUser.role === "BTGR" && (
                      <>
                        <label style={{ gridColumn: "span 2" }}>
                          Régions Assignées
                        </label>
                        <div
                          className="multi-select-container"
                          style={{ gridColumn: "span 2" }}
                        >
                          {Array.isArray(regions) &&
                            regions.map((reg) => (
                              <label key={reg.id} className="checkbox-item">
                                <input
                                  type="checkbox"
                                  checked={
                                    selectedUser.region_ids?.includes(reg.id) ||
                                    selectedUser.assigned_regions?.some(
                                      (r) => r.region_id === reg.id,
                                    )
                                  }
                                  onChange={(e) => {
                                    const currentIds =
                                      selectedUser.region_ids ||
                                      selectedUser.assigned_regions?.map(
                                        (r) => r.region_id,
                                      ) ||
                                      [];
                                    const newIds = e.target.checked
                                      ? [...currentIds, reg.id]
                                      : currentIds.filter(
                                          (id) => id !== reg.id,
                                        );
                                    setSelectedUser({
                                      ...selectedUser,
                                      region_ids: newIds,
                                    });
                                  }}
                                />
                                {reg.nom}
                              </label>
                            ))}
                        </div>
                      </>
                    )}

                    {selectedUser.role === "SPGR" && (
                      <>
                        <label style={{ gridColumn: "span 2" }}>
                          Région de référence
                        </label>
                        <CustomSelect
                          className="cselect-form"
                          value={selectedUser.temp_region_id || ""}
                          onChange={(e) =>
                            setSelectedUser({
                              ...selectedUser,
                              temp_region_id: e.target.value,
                            })
                          }
                        >
                          <option value="">
                            -- Sélectionner une région --
                          </option>
                          {regions.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.nom}
                            </option>
                          ))}
                        </CustomSelect>

                        <label style={{ gridColumn: "span 2" }}>
                          Préfectures Assignées
                        </label>
                        <div
                          className="multi-select-container"
                          style={{ gridColumn: "span 2" }}
                        >
                          {Array.isArray(prefectures) &&
                            prefectures
                              .filter(
                                (p) =>
                                  selectedUser.temp_region_id &&
                                  (p.regions_id ===
                                    parseInt(selectedUser.temp_region_id) ||
                                    p.regions_id_id ===
                                      parseInt(selectedUser.temp_region_id)),
                              )
                              .map((pref) => (
                                <label key={pref.id} className="checkbox-item">
                                  <input
                                    type="checkbox"
                                    checked={
                                      selectedUser.prefecture_ids?.includes(
                                        pref.id,
                                      ) ||
                                      selectedUser.assigned_prefectures?.some(
                                        (p) => p.prefecture_id === pref.id,
                                      )
                                    }
                                    onChange={(e) => {
                                      const currentIds =
                                        selectedUser.prefecture_ids ||
                                        selectedUser.assigned_prefectures?.map(
                                          (p) => p.prefecture_id,
                                        ) ||
                                        [];
                                      const newIds = e.target.checked
                                        ? [...currentIds, pref.id]
                                        : currentIds.filter(
                                            (id) => id !== pref.id,
                                          );
                                      setSelectedUser({
                                        ...selectedUser,
                                        prefecture_ids: newIds,
                                      });
                                    }}
                                  />
                                  {pref.nom}
                                </label>
                              ))}
                        </div>
                      </>
                    )}

                    <label style={{ gridColumn: "span 2" }}>
                      Accès aux Interfaces
                    </label>
                    <div
                      className="multi-select-container"
                      style={{ gridColumn: "span 2" }}
                    >
                      {INTERFACES.map((itf) => (
                        <label key={itf.id} className="checkbox-item">
                          <input
                            type="checkbox"
                            checked={
                              selectedUser.interface_names?.includes(itf.id) ||
                              selectedUser.allowed_interfaces?.includes(itf.id)
                            }
                            onChange={(e) => {
                              const currentInterfaces =
                                selectedUser.interface_names ||
                                selectedUser.allowed_interfaces ||
                                [];
                              const newInterfaces = e.target.checked
                                ? [...currentInterfaces, itf.id]
                                : currentInterfaces.filter(
                                    (name) => name !== itf.id,
                                  );
                              setSelectedUser({
                                ...selectedUser,
                                interface_names: newInterfaces,
                              });
                            }}
                          />
                          {itf.label}
                        </label>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="btn green"
                      onClick={handleEditUser}
                    >
                      💾 Enregistrer
                    </button>
                  </form>
                )}

                {/* MODE SUPPRESSION */}
                {actionType === "delete" && (
                  <div className="modal-delete-content">
                    <p>
                      Voulez-vous vraiment supprimer{" "}
                      <strong>
                        {selectedUser.nom} {selectedUser.prenom}
                      </strong>{" "}
                      ?
                    </p>
                    <div className="delete-actions">
                      <button
                        className="btn red"
                        onClick={() => {
                          handleDeleteUser(selectedUser.id);
                          closeModal();
                        }}
                      >
                        🗑️ Oui, supprimer
                      </button>
                      <button className="btn" onClick={closeModal}>
                        Annuler
                      </button>
                    </div>
                  </div>
                )}

                {actionType !== "delete" && (
                  <button className="btn modal-close-btn" onClick={closeModal}>
                    ❌ Fermer
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========= MODALE AJOUT D'UTILISATEUR — hors table/cards pour être toujours visible ========= */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-shell modal-shell-wide">
            <div className="modal-inner">
              <div className="modal-inner-header">
                <h2>Nouvel Utilisateur</h2>
              </div>
              <div className="modal-inner-body">
                <form
                  className="edit-form"
                  onSubmit={(e) => e.preventDefault()}
                >
                  <label>Nom *</label>
                  <input
                    type="text"
                    value={newUser.nom}
                    onChange={(e) =>
                      setNewUser({ ...newUser, nom: e.target.value })
                    }
                    placeholder="Nom de famille"
                  />

                  <label>Prénom *</label>
                  <input
                    type="text"
                    value={newUser.prenom}
                    onChange={(e) =>
                      setNewUser({ ...newUser, prenom: e.target.value })
                    }
                    placeholder="Prénom"
                  />

                  <label>Email *</label>
                  <input
                    type="email"
                    value={newUser.mail}
                    onChange={(e) =>
                      setNewUser({ ...newUser, mail: e.target.value })
                    }
                    placeholder="adresse@email.com"
                  />

                  <label>Mot de passe *</label>
                  <input
                    type="password"
                    value={newUser.mdp}
                    onChange={(e) =>
                      setNewUser({ ...newUser, mdp: e.target.value })
                    }
                    placeholder="Mot de passe"
                  />

                  <label>Rôle *</label>
                  <CustomSelect
                    className="cselect-form"
                    value={newUser.role}
                    onChange={(e) =>
                      setNewUser({ ...newUser, role: e.target.value })
                    }
                  >
                    <option value="BTGR">BTGR (Régional)</option>
                    <option value="SPGR">SPGR (Préfectoral)</option>
                    <option value="Admin">Administrateur</option>
                    <option value="Super_admin">Super Administrateur</option>
                  </CustomSelect>

                  {newUser.role === "BTGR" && (
                    <>
                      <label style={{ gridColumn: "span 2" }}>
                        Régions Assignées
                      </label>
                      <div
                        className="multi-select-container"
                        style={{ gridColumn: "span 2" }}
                      >
                        {Array.isArray(regions) &&
                          regions.map((reg) => (
                            <label key={reg.id} className="checkbox-item">
                              <input
                                type="checkbox"
                                checked={newUser.region_ids.includes(reg.id)}
                                onChange={(e) => {
                                  const newIds = e.target.checked
                                    ? [...newUser.region_ids, reg.id]
                                    : newUser.region_ids.filter(
                                        (id) => id !== reg.id,
                                      );
                                  setNewUser({
                                    ...newUser,
                                    region_ids: newIds,
                                  });
                                }}
                              />
                              {reg.nom}
                            </label>
                          ))}
                      </div>
                    </>
                  )}

                  {newUser.role === "SPGR" && (
                    <>
                      <label style={{ gridColumn: "span 2" }}>
                        Région de référence
                      </label>
                      <CustomSelect
                        className="cselect-form"
                        value={spgrRegionId}
                        onChange={(e) => setSpgrRegionId(e.target.value)}
                      >
                        <option value="">-- Sélectionner une région --</option>
                        {regions.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.nom}
                          </option>
                        ))}
                      </CustomSelect>
                      <label style={{ gridColumn: "span 2" }}>
                        Préfectures Assignées
                      </label>
                      <div
                        className="multi-select-container"
                        style={{ gridColumn: "span 2" }}
                      >
                        {Array.isArray(prefectures) &&
                          prefectures
                            .filter(
                              (p) =>
                                spgrRegionId &&
                                (p.regions_id === parseInt(spgrRegionId) ||
                                  p.regions_id_id === parseInt(spgrRegionId)),
                            )
                            .map((pref) => (
                              <label key={pref.id} className="checkbox-item">
                                <input
                                  type="checkbox"
                                  checked={newUser.prefecture_ids.includes(
                                    pref.id,
                                  )}
                                  onChange={(e) => {
                                    const newIds = e.target.checked
                                      ? [...newUser.prefecture_ids, pref.id]
                                      : newUser.prefecture_ids.filter(
                                          (id) => id !== pref.id,
                                        );
                                    setNewUser({
                                      ...newUser,
                                      prefecture_ids: newIds,
                                    });
                                  }}
                                />
                                {pref.nom}
                              </label>
                            ))}
                      </div>
                    </>
                  )}

                  <label style={{ gridColumn: "span 2" }}>
                    Accès aux Interfaces
                  </label>
                  <div
                    className="multi-select-container"
                    style={{ gridColumn: "span 2" }}
                  >
                    {INTERFACES.map((itf) => (
                      <label key={itf.id} className="checkbox-item">
                        <input
                          type="checkbox"
                          checked={newUser.interface_names.includes(itf.id)}
                          onChange={(e) => {
                            const newInterfaces = e.target.checked
                              ? [...newUser.interface_names, itf.id]
                              : newUser.interface_names.filter(
                                  (name) => name !== itf.id,
                                );
                            setNewUser({
                              ...newUser,
                              interface_names: newInterfaces,
                            });
                          }}
                        />
                        {itf.label}
                      </label>
                    ))}
                  </div>

                  <div
                    style={{
                      gridColumn: "span 2",
                      display: "flex",
                      gap: "1rem",
                      marginTop: "1rem",
                    }}
                  >
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setShowAddModal(false)}
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      className="btn green"
                      onClick={handleAddUser}
                      disabled={loading}
                    >
                      {loading ? "Création..." : "Créer l'utilisateur"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GestionUserPage;
