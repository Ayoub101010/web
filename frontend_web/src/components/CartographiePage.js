// CartographiePage.js
// Vue "Cartographie" — affiche les filtres sélectionnés et 2 boutons de génération de cartes
import React, { useState, useEffect, useCallback } from "react";
import GeographicFilter from "./GeographicFilterWithZoom";
import { generateCarte1, generateCarte2 } from "./CartographieGenerator";
import "./CartographiePage.css";

const CartographiePage = ({ filters: parentFilters }) => {
  // ── État local des filtres géographiques ──
  const [localFilters, setLocalFilters] = useState({
    region_id: parentFilters?.region_id || [],
    prefecture_id: parentFilters?.prefecture_id || [],
    commune_id: parentFilters?.commune_id || [],
  });

  // ── Noms résolus pour l'affichage ──
  const [resolvedNames, setResolvedNames] = useState({
    regions: [],
    prefectures: [],
    communes: [],
  });

  // ── Hiérarchie géographique ──
  const [hierarchy, setHierarchy] = useState([]);

  // ── État de génération ──
  const [generating, setGenerating] = useState(null); // 'carte1' | 'carte2' | null
  const [progressMsg, setProgressMsg] = useState(null);

  // Charger la hiérarchie pour résoudre les noms
  useEffect(() => {
    const loadHierarchy = async () => {
      try {
        const resp = await fetch("/api/geography/hierarchy/");
        const result = await resp.json();
        const data = result?.hierarchy || [];
        setHierarchy(data);
      } catch (e) {
        console.error("Erreur chargement hiérarchie:", e);
      }
    };
    loadHierarchy();
  }, []);

  // Synchroniser les filtres parents quand ils changent
  useEffect(() => {
    if (parentFilters) {
      const toArray = (val) => {
        if (!val) return [];
        return Array.isArray(val) ? val : [val];
      };
      setLocalFilters({
        region_id: toArray(parentFilters.region_id),
        prefecture_id: toArray(parentFilters.prefecture_id),
        commune_id: toArray(parentFilters.commune_id),
      });
    }
  }, [parentFilters]);

  // Résoudre les noms à partir des IDs
  useEffect(() => {
    if (!hierarchy.length) return;

    const regionNames = [];
    const prefectureNames = [];
    const communeNames = [];

    hierarchy.forEach((region) => {
      if (localFilters.region_id.includes(region.id)) {
        regionNames.push(region.nom);
      }
      (region.prefectures || []).forEach((pref) => {
        if (localFilters.prefecture_id.includes(pref.id)) {
          prefectureNames.push(pref.nom);
        }
        (pref.communes || []).forEach((comm) => {
          if (localFilters.commune_id.includes(comm.id)) {
            communeNames.push(comm.nom);
          }
        });
      });
    });

    setResolvedNames({
      regions: regionNames,
      prefectures: prefectureNames,
      communes: communeNames,
    });
  }, [hierarchy, localFilters]);

  // Gestion du changement de filtre
  const handleFiltersChange = useCallback((geoFilters) => {
    setLocalFilters({
      region_id: geoFilters.region_id || [],
      prefecture_id: geoFilters.prefecture_id || [],
      commune_id: geoFilters.commune_id || [],
    });
  }, []);

  // Vérifier si un filtre est sélectionné (au minimum une préfecture)
  const hasValidSelection = localFilters.prefecture_id.length > 0;

  // Génération de la Carte 1 : Pistes et ouvrages réalisés
  const handleGenerateCarte1 = async () => {
    if (!hasValidSelection) return;
    setGenerating("carte1");
    setProgressMsg("Démarrage de la génération...");
    try {
      await generateCarte1(localFilters, resolvedNames, (msg) =>
        setProgressMsg(msg),
      );
    } catch (e) {
      console.error("Erreur génération Carte 1:", e);
      alert("Erreur lors de la génération de la carte : " + e.message);
    } finally {
      setGenerating(null);
      setProgressMsg(null);
    }
  };

  // Génération de la Carte 2 : Zones de production
  const handleGenerateCarte2 = async () => {
    if (!hasValidSelection) return;
    setGenerating("carte2");
    setProgressMsg("Démarrage de la génération...");
    try {
      await generateCarte2(localFilters, resolvedNames, (msg) =>
        setProgressMsg(msg),
      );
    } catch (e) {
      console.error("Erreur génération Carte 2:", e);
      alert("Erreur lors de la génération de la carte : " + e.message);
    } finally {
      setGenerating(null);
      setProgressMsg(null);
    }
  };

  return (
    <div className="cartographie-page">
      {/* ── En-tête ── */}
      <div className="carto-header">
        <div className="carto-header-icon">
          <i className="fas fa-map-marked-alt"></i>
        </div>
        <div className="carto-header-text">
          <h1>Cartographie thématique</h1>
          <p>
            Générez des cartes thématiques au format PDF pour l'impression et
            les rapports officiels du projet PPR.
          </p>
        </div>
      </div>

      {/* ── Contenu principal ── */}
      <div className="carto-content">
        {/* ── Panneau de filtrage ── */}
        <div className="carto-filters-panel">
          <div className="carto-panel-title">
            <i className="fas fa-filter"></i>
            <span>Zone géographique</span>
          </div>
          <p className="carto-panel-desc">
            Sélectionnez au minimum une <strong>préfecture</strong> pour générer
            les cartes thématiques.
          </p>

          <div className="carto-geo-filter">
            <GeographicFilter
              onFiltersChange={handleFiltersChange}
              initialFilters={localFilters}
              showLabels={true}
            />
          </div>

          {/* ── Résumé des filtres sélectionnés ── */}
          {hasValidSelection && (
            <div className="carto-filter-summary">
              <div className="carto-summary-title">
                <i className="fas fa-check-circle"></i> Sélection active
              </div>
              {resolvedNames.regions.length > 0 && (
                <div className="carto-summary-item">
                  <span className="carto-summary-label">Régions :</span>
                  <span className="carto-summary-value">
                    {resolvedNames.regions.join(", ")}
                  </span>
                </div>
              )}
              {resolvedNames.prefectures.length > 0 && (
                <div className="carto-summary-item">
                  <span className="carto-summary-label">Préfectures :</span>
                  <span className="carto-summary-value">
                    {resolvedNames.prefectures.join(", ")}
                  </span>
                </div>
              )}
              {resolvedNames.communes.length > 0 && (
                <div className="carto-summary-item">
                  <span className="carto-summary-label">Communes :</span>
                  <span className="carto-summary-value">
                    {resolvedNames.communes.join(", ")}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Panneau des cartes ── */}
        <div className="carto-maps-panel">
          <div className="carto-panel-title">
            <i className="fas fa-layer-group"></i>
            <span>Cartes disponibles</span>
          </div>

          {!hasValidSelection && (
            <div className="carto-empty-state">
              <i className="fas fa-hand-point-left"></i>
              <p>
                Veuillez sélectionner au minimum une <strong>préfecture</strong>{" "}
                dans le panneau de gauche pour accéder aux cartes thématiques.
              </p>
            </div>
          )}

          {hasValidSelection && (
            <div className="carto-cards">
              {/* ── Carte 1 : Pistes et ouvrages réalisés ── */}
              <div className="carto-card carto-card-pistes">
                <div className="carto-card-icon">
                  <i className="fas fa-road"></i>
                </div>
                <div className="carto-card-content">
                  <h3>Carte 1 — Pistes et ouvrages réalisés</h3>
                  <p className="carto-card-full-title">
                    Cartographie des pistes et ouvrages réalisés dans le cadre
                    du projet PPR
                  </p>
                  <ul className="carto-card-layers">
                    <li>
                      <i className="fas fa-draw-polygon"></i> Découpage
                      administratif (préfecture, communes)
                    </li>
                    <li>
                      <i className="fas fa-home"></i> Localités avec étiquettes
                    </li>
                    <li>
                      <i className="fas fa-road"></i> Pistes avec numéro de
                      piste
                    </li>
                    <li>
                      <i className="fas fa-bridge"></i> Ouvrages (ponts, dalots,
                      buses, bacs)
                    </li>
                    <li>
                      <i className="fas fa-table"></i> Tableau récapitulatif des
                      pistes
                    </li>
                  </ul>
                </div>
                <button
                  className="carto-card-btn carto-btn-pistes"
                  onClick={handleGenerateCarte1}
                  disabled={generating !== null}
                >
                  {generating === "carte1" ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i> Génération en
                      cours...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-file-pdf"></i> Générer la carte
                    </>
                  )}
                </button>
              </div>

              {/* ── Carte 2 : Zones de production ── */}
              <div className="carto-card carto-card-zones">
                <div className="carto-card-icon">
                  <i className="fas fa-seedling"></i>
                </div>
                <div className="carto-card-content">
                  <h3>Carte 2 — Zones de production désenclavées</h3>
                  <p className="carto-card-full-title">
                    Cartographie des zones de production agricole et halieutique
                    désenclavées
                  </p>
                  <ul className="carto-card-layers">
                    <li>
                      <i className="fas fa-draw-polygon"></i> Découpage
                      administratif (préfecture, communes)
                    </li>
                    <li>
                      <i className="fas fa-home"></i> Localités avec étiquettes
                    </li>
                    <li>
                      <i className="fas fa-road"></i> Pistes avec numéro de
                      piste
                    </li>
                    <li>
                      <i className="fas fa-water"></i> Zones et sites de plaines
                    </li>
                  </ul>
                </div>
                <button
                  className="carto-card-btn carto-btn-zones"
                  onClick={handleGenerateCarte2}
                  disabled={generating !== null}
                >
                  {generating === "carte2" ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i> Génération en
                      cours...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-file-pdf"></i> Générer la carte
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Overlay de progression ── */}
      {generating && progressMsg && (
        <div className="carto-progress-overlay">
          <div className="carto-progress-box">
            <div className="carto-progress-spinner"></div>
            <p>{progressMsg}</p>
          </div>
        </div>
      )}

      {/* ── Pied de page info ── */}
      <div className="carto-footer">
        <div className="carto-footer-item">
          <i className="fas fa-info-circle"></i>
          <span>
            Les cartes générées incluent : logo de la Guinée, titres officiels,
            légende, plan de situation, tableau des pistes et éléments
            cartographiques (échelle, flèche nord, graticule).
          </span>
        </div>
      </div>
    </div>
  );
};

export default CartographiePage;
