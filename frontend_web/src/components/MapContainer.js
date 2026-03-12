// MapContainer.js
import React, { useEffect, useState, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import html2canvas from "html2canvas";
import JSZip from "jszip";
import jsPDF from "jspdf";
import * as turf from "@turf/turf";
import { useAuth } from "./AuthContext";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import dataservice from "./dataservice";
import MapLegend from "./MapLegend";
import "./MapContainer.css";
import AdministrativeBoundariesManager from "./AdministrativeBoundariesManager";
import "./administrative-boundaries-styles.css";
import ndgrLogo from "../assets/NDGR_Logo.png";
import hybridCache from "./hybridcache";
import { useIsMobile } from "../hooks/useIsMobile";
import {
  isLoading,
  lockLoading,
  unlockLoading,
  getLoadingPromise,
  getRawData,
  setRawData,
} from "./globalloadinglock";

const iconConfig = {
  services_santes: { icon: "hospital", color: "#E74C3C", label: "Services de santé" },
  bacs: { icon: "ship", color: "#F39C12", label: "Bacs" },
  ponts: { icon: "bridge", color: "#9B59B6", label: "Ponts" },
  buses: { icon: "dot-circle", color: "#7F8C8D", label: "Buses" },
  dalots: { icon: "water", color: "#3498DB", label: "Dalots" },
  passages_submersibles: { icon: "water", color: "#1ABC9C", label: "Passages submersibles" },
  points_coupures: { icon: "times-circle", color: "#C0392B", label: "Points de coupure" },
  points_critiques: { icon: "exclamation-triangle", color: "#D35400", label: "Points critiques" },
  localites: { icon: "home", color: "#E67E22", label: "Localités" },
  ecoles: { icon: "graduation-cap", color: "#27AE60", label: "Écoles" },
  marches: { icon: "store", color: "#F1C40F", label: "Marchés" },
  batiments_administratifs: { icon: "building", color: "#34495E", label: "Bât. administratifs" },
  infrastructures_hydrauliques: { icon: "tint", color: "#16A085", label: "Infra. hydrauliques" },
  autres_infrastructures: { icon: "map-marker-alt", color: "#95A5A6", label: "Autres infrastructures" },
  pistes: { icon: "road", color: "#FF6B00", label: "Pistes", isDashed: true },
  chaussees: { icon: "road", color: "#8e44ad", label: "Chaussées", isLine: true },
  ppr_itial: { icon: "dot-circle", color: "#000000", label: "site de plaine" },
  enquete_polygone: { icon: "draw-polygon", color: "#27ae60", label: "zones de plaine", isPolygon: true },
};

let GLOBAL_HIERARCHY_CACHE = null;
let GLOBAL_DATA_CACHE = null;

const convertToGeoJSON = (infrastructureData) => {
  const features = [];
  const types = [
    "pistes", "chaussees", "ponts", "buses", "dalots", "bacs",
    "passages_submersibles", "ecoles", "services_santes", "marches",
    "batiments_administratifs", "infrastructures_hydrauliques", "localites",
    "autres_infrastructures", "points_coupures", "points_critiques",
    "ppr_itial", "enquete_polygone",
  ];

  types.forEach((type) => {
    const items = infrastructureData[type] || [];
    items.forEach((item) => {
      const geometry = item.geometry;
      const props = item.properties || {};

      if (!geometry) return;

      const commune_id = props.commune_id || props.communes_rurales_id || null;

      const feature = {
        type: "Feature",
        id: item.id,          // ← PK Django (supprimé des properties par DRF-GIS, on le restaure ici)
        geometry: geometry,
        properties: {
          ...props,
          type: type,
          commune_id: commune_id,
        },
      };
      features.push(feature);
    });
  });

  return { type: "FeatureCollection", features: features };
};

const getTypeLabel = (type) => {
  const labels = {
    pistes: "Piste Rurale", chaussees: "Chaussee", ponts: "Pont", buses: "Buse",
    dalots: "Dalot", bacs: "Bac", passages_submersibles: "Passage Submersible",
    ecoles: "Ecole", services_santes: "Service de Sante", marches: "Marche",
    batiments_administratifs: "Batiment Administratif", infrastructures_hydrauliques: "Infrastructure Hydraulique",
    localites: "Localite", autres_infrastructures: "Autre Infrastructure",
    points_coupures: "Point de Coupure", points_critiques: "Point Critique",
    ppr_itial: "site de plaine", enquete_polygone: "zones de plaine",
  };
  return labels[type] || type;
};

const formatPopupContent = (properties) => {
  const ignoredFields = [
    "fid", "id", "gid", "piste_id", "sqlite_id", "code_gps", "commune_id", "login_id",
    "communes_rurales_id", "chaussee_id", "prefectures_id", "regions_id",
    "geom", "geometry", "the_geom", "region_id", "prefecture_id", "commune_id",
    "x_origine", "y_origine", "x_destination", "y_destination",
    "intersections_json", "nombre_intersections",
    "x_debut_ch", "y_debut_ch", "x_fin_ch", "y_fin_chau",
    "x_pont", "y_pont", "x_dalot", "y_dalot", "x_buse", "y_buse", "x_debut_tr",
    "y_debut_tr", "x_fin_trav", "y_fin_trav", "x_debut_pa", "y_debut_pa",
    "x_fin_pass", "y_fin_pass", "x_ecole", "y_ecole", "x_sante", "y_sante",
    "x_marche", "y_marche", "x_batiment", "y_batiment", "x_infrastr", "y_infrastr",
    "x_localite", "y_localite", "x_autre_in", "y_autre_in", "x_point_co", "y_point_co",
    "x_point_cr", "y_point_cr", "x_site", "y_site", "utilisateur"
  ];

  const fieldLabels = {
    code_piste: "Code Piste", nom_origine_piste: "Origine", nom_destination_piste: "Destination",
    x_origine: "Longitude Origine", y_origine: "Latitude Origine",
    x_destination: "Longitude Destination", y_destination: "Latitude Destination",
    existence_intersection: "Intersection",
    type_occupation: "Type Occupation",
    debut_occupation: "Début Occupation", fin_occupation: "Fin Occupation",
    largeur_emprise: "Largeur Emprise (m)", frequence_trafic: "Frequence Trafic",
    type_trafic: "Type Trafic", travaux_realises: "Travaux Realises",
    date_travaux: "Date Travaux", entreprise: "Entreprise", heure_debut: "Heure Debut",
    heure_fin: "Heure Fin", plateforme: "Plateforme", relief: "Relief", vegetation: "Végétation",
    debut_travaux: "Début des travaux", fin_travaux: "Fin des travaux", financement: "Financement",
    projet: "Projet", niveau_service: "Niveau de service (NS)", fonctionnalite: "Fonctionnalité (FO)",
    interet_socio_administratif: "Intérêt socio-administratif (ISA)",
    population_desservie: "Population desservie (P)", potentiel_agricole: "Potentiel agricole (PA)",
    cout_investissement: "Coût d’investissement (CI)", protection_environnement: "Protection de l’environnement (PE)",
    note_globale: "Note globale (NG)", type_chaus: "Type Chaussee", etat_piste: "Etat", endroit: "Endroit",
    situation: "Situation", type_pont: "Type Pont", nom_cours: "Nom Cours d'eau", type_bac: "Type Bac",
    type_mater: "Type Materiau", nom: "Nom", type: "Type", type_infra: "Type", date_creat: "Date Creation",
    cause_coup: "Cause Coupure", type_point: "Type Point", original_type: "Type",
    travaux_debut: "Début des travaux", travaux_fin: "Fin des travaux", type_de_realisation: "Type de réalisation",
    amenage_ou_non_amenage: "Aménagé / Non aménagé", superficie_enquetes_ha: "Superficie enquête (ha)",
    superficie_digitalisee: "Superficie digitalisée (ha)", superficie_en_ha: "Superficie (ha)",
    piste_id: "ID", code_gps: "Code GPS",
    region_nom: "Région", prefecture_nom: "Préfecture", commune_nom: "Commune",
    created_at: "Date de création", updated_at: "Date de mise à jour"
  };

  // ✅ CALCULATE NOTE GLOBALE IF MISSING
  if (properties.type === 'pistes') {
    if (properties.note_globale == null || properties.note_globale === '') {
      const noteFields = ['niveau_service', 'fonctionnalite', 'interet_socio_administratif',
        'population_desservie', 'potentiel_agricole', 'cout_investissement', 'protection_environnement'];
      const values = noteFields.map(f => parseFloat(properties[f])).filter(v => !isNaN(v));
      if (values.length > 0) {
        properties.note_globale = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
      }
    }
  }

  const pprWhitelist = ["nom", "original_type", "code_piste", "code_gps", "projet", "entreprise", "financement", "travaux_debut", "travaux_fin", "type_de_realisation", "amenage_ou_non_amenage", "superficie_enquetes_ha", "superficie_digitalisee", "created_at", "updated_at", "commune_nom"];

  let keysToProcess = [];
  const baseKeys = Object.keys(properties);

  if (properties.type === "ppr_itial") {
    keysToProcess = pprWhitelist;
  } else if (properties.type === "pistes") {
    const firstFields = ["piste_id", "code_piste", "nom_origine_piste", "nom_destination_piste", "region_nom", "prefecture_nom", "commune_nom", "note_globale", "heure_debut", "heure_fin", "type_occupation", "largeur_emprise", "frequence_trafic", "type_trafic", "financement", "entreprise", "projet", "cout_investissement"];
    const otherFields = baseKeys.filter(k => !firstFields.includes(k) && !ignoredFields.includes(k) && k !== 'type');
    keysToProcess = [...firstFields, ...otherFields];
  } else {
    const geoKeys = ["region_nom", "prefecture_nom", "commune_nom"];
    const otherKeys = baseKeys.filter(k => !geoKeys.includes(k));
    const communeIdx = otherKeys.findIndex(k => k === 'commune_nom');
    if (communeIdx !== -1) {
      otherKeys.splice(communeIdx, 0, "region_nom", "prefecture_nom");
      keysToProcess = [...new Set(otherKeys)];
    } else {
      keysToProcess = ["region_nom", "prefecture_nom", "commune_nom", ...otherKeys];
    }
  }

  let innerContent = "";
  keysToProcess.forEach((key) => {
    const isPprAllowed = properties.type === 'ppr_itial' && pprWhitelist.includes(key);
    if ((ignoredFields.includes(key) && !isPprAllowed) || key === 'type') return;
    if (key === 'code_piste' && properties.type !== 'pistes') return;
    if (properties.type !== 'ppr_itial' && properties.type !== 'pistes') {
      if (properties[key] === null || properties[key] === undefined || properties[key] === "") return;
    }

    const value = properties[key];
    const safeValue = (value === null || value === undefined) ? "" : value;
    const label = fieldLabels[key] || key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

    let displayValue = safeValue;
    if ((key.includes("date") || key === "date_creat" || key === "debut_occupation" || key === "fin_occupation" || key === "travaux_debut" || key === "travaux_fin" || key === "debut_travaux" || key === "fin_travaux") && typeof value === "string") {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          displayValue = date.toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
        }
      } catch (e) { }
    }
    if (key.includes("heure") && typeof value === "string") displayValue = value;
    if (key === "largeur_emprise" && typeof value === "number") displayValue = `${value.toFixed(2)} m`;
    if (typeof value === "boolean") displayValue = value ? "Oui" : "Non";
    if (key === "existence_intersection") displayValue = value === 1 ? "Oui" : "Non";
    if (["x_origine","y_origine","x_destination","y_destination","x_intersection","y_intersection"].includes(key) && typeof value === "number")
      displayValue = value.toFixed(6);
    if (key === "amenage_ou_non_amenage") {
      const v = String(value).toLowerCase();
      displayValue = v === "true" ? "Aménagé" : v === "false" ? "Non aménagé" : value;
    }

    const isNoteGlobale = key === "note_globale";
    const style = isNoteGlobale ? 'margin: 5px 0; padding: 5px; background: #f0f7ff; border-radius: 4px; border-left: 3px solid #1976d2; font-weight: bold;' : 'margin: 5px 0;';

    innerContent += `<p style="${style}"><strong>${label}:</strong> ${displayValue}</p>`;
  });

  if (innerContent === "") innerContent = '<p style="margin: 5px 0;"><em>Aucune information disponible</em></p>';

  // ── Section coordonnées ──────────────────────────────────────────────────
  const coordsDefs = {
    pistes:                    [{ label: "Début",    xKey: "x_origine",   yKey: "y_origine"   },
                                { label: "Fin",      xKey: "x_destination", yKey: "y_destination" }],
    chaussees:                 [{ label: "Début",    xKey: "x_debut_ch",  yKey: "y_debut_ch"  },
                                { label: "Fin",      xKey: "x_fin_ch",    yKey: "y_fin_chau"  }],
    bacs:                      [{ label: "Début",    xKey: "x_debut_tr",  yKey: "y_debut_tr"  },
                                { label: "Fin",      xKey: "x_fin_trav",  yKey: "y_fin_trav"  }],
    passages_submersibles:     [{ label: "Début",    xKey: "x_debut_pa",  yKey: "y_debut_pa"  },
                                { label: "Fin",      xKey: "x_fin_pass",  yKey: "y_fin_pass"  }],
    ponts:                     [{ label: "Position", xKey: "x_pont",      yKey: "y_pont"      }],
    buses:                     [{ label: "Position", xKey: "x_buse",      yKey: "y_buse"      }],
    dalots:                    [{ label: "Position", xKey: "x_dalot",     yKey: "y_dalot"     }],
    ecoles:                    [{ label: "Position", xKey: "x_ecole",     yKey: "y_ecole"     }],
    services_santes:           [{ label: "Position", xKey: "x_sante",     yKey: "y_sante"     }],
    batiments_administratifs:  [{ label: "Position", xKey: "x_batiment",  yKey: "y_batiment"  }],
    infrastructures_hydrauliques:[{ label: "Position", xKey: "x_infrastr", yKey: "y_infrastr" }],
    localites:                 [{ label: "Position", xKey: "x_localite",  yKey: "y_localite"  }],
    marches:                   [{ label: "Position", xKey: "x_marche",    yKey: "y_marche"    }],
    autres_infrastructures:    [{ label: "Position", xKey: "x_autre_in",  yKey: "y_autre_in"  }],
    points_coupures:           [{ label: "Position", xKey: "x_point_co",  yKey: "y_point_co"  }],
    points_critiques:          [{ label: "Position", xKey: "x_point_cr",  yKey: "y_point_cr"  }],
    ppr_itial:                 [{ label: "Position", xKey: "x_site",      yKey: "y_site"      }],
  };
  let coordHtml = "";
  const defs = coordsDefs[properties.type] || [];
  const visibleDefs = defs.filter(d => (!d.cond || d.cond(properties)) && properties[d.xKey] != null && properties[d.yKey] != null);
  if (visibleDefs.length > 0) {
    coordHtml = `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #bbb;"><strong style="color: #2c3e50; font-size: 12px;">Coordonnées :</strong>`;
    visibleDefs.forEach(d => {
      coordHtml += `<p style="margin: 2px 0; font-size: 12px;"><strong>${d.label} :</strong> Lon: ${Number(properties[d.xKey]).toFixed(6)}, Lat: ${Number(properties[d.yKey]).toFixed(6)}</p>`;
    });
    coordHtml += `</div>`;
  }

  // ── Section intersections (pistes uniquement) ────────────────────────────
  let intersectHtml = "";
  if (properties.type === "pistes" && properties.intersections_json) {
    let list = properties.intersections_json;
    if (typeof list === "string") { try { list = JSON.parse(list); } catch(e) { list = []; } }
    if (Array.isArray(list) && list.length > 0) {
      intersectHtml = `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #bbb;">` +
        `<strong style="color:#2c3e50;font-size:12px;">Intersections (${list.length}) :</strong>`;
      list.forEach((item, i) => {
        intersectHtml += `<p style="margin:2px 0;font-size:12px;">` +
          `<strong>${i + 1}.</strong> ${item.code_piste} — Lon: ${Number(item.x).toFixed(6)}, Lat: ${Number(item.y).toFixed(6)}` +
          `</p>`;
      });
      intersectHtml += `</div>`;
    }
  }

  return `<div style="max-height: 250px; overflow-y: auto; padding-right: 10px; scrollbar-width: thin;">${innerContent}${coordHtml}${intersectHtml}</div>`;
};

