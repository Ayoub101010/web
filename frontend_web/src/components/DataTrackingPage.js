// DataTrackingPage.js
import React, { useEffect, useState, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import "./DashBoard.css";
import dataservice, { updateRow } from "./dataservice";
import { useAuth } from "./AuthContext";
import * as XLSX from "xlsx";

import hybridCache from "./hybridcache";
import GeographicFilter from "./GeographicFilterWithZoom";
import { CustomDateInput } from "./CustomDatePicker";

// ── Colonnes à masquer complètement ─────────────────────────────────────────
const HIDDEN_COLUMNS = new Set([
  "fid", "id", "gid", "sqlite_id", "code_gps",
  "login_id", "login", "utilisateur", "communes_rurales_id", "commune_id", "commune_rural_id",
  "region_id", "prefecture_id",
  "chaussee_id",
  // doublons : le serializer renvoie ces champs en plus de commune_name/prefecture_name/region_name
  "commune", "commune_nom",
  "prefecture", "prefecture_nom",
  "region", "region_nom",
  // champs techniques inutiles dans le tableau
  "localisation_complete", "infrastructures_par_type",
  // horodatages masqués dans toutes les couches
  "created_at", "updated_at",
]);

// ── Colonnes à masquer par couche ────────────────────────────────────────────
const LAYER_HIDDEN_COLUMNS = {
  // ppr_itial : "type" est écrasé par 'ppr_itial' par le sérialiseur (usage clustering)
  // la vraie valeur est dans "original_type"
  ppr_itial: new Set(["type"]),
};

// ── Colonnes affichées en lecture seule (grisées, non modifiables) ───────────
const READONLY_COLUMNS = new Set([
  "code_piste",
  "heure_debut", "heure_fin",
  "existence_intersection",
  "longueur", "kilometrage", "length_km", "km",
  "superficie_en_ha", "superficie_enquetes_ha", "superficie_digitalisee",
  "nombre_intersections",
  "intersections_json",
  "commune_name", "prefecture_name", "region_name",
  "note_globale",
  "login", "utilisateur",
]);

function isReadOnlyColumn(col) {
  return READONLY_COLUMNS.has(col) || /^[xy]_/.test(col);
}

// ── Colonnes avec liste de choix globales (toutes couches) ───────────────────
const COLUMN_SELECT_OPTIONS = {
  // Piste
  type_occupation:  ['Urbain', 'Semi Urbain', 'Rural', 'Rizipiscicole', 'Autre'],
  frequence_trafic: ['Quotidien', 'Hebdomadaire', 'Mensuel', 'Saisonnier'],
  type_trafic:      ['Véhicules Légers', 'Poids Lourds', 'Motos', 'Piétons', 'Autre'],
  // Chaussée
  type_chaus: ['Bitume', 'Latérite', 'Terre', 'Bouwal', 'Déviation', 'Coupure', 'Submersible', 'Col', 'Autre'],
  etat_piste: ['Bon état', 'Moyennement dégradée', 'Fortement dégradée'],
  // Bac
  type_bac: ['Manuel', 'Motorisé'],
  // Passage submersible
  type_mater: ['béton', 'bloc de pierre', 'gabion', 'autre'],
  // Pont
  type_pont: ['béton', 'bois', 'métallique', 'autre'],
  // Points coupures / critiques
  cause_coup: ['Détruit (permanent)', 'Inondé (temporaire)'],
  type_point: ['nid de poule', 'trou'],
};
// ── Options spécifiques par couche (prioritaire sur COLUMN_SELECT_OPTIONS) ───
const LAYER_COLUMN_SELECT_OPTIONS = {
  localites:                  { type: ['village', 'chef-lieu de district', 'chef-lieu de préfecture', 'ville', 'autre'] },
  ecoles:                     { type: ['primaire', 'secondaire', 'universitaire'] },
  services_santes:            { type: ['dispensaire', 'centre de santé', 'hôpital'] },
  marches:                    { type: ['quotidien', 'hebdomadaire'] },
  ppr_itial:                  { type: ['Arrière Mangrove', 'Bas-fond', 'Grande plaine', 'Moyenne plaine', 'Petite plaine', "Plaine d'arrière Mangrove", 'Plaine de Mangrove'], original_type: ['site de plaine', 'autre'], amenage_ou_non_amenage: ['Aménagé', 'Non aménagé'] },
  autres_infrastructures:     { type: ['Église', 'Mosquée', 'Terrain de foot', 'Cimetière', 'Antenne orange', "Centre d'alphabétisation", 'Magasin de stockage', 'Maison des jeunes', 'Étang'] },
  infrastructures_hydrauliques: { type: ['forage', 'source améliorée', 'autre'] },
  batiments_administratifs:   { type: ['mairie', 'poste de police', 'bureau de poste', 'autre'] },
  // situation a des options différentes selon la couche
  ponts:  { situation: ['à réaliser', 'en cours de réalisation', 'existant', 'ancien', 'nouveau', 'nouveau (1ans)'] },
  dalots: { situation: ['à réaliser', 'en cours', 'existant'] },
  pistes: { type_occupation: ['Urbain', 'Semi Urbain', 'Rural', 'Rizipiscicole',  'Traversé Route', 'Axe coupure', 'Traversé Piste', 'Axe deviation', 'Axe','Autre', ] },
};
// Colonnes à sélection multiple globales (valeur stockée en virgule-séparée)
const COLUMN_MULTI_SELECT = new Set(['type_trafic']);
// Colonnes à sélection multiple spécifiques par couche
const LAYER_COLUMN_MULTI_SELECT = {
  ecoles: new Set(['type']),
};

// ── Colonnes avec sélecteur de date ──────────────────────────────────────────
// 'date' → <input type="date">  |  'datetime-local' → <input type="datetime-local">
const COLUMN_DATE_TYPE = {
  debut_occupation: 'datetime-local',
  fin_occupation:   'datetime-local',
  debut_travaux:    'date',
  fin_travaux:      'date',
  date_creat:       'date',
  travaux_debut:    'date',
  travaux_fin:      'date',
};

// ── Colonnes numériques avec plage de valeurs autorisée ──────────────────────
const COLUMN_NUMBER_RANGE = {
  niveau_service:               { min: 0, max: 10 },
  fonctionnalite:               { min: 0, max: 10 },
  interet_socio_administratif:  { min: 0, max: 10 },
  population_desservie:         { min: 0, max: 10 },
  potentiel_agricole:           { min: 0, max: 10 },
  cout_investissement:          { min: 0, max: 10 },
  protection_environnement:     { min: 0, max: 10 },
};

// ── Labels lisibles pour les en-têtes de colonnes ───────────────────────────
const COLUMN_LABELS = {
  code_piste: "Code Piste", nom_origine_piste: "Nom Origine",
  nom_destination_piste: "Nom Destination",
  heure_debut: "Heure Début", heure_fin: "Heure Fin",
  existence_intersection: "Intersection",
  commune_name: "Commune", prefecture_name: "Préfecture", region_name: "Région",
  longueur: "Longueur (km)", kilometrage: "Kilométrage (km)", length_km: "Longueur (km)", largeur_emprise: "Largeur Emprise (m)",
  frequence_trafic: "Fréquence Trafic", type_trafic: "Type Trafic",
  travaux_realises: "Travaux Réalisés", date_travaux: "Date Travaux",
  entreprise: "Entreprise", plateforme: "Plateforme", relief: "Relief",
  vegetation: "Végétation", debut_travaux: "Début Travaux", fin_travaux: "Fin Travaux",
  financement: "Financement", projet: "Projet", note_globale: "Note Globale (NG)",
  type_chaus: "Type Chaussée", etat_piste: "État Piste", endroit: "Endroit",
  situation: "Situation", type_pont: "Type Pont", nom_cours: "nom cours_",
  type_bac: "Type Bac", type_mater: "Type Matériau", nom: "Nom", type: "Type",
  date_creat: "Date Création", type_point: "Type Point", cause_coup: "Cause Coupure",
  niveau_service: "Niveau de service (NS)", fonctionnalite: "Fonctionnalité (FO)",
  interet_socio_administratif: "Intérêt socio-admin (ISA)", population_desservie: "Population desservie (P)",
  potentiel_agricole: "Potentiel agricole (PA)", cout_investissement: "Coût investissement (CI)",
  protection_environnement: "Protection environnement (PE)",
  type_occupation: "Type Occupation",
  created_at: "Créé le", updated_at: "Modifié le",
  login: "Utilisateur", utilisateur: "Utilisateur",
  nombre_intersections: "Nb intersections",
  intersections_json: "Intersections",
  amenage_ou_non_amenage: "Aménagé / Non aménagé",
  debut_occupation: "Début Occupation",
  fin_occupation: "Fin Occupation",
  original_type: "Type",
  travaux_debut: "Début Travaux",
  travaux_fin: "Fin Travaux",
  type_de_realisation: "Type de réalisation",
  superficie_enquetes_ha: "Superficie enquête (ha)",
  superficie_digitalisee: "Superficie digitalisée (ha)",
  superficie_en_ha: "Superficie (ha)",
};

function getColumnLabel(col) {
  return COLUMN_LABELS[col] || col.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

// ── Normalise une valeur brute pour un input date/datetime-local ─────────────
function toDateInputValue(val, type) {
  if (!val || val === '') return '';
  const s = String(val);
  if (type === 'datetime-local') {
    // "2024-01-15T10:30:00.000Z" ou "2024-01-15T10:30:00+00:00" → "2024-01-15T10:30"
    return s.replace(/\+.*$/, '').replace(/Z$/, '').replace(/\.\d+$/, '').slice(0, 16);
  }
  // type === 'date' : "2024-01-15T..." ou "2024-01-15" → "2024-01-15"
  return s.slice(0, 10);
}

// ── Libellés lisibles pour les valeurs du champ "type" ──────────────────────
const TYPE_DISPLAY_LABELS = {
  ppr_itial:        "Site enquête",
  enquete_polygone: "Zone de plaine",
};

// ── Formatage de la valeur affichée ─────────────────────────────────────────
function formatCellValue(col, val) {
  if (col === "intersections_json") {
    if (!val) return "—";
    let list = val;
    if (typeof list === "string") { try { list = JSON.parse(list); } catch(e) { return val; } }
    if (!Array.isArray(list) || list.length === 0) return "—";
    return list.map(item => item.code_piste).join(", ");
  }
  if (col === "existence_intersection") {
    if (val === 1 || val === "1" || val === true) return "Oui";
    if (val === 0 || val === "0" || val === false) return "Non";
  }
  if (col === "amenage_ou_non_amenage") {
    if (val === true || val === "true" || val === "True" || val === "Aménagé") return "Aménagé";
    if (val === false || val === "false" || val === "False" || val === "Non aménagé") return "Non aménagé";
  }
  if (col === "type" && TYPE_DISPLAY_LABELS[val]) return TYPE_DISPLAY_LABELS[val];
  return val;
}

// ── Lookup hiérarchie géographique pour afficher les noms ───────────────────
function getGeographyNames(communeId, hierarchyData) {
  if (!hierarchyData || !communeId) return {};
  const cId = parseInt(communeId);
  for (const region of hierarchyData) {
    for (const pref of (region.prefectures || [])) {
      for (const commune of (pref.communes || [])) {
        if (commune.id === cId) {
          return {
            commune_name: commune.nom || "",
            prefecture_name: pref.nom || "",
            region_name: region.nom || "",
          };
        }
      }
    }
  }
  return {};
}

// ── Collecte tous les identifiants possibles d'un feature brut (GeoJSON) ─────
// Permet un matching robuste même si feature.id, properties.fid, properties.id diffèrent
function getEntityIds(rawItem) {
  const s = new Set();
  const add = (v) => { if (v != null && v !== '' && v !== 0) s.add(String(v)); };
  add(rawItem?.id);                          // feature.id (racine GeoJSON)
  const p = rawItem?.properties || rawItem;
  add(p?.fid); add(p?.id); add(p?.gid); add(p?.sqlite_id);
  return s;
}

// ── Extraire les coordonnées (lat/lng) depuis un item GeoJSON brut ───────────
function getCoordinatesFromRaw(rawItem) {
  const geom = rawItem?.geometry || rawItem?.geom;
  if (!geom || !geom.coordinates) return null;
  let coords;
  switch (geom.type) {
    case 'Point':         coords = geom.coordinates; break;
    case 'LineString':    coords = geom.coordinates[0]; break;
    case 'MultiLineString': coords = geom.coordinates[0]?.[0]; break;
    case 'Polygon':       coords = geom.coordinates[0]?.[0]; break;
    case 'MultiPolygon':  coords = geom.coordinates[0]?.[0]?.[0]; break;
    default: return null;
  }
  if (!coords) return null;
  return { lng: coords[0], lat: coords[1] };
}

// Liste des couches affichées dans le menu de gauche
const LAYERS = [
  { id: "pistes", label: "Pistes" },
  { id: "chaussees", label: "Chaussées" },
  { id: "buses", label: "Buses" },
  { id: "dalots", label: "Dalots" },
  { id: "ponts", label: "Ponts" },
  { id: "passages_submersibles", label: "Passages submersibles" },
  { id: "bacs", label: "Bacs" },
  { id: "ecoles", label: "Écoles" },
  { id: "marches", label: "Marchés" },
  { id: "services_santes", label: "Services de santé" },
  { id: "batiments_administratifs", label: "Bâtiments administratifs" },
  {
    id: "infrastructures_hydrauliques",
    label: "Infrastructures hydrauliques",
  },
  { id: "localites", label: "Localités" },
  { id: "autres_infrastructures", label: "Autres infrastructures" },
  { id: "ppr_itial", label: "site de plaine" },
  { id: "enquete_polygone", label: "zones de plaine" },
  { id: "points_coupures", label: "Points de coupure" },
  { id: "points_critiques", label: "Points critiques" },
];

// ---------- Normalisation d'une ligne générique (GeoJSON ou objet simple)
function normalizeRow(item) {
  const base = item?.properties || item || {};
  const row = {};

  // conserver un identifiant
  if (item.fid !== undefined) row.fid = item.fid;
  if (item.id !== undefined && base.id === undefined) row.id = item.id;

  Object.keys(base).forEach((key) => {
    if (key === "geom" || key === "geometry") return;

    const value = base[key];

    if (value === null || value === undefined) {
      row[key] = "";
    } else if (typeof value === "object") {
      // cas typiques login, commune, etc.
      if (value.nom && value.prenom) {
        row[key] = `${value.nom} ${value.prenom}`.trim();
      } else if (value.nom) {
        row[key] = value.nom;
      } else if (value.name) {
        row[key] = value.name;
      } else if (value.id !== undefined) {
        row[key] = value.id;
      } else {
        row[key] = JSON.stringify(value);
      }
    } else {
      row[key] = value;
    }
  });

  return row;
}

// ---------- Petit helper pour récupérer un tableau quel que soit le format
function extractArray(layerData) {
  if (!layerData) return [];
  if (Array.isArray(layerData)) return layerData;

  // GeoJSON FeatureCollection ?
  if (Array.isArray(layerData.features)) return layerData.features;

  // format paginé éventuel
  if (Array.isArray(layerData.results)) return layerData.results;

  return [];
}

const DataTrackingPage = () => {
  const [infrastructureData, setInfrastructureData] = useState(null);
  const [hierarchyData, setHierarchyData] = useState(null);
  const { user } = useAuth();

  const [geoFilters, setGeoFilters] = useState(() => {
    const initial = { region_id: [], prefecture_id: [], commune_id: [] };
    if (user) {
      const rId = user.region_id || user.region?.id;
      if (rId) initial.region_id = [rId];
      const pId = user.prefecture_id || user.prefecture?.id;
      if (pId) initial.prefecture_id = [pId];
      const cId = user.commune_id || user.commune?.id;
      if (cId) initial.commune_id = [cId];
    }
    return initial;
  });
  const [selectedLayer, setSelectedLayer] = useState("pistes");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [editedRows, setEditedRows] = useState([]); // version modifiable
  const [saving, setSaving] = useState(false); // état du bouton Sauvegarder

  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 100;

  const [highlightedFid, setHighlightedFid] = useState(null);
  const [highlightedLayer, setHighlightedLayer] = useState(null);
  const highlightedRowRef = useRef(null);
  const [openMultiKey, setOpenMultiKey] = useState(null); // clé "rowIndex_col" du dropdown multi ouvert
  const [dropdownRect, setDropdownRect] = useState(null); // position du trigger pour le panel fixed
  const dropdownPanelRef = useRef(null); // ref sur le panel ouvert (pour ignorer les clics sur la scrollbar)
  const highlightedFidRef = useRef(null); // ref synchrone, lisible dans les effects sans dépendance

  // ---------- Fermer le dropdown si scroll (le clic hors dropdown est géré par le backdrop)
  useEffect(() => {
    if (!openMultiKey) return;
    const handler = (e) => {
      if (dropdownPanelRef.current && dropdownPanelRef.current.contains(e.target)) return;
      setOpenMultiKey(null);
    };
    document.addEventListener('scroll', handler, true);
    return () => document.removeEventListener('scroll', handler, true);
  }, [openMultiKey]);

  // ---------- Chargement des données (cache session -> IndexedDB -> API)
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        setLoading(true);
        setError("");

        let data = await hybridCache.getInfrastructureData();

        if (!data) {
          const result = await dataservice.loadAllInfrastructures();
          if (!result.success) {
            throw new Error(
              result.error || "Impossible de charger les données"
            );
          }
          data = result.data;
          await hybridCache.saveInfrastructureData(data);
        }

        // Charger aussi la hiérarchie pour le filtrage RBAC
        let hData = await hybridCache.getHierarchy();
        if (!hData) {
          const hRes = await fetch("http://localhost:8000/api/geography/hierarchy/");
          const hJson = await hRes.json();
          if (hJson.success) {
            hData = hJson.hierarchy;
            await hybridCache.saveHierarchy(hData);
          }
        }

        if (!isMounted) return;

        setInfrastructureData(data);
        setHierarchyData(hData);

        // choisir une couche avec des données
        const firstWithData = LAYERS.find((l) => {
          const arr = extractArray(data[l.id]);
          return arr.length > 0;
        });

        if (firstWithData) {
          setSelectedLayer(firstWithData.id);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || "Erreur lors du chargement des données.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  // ---------- Lien carte → tableau : écouter entitySelectedOnMap
  useEffect(() => {
    const handler = (e) => {
      const { layer, fids } = e.detail || {};
      if (!layer || !fids) return;
      // fids est une chaîne de tous les ids possibles séparés par "|" (venant de MapContainer)
      const fidArray = fids.split('|').filter(Boolean);
      const fid = fidArray[0] || '';
      if (!fid) return;
      highlightedFidRef.current = fid; // mise à jour synchrone avant le re-render
      setHighlightedLayer(layer);
      setHighlightedFid(fid);
      setSelectedLayer(layer);
      setSearch("");
    };
    window.addEventListener('entitySelectedOnMap', handler);
    return () => window.removeEventListener('entitySelectedOnMap', handler);
  }, []);

  // ---------- Synchronisation bidirectionnelle des filtres géographiques avec la carte
  const lastDispatchedFilters = React.useRef(null);

  // Carte → Suivi de données
  useEffect(() => {
    const handler = (e) => {
      const { region_id, prefecture_id, commune_id } = e.detail || {};
      const incoming = {
        region_id: Array.isArray(region_id) ? region_id : (region_id ? [region_id] : []),
        prefecture_id: Array.isArray(prefecture_id) ? prefecture_id : (prefecture_id ? [prefecture_id] : []),
        commune_id: Array.isArray(commune_id) ? commune_id : (commune_id ? [commune_id] : []),
      };
      lastDispatchedFilters.current = JSON.stringify(incoming);
      setGeoFilters(incoming);
    };
    window.addEventListener('geographicFilterChanged', handler);
    return () => window.removeEventListener('geographicFilterChanged', handler);
  }, []);

  // Suivi de données → Carte (ne dispatche que si la valeur vient vraiment du panneau suivi)
  useEffect(() => {
    const serialized = JSON.stringify(geoFilters);
    if (lastDispatchedFilters.current === serialized) return;
    lastDispatchedFilters.current = serialized;
    window.dispatchEvent(new CustomEvent('geographicFilterChanged', { detail: geoFilters }));
  }, [geoFilters]);

  // ---------- Set des communes autorisées (RBAC + filtres géo) — utilisé par la sidebar ET le tableau
  const allowedCommuneSet = useMemo(() => {
    if (!hierarchyData) return null;

    // 1. RBAC
    let rbacIds = null;
    if (user && (user.role === 'BTGR' || user.role === 'SPGR')) {
      const scopeIds = new Set();
      if (user.role === 'BTGR') {
        const assignedRegionIds = (user.assigned_regions || []).map(r => parseInt(r.region_id));
        hierarchyData.forEach(region => {
          if (assignedRegionIds.includes(region.id)) {
            region.prefectures?.forEach(pref => pref.communes?.forEach(c => scopeIds.add(c.id)));
          }
        });
      } else {
        const assignedPrefIds = (user.assigned_prefectures || []).map(p => parseInt(p.prefecture_id));
        hierarchyData.forEach(region => {
          region.prefectures?.forEach(pref => {
            if (assignedPrefIds.includes(pref.id)) {
              pref.communes?.forEach(c => scopeIds.add(c.id));
            }
          });
        });
      }
      rbacIds = scopeIds;
    }

    // 2. Filtres géographiques
    const regionIds = (geoFilters.region_id || []).map(id => parseInt(id));
    const prefIds   = (geoFilters.prefecture_id || []).map(id => parseInt(id));
    const commIds   = (geoFilters.commune_id || []).map(id => parseInt(id));

    let geoIds = null;
    if (regionIds.length || prefIds.length || commIds.length) {
      geoIds = new Set();
      hierarchyData.forEach(region => {
        if (regionIds.length && !regionIds.includes(region.id)) return;
        region.prefectures?.forEach(pref => {
          if (prefIds.length && !prefIds.includes(pref.id)) return;
          pref.communes?.forEach(c => {
            if (commIds.length && !commIds.includes(c.id)) return;
            geoIds.add(c.id);
          });
        });
      });
    }

    // 3. Combinaison : intersection si les deux existent
    if (!rbacIds && !geoIds) return null;
    if (rbacIds && !geoIds) return rbacIds;
    if (!rbacIds && geoIds) return geoIds;
    const intersection = new Set();
    rbacIds.forEach(id => { if (geoIds.has(id)) intersection.add(id); });
    return intersection;
  }, [user, hierarchyData, geoFilters]);

  // ---------- Préparation des lignes / colonnes à partir des données brutes
  const { rows, columns, rawRows } = useMemo(() => {
    if (!infrastructureData || !selectedLayer) {
      return { rows: [], columns: [], rawRows: [] };
    }

    let raw = extractArray(infrastructureData[selectedLayer]);

    // Filtrage via allowedCommuneSet (RBAC + géo)
    if (allowedCommuneSet !== null) {
      raw = raw.filter(item => {
        const props = item.properties || item;
        const cId = parseInt(props.commune_id || props.communes_rurales_id || props.commune_rural_id);
        return allowedCommuneSet.has(cId);
      });
    }

    const normalized = raw.map((item, index) => {
      const row = { __index: index, ...normalizeRow(item) };
      // Ajouter les noms géographiques depuis la hiérarchie
      const props = item?.properties || item || {};
      const cId = props.commune_id || props.communes_rurales_id;
      if (cId && hierarchyData) {
        Object.assign(row, getGeographyNames(cId, hierarchyData));
      }
      return row;
    });

    // Filtrer les colonnes cachées
    const allCols =
      normalized.length > 0
        ? Object.keys(normalized[0]).filter((c) => c !== "__index" && !HIDDEN_COLUMNS.has(c) && !(LAYER_HIDDEN_COLUMNS[selectedLayer] || new Set()).has(c))
        : [];

    // Mettre commune/prefecture/region en premier
    const geoNameCols = ["commune_name", "prefecture_name", "region_name"].filter((c) =>
      allCols.includes(c)
    );
    const otherCols = allCols.filter((c) => !geoNameCols.includes(c));
    const cols = [...geoNameCols, ...otherCols];

    return { rows: normalized, columns: cols, rawRows: raw };
  }, [infrastructureData, selectedLayer, allowedCommuneSet, hierarchyData]);

  // ---------- Quand les rows changent : recopie pour édition + navigation de page
  useEffect(() => {
    if (!rows || !rows.length) {
      setEditedRows([]);
      setCurrentPage(1);
      return;
    }
    const newEdited = rows.map((r) => ({ ...r }));
    setEditedRows(newEdited);

    // Si on navigue vers une entité précise, aller directement à sa page
    const targetFid = highlightedFidRef.current;
    if (targetFid) {
      const raw = rawRows; // snapshot synchrone
      const idx = newEdited.findIndex((r) => getEntityIds(raw[r.__index]).has(targetFid));
      if (idx !== -1) {
        setCurrentPage(Math.floor(idx / PAGE_SIZE) + 1);
        return;
      }
    }
    setCurrentPage(1);
  }, [rows]);

  // ---------- Filtrage sur la version éditable
  const filteredRows = useMemo(() => {
    if (!search.trim()) return editedRows;

    const term = search.toLowerCase();

    return editedRows.filter((row) =>
      Object.entries(row).some(([key, val]) => {
        if (key === "__index") return false;
        return String(val ?? "")
          .toLowerCase()
          .includes(term);
      })
    );
  }, [editedRows, search]);

  // ---------- Pagination
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return filteredRows.slice(start, end);
  }, [filteredRows, currentPage]);

  const totalPages = useMemo(() => {
    if (!filteredRows.length) return 1;
    return Math.ceil(filteredRows.length / PAGE_SIZE);
  }, [filteredRows]);

  const currentLabel =
    LAYERS.find((l) => l.id === selectedLayer)?.label || selectedLayer;

  // ---------- Naviguer vers la bonne page quand une entité est mise en surbrillance (fallback)
  useEffect(() => {
    if (!highlightedFid || !filteredRows.length) return;
    const idx = filteredRows.findIndex((r) => getEntityIds(rawRows[r.__index]).has(highlightedFid));
    if (idx === -1) return;
    setCurrentPage(Math.floor(idx / PAGE_SIZE) + 1);
  }, [highlightedFid, filteredRows, rawRows]);

  // ---------- Scroller vers la ligne mise en surbrillance après rendu
  useEffect(() => {
    if (!highlightedFid) return;
    // setTimeout : laisse React terminer le rendu de la nouvelle page avant de scroller
    const t = setTimeout(() => {
      if (highlightedRowRef.current) {
        highlightedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
    return () => clearTimeout(t);
  }, [highlightedFid, pagedRows]);

  // ---------- Utilitaire téléchargement fichier
  const downloadFile = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // ---------- Export Excel
  const handleExportExcel = () => {
    if (!columns.length || !filteredRows.length) {
      alert("Aucune donnée à exporter.");
      return;
    }

    const exportCols = columns.filter((c) => c !== "__index");

    const data = filteredRows.map((row) => {
      const obj = {};
      exportCols.forEach((col) => {
        obj[col] = row[col] === null || row[col] === undefined ? "" : row[col];
      });
      return obj;
    });

    const ws = XLSX.utils.json_to_sheet(data, { header: exportCols });

    // Largeur automatique des colonnes
    const colWidths = exportCols.map((col) => ({
      wch: Math.max(
        col.length,
        ...data.map((r) => String(r[col] ?? "").length)
      ),
    }));
    ws["!cols"] = colWidths;

    // AutoFilter sur la première ligne
    ws["!autofilter"] = { ref: ws["!ref"] };

    const wb = XLSX.utils.book_new();
    const label = LAYERS.find((l) => l.id === selectedLayer)?.label || selectedLayer;
    XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 31));

    XLSX.writeFile(wb, `pprcollecte_${selectedLayer}.xlsx`);
  };

  // ---------- Export GeoJSON
  const handleExportGeoJSON = () => {
    if (!rawRows.length || !filteredRows.length) {
      alert("Aucune donnée à exporter.");
      return;
    }

    const indices = filteredRows
      .map((r) => r.__index)
      .filter((i) => typeof i === "number" && i >= 0 && i < rawRows.length);

    const indexSet = new Set(indices);
    const features = [];

    indexSet.forEach((i) => {
      const item = rawRows[i];
      if (!item) return;

      const rawProps = item?.properties || item || {};
      const cId = rawProps.commune_id || rawProps.communes_rurales_id;
      const geoNames = (cId && hierarchyData) ? getGeographyNames(cId, hierarchyData) : {};

      if (item.type === "Feature") {
        features.push({
          ...item,
          properties: { ...geoNames, ...item.properties },
        });
      } else {
        let geometry = null;
        if (item.geometry) geometry = item.geometry;
        else if (item.geom) geometry = item.geom;

        const properties = { ...item };
        delete properties.geometry;
        delete properties.geom;

        features.push({
          type: "Feature",
          geometry,
          properties: { ...geoNames, ...properties },
        });
      }
    });

    if (!features.length) {
      alert("Aucune géométrie valide à exporter.");
      return;
    }

    const geojson = {
      type: "FeatureCollection",
      features,
    };

    downloadFile(
      JSON.stringify(geojson, null, 2),
      `pprcollecte_${selectedLayer}.geojson`,
      "application/geo+json;charset=utf-8;"
    );
  };

  // ---------- Lien tableau → carte : centrer la carte sur l'entité
  const handleShowOnMap = (row) => {
    const rawItem = rawRows[row.__index];
    if (!rawItem) return;
    const coords = getCoordinatesFromRaw(rawItem);
    if (!coords) return;
    // rawItem.id = feature.id (PK placée à la racine GeoJSON par DRF-GIS)
    // C'est exactement la clé utilisée par fidToLayerRef dans MapContainer
    const fid = (rawItem.id != null && rawItem.id !== '' && rawItem.id !== 0)
      ? rawItem.id
      : (row.fid || row.gid || row.sqlite_id || '');
    window.dispatchEvent(new CustomEvent('showEntityOnMap', {
      detail: { layer: selectedLayer, fid: String(fid), lat: coords.lat, lng: coords.lng }
    }));
  };

  // ---------- Modification d'une cellule
  const handleCellChange = (rowIndex, column, value) => {
    setEditedRows((prev) =>
      prev.map((row) =>
        row.__index === rowIndex ? { ...row, [column]: value } : row
      )
    );
  };

  // ---------- Sauvegarde en base
  const handleSaveChanges = async () => {
    if (!selectedLayer) return;

    if (!editedRows || editedRows.length === 0) {
      alert("Aucune modification à sauvegarder.");
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    try {
      setSaving(true);

      for (const edited of editedRows) {
        const original = rows.find((r) => r.__index === edited.__index);
        const raw = rawRows[edited.__index];

        if (!original || !raw) continue;

        const baseProps = raw.properties || raw;
        const payload = {};

        columns.forEach((col) => {
          if (col === "__index" || col === "id" || col === "fid") return;
          if (isReadOnlyColumn(col)) return;

          const oldVal = original[col] ?? "";
          const newVal = edited[col] ?? "";

          // Normaliser via formatCellValue pour éviter les faux-positifs sur les booléens
          // (ex: true !== "Aménagé" alors qu'ils représentent la même valeur)
          const normalize = (v) => String(formatCellValue(col, v) ?? v ?? "");
          if (normalize(oldVal) === normalize(newVal)) return;

          if (
            Object.prototype.hasOwnProperty.call(baseProps, col) &&
            typeof baseProps[col] === "object" &&
            baseProps[col] !== null
          ) {
            return;
          }

          payload[col] = newVal === "-" ? "" : newVal;
        });

        if (Object.keys(payload).length === 0) {
          continue;
        }

        // Utiliser || (pas ??) pour bypasser les chaînes vides "" issues de null dans normalizeRow
        const id = edited.id || raw.id || edited.fid || raw.fid;
        if (!id) {
          errorCount++;
          continue;
        }

        const result = await updateRow(selectedLayer, id, payload);

        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
      }

      if (successCount > 0) {
        try {
          await hybridCache.clearAll();

          const fresh = await dataservice.loadAllInfrastructures();
          if (fresh.success && fresh.data) {
            setInfrastructureData(fresh.data);
          }
        } catch (e) {
        }
      }

      alert(
        `Sauvegarde terminée : ${successCount} ligne(s) mise(s) à jour, ${errorCount} erreur(s).`
      );
    } catch (err) {
      alert("Erreur lors de la sauvegarde : " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard">
      {/* HEADER BLEU */}
      <div className="data-tracking-header">
        <div className="data-tracking-header-icon">
          <i className="fas fa-database"></i>
        </div>
        <h1 className="data-tracking-header-title">Suivi des données</h1>
        <p className="data-tracking-header-subtitle">
          Visualisation détaillée des données collectées, table par table.
        </p>
      </div>

      <div className="data-tracking-layout">
        {/* Sidebar gauche */}
        <div className="data-tracking-sidebar">
          <h3>DONNÉES</h3>
          <ul className="data-tracking-list">
            {LAYERS.map((layer) => {
              const layerData = infrastructureData && infrastructureData[layer.id];
              const arr = extractArray(layerData);
              const count = allowedCommuneSet === null
                ? arr.length
                : arr.filter(item => {
                    const props = item?.properties || item || {};
                    const cId = parseInt(props.commune_id || props.communes_rurales_id || props.commune_rural_id);
                    return allowedCommuneSet.has(cId);
                  }).length;

              return (
                <li
                  key={layer.id}
                  className={
                    layer.id === selectedLayer
                      ? "data-tracking-item active"
                      : "data-tracking-item"
                  }
                  onClick={() => setSelectedLayer(layer.id)}
                >
                  <span>{layer.label}</span>
                  <span className="data-tracking-count">{count}</span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Partie droite : filtres + tableau */}
        <div className="data-tracking-table-container">
          <div className="dashboard-controls">
            <div className="dashboard-geo-filters" style={{ marginBottom: "0.75rem" }}>
              <GeographicFilter
                onFiltersChange={setGeoFilters}
                initialFilters={geoFilters}
                showLabels={false}
                layout="horizontal"
              />
            </div>
            <div
              className="filters-row"
              style={{ justifyContent: "space-between" }}
            >
              <div>
                <h2 style={{ margin: 0 }}>
                  Données :{" "}
                  <span style={{ color: "#009460" }}>{currentLabel}</span>
                </h2>
                <p style={{ margin: 0, fontSize: "0.9rem", color: "#555" }}>
                  {rows.length} enregistrements trouvés.
                </p>
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Rechercher dans le tableau..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ padding: "0.4rem 0.6rem", minWidth: "260px" }}
                />
              </div>
            </div>

            {/* Boutons d'action */}
            <div
              className="actions-row"
              style={{ justifyContent: "flex-end", marginTop: "0.5rem" }}
            >
              <button
                className="btn btn-outline"
                onClick={handleExportExcel}
                type="button"
              >
                Export Excel
              </button>

              <button
                className="btn btn-green"
                onClick={handleExportGeoJSON}
                type="button"
                style={{ marginLeft: "0.5rem" }}
              >
                Export GeoJSON
              </button>

              <button
                className="btn btn-green"
                type="button"
                onClick={handleSaveChanges}
                disabled={saving}
                style={{
                  marginLeft: "0.5rem",
                  background: "linear-gradient(45deg, #009460, #00b37a)",
                }}
              >
                {saving ? "Sauvegarde..." : "Sauvegarder"}
              </button>
            </div>
          </div>

          {loading && (
            <div className="dashboard-loading">Chargement des données…</div>
          )}

          {error && !loading && <div className="dashboard-error">{error}</div>}

          {!loading && !error && (
            <>
              <div className="dashboard-table data-tracking-table">
                <table>
                  <thead>
                    <tr>
                      <th style={{ whiteSpace: 'nowrap' }}>Carte</th>
                      {columns.map((col) => (
                        <th key={col} title={col}>{getColumnLabel(col)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((row, idx) => {
                      const isHighlighted = !!(highlightedFid && getEntityIds(rawRows[row.__index]).has(highlightedFid));
                      return (
                        <tr
                          key={row.fid || row.id || row.__index || idx}
                          ref={isHighlighted ? highlightedRowRef : null}
                          style={isHighlighted ? { backgroundColor: '#fff3cd', outline: '2px solid #f0a500' } : {}}
                          onClick={() => { if (highlightedFid) setHighlightedFid(null); }}
                        >
                          <td style={{ textAlign: 'center', padding: '2px 6px' }}>
                            <button
                              title="Voir sur la carte"
                              onClick={() => handleShowOnMap(row)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', padding: '2px', color: '#2980b9' }}
                            >
                              <i className="fas fa-eye" />
                            </button>
                          </td>
                          {columns.map((col) => {
                            const rawValue =
                              row[col] === null || row[col] === undefined
                                ? ""
                                : row[col];
                            const displayed = formatCellValue(col, rawValue);
                            const strValue = String(displayed);
                            const size = Math.min(30, strValue.length || 1);
                            const readOnly = isReadOnlyColumn(col);
                            const selectOptions = (LAYER_COLUMN_SELECT_OPTIONS[selectedLayer] || {})[col] || COLUMN_SELECT_OPTIONS[col];
                            const isMulti = COLUMN_MULTI_SELECT.has(col) || (LAYER_COLUMN_MULTI_SELECT[selectedLayer] || new Set()).has(col);
                            const numRange = COLUMN_NUMBER_RANGE[col];
                            const dateType = COLUMN_DATE_TYPE[col];

                            return (
                              <td key={col}>
                                {numRange && !readOnly ? (
                                  <input
                                    type="number"
                                    className="data-tracking-input"
                                    value={strValue}
                                    min={numRange.min}
                                    max={numRange.max}
                                    step="0.1"
                                    placeholder={`${numRange.min}-${numRange.max}`}
                                    title={`Note entre ${numRange.min} et ${numRange.max}`}
                                    style={{ width: 64, textAlign: 'center' }}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      if (v === '' || v === '-') { handleCellChange(row.__index, col, v); return; }
                                      const num = parseFloat(v);
                                      if (!isNaN(num)) handleCellChange(row.__index, col, Math.min(numRange.max, Math.max(numRange.min, num)));
                                    }}
                                    onBlur={(e) => {
                                      const num = parseFloat(e.target.value);
                                      if (!isNaN(num)) handleCellChange(row.__index, col, Math.min(numRange.max, Math.max(numRange.min, num)));
                                    }}
                                  />
                                ) : dateType && !readOnly ? (
                                  dateType === 'datetime-local' ? (() => {
                                    const dtVal = toDateInputValue(rawValue, 'datetime-local');
                                    const datePart = dtVal.slice(0, 10);
                                    const timePart = dtVal.length > 10 ? dtVal.slice(11) : '';
                                    const [dh, dmi] = timePart ? timePart.split(':') : ['', ''];
                                    const numSt = { fontSize: 12, padding: '3px 4px', border: '1px solid #dee2e6', borderRadius: 4, background: '#fff', width: 44, textAlign: 'center' };
                                    const clamp = (v, min, max) => Math.min(max, Math.max(min, parseInt(v, 10)));
                                    return (
                                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                                        <CustomDateInput
                                          value={datePart}
                                          onChange={(e) => {
                                            const d = e.target.value;
                                            handleCellChange(row.__index, col, d ? `${d}T${timePart || '00:00'}` : '');
                                          }}
                                        />
                                        <input
                                          type="number"
                                          min={0} max={23}
                                          placeholder="H"
                                          value={dh}
                                          style={numSt}
                                          onChange={(e) => {
                                            const d = datePart || new Date().toISOString().slice(0, 10);
                                            const h = String(clamp(e.target.value, 0, 23)).padStart(2,'0');
                                            handleCellChange(row.__index, col, `${d}T${h}:${dmi || '00'}`);
                                          }}
                                        />
                                        <span style={{fontSize:11,color:'#888'}}>:</span>
                                        <input
                                          type="number"
                                          min={0} max={59}
                                          placeholder="Min"
                                          value={dmi}
                                          style={numSt}
                                          onChange={(e) => {
                                            const d = datePart || new Date().toISOString().slice(0, 10);
                                            const mi = String(clamp(e.target.value, 0, 59)).padStart(2,'0');
                                            handleCellChange(row.__index, col, `${d}T${dh || '00'}:${mi}`);
                                          }}
                                        />
                                      </div>
                                    );
                                  })() : (
                                    <CustomDateInput
                                      value={toDateInputValue(rawValue, 'date')}
                                      onChange={(e) => handleCellChange(row.__index, col, e.target.value)}
                                    />
                                  )
                                ) : selectOptions && !readOnly ? (
                                  isMulti ? (() => {
                                    const multiKey = `${row.__index}_${col}`;
                                    const selectedArr = strValue ? strValue.split(',').map(s => s.trim()).filter(Boolean) : [];
                                    const isOpen = openMultiKey === multiKey;
                                    return (
                                      <div style={{ position: 'relative', display: 'inline-block' }}>
                                        <div
                                          className="data-tracking-input"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (!isOpen) {
                                              const r = e.currentTarget.getBoundingClientRect();
                                              const estH = Math.min(selectOptions.length * 34 + 54, 300);
                                              const spaceBelow = window.innerHeight - r.bottom;
                                              const openUp = spaceBelow < estH && r.top > spaceBelow;
                                              setDropdownRect({ top: r.top, bottom: r.bottom, left: r.left, openUp });
                                            }
                                            setOpenMultiKey(isOpen ? null : multiKey);
                                          }}
                                          onTouchEnd={(e) => e.stopPropagation()}
                                          title={strValue || '-'}
                                          style={{ cursor: 'pointer', minWidth: 130, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160, paddingRight: 18, userSelect: 'none' }}
                                        >
                                          {selectedArr.length > 0 ? selectedArr.join(', ') : <span style={{ color: '#aaa' }}>-</span>}
                                          <span style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#666' }}>▼</span>
                                        </div>
                                        {isOpen && dropdownRect && createPortal(
                                          <>
                                          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onMouseDown={(e) => {
                                            if (dropdownPanelRef.current) {
                                              const r = dropdownPanelRef.current.getBoundingClientRect();
                                              if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
                                            }
                                            setOpenMultiKey(null);
                                          }} />
                                          <div ref={dropdownPanelRef} style={{
                                            position: 'fixed',
                                            ...(dropdownRect.openUp
                                              ? { bottom: window.innerHeight - dropdownRect.top + 2 }
                                              : { top: dropdownRect.bottom + 2 }),
                                            left: dropdownRect.left,
                                            maxHeight: Math.min(260, dropdownRect.openUp
                                              ? Math.max(80, dropdownRect.top - 8)
                                              : Math.max(80, window.innerHeight - dropdownRect.bottom - 8)),
                                            overflowY: 'auto',
                                            zIndex: 9999, background: 'white', border: '1px solid #ccc', borderRadius: 4, boxShadow: '0 3px 10px rgba(0,0,0,0.18)', padding: '4px 0', minWidth: 170,
                                          }}>
                                            {selectOptions.map(opt => {
                                              const checked = selectedArr.includes(opt);
                                              return (
                                                <div
                                                  key={opt}
                                                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', userSelect: 'none' }}
                                                  onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    const newArr = checked ? selectedArr.filter(v => v !== opt) : [...selectedArr, opt];
                                                    handleCellChange(row.__index, col, newArr.join(','));
                                                  }}
                                                >
                                                  <div style={{ width: 14, height: 14, border: `2px solid ${checked ? '#2980b9' : '#aaa'}`, borderRadius: 2, flexShrink: 0, background: checked ? '#2980b9' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {checked && <span style={{ color: 'white', fontSize: 10, lineHeight: 1 }}>✓</span>}
                                                  </div>
                                                  {opt}
                                                </div>
                                              );
                                            })}
                                            <div style={{ borderTop: '1px solid #eee', padding: '6px 12px', textAlign: 'right' }}>
                                              <button
                                                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setOpenMultiKey(null); }}
                                                style={{ fontSize: 12, background: '#2980b9', color: 'white', border: 'none', borderRadius: 3, padding: '4px 14px', cursor: 'pointer' }}
                                              >OK</button>
                                            </div>
                                          </div>
                                          </>,
                                          document.body
                                        )}
                                      </div>
                                    );
                                  })() : (() => {
                                    const singleKey = `${row.__index}_${col}`;
                                    const isOpen = openMultiKey === singleKey;
                                    return (
                                      <div style={{ position: 'relative', display: 'inline-block' }}>
                                        <div
                                          className="data-tracking-input"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (!isOpen) {
                                              const r = e.currentTarget.getBoundingClientRect();
                                              const estH = Math.min((selectOptions.length + 1) * 34 + 16, 300);
                                              const spaceBelow = window.innerHeight - r.bottom;
                                              const openUp = spaceBelow < estH && r.top > spaceBelow;
                                              setDropdownRect({ top: r.top, bottom: r.bottom, left: r.left, openUp });
                                            }
                                            setOpenMultiKey(isOpen ? null : singleKey);
                                          }}
                                          onTouchEnd={(e) => e.stopPropagation()}
                                          title={strValue || '—'}
                                          style={{ cursor: 'pointer', minWidth: 110, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160, paddingRight: 18, userSelect: 'none' }}
                                        >
                                          {strValue || <span style={{ color: '#aaa' }}>—</span>}
                                          <span style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#666' }}>▼</span>
                                        </div>
                                        {isOpen && dropdownRect && createPortal(
                                          <>
                                          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onMouseDown={(e) => {
                                            if (dropdownPanelRef.current) {
                                              const r = dropdownPanelRef.current.getBoundingClientRect();
                                              if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
                                            }
                                            setOpenMultiKey(null);
                                          }} />
                                          <div ref={dropdownPanelRef} style={{
                                            position: 'fixed',
                                            ...(dropdownRect.openUp
                                              ? { bottom: window.innerHeight - dropdownRect.top + 2 }
                                              : { top: dropdownRect.bottom + 2 }),
                                            left: dropdownRect.left,
                                            maxHeight: Math.min(260, dropdownRect.openUp
                                              ? Math.max(80, dropdownRect.top - 8)
                                              : Math.max(80, window.innerHeight - dropdownRect.bottom - 8)),
                                            overflowY: 'auto',
                                            zIndex: 9999, background: 'white', border: '1px solid #ccc', borderRadius: 4, boxShadow: '0 3px 10px rgba(0,0,0,0.18)', padding: '4px 0', minWidth: 170,
                                          }}>
                                            <div
                                              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', color: '#aaa', userSelect: 'none' }}
                                              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleCellChange(row.__index, col, ''); setOpenMultiKey(null); }}
                                            >—</div>
                                            {selectOptions.map(opt => (
                                              <div
                                                key={opt}
                                                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', background: opt === strValue ? '#e8f4fd' : 'white', userSelect: 'none' }}
                                                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleCellChange(row.__index, col, opt); setOpenMultiKey(null); }}
                                              >{opt}</div>
                                            ))}
                                          </div>
                                          </>,
                                          document.body
                                        )}
                                      </div>
                                    );
                                  })()
                                ) : col === "intersections_json" ? (
                                  <div style={{ backgroundColor: "#f0f0f0", color: "#666", fontSize: 12, padding: "2px 6px", lineHeight: "1.7", minWidth: 80, maxWidth: 200, cursor: "default" }}>
                                    {strValue === "—" ? "—" : strValue.split(", ").map((code, i) => (
                                      <div key={i}>{code}</div>
                                    ))}
                                  </div>
                                ) : (
                                  <input
                                    className={`data-tracking-input ${readOnly ? "read-only" : ""}`}
                                    value={strValue}
                                    placeholder="-"
                                    size={size}
                                    title={strValue}
                                    readOnly={readOnly}
                                    style={readOnly ? { backgroundColor: "#f0f0f0", color: "#666", cursor: "default" } : {}}
                                    onChange={readOnly ? undefined : (e) =>
                                      handleCellChange(
                                        row.__index,
                                        col,
                                        e.target.value
                                      )
                                    }
                                  />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="data-tracking-pagination">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    ◀ <span className="pagination-btn-text">Précédent</span>
                  </button>

                  <span className="pagination-info">
                    Page {currentPage} / {totalPages}
                  </span>

                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                  >
                    <span className="pagination-btn-text">Suivant</span> ▶
                  </button>
                </div>
              </div>

              <div className="dashboard-pagination">
                <p>
                  Affichage de {filteredRows.length} lignes sur {rows.length}{" "}
                  pour {currentLabel}.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataTrackingPage;