// ... (Helpers: _niceStepDeg, _fmtDegDec, _loadImageSafe, drawGraticule4326 remain exactly the same as previous) ...
function _niceStepDeg(spanDeg) {
  const raw = spanDeg / 8;
  const steps = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10];
  return steps.find((s) => s >= raw) || 10;
}
function _fmtDegDec(v) {
  const av = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  return sign + av.toFixed(3);
}
function _loadImageSafe(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
function drawGraticule4326(ctx, map, mapX, mapY, mapW, mapH, scale) {
  if (!map || !map.getBounds) return;
  const b = map.getBounds();
  const west = b.getWest(), east = b.getEast();
  const south = b.getSouth(), north = b.getNorth();
  const stepLon = _niceStepDeg(Math.abs(east - west));
  const stepLat = _niceStepDeg(Math.abs(north - south));
  const startLon = Math.floor(west / stepLon) * stepLon;
  const endLon = Math.ceil(east / stepLon) * stepLon;
  const startLat = Math.floor(south / stepLat) * stepLat;
  const endLat = Math.ceil(north / stepLat) * stepLat;
  ctx.save();
  const overflow = 10 * scale;
  ctx.strokeStyle = "rgba(100,100,100,0.35)";
  ctx.lineWidth = 1.5 * scale;
  ctx.setLineDash([8 * scale, 4 * scale]);
  for (let lon = startLon; lon <= endLon + 1e-9; lon += stepLon) {
    const p = map.latLngToContainerPoint([north, lon]);
    const x = mapX + p.x * scale;
    ctx.beginPath();
    ctx.moveTo(x, mapY - overflow);
    ctx.lineTo(x, mapY + mapH + overflow);
    ctx.stroke();
  }
  for (let lat = startLat; lat <= endLat + 1e-9; lat += stepLat) {
    const p = map.latLngToContainerPoint([lat, west]);
    const y = mapY + p.y * scale;
    ctx.beginPath();
    ctx.moveTo(mapX - overflow, y);
    ctx.lineTo(mapX + mapW + overflow, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = "#2c3e50";
  ctx.lineWidth = 2 * scale;
  ctx.fillStyle = "#2c3e50";
  ctx.font = `bold ${12 * scale}px Arial, sans-serif`;
  const tick = 8 * scale;
  ctx.textAlign = "center";
  for (let lon = startLon; lon <= endLon + 1e-9; lon += stepLon) {
    const p = map.latLngToContainerPoint([south, lon]);
    const x = mapX + p.x * scale;
    if (x < mapX || x > mapX + mapW) continue;
    const text = _fmtDegDec(lon) + "°";
    ctx.beginPath();
    ctx.moveTo(x, mapY);
    ctx.lineTo(x, mapY - tick);
    ctx.stroke();
    ctx.textBaseline = "bottom";
    ctx.fillText(text, x, mapY - tick - 4 * scale);
  }
  ctx.textBaseline = "middle";
  for (let lat = startLat; lat <= endLat + 1e-9; lat += stepLat) {
    const p = map.latLngToContainerPoint([lat, west]);
    const y = mapY + p.y * scale;
    if (y < mapY || y > mapY + mapH) continue;
    const text = _fmtDegDec(lat) + "°";
    ctx.beginPath();
    ctx.moveTo(mapX, y);
    ctx.lineTo(mapX - tick, y);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(text, mapX - tick - 4 * scale, y);
  }
  ctx.restore();
}

/**
 * Creates a Leaflet GeoJSON layer representing the buffer.
 */
function createPolygonBuffer(polygon, distanceKm) {
  try {
    const geoJson = polygon.toGeoJSON();
    const buffered = turf.buffer(geoJson, distanceKm, { units: 'kilometers' });
    return L.geoJSON(buffered, {
      style: {
        color: '#e74c3c', weight: 2, opacity: 1, dashArray: '5, 10',
        fillColor: '#e74c3c', fillOpacity: 0.2, interactive: false
      }
    });
  } catch (error) {
    return null;
  }
}

const MapContainer = () => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerLayersByTypeRef = useRef({});
  const lineLayerRef = useRef(null);
  const polygonLayerRef = useRef(null);
  const iconCacheRef = useRef(null);
  const tempBufferLayerRef = useRef(null);
  const fidToLayerRef = useRef({});           // fid → { layer, clusterGroup }
  const tempHighlightRef = useRef(null);      // cercle de surbrillance temporaire
  const updateMapDisplayRef = useRef(null);   // toujours la dernière version d'updateMapDisplay

  // ✅ NEW STATE FOR BUFFER GEOJSON
  const [currentBufferGeoJSON, setCurrentBufferGeoJSON] = useState(null);

  const [localDataCache, setLocalDataCache] = useState(null);
  const [hierarchyData, setHierarchyData] = useState(null);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [geographicFilters, setGeographicFilters] = useState({ region_id: "", prefecture_id: "", commune_id: "" });
  const [isMapReady, setIsMapReady] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [boundariesManager, setBoundariesManager] = useState(null);
  const [boundariesEnabled, setBoundariesEnabled] = useState({ region: true, prefecture: true, commune: true });
  const { user, hasInterfaceAccess } = useAuth();
  const canViewInTable = hasInterfaceAccess('suivi_donnees');
  const isMobile = useIsMobile(768);

  useEffect(() => {
    const svgId = "map-svg-patterns";
    if (!document.getElementById(svgId)) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.id = svgId;
      svg.style.position = "absolute";
      svg.style.width = "0";
      svg.style.height = "0";
      svg.style.pointerEvents = "none";
      svg.innerHTML = `<defs><pattern id="hatch" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" style="stroke:#27ae60; stroke-width:4" /></pattern></defs>`;
      document.body.appendChild(svg);
    }
  }, []);

  const canExport = () => {
    if (!user) return false;
    return hasInterfaceAccess('export_carte');
  };

  const generateIconCache = async () => {
    if (iconCacheRef.current) return iconCacheRef.current;
    const iconDefinitions = {
      Ponts: { icon: "bridge", color: "#9B59B6" },
      Buses: { icon: "dot-circle", color: "#7F8C8D" },
      Dalots: { icon: "water", color: "#3498DB" },
      Bacs: { icon: "ship", color: "#F39C12" },
      "Passages submersibles": { icon: "water", color: "#1ABC9C" },
      "Points de coupure": { icon: "times-circle", color: "#C0392B" },
      "Points critiques": { icon: "exclamation-triangle", color: "#D35400" },
      Localités: { icon: "home", color: "#E67E22" },
      Écoles: { icon: "graduation-cap", color: "#27AE60" },
      "Services de santé": { icon: "hospital", color: "#E74C3C" },
      Marchés: { icon: "shopping-cart", color: "#F1C40F" },
      "Bât. administratifs": { icon: "building", color: "#34495E" },
      "Infra. hydrauliques": { icon: "tint", color: "#3498DB" },
      "Autres infrastructures": { icon: "map-pin", color: "#95A5A6" },
      "site de plaine": { icon: "dot-circle", color: "#000000" },
      "zones de plaine": { icon: "draw-polygon", color: "#27ae60", isRect: true },
    };
    const cache = {};
    for (const [label, config] of Object.entries(iconDefinitions)) {
      const { icon, color, bgColor, isRect } = config;
      const size = 32;
      const tempDiv = document.createElement("div");
      tempDiv.style.cssText = `position: absolute; left: -9999px; width: ${size}px; height: ${size}px; background-color: ${bgColor || color}; border-radius: ${isRect ? "4px" : "50%"}; display: flex; align-items: center; justify-content: center; border: 3px solid ${bgColor ? color : "white"};`;
      tempDiv.innerHTML = `<i class="fas fa-${icon}" style="color: ${bgColor ? color : "white"}; font-size: 16px;"></i>`;
      document.body.appendChild(tempDiv);
      const canvas = await html2canvas(tempDiv, { backgroundColor: null, scale: 2, logging: false });
      document.body.removeChild(tempDiv);
      cache[label] = canvas;
    }
    iconCacheRef.current = cache;
    return cache;
  };

  const createCustomIcon = (type) => {
    const config = iconConfig[type] || iconConfig.autres_infrastructures;
    const isWhite = config.color === "#FFFFFF" || config.color === "white";
    const iconColor = isWhite ? (config.contourColor || "#000") : "white";
    const borderColor = config.contourColor || (isWhite ? "#000" : "white");
    return L.divIcon({
      html: `<div style="background-color: ${config.color}; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2.5px solid ${borderColor}; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"><i class="fas fa-${config.icon}" style="color: ${iconColor}; font-size: 11px;"></i></div>`,
      className: "custom-marker", iconSize: [26, 26], iconAnchor: [13, 13],
    });
  };

  const loadAllDataOnce = async () => {
    if (GLOBAL_DATA_CACHE && GLOBAL_HIERARCHY_CACHE && GLOBAL_DATA_CACHE.features && GLOBAL_DATA_CACHE.features.length > 0) {
      // Vérifier que le cache disque est encore valide (non effacé après logout)
      const diskData = await hybridCache.getMapData();
      if (diskData) {
        setLocalDataCache(GLOBAL_DATA_CACHE);
        setHierarchyData(GLOBAL_HIERARCHY_CACHE);
        setIsInitialLoading(false);
        return;
      }
      // Cache disque effacé (logout) → invalider le cache mémoire
      GLOBAL_DATA_CACHE = null;
      GLOBAL_HIERARCHY_CACHE = null;
    }
    if (localDataCache && hierarchyData && localDataCache.features && localDataCache.features.length > 0) {
      setIsInitialLoading(false);
      return;
    }
    if (isLoading()) {
      const promise = getLoadingPromise();
      if (promise) {
        await promise;
        // Vérifier les données brutes partagées (chargées par useInfrastructureData)
        const rawData = getRawData();
        if (rawData) {
          const geoJsonData = rawData.type === 'FeatureCollection' ? rawData : convertToGeoJSON(rawData);
          GLOBAL_DATA_CACHE = geoJsonData;
          setLocalDataCache(GLOBAL_DATA_CACHE);
          // Récupérer la hiérarchie (cache ou API)
          let hierarchy = GLOBAL_HIERARCHY_CACHE || await hybridCache.getHierarchy();
          if (!hierarchy) {
            try {
              const resp = await fetch("/api/geography/hierarchy/", );
              const json = await resp.json();
              if (json.success) {
                hierarchy = json.hierarchy;
                GLOBAL_HIERARCHY_CACHE = hierarchy;
                await hybridCache.saveHierarchy(hierarchy);
              }
            } catch (e) {}
          }
          if (hierarchy) {
            GLOBAL_HIERARCHY_CACHE = hierarchy;
            setHierarchyData(hierarchy);
          }
          setIsInitialLoading(false);
          return; // ← TOUJOURS retourner après avoir utilisé les données brutes
        }
        // Fallback 1 : cache GeoJSON de la carte
        const cached = await hybridCache.getMapData();
        const cachedHierarchy = await hybridCache.getHierarchy();
        if (cached && cachedHierarchy) {
          GLOBAL_DATA_CACHE = cached;
          GLOBAL_HIERARCHY_CACHE = cachedHierarchy;
          setLocalDataCache(cached);
          setHierarchyData(cachedHierarchy);
          setIsInitialLoading(false);
          return;
        }
        // Fallback 2 : données brutes du cache infra (useInfrastructureData a utilisé le cache disque)
        const infraData = await hybridCache.getInfrastructureData();
        if (infraData) {
          const geoJsonData = convertToGeoJSON(infraData);
          GLOBAL_DATA_CACHE = geoJsonData;
          setLocalDataCache(GLOBAL_DATA_CACHE);
          let hierarchy = GLOBAL_HIERARCHY_CACHE || await hybridCache.getHierarchy();
          if (!hierarchy) {
            try {
              const resp = await fetch("/api/geography/hierarchy/", );
              const json = await resp.json();
              if (json.success) { hierarchy = json.hierarchy; GLOBAL_HIERARCHY_CACHE = hierarchy; await hybridCache.saveHierarchy(hierarchy); }
            } catch (e) {}
          }
          if (hierarchy) { GLOBAL_HIERARCHY_CACHE = hierarchy; setHierarchyData(hierarchy); }
          setIsInitialLoading(false);
          return;
        }
      }
    }
    // Vérifier si les données brutes sont déjà disponibles en mémoire (chargées par useInfrastructureData)
    // Cela évite les double appels API quand le lock a déjà été libéré mais rawData est défini
    const earlyRawData = getRawData();
    if (earlyRawData) {
      const geoJsonData = earlyRawData.type === 'FeatureCollection' ? earlyRawData : convertToGeoJSON(earlyRawData);
      GLOBAL_DATA_CACHE = geoJsonData;
      setLocalDataCache(GLOBAL_DATA_CACHE);
      let earlyHierarchy = GLOBAL_HIERARCHY_CACHE || await hybridCache.getHierarchy();
      if (!earlyHierarchy) {
        try {
          const resp = await fetch("/api/geography/hierarchy/", );
          const json = await resp.json();
          if (json.success) { earlyHierarchy = json.hierarchy; GLOBAL_HIERARCHY_CACHE = earlyHierarchy; await hybridCache.saveHierarchy(earlyHierarchy); }
        } catch (e) {}
      }
      if (earlyHierarchy) { GLOBAL_HIERARCHY_CACHE = earlyHierarchy; setHierarchyData(earlyHierarchy); }
      setIsInitialLoading(false);
      return;
    }
    const loadPromise = (async () => {
      setIsInitialLoading(true);
      try {
        const hasActiveFilters = ((Array.isArray(geographicFilters.region_id) ? geographicFilters.region_id.length > 0 : !!geographicFilters.region_id) || (Array.isArray(geographicFilters.prefecture_id) ? geographicFilters.prefecture_id.length > 0 : !!geographicFilters.prefecture_id) || (Array.isArray(geographicFilters.commune_id) ? geographicFilters.commune_id.length > 0 : !!geographicFilters.commune_id));
        const cachedMapData = !hasActiveFilters ? await hybridCache.getMapData() : null;
        const cachedHierarchy = await hybridCache.getHierarchy();
        if (cachedMapData && cachedHierarchy && cachedMapData.features && cachedMapData.features.length > 0) {
          GLOBAL_DATA_CACHE = cachedMapData;
          GLOBAL_HIERARCHY_CACHE = cachedHierarchy;
          setLocalDataCache(GLOBAL_DATA_CACHE);
          setHierarchyData(GLOBAL_HIERARCHY_CACHE);
          setIsInitialLoading(false);
          return;
        }
        const infraData = !hasActiveFilters ? await hybridCache.getInfrastructureData() : null;
        if (infraData) {
          const geoJsonData = convertToGeoJSON(infraData);
          GLOBAL_DATA_CACHE = geoJsonData;
          setLocalDataCache(GLOBAL_DATA_CACHE);
          const hierarchyResponse = await fetch("/api/geography/hierarchy/", );
          const hierarchyJson = await hierarchyResponse.json();
          if (hierarchyJson.success) {
            GLOBAL_HIERARCHY_CACHE = hierarchyJson.hierarchy;
            setHierarchyData(GLOBAL_HIERARCHY_CACHE);
            await hybridCache.saveMapData(GLOBAL_DATA_CACHE);
            await hybridCache.saveHierarchy(GLOBAL_HIERARCHY_CACHE);
          }
          setIsInitialLoading(false);
          return;
        }
        // Chargement sans filtres serveur — filtrage géographique côté client
        const [dataResult, hierarchyResponse] = await Promise.all([dataservice.loadMapData({}), fetch("/api/geography/hierarchy/", )]);
        const hierarchyJson = await hierarchyResponse.json();
        if (dataResult.success && dataResult.data) {
          const geoJsonData = dataResult.isGeoJSON ? dataResult.data : convertToGeoJSON(dataResult.data);
          // Sauvegarder les données brutes pour les graphiques (si MapContainer charge en premier)
          setRawData(dataResult.isGeoJSON ? dataResult.data : dataResult.data);
          GLOBAL_DATA_CACHE = geoJsonData;
          setLocalDataCache(GLOBAL_DATA_CACHE);
          await hybridCache.saveMapData(GLOBAL_DATA_CACHE);
        } else {
          GLOBAL_DATA_CACHE = { type: "FeatureCollection", features: [] };
          setLocalDataCache(GLOBAL_DATA_CACHE);
        }
        if (hierarchyJson.success) {
          GLOBAL_HIERARCHY_CACHE = hierarchyJson.hierarchy;
          setHierarchyData(GLOBAL_HIERARCHY_CACHE);
          await hybridCache.saveHierarchy(GLOBAL_HIERARCHY_CACHE);
        }
      } catch (err) {
        GLOBAL_DATA_CACHE = { type: "FeatureCollection", features: [] };
        setLocalDataCache(GLOBAL_DATA_CACHE);
      } finally {
        setIsInitialLoading(false);
        unlockLoading();
      }
    })();
    lockLoading(loadPromise, "MapContainer");
    await loadPromise;
  };

  const getTargetCommunes = React.useCallback(() => {
    if (!hierarchyData) return null;
    const filters = geographicFilters;
    const communeSelected = Array.isArray(filters.commune_id) ? filters.commune_id : (filters.commune_id && filters.commune_id !== "null" ? [filters.commune_id] : []);
    const prefectureSelected = Array.isArray(filters.prefecture_id) ? filters.prefecture_id : (filters.prefecture_id && filters.prefecture_id !== "null" ? [filters.prefecture_id] : []);
    const regionSelected = Array.isArray(filters.region_id) ? filters.region_id : (filters.region_id && filters.region_id !== "null" ? [filters.region_id] : []);
    let filterCommuneIds = null;
    if (communeSelected.length > 0) {
      // Commune = filtre le plus précis → priorité maximale
      const targetIds = new Set();
      communeSelected.forEach(id => { if (id) targetIds.add(parseInt(id)); });
      filterCommuneIds = Array.from(targetIds);
    } else if (prefectureSelected.length > 0) {
      // Préfecture sélectionnée → filtre par communes de ces préfectures
      const targetIds = new Set();
      prefectureSelected.forEach(prefId => {
        if (!prefId) return;
        const prefecture = hierarchyData.flatMap(r => r.prefectures).find(p => p.id === parseInt(prefId));
        if (prefecture) prefecture.communes.forEach(c => targetIds.add(c.id));
      });
      filterCommuneIds = Array.from(targetIds);
    } else if (regionSelected.length > 0) {
      // Région sélectionnée → filtre par communes de ces régions
      const targetIds = new Set();
      regionSelected.forEach(regId => {
        if (!regId) return;
        const region = hierarchyData.find(r => r.id === parseInt(regId));
        if (region) region.prefectures.forEach(p => p.communes.forEach(c => targetIds.add(c.id)));
      });
      filterCommuneIds = Array.from(targetIds);
    }
    const isRestricted = user && (user.role === 'BTGR' || user.role === 'SPGR');
    let scopeCommuneIds = null;
    if (isRestricted) {
      const scopeIds = new Set();
      if (user.role === 'BTGR') {
        const assignedRegionIds = (user.assigned_regions || []).map(r => parseInt(r.region_id));
        hierarchyData.forEach(region => {
          if (assignedRegionIds.includes(region.id)) region.prefectures.forEach(pref => pref.communes.forEach(c => scopeIds.add(c.id)));
        });
      } else if (user.role === 'SPGR') {
        const assignedPrefIds = (user.assigned_prefectures || []).map(p => parseInt(p.prefecture_id));
        hierarchyData.forEach(region => {
          region.prefectures.forEach(pref => {
            if (assignedPrefIds.includes(pref.id)) pref.communes.forEach(c => scopeIds.add(c.id));
          });
        });
      }
      scopeCommuneIds = Array.from(scopeIds);
    }
    if (!filterCommuneIds && !isRestricted) return null;
    if (!filterCommuneIds && isRestricted) return scopeCommuneIds;
    if (filterCommuneIds && !isRestricted) return filterCommuneIds;
    return filterCommuneIds.filter(id => scopeCommuneIds.includes(id));
  }, [hierarchyData, geographicFilters, user]);

  const getActiveFilters = React.useCallback(() => {
    const checkboxes = document.querySelectorAll(".filter-checkbox-group input[type='checkbox']");
    // Si les checkboxes pas encore dans le DOM (données chargées avant le rendu) → tout afficher
    if (checkboxes.length === 0) return { types: null };
    const checkedTypes = Array.from(checkboxes).filter((cb) => cb.checked).map((cb) => cb.id);
    if (checkedTypes.length === 0) return { types: [] };
    return { types: checkedTypes };
  }, []);

  const filterDataLocally = React.useCallback(() => {
    if (!localDataCache?.features) return [];
    const activeFilters = getActiveFilters();
    const activeTypes = activeFilters.types; // null = tout afficher, [] = rien, [...] = filtrés
    const targetCommunes = getTargetCommunes();
    const filtered = localDataCache.features.filter((feature) => {
      const properties = feature.properties || {};
      // null = checkboxes pas encore initialisées → tout passe
      let typeMatch = activeTypes === null ? true : (activeTypes.length === 0 ? false : activeTypes.includes(properties.type));
      let geoMatch = true;
      if (targetCommunes !== null && Array.isArray(targetCommunes) && targetCommunes.length > 0) {
        geoMatch = targetCommunes.includes(properties.commune_id);
      } else if (
        (Array.isArray(geographicFilters.region_id) ? geographicFilters.region_id.length > 0 : !!geographicFilters.region_id) ||
        (Array.isArray(geographicFilters.prefecture_id) ? geographicFilters.prefecture_id.length > 0 : !!geographicFilters.prefecture_id) ||
        (Array.isArray(geographicFilters.commune_id) ? geographicFilters.commune_id.length > 0 : !!geographicFilters.commune_id)
      ) {
        geoMatch = false;
      }
      return typeMatch && geoMatch;
    });
    return filtered;
  }, [localDataCache, getActiveFilters, getTargetCommunes, geographicFilters]);

  const zoomToSelectedArea = async () => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    let type = null, id = null;
    const communeIds = Array.isArray(geographicFilters.commune_id) ? geographicFilters.commune_id : (geographicFilters.commune_id && geographicFilters.commune_id !== "null" ? [geographicFilters.commune_id] : []);
    const prefectureIds = Array.isArray(geographicFilters.prefecture_id) ? geographicFilters.prefecture_id : (geographicFilters.prefecture_id && geographicFilters.prefecture_id !== "null" ? [geographicFilters.prefecture_id] : []);
    const regionIds = Array.isArray(geographicFilters.region_id) ? geographicFilters.region_id : (geographicFilters.region_id && geographicFilters.region_id !== "null" ? [geographicFilters.region_id] : []);
    if (communeIds.length > 0) { type = "commune"; id = communeIds[communeIds.length - 1]; }
    else if (prefectureIds.length > 0) { type = "prefecture"; id = prefectureIds[prefectureIds.length - 1]; }
    else if (regionIds.length > 0) { type = "region"; id = regionIds[regionIds.length - 1]; }
    if (!type || !id) { map.setView([9.9456, -11.3167], 7); return; }
    try {
      const response = await fetch(`/api/geography/zoom/?type=${type}&id=${id}`, );
      const data = await response.json();
      if (data.success && data.location) {
        if (data.location.bounds) {
          const [minLng, minLat, maxLng, maxLat] = data.location.bounds;
          map.fitBounds([[minLat, minLng], [maxLat, maxLng]], { padding: [20, 20] });
        } else if (data.location.center) {
          const zoomLevel = type === "commune" ? 12 : type === "prefecture" ? 10 : 8;
          map.setView([data.location.center[1], data.location.center[0]], zoomLevel);
        }
      }
    } catch (e) {}
  };

  const updateStats = React.useCallback((visibleCount) => {
    const activeFiltersEl = document.getElementById("activeFilters");
    if (activeFiltersEl) {
      const filters = getActiveFilters();
      activeFiltersEl.innerText = filters.types.length;
    }
    const totalVisibleEl = document.getElementById("totalVisible");
    if (totalVisibleEl) {
      totalVisibleEl.innerText = visibleCount;
    }
  }, [getActiveFilters]);

  // ============================================================
  // ✅ NEW: HANDLE ZONE EXPORT (Buffer Content)
  // ============================================================

  // ============================================================
  // ✅ NEW: HANDLE ZONE EXPORT (Buffer Content - ZIP/Separated)
  // ============================================================
  const handleExportZone = async () => {
    if (!currentBufferGeoJSON || !localDataCache) return;

    try {
      setIsExporting(true);

      // Determine the geometry to intersect against
      const bufferGeom = currentBufferGeoJSON.type === 'FeatureCollection'
        ? currentBufferGeoJSON.features[0].geometry
        : currentBufferGeoJSON.type === 'Feature'
          ? currentBufferGeoJSON.geometry
          : currentBufferGeoJSON;

      // 1. Filter features inside the buffer
      const featuresInside = localDataCache.features.filter((f) => {
        if (!f.geometry) return false;

        // Note: The exclusion for 'enquete_polygone' has been removed
        // to allow exporting zones de plaine.

        if (f.geometry.type === 'Point') {
          return turf.booleanPointInPolygon(f.geometry, bufferGeom);
        } else {
          return turf.booleanIntersects(f, bufferGeom);
        }
      });

      if (featuresInside.length === 0) {
        alert("Aucune infrastructure trouvée dans cette zone.");
        setIsExporting(false);
        return;
      }

      // 2. Group features by their type
      const groupedFeatures = {};
      featuresInside.forEach((f) => {
        const type = f.properties.type || "autres";
        if (!groupedFeatures[type]) {
          groupedFeatures[type] = [];
        }
        groupedFeatures[type].push(f);
      });

      // 3. Initialize JSZip
      const zip = new JSZip();

      // Rename mapping
      const typeNameMapping = {
        "ppr_itial": "site_plaine",
        "enquete_polygone": "zone_de_plaine"
      };

      // 4. Create separate GeoJSON files for each type in the zip
      Object.keys(groupedFeatures).forEach((type) => {
        // Apply renaming rules or use original type
        const exportName = typeNameMapping[type] || type;

        const featureCollection = {
          type: "FeatureCollection",
          features: groupedFeatures[type]
        };

        zip.file(`${exportName}.geojson`, JSON.stringify(featureCollection));
      });

      // 5. Generate the ZIP file and trigger download
      const content = await zip.generateAsync({ type: "blob" });
      const timestamp = new Date().toISOString().slice(0, 10);
      const zipFilename = `export_zone_buffer_${timestamp}.zip`;

      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = zipFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      alert(`Export réussi: ${featuresInside.length} éléments exportés dans ${zipFilename}.`);

    } catch (e) {
      alert("Erreur lors de l'export de la zone.");
    } finally {
      setIsExporting(false);
    }
  };



  // ============================================================

  const updateMapDisplay = React.useCallback(() => {
    if (!markerLayersByTypeRef.current || !lineLayerRef.current || !localDataCache) return;
    const tableBtnHtml = (layer, fid) => canViewInTable
      ? `<div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #ddd; text-align: right;"><button class="goto-table-btn" data-layer="${layer}" data-fid="${fid}" style="padding: 5px 12px; background: #2980b9; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">📋 Voir dans le tableau</button></div>`
      : '';
    const markerLayersByType = markerLayersByTypeRef.current;
    const lineLayer = lineLayerRef.current;
    Object.values(markerLayersByType).forEach((layer) => layer.clearLayers());
    lineLayer.clearLayers();
    if (polygonLayerRef.current) polygonLayerRef.current.clearLayers();
    fidToLayerRef.current = {};
    const filteredFeatures = filterDataLocally();
    if (filteredFeatures.length === 0) { updateStats(0); return; }
    let visibleCount = 0;
    filteredFeatures.forEach((feature) => {
      try {
        if (!feature.geometry || !feature.geometry.coordinates) return;
        const { type, coordinates } = feature.geometry;
        const properties = feature.properties || {};
        // Utiliser feature.id (PK Django) en priorité — évite toute collision entre entités.
        // DRF-GIS place le PK dans feature.id et le retire des properties ; convertToGeoJSON
        // le restaure via `id: item.id`. Fallback sur les champs de properties si absent.
        const entityId = (feature.id != null && feature.id !== '' && feature.id !== 0)
          ? String(feature.id)
          : [properties.fid, properties.id, properties.gid, properties.sqlite_id]
              .filter(v => v != null && v !== '' && v !== 0)
              .map(String)
              .filter((v, i, a) => a.indexOf(v) === i)
              .join('|') || '';
        if (type === "Point") {
          const [lng, lat] = coordinates;
          visibleCount++;
          const config = iconConfig[properties.type] || iconConfig.autres_infrastructures;
          const marker = L.marker([lat, lng], { icon: createCustomIcon(properties.type) }).bindPopup(`<div style="padding: 15px; min-width: 250px; max-width: 400px; font-family: Arial, sans-serif;"><h4 style="margin: 0 0 12px 0; color: #2c3e50; border-bottom: 2px solid ${config.color}; padding-bottom: 6px;">${getTypeLabel(properties.type)}</h4>${formatPopupContent(properties)}${tableBtnHtml(properties.type, entityId)}</div>`);
          const markerType = properties.type || "autres_infrastructures";
          const targetLayer = markerLayersByTypeRef.current[markerType];
          if (targetLayer) {
            targetLayer.addLayer(marker);
            fidToLayerRef.current[`${properties.type}:${entityId}`] = { layer: marker, clusterGroup: targetLayer };
          }
        } else if (type === "LineString" || type === "MultiLineString") {
          let lineCoords = [];
          if (type === "LineString") lineCoords = coordinates.map((coord) => [coord[1], coord[0]]);
          else if (type === "MultiLineString" && coordinates[0]) lineCoords = coordinates[0].map((coord) => [coord[1], coord[0]]);
          visibleCount++;

          if (lineCoords.length > 0) {
            const isPiste = properties.type === "pistes";
            const isBacOrPassage =
              properties.type === "bacs" ||
              properties.type === "passages_submersibles";

            const lineConfig =
              iconConfig[properties.type] || iconConfig.autres_infrastructures;

            const polyline = L.polyline(lineCoords, {
              color: iconConfig[properties.type]?.color || "#000",
              weight: isPiste ? 4 : 4,
              opacity: 0.8,
              dashArray: isPiste ? "10, 10" : null,
              interactive: true,
              bubblingMouseEvents: true,
            });

            // ============================================================
            // ✅ MODIFIED: ADD BUFFER UI FOR PISTES
            // ============================================================
            if (isPiste) {
              const popupContent = `
                <div style="padding: 15px; min-width: 250px; max-width: 400px; font-family: Arial, sans-serif;">
                  <h4 style="margin: 0 0 12px 0; color: #2c3e50; border-bottom: 2px solid ${lineConfig.color}; padding-bottom: 6px;">
                    ${getTypeLabel(properties.type)}
                  </h4>
                  ${formatPopupContent(properties)}
                  
                  <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #ddd;">
                    <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #2c3e50;">
                      Créer un buffer (km):
                    </label>
                    <div style="display: flex; gap: 8px; align-items: center;">
                      <input
                        type="number"
                        id="buffer-distance-input-line"
                        min="0.1"
                        step="0.1"
                        placeholder="Ex: 1"
                        style="flex: 1; padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;"
                      />
                      <button
                        id="apply-buffer-btn-line"
                        style="padding: 6px 16px; background-color: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px;"
                      >
                        Appliquer
                      </button>
                    </div>
                  </div>
                  ${tableBtnHtml(properties.type, entityId)}
                </div>
              `;

              polyline.bindPopup(popupContent);

              // Add event listener logic for the Piste Buffer
              polyline.on('popupopen', () => {
                const applyBtn = document.getElementById('apply-buffer-btn-line');
                const distanceInput = document.getElementById('buffer-distance-input-line');

                if (applyBtn && distanceInput) {
                  applyBtn.onclick = () => {
                    const distance = parseFloat(distanceInput.value);

                    if (isNaN(distance) || distance <= 0) {
                      alert('Veuillez entrer une distance valide (supérieure à 0)');
                      return;
                    }

                    // Clear previous buffer if exists
                    if (tempBufferLayerRef.current) {
                      mapInstanceRef.current.removeLayer(tempBufferLayerRef.current);
                      tempBufferLayerRef.current = null;
                    }

                    // Create new buffer (Works for Lines too via Turf)
                    const buffer = createPolygonBuffer(polyline, distance);
                    if (buffer) {
                      buffer.addTo(mapInstanceRef.current);
                      tempBufferLayerRef.current = buffer;
                      // ✅ SAVE BUFFER TO STATE FOR EXPORT
                      setCurrentBufferGeoJSON(buffer.toGeoJSON());
                    }

                    // Close the popup
                    polyline.closePopup();
                  };
                }
              });

            } else {
              // Standard Popup for non-pistes lines (chaussées, etc.)
              polyline.bindPopup(`
                <div style="padding: 15px; min-width: 250px; max-width: 400px; font-family: Arial, sans-serif;">
                  <h4 style="margin: 0 0 12px 0; color: #2c3e50; border-bottom: 2px solid ${lineConfig.color}; padding-bottom: 6px;">
                    ${getTypeLabel(properties.type)}
                  </h4>
                  ${formatPopupContent(properties)}
                  ${tableBtnHtml(properties.type, entityId)}
                </div>
              `);
            }
            // ============================================================

            fidToLayerRef.current[`${properties.type}:${entityId}`] = { layer: polyline, clusterGroup: null };
            lineLayer.addLayer(polyline);

            //  NOUVEAU : Ajouter icône au premier point pour bacs et passages
            if (isBacOrPassage) {
              const [firstLat, firstLng] = lineCoords[0];

              const iconConfig2 =
                iconConfig[properties.type] ||
                iconConfig.autres_infrastructures;
              const iconMarker = L.marker([firstLat, firstLng], {
                icon: createCustomIcon(properties.type),
                zIndexOffset: 1000,
              }).bindPopup(`
                <div style="padding: 15px; min-width: 250px; max-width: 400px; font-family: Arial, sans-serif;">
                  <h4 style="margin: 0 0 12px 0; color: #2c3e50; border-bottom: 2px solid ${iconConfig2.color}; padding-bottom: 6px;">
                    ${getTypeLabel(properties.type)}
                  </h4>
                  ${formatPopupContent(properties)}
                  ${tableBtnHtml(properties.type, entityId)}
                </div>
              `);

              const targetLayer = markerLayersByTypeRef.current[properties.type];
              if (targetLayer) {
                targetLayer.addLayer(iconMarker);
                // Override polyline entry : le marker a le popup principal
                fidToLayerRef.current[`${properties.type}:${entityId}`] = { layer: iconMarker, clusterGroup: targetLayer };
              }
            }
          }
        } else if (type === "Polygon" || type === "MultiPolygon") {
          const isEnquete = properties.type === "enquete_polygone";
          const drawPolygon = (coords) => {
            const polyCoords = coords.map((ring) => ring.map((coord) => [coord[1], coord[0]]));
            const polygon = L.polygon(polyCoords, {
              color: isEnquete ? "#27ae60" : "#3498db", weight: isEnquete ? 1.5 : 2, fillColor: isEnquete ? "#90EE90" : "#3498db", fillOpacity: isEnquete ? 0.3 : 0.5, className: isEnquete ? "hachure-polygon" : "", interactive: true
            });
            if (isEnquete) {
              const popupContent = `<div style="padding: 15px; min-width: 250px; max-width: 400px; font-family: Arial, sans-serif;"><h4 style="margin: 0 0 12px 0; color: #2c3e50; border-bottom: 2px solid #27ae60; padding-bottom: 6px;">${getTypeLabel(properties.type)}</h4>${formatPopupContent(properties)}<div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #ddd;"><label style="display: block; margin-bottom: 8px; font-weight: bold; color: #2c3e50;">Créer un buffer (km):</label><div style="display: flex; gap: 8px; align-items: center;"><input type="number" id="buffer-distance-input" min="0.1" step="0.1" placeholder="Ex: 10" style="flex: 1; padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;"/><button id="apply-buffer-btn" style="padding: 6px 16px; background-color: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px;">Appliquer</button></div></div>${tableBtnHtml(properties.type, entityId)}</div>`;
              polygon.bindPopup(popupContent);
              polygon.on('popupopen', () => {
                const applyBtn = document.getElementById('apply-buffer-btn');
                const distanceInput = document.getElementById('buffer-distance-input');
                if (applyBtn && distanceInput) {
                  applyBtn.onclick = () => {
                    const distance = parseFloat(distanceInput.value);
                    if (isNaN(distance) || distance <= 0) { alert('Veuillez entrer une distance valide (supérieure à 0)'); return; }
                    if (tempBufferLayerRef.current) { mapInstanceRef.current.removeLayer(tempBufferLayerRef.current); tempBufferLayerRef.current = null; }
                    const buffer = createPolygonBuffer(polygon, distance);
                    if (buffer) {
                      buffer.addTo(mapInstanceRef.current);
                      tempBufferLayerRef.current = buffer;
                      // ✅ SAVE BUFFER TO STATE FOR EXPORT
                      setCurrentBufferGeoJSON(buffer.toGeoJSON());
                    }
                    polygon.closePopup();
                  };
                }
              });
            } else {
              polygon.bindPopup(`<div style="padding: 15px; min-width: 250px; max-width: 400px; font-family: Arial, sans-serif;"><h4 style="margin: 0 0 12px 0; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 6px;">${getTypeLabel(properties.type)}</h4>${formatPopupContent(properties)}${tableBtnHtml(properties.type, entityId)}</div>`);
            }
            fidToLayerRef.current[`${properties.type}:${entityId}`] = { layer: polygon, clusterGroup: null };
            if (polygonLayerRef.current) polygonLayerRef.current.addLayer(polygon);
            else lineLayer.addLayer(polygon);
          };
          if (type === "Polygon") drawPolygon(coordinates);
          else coordinates.forEach((poly) => drawPolygon(poly));
          visibleCount++;
        }
      } catch (e) {}
    });
    updateStats(visibleCount);
  }, [localDataCache, filterDataLocally, updateStats, canViewInTable]);

  // Garder une référence toujours à jour vers updateMapDisplay (accessible depuis les event listeners)
  useEffect(() => { updateMapDisplayRef.current = updateMapDisplay; }, [updateMapDisplay]);

  const exportMap = async (format = "png") => {
    setIsExporting(true);
    let savedMarkers = null, markerLayers = null, map = null;
    try {
      const mapElement = document.getElementById("map");
      map = mapInstanceRef.current;
      const exportBounds = map.getBounds();
      const infrastructureCounts = {};
      const filteredFeatures = filterDataLocally();
      let totalVisible = 0;
      filteredFeatures.forEach((feature) => {
        if (!feature.geometry || !feature.geometry.coordinates) return;
        const type = feature.properties?.type;
        if (!type) return;
        const geomType = feature.geometry.type;
        let isVisible = false;
        if (geomType === 'Point') { const [lng, lat] = feature.geometry.coordinates; isVisible = exportBounds.contains([lat, lng]); }
        else if (geomType === 'LineString') { const coords = feature.geometry.coordinates; isVisible = coords.some(([lng, lat]) => exportBounds.contains([lat, lng])); }
        else if (geomType === 'MultiLineString') { const coords = feature.geometry.coordinates; isVisible = coords.some(line => line.some(([lng, lat]) => exportBounds.contains([lat, lng]))); }
        if (isVisible) { infrastructureCounts[type] = (infrastructureCounts[type] || 0) + 1; totalVisible++; }
      });

      const typeToLabel = { 'pistes': 'Pistes', 'chaussees': 'Chaussées', 'ponts': 'Ponts', 'buses': 'Buses', 'dalots': 'Dalots', 'bacs': 'Bacs', 'passages_submersibles': 'Passages submersibles', 'localites': 'Localités', 'ecoles': 'Écoles', 'services_santes': 'Services de santé', 'marches': 'Marchés', 'batiments_administratifs': 'Bât. administratifs', 'infrastructures_hydrauliques': 'Infra. hydrauliques', 'autres_infrastructures': 'Autres infrastructures', 'points_coupures': 'Points de coupure', 'points_critiques': 'Points critiques', 'ppr_itial': "PPR Itial", 'enquete_polygone': "Polygones d'enquête" };
      const labelCounts = {};
      Object.keys(infrastructureCounts).forEach(type => { const label = typeToLabel[type]; if (label) labelCounts[label] = infrastructureCounts[type]; });

      const controls = mapElement.querySelectorAll(".leaflet-control");
      controls.forEach((ctrl) => (ctrl.style.display = "none"));
      markerLayers = markerLayersByTypeRef.current;
      savedMarkers = {};
      Object.keys(markerLayers).forEach(type => {
        const clusterGroup = markerLayers[type];
        savedMarkers[type] = [];
        clusterGroup.eachLayer(marker => savedMarkers[type].push(marker));
        map.removeLayer(clusterGroup);
        savedMarkers[type].forEach(marker => marker.addTo(map));
      });

      await new Promise(resolve => setTimeout(resolve, 300));
      const mapCanvas = await html2canvas(mapElement, { useCORS: true, allowTaint: true, backgroundColor: "#ffffff", scale: 2, logging: false });
      controls.forEach((ctrl) => (ctrl.style.display = ""));
      Object.keys(markerLayers).forEach(type => {
        savedMarkers[type].forEach(marker => map.removeLayer(marker));
        map.addLayer(markerLayers[type]);
      });

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = mapCanvas.width;
      tempCanvas.height = mapCanvas.height;
      const tempCtx = tempCanvas.getContext("2d");
      tempCtx.drawImage(mapCanvas, 0, 0);

      const lineLayer = lineLayerRef.current;
      if (lineLayer) {
        lineLayer.eachLayer((layer) => {
          if (layer instanceof L.Polyline) {
            const latlngs = layer.getLatLngs();
            const paths = Array.isArray(latlngs[0]) ? latlngs : [latlngs];
            paths.forEach((path) => {
              tempCtx.strokeStyle = layer.options.color || "#000";
              tempCtx.lineWidth = (layer.options.weight || 3) * 2;
              tempCtx.globalAlpha = layer.options.opacity || 0.8;
              if (layer.options.dashArray) {
                const dash = layer.options.dashArray.split(",").map((n) => parseInt(n.trim()) * 2);
                tempCtx.setLineDash(dash);
              } else { tempCtx.setLineDash([]); }
              tempCtx.beginPath();
              path.forEach((latlng, index) => {
                const point = map.latLngToContainerPoint(latlng);
                const x = point.x * 2;
                const y = point.y * 2;
                if (index === 0) tempCtx.moveTo(x, y);
                else tempCtx.lineTo(x, y);
              });
              tempCtx.stroke();
              tempCtx.globalAlpha = 1;
              tempCtx.setLineDash([]);
            });
          }
        });
      }

      const finalMapCanvas = tempCanvas;
      const legendWidth = 320, marginTop = 70, marginBottom = 230, marginLeft = 150;
      const finalWidth = finalMapCanvas.width + legendWidth + 100 + marginLeft;
      const finalHeight = finalMapCanvas.height + marginTop + marginBottom;
      const finalCanvas = document.createElement("canvas");
      finalCanvas.width = finalWidth; finalCanvas.height = finalHeight;
      const ctx = finalCanvas.getContext("2d");

      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, finalWidth, finalHeight);
      const titleHeight = 80;
      ctx.fillStyle = "#2c3e50"; ctx.fillRect(0, 0, finalWidth, titleHeight);
      ctx.fillStyle = "#ffffff"; ctx.font = "bold 40px Arial, sans-serif"; ctx.textAlign = "center"; ctx.fillText("CARTE DES INFRASTRUCTURES", finalWidth / 2, 38);
      ctx.font = "24px Arial, sans-serif"; ctx.fillText("République de Guinée", finalWidth / 2, 65);

      const mapX = marginLeft, mapY = titleHeight + 50;
      ctx.drawImage(finalMapCanvas, mapX, mapY);
      ctx.strokeStyle = "#2c3e50"; ctx.lineWidth = 4; ctx.strokeRect(mapX, mapY, finalMapCanvas.width, finalMapCanvas.height);
      const scale = 1.8;
      drawGraticule4326(ctx, map, mapX, mapY, finalMapCanvas.width, finalMapCanvas.height, scale);

      const legendX = mapX + finalMapCanvas.width + 50, legendY = mapY, legWidth = 320, legHeight = 620;
      ctx.fillStyle = "#f8f9fa"; ctx.fillRect(legendX, legendY, legWidth, legHeight);
      ctx.strokeStyle = "#2c3e50"; ctx.lineWidth = 3; ctx.strokeRect(legendX, legendY, legWidth, legHeight);
      ctx.fillStyle = "#2c3e50"; ctx.fillRect(legendX, legendY, legWidth, 55);
      ctx.fillStyle = "#ffffff"; ctx.font = "bold 24px Arial, sans-serif"; ctx.textAlign = "center"; ctx.fillText("LÉGENDE", legendX + legWidth / 2, legendY + 38);

      const legendItems = [
        { label: "Pistes", color: "#FF6B00", type: "dashed" },
        { label: "Chaussées", color: "#8e44ad", type: "line" },
        { label: "Ponts", color: "#9B59B6", type: "circle" },
        { label: "Buses", color: "#7F8C8D", type: "circle" },
        { label: "Dalots", color: "#3498DB", type: "circle" },
        { label: "Bacs", color: "#F39C12", type: "circle" },
        { label: "Passages submersibles", color: "#1ABC9C", type: "circle" },
        { label: "Localités", color: "#E67E22", type: "circle" },
        { label: "Écoles", color: "#27AE60", type: "circle" },
        { label: "Services de santé", color: "#E74C3C", type: "circle" },
        { label: "Marchés", color: "#F1C40F", type: "circle" },
        { label: "Bât. administratifs", color: "#34495E", type: "circle" },
        { label: "Infra. hydrauliques", color: "#3498DB", type: "circle" },
        { label: "Autres infrastructures", color: "#95A5A6", type: "circle" },
        { label: "Points de coupure", color: "#C0392B", type: "circle" },
        { label: "Points critiques", color: "#D35400", type: "circle" },
        { label: "Sites d'enquête", color: "#000000", type: "site_enquete" },
        { label: "Polygones d'enquête", color: "#27ae60", type: "enquete_polygone" },
      ];

      let iconCanvasMap = iconCacheRef.current;
      if (!iconCanvasMap) { await generateIconCache(); iconCanvasMap = iconCacheRef.current; }
      let yPos = legendY + 70; const lineHeight = 30;
      ctx.textAlign = "left"; ctx.font = "15px Arial, sans-serif";

      legendItems.forEach((item) => {
        const centerX = legendX + 45, centerY = yPos - 5;
        if (item.type === "dashed") {
          ctx.strokeStyle = item.color; ctx.lineWidth = 6; ctx.setLineDash([12, 6]); ctx.beginPath(); ctx.moveTo(legendX + 20, yPos - 3); ctx.lineTo(legendX + 70, yPos - 3); ctx.stroke(); ctx.setLineDash([]);
        } else {
          const iconCanvas = iconCanvasMap[item.label];
          if (iconCanvas) ctx.drawImage(iconCanvas, centerX - 16, centerY - 16, 32, 32);
          else if (item.type === "line") {
            ctx.strokeStyle = item.color; ctx.lineWidth = 6; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(legendX + 20, yPos - 3); ctx.lineTo(legendX + 70, yPos - 3); ctx.stroke();
          }
        }
        ctx.fillStyle = "#2c3e50"; ctx.textBaseline = "middle";
        const count = labelCounts[item.label] || 0;
        ctx.fillText(`${item.label} (${count})`, legendX + 90, yPos - 5);
        yPos += lineHeight;
      });

      const _logo = await _loadImageSafe(ndgrLogo);
      if (_logo) {
        const logoBoxY = legendY + legHeight + 15, logoBoxH = 100;
        ctx.fillStyle = "#ffffff"; ctx.fillRect(legendX, logoBoxY, legWidth, logoBoxH);
        ctx.strokeStyle = "#2c3e50"; ctx.lineWidth = 2; ctx.strokeRect(legendX, logoBoxY, legWidth, logoBoxH);
        const maxH = 75, ratio = _logo.width / _logo.height, drawH = maxH, drawW = drawH * ratio;
        ctx.drawImage(_logo, legendX + (legWidth - drawW) / 2, logoBoxY + (logoBoxH - drawH) / 2, drawW, drawH);
      }

      const northX = mapX + finalMapCanvas.width - 90, northY = mapY + 60;
      ctx.fillStyle = "#ffffff"; ctx.shadowColor = "rgba(0, 0, 0, 0.3)"; ctx.shadowBlur = 10; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2; ctx.beginPath(); ctx.arc(northX, northY, 45, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = "#2980b9"; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = "#e74c3c"; ctx.beginPath(); ctx.moveTo(northX, northY - 30); ctx.lineTo(northX - 12, northY + 8); ctx.lineTo(northX + 12, northY + 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#2c3e50"; ctx.font = "bold 26px Arial, sans-serif"; ctx.textAlign = "center"; ctx.fillText("N", northX, northY + 32);

      const scaleX = mapX + 50, scaleY = mapY + finalMapCanvas.height - 90, scaleWidth = 280, scaleHeight = 16, boxPadding = 25;
      const center = map.getCenter(), bounds = map.getBounds();
      const mapWidthInMeters = center.distanceTo(L.latLng(center.lat, bounds.getEast()));
      const metersPerPixel = (mapWidthInMeters * 2) / finalMapCanvas.width;
      const scaleMeters = (scaleWidth / 2) * metersPerPixel;
      let displayDistance, unit = "km";
      if (scaleMeters < 1000) { unit = "m"; displayDistance = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((v) => v >= scaleMeters) || 500; }
      else { const scaleKm = scaleMeters / 1000; displayDistance = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((v) => v >= scaleKm) || 1000; }

      ctx.shadowColor = "rgba(0, 0, 0, 0.3)"; ctx.shadowBlur = 10; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2; ctx.fillStyle = "#ffffff"; ctx.fillRect(scaleX - boxPadding, scaleY - 50, scaleWidth + boxPadding * 2, 90); ctx.shadowBlur = 0; ctx.strokeStyle = "#2c3e50"; ctx.lineWidth = 2; ctx.strokeRect(scaleX - boxPadding, scaleY - 50, scaleWidth + boxPadding * 2, 90);
      ctx.fillStyle = "#2c3e50"; ctx.font = "bold 18px Arial, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillText("ÉCHELLE", scaleX + scaleWidth / 2, scaleY - 28);
      const segments = 5, segmentWidth = scaleWidth / segments;
      for (let i = 0; i < segments; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#2c3e50" : "#ffffff"; ctx.fillRect(scaleX + i * segmentWidth, scaleY, segmentWidth, scaleHeight); ctx.strokeStyle = "#2c3e50"; ctx.lineWidth = 2; ctx.strokeRect(scaleX + i * segmentWidth, scaleY, segmentWidth, scaleHeight);
      }
      ctx.fillStyle = "#2c3e50"; ctx.font = "bold 15px Arial, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top";
      [0, 1, 2, 3, 4, 5].map((i) => Math.round((displayDistance * i) / 5)).forEach((distance, index) => { ctx.fillText(`${distance}`, scaleX + segmentWidth * index, scaleY + scaleHeight + 5); });
      ctx.font = "bold 14px Arial, sans-serif"; ctx.textAlign = "center"; ctx.fillText(unit === "m" ? "mètres" : "kilomètres", scaleX + scaleWidth / 2, scaleY + scaleHeight + 28);

      const infoY = mapY + finalMapCanvas.height + 100;
      ctx.shadowBlur = 0; ctx.fillStyle = "#ecf0f1"; ctx.fillRect(0, infoY - 20, finalWidth, 100);
      ctx.strokeStyle = "#2980b9"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, infoY - 20); ctx.lineTo(finalWidth, infoY - 20); ctx.stroke();
      ctx.fillStyle = "#2c3e50"; ctx.font = "bold 20px Arial, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillText("INFORMATIONS CARTOGRAPHIQUES", 40, infoY + 5);
      ctx.font = "17px Arial, sans-serif"; ctx.fillStyle = "#2c3e50"; ctx.textAlign = "left";
      ctx.fillText(`Pays: République de Guinée`, 40, infoY + 35); ctx.fillText(`Système: WGS 84 / EPSG:4326`, 40, infoY + 60);
      ctx.textAlign = "right"; ctx.fillText(`Date: ${new Date().toLocaleDateString("fr-FR")}`, finalWidth - 40, infoY + 35); ctx.fillText(`Heure: ${new Date().toLocaleTimeString("fr-FR")}`, finalWidth - 40, infoY + 60);

      if (format === "png") {
        const link = document.createElement("a");
        link.download = `carte_guinee_${new Date().toISOString().split("T")[0]}.png`;
        link.href = finalCanvas.toDataURL("image/png", 1.0);
        link.click();
      } else if (format === "pdf") {
        const imgData = finalCanvas.toDataURL("image/png", 1.0);
        const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [finalCanvas.width * 0.75, finalCanvas.height * 0.75] });
        pdf.addImage(imgData, "PNG", 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight(), undefined, "FAST");
        pdf.save(`carte_guinee_${new Date().toISOString().split("T")[0]}.pdf`);
      }
    } catch (error) {
      if (savedMarkers && markerLayers) {
        Object.keys(markerLayers).forEach(type => { if (savedMarkers[type]) savedMarkers[type].forEach(marker => { try { map.removeLayer(marker); } catch (e) { } }); map.addLayer(markerLayers[type]); });
      }
      alert("Erreur lors de l'export. Veuillez réessayer.");
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const map = L.map(mapRef.current, { center: [9.9456, -11.3167], zoom: 7, zoomControl: false, preferCanvas: true, renderer: L.canvas({ tolerance: 10 }) });
    L.control.zoom({ position: "topright" }).addTo(map);
    L.control.scale({ position: "bottomright", metric: true, imperial: false, maxWidth: window.innerWidth <= 768 ? 100 : 200 }).addTo(map);
    const baseLayers = {
      OpenStreetMap: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 19, crossOrigin: true }),
      Satellite: L.tileLayer("https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", { attribution: "© Google", maxZoom: 20, subdomains: ["mt0", "mt1", "mt2", "mt3"] }),
      "Satellite + Labels": L.tileLayer("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", { attribution: "© Google", maxZoom: 20, subdomains: ["mt0", "mt1", "mt2", "mt3"] }),
    };
    baseLayers["OpenStreetMap"].addTo(map);
    L.control.layers(baseLayers, null, { position: "topright" }).addTo(map);

    const markerLayersByType = {};
    const allTypes = ["services_santes", "bacs", "ponts", "buses", "dalots", "ecoles", "marches", "batiments_administratifs", "infrastructures_hydrauliques", "localites", "passages_submersibles", "autres_infrastructures", "points_coupures", "points_critiques", "ppr_itial", "enquete_polygone"];
    allTypes.forEach((type) => {
      const config = iconConfig[type] || iconConfig.autres_infrastructures;
      markerLayersByType[type] = L.markerClusterGroup({
        chunkedLoading: true, maxClusterRadius: 80, spiderfyOnMaxZoom: true, showCoverageOnHover: false, zoomToBoundsOnClick: true,
        iconCreateFunction: function (cluster) {
          const count = cluster.getChildCount();
          return L.divIcon({
            html: `<div style="background-color: ${config.color}; width: 40px; height: 40px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.4); font-weight: bold; color: white;"><i class="fas fa-${config.icon}" style="font-size: 14px; margin-bottom: 2px;"></i><span style="font-size: 11px;">${count}</span></div>`,
            className: `custom-cluster-icon cluster-${type}`, iconSize: L.point(40, 40),
          });
        },
      });
      map.addLayer(markerLayersByType[type]);
    });

    const lineLayer = L.layerGroup(); map.addLayer(lineLayer);
    const polygonLayer = L.layerGroup(); map.addLayer(polygonLayer);

    mapInstanceRef.current = map;
    markerLayersByTypeRef.current = markerLayersByType;
    lineLayerRef.current = lineLayer;
    polygonLayerRef.current = polygonLayer;
    setIsMapReady(true);

    // ✅ ADDED: CLEAR BUFFER ON MAP CLICK
    map.on('click', () => {
      if (tempBufferLayerRef.current) {
        map.removeLayer(tempBufferLayerRef.current);
        tempBufferLayerRef.current = null;
        setCurrentBufferGeoJSON(null); // Reset State
      }
    });

    // ✅ Lien carte ↔ tableau : délégation de clic sur .goto-table-btn (tous les popups)
    const handleGotoClick = (e) => {
      const btn = e.target.closest('.goto-table-btn');
      if (!btn) return;
      e.stopPropagation();
      const layer = btn.getAttribute('data-layer');
      // Envoyer tous les identifiants séparés par "|" pour un matching robuste
      const fids = btn.getAttribute('data-fids') || btn.getAttribute('data-fid') || '';
      window.dispatchEvent(new CustomEvent('entitySelectedOnMap', { detail: { layer, fids } }));
    };
    document.addEventListener('click', handleGotoClick);

    // ✅ Lien tableau ↔ carte : zoom max + cercle de surbrillance + popup
    const handleShowOnMap = (e) => {
      const { fid, lat, lng, layer: entityLayer } = e.detail || {};
      if (lat === undefined || lng === undefined || !mapInstanceRef.current) return;
      const map = mapInstanceRef.current;

      // Supprimer l'ancien cercle
      if (tempHighlightRef.current) {
        map.removeLayer(tempHighlightRef.current);
        tempHighlightRef.current = null;
      }

      // Délai pour laisser React basculer la vue (display:none → visible)
      setTimeout(() => {
        if (!mapInstanceRef.current) return;

        try {
          const renderer = map.options.renderer;
          if (renderer && renderer._container && !renderer._ctx) {
            renderer._ctx = renderer._container.getContext('2d');
          }
          map.invalidateSize({ animate: false });
        } catch (e) { /* canvas non encore prêt, flyTo se chargera du recalcul */ }

        const maxZoom = map.getMaxZoom() || 22;
        map.setView([lat, lng], maxZoom, { animate: false });

        const highlight = L.circleMarker([lat, lng], {
          radius: 22,
          color: '#e74c3c',
          weight: 3,
          fillColor: '#e74c3c',
          fillOpacity: 0.15,
          renderer: L.svg(),
        }).addTo(map);
        tempHighlightRef.current = highlight;

        const checkbox = document.querySelector(`.filter-checkbox-group input#${entityLayer}`);
        if (checkbox && !checkbox.checked) {
          checkbox.checked = true;
          if (updateMapDisplayRef.current) updateMapDisplayRef.current();
        }

        const entry = fidToLayerRef.current[`${entityLayer}:${String(fid || '')}`];
        if (entry) {
          const { layer, clusterGroup } = entry;
          if (clusterGroup && typeof clusterGroup.zoomToShowLayer === 'function') {
            clusterGroup.zoomToShowLayer(layer, () => layer.openPopup());
          } else if (layer.openPopup) {
            layer.openPopup([lat, lng]);
          }
        }

        setTimeout(() => {
          if (tempHighlightRef.current === highlight && mapInstanceRef.current) {
            mapInstanceRef.current.removeLayer(highlight);
            tempHighlightRef.current = null;
          }
        }, 6000);
      }, 150);
    };
    window.addEventListener('showEntityOnMap', handleShowOnMap);

    return () => {
      document.removeEventListener('click', handleGotoClick);
      window.removeEventListener('showEntityOnMap', handleShowOnMap);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerLayersByTypeRef.current = {};
        lineLayerRef.current = null;
        polygonLayerRef.current = null;
        tempBufferLayerRef.current = null;
        setIsMapReady(false);
      }
    };
  }, []);

  useEffect(() => {
    if (!isMapReady || !mapInstanceRef.current || boundariesManager) return;
    const initBoundaries = async () => {
      try {
        const manager = new AdministrativeBoundariesManager(mapInstanceRef.current);
        const success = await manager.initialize();
        if (success) setBoundariesManager(manager);
      } catch (e) {}
    };
    initBoundaries();
    return () => { if (boundariesManager) boundariesManager.destroy(); };
  }, [isMapReady]);

  useEffect(() => {
    if (!boundariesManager) return;
    Object.keys(boundariesEnabled).forEach(type => { boundariesManager.toggleLevel(type, boundariesEnabled[type]); });
  }, [boundariesManager, boundariesEnabled]);

  useEffect(() => {
    const checkboxes = document.querySelectorAll('.filter-checkbox-group input[type="checkbox"]');
    checkboxes.forEach((checkbox) => { checkbox.checked = true; });
  }, []);

  useEffect(() => {
    if (isMapReady) { loadAllDataOnce(); }
  }, [isMapReady]); // Chargement unique — filtrage géographique client-side via updateMapDisplay

  useEffect(() => {
    const handleGeographicFilterChange = (event) => {
      const newFilters = event.detail;
      if (JSON.stringify(newFilters) === JSON.stringify(geographicFilters)) return;
      setGeographicFilters(newFilters);
    };
    window.addEventListener("geographicFilterChanged", handleGeographicFilterChange);
    return () => { window.removeEventListener("geographicFilterChanged", handleGeographicFilterChange); };
  }, [geographicFilters]);

  useEffect(() => {
    if (isMapReady && localDataCache && hierarchyData) { updateMapDisplay(); zoomToSelectedArea(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geographicFilters, hierarchyData, updateMapDisplay]);

  useEffect(() => {
    if (!isMapReady || !localDataCache) return;
    const allFilterInputs = document.querySelectorAll(".filter-checkbox-group input");
    const handleFilterChange = (event) => { setTimeout(() => { updateMapDisplay(); }, 50); };
    allFilterInputs.forEach((input) => { input.addEventListener("change", handleFilterChange); });
    return () => { allFilterInputs.forEach((input) => { input.removeEventListener("change", handleFilterChange); }); };
  }, [isMapReady, localDataCache, hierarchyData, geographicFilters]);

  useEffect(() => {
    if (localDataCache && isMapReady) { updateMapDisplay(); }
  }, [localDataCache, isMapReady, updateMapDisplay]);

  useEffect(() => {
    if (isMapReady && !iconCacheRef.current) { generateIconCache(); }
  }, [isMapReady]);

  const BoundariesLegendControls = () => {
    const [isCollapsed, setIsCollapsed] = React.useState(() => isMobile);

    // Position: below Leaflet zoom + layer controls on mobile
    const topPosition = isMobile ? '210px' : '220px';
    const rightPosition = isMobile ? '6px' : '10px';
    const fontSize = isMobile ? '11px' : '12px';
    const checkboxSize = isMobile ? '15px' : '14px';
    const itemPadding = isMobile ? '6px 5px' : '6px';
    const itemGap = isMobile ? '5px' : '8px';
    // CSS min() ensures panel never overflows on small screens
    const expandedWidth = isMobile ? 'min(165px, 44vw)' : '190px';

    return (
      <div
        className="legend-section boundaries-section"
        style={{
          position: 'absolute',
          top: topPosition,
          right: rightPosition,
          background: 'white',
          borderRadius: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
          zIndex: 900,
          width: isCollapsed ? 'auto' : expandedWidth,
          maxWidth: isMobile ? '46vw' : 'none',
          transition: 'width 0.25s ease',
          overflow: 'hidden',
        }}
      >
        {/* Toggle button */}
        <div
          className="section-title"
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{
            fontWeight: '700',
            fontSize: fontSize,
            color: '#333',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            userSelect: 'none',
            gap: '4px',
            padding: isMobile ? '8px 10px' : '10px 12px',
            minHeight: isMobile ? '38px' : '36px',
            whiteSpace: 'nowrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <i className="fas fa-map-marked-alt" style={{ fontSize: fontSize, color: '#E74C3C', flexShrink: 0 }}></i>
            {!isCollapsed && <span style={{ fontSize: fontSize }}>Limites</span>}
          </div>
          <i className={`fas fa-chevron-${isCollapsed ? 'down' : 'up'}`} style={{ fontSize: '9px', color: '#7f8c8d', flexShrink: 0 }}></i>
        </div>

        {/* Expanded content */}
        {!isCollapsed && (
          <div style={{ padding: isMobile ? '0 8px 8px' : '0 12px 12px' }}>
            {!boundariesManager && (
              <div style={{ padding: '8px 0', textAlign: 'center', fontSize: '10px', color: '#7f8c8d' }}>
                <i className="fas fa-spinner fa-spin" style={{ marginRight: '4px' }}></i>
                Chargement...
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: itemGap, opacity: boundariesManager ? 1 : 0.6 }}>

              {/* Régions */}
              <div style={{ padding: itemPadding, background: '#f8f9fa', borderRadius: '6px', borderLeft: '3px solid #E74C3C' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', cursor: boundariesManager ? 'pointer' : 'not-allowed', userSelect: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input type="checkbox" checked={boundariesEnabled.region} onChange={(e) => { if (!boundariesManager) return; const v = e.target.checked; setBoundariesEnabled(p => ({ ...p, region: v })); boundariesManager.toggleLevel('region', v); }} disabled={!boundariesManager} style={{ width: checkboxSize, height: checkboxSize, cursor: boundariesManager ? 'pointer' : 'not-allowed', flexShrink: 0 }} />
                    <span style={{ color: '#E74C3C', fontWeight: '700', fontSize: fontSize }}>Régions</span>
                  </div>
                  <div style={{ width: '100%', height: '3px', borderRadius: '2px', background: 'repeating-linear-gradient(to right,#E74C3C 0,#E74C3C 6px,transparent 6px,transparent 10px)', border: '1px solid #E74C3C' }}></div>
                </label>
              </div>

              {/* Préfectures */}
              <div style={{ padding: itemPadding, background: '#f8f9fa', borderRadius: '6px', borderLeft: '3px solid #3498DB' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', cursor: boundariesManager ? 'pointer' : 'not-allowed', userSelect: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input type="checkbox" checked={boundariesEnabled.prefecture} onChange={(e) => { if (!boundariesManager) return; const v = e.target.checked; setBoundariesEnabled(p => ({ ...p, prefecture: v })); boundariesManager.toggleLevel('prefecture', v); }} disabled={!boundariesManager} style={{ width: checkboxSize, height: checkboxSize, cursor: boundariesManager ? 'pointer' : 'not-allowed', flexShrink: 0 }} />
                    <span style={{ color: '#3498DB', fontWeight: '700', fontSize: fontSize }}>Préf.</span>
                  </div>
                  <div style={{ width: '100%', height: '2px', borderRadius: '1px', backgroundColor: '#3498DB' }}></div>
                </label>
              </div>

              {/* Communes */}
              <div style={{ padding: itemPadding, background: '#f8f9fa', borderRadius: '6px', borderLeft: '3px solid #2ECC71' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', cursor: boundariesManager ? 'pointer' : 'not-allowed', userSelect: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input type="checkbox" checked={boundariesEnabled.commune} onChange={(e) => { if (!boundariesManager) return; const v = e.target.checked; setBoundariesEnabled(p => ({ ...p, commune: v })); boundariesManager.toggleLevel('commune', v); }} disabled={!boundariesManager} style={{ width: checkboxSize, height: checkboxSize, cursor: boundariesManager ? 'pointer' : 'not-allowed', flexShrink: 0 }} />
                    <span style={{ color: '#2ECC71', fontWeight: '700', fontSize: fontSize }}>Communes</span>
                  </div>
                  <div style={{ width: '100%', height: '2px', borderRadius: '1px', backgroundColor: '#2ECC71' }}></div>
                </label>
              </div>

            </div>
          </div>
        )}
      </div>
    );
  };

  const CartographicElements = () => (
    <div className="cartographic-elements">
      <div className="north-arrow"><div className="north-arrow-icon"><i className="fas fa-arrow-up"></i></div><div className="north-label">N</div></div>
      <div className="map-info-box">
        <div className="info-row"><i className="fas fa-map-marker-alt"></i><span>Guinée</span></div>
        <div className="info-row"><i className="fas fa-globe"></i><span>WGS 84 / EPSG:4326</span></div>
        <div className="info-row"><i className="fas fa-calendar"></i><span>{new Date().toLocaleDateString("fr-FR")}</span></div>
      </div>
    </div>
  );

  const mapHeaderHeight = isMobile ? 42 : 50;

  return (
    <div style={{ height: "100%", position: "relative" }}>
      <div className={`map-header${isMobile ? " map-header-mobile" : ""}`}>
        {!isMobile && <div className="map-title"><i className="fas fa-map"></i>Carte des Infrastructures</div>}
        <div className="map-stats">
          <div className="stat-item"><div className="stat-number" id="totalVisible">0</div><div className="stat-label">{isMobile ? "Aff." : "Affichés"}</div></div>
          <div className="stat-item"><div className="stat-number" id="activeFilters">0</div><div className="stat-label">{isMobile ? "Filtres" : "Filtres actifs"}</div></div>
          {canExport() && (
            <div className="export-button-container">
              <button className="export-button" onClick={() => exportMap("png")} disabled={isExporting} title="Exporter la carte en PNG">{isExporting ? <><i className="fas fa-spinner fa-spin"></i><span>Export...</span></> : <><i className="fas fa-download"></i><span>PNG</span></>}</button>
              <button className="export-button export-button-pdf" onClick={() => exportMap("pdf")} disabled={isExporting} title="Exporter la carte en PDF">{isExporting ? <><i className="fas fa-spinner fa-spin"></i><span>Export...</span></> : <><i className="fas fa-file-pdf"></i><span>PDF</span></>}</button>

              {/* ✅ NEW EXPORT ZONE BUTTON */}
              {currentBufferGeoJSON && (
                <button
                  className="export-button"
                  onClick={handleExportZone}
                  disabled={isExporting}
                  title="Exporter les données de la zone tampon"
                  style={{ background: 'linear-gradient(135deg, #27ae60 0%, #2ecc71 100%)', boxShadow: '0 2px 8px rgba(46, 204, 113, 0.3)' }}
                >
                  {isExporting ? <><i className="fas fa-spinner fa-spin"></i><span>Export...</span></> : <><i className="fas fa-file-export"></i><span>Export Zone</span></>}
                </button>
              )}

            </div>
          )}
        </div>
      </div>

      {isInitialLoading && (<div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "rgba(255,255,255,0.9)", padding: "20px", borderRadius: "10px", zIndex: 1000, textAlign: "center" }}><div>Chargement des données...</div><div style={{ fontSize: "12px", marginTop: "10px", color: "#666" }}>{localDataCache ? "Données en cache" : ""}</div></div>)}
      <div ref={mapRef} id="map" style={{ height: `calc(100% - ${mapHeaderHeight}px)` }}></div>
      {isMapReady && <MapLegend />}
      {isMapReady && <CartographicElements />}
      {isMapReady && <BoundariesLegendControls />}
    </div>
  );
};

export default MapContainer;