import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './GeographicFilter.css';
import api from './api';

/**
 * MultiSelectDropdown Component
 * A premium multi-selection dropdown with search and tags
 */
const MultiSelectDropdown = ({
  label,
  options,
  selectedIds,
  onChange,
  disabled,
  placeholder,
  loading = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [tempSelectedIds, setTempSelectedIds] = useState([]);
  const dropdownRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, openUp: false });
  const contentRef = useRef(null);

  // Sync temp selection when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTempSelectedIds([...selectedIds]);
    }
  }, [isOpen, selectedIds]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      const isTriggerClick = dropdownRef.current && dropdownRef.current.contains(event.target);
      const isPortalClick = contentRef.current && contentRef.current.contains(event.target);

      if (!isTriggerClick && !isPortalClick) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Update position for the Portal
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const updatePosition = () => {
        if (dropdownRef.current) {
          const rect = dropdownRef.current.getBoundingClientRect();
          const dropdownHeight = 320; // Approximate: search + options + footer
          const spaceBelow = window.innerHeight - rect.bottom;
          const spaceAbove = rect.top;
          const openUp = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

          setCoords({
            top: openUp ? rect.top - 8 : rect.bottom + 8,
            left: rect.left,
            width: rect.width,
            openUp
          });
        }
      };
      updatePosition();

      // Listen to all scrolls to follow the trigger
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);

      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen]);

  const filteredOptions = options.filter(opt =>
    opt.nom.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleOption = (id) => {
    const newSelected = tempSelectedIds.includes(id)
      ? tempSelectedIds.filter(item => item !== id)
      : [...tempSelectedIds, id];
    setTempSelectedIds(newSelected);
  };

  const handleApply = () => {
    onChange(tempSelectedIds);
    setIsOpen(false);
  };

  const clearAll = () => {
    setTempSelectedIds([]);
  };

  const getTriggerContent = () => {
    if (loading) return <div className="trigger-placeholder">Chargement...</div>;
    if (selectedIds.length === 0) return <div className="trigger-placeholder">{placeholder}</div>;

    const selectedOptions = options.filter(opt => selectedIds.includes(opt.id));

    // Show up to 2 chips in the trigger for preview
    const limit = 2;
    const itemsToShow = selectedOptions.slice(0, limit);
    const extra = selectedOptions.length - limit;

    return (
      <div className="trigger-values">
        {itemsToShow.map(opt => (
          <span key={opt.id} className="selection-chip">
            {opt.nom}
            <i
              className="fas fa-times chip-remove"
              onClick={(e) => {
                e.stopPropagation();
                // For the trigger chips, we apply immediately!
                onChange(selectedIds.filter(id => id !== opt.id));
              }}
            ></i>
          </span>
        ))}
        {extra > 0 && <span className="count-badge">+{extra} more</span>}
      </div>
    );
  };

  return (
    <div className="multi-select-container" ref={dropdownRef}>
      <div
        className={`multi-select-trigger ${isOpen ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        {getTriggerContent()}
        <i className={`fas fa-chevron-${isOpen ? 'up' : 'down'}`} style={{ fontSize: '12px', color: '#94a3b8' }}></i>
      </div>

      {isOpen && document.body && createPortal(
        <div
          className="multi-select-dropdown portal-dropdown"
          ref={contentRef}
          style={{
            position: 'fixed',
            ...(coords.openUp
              ? { bottom: `${window.innerHeight - coords.top}px` }
              : { top: `${coords.top}px` }
            ),
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            maxHeight: `${coords.openUp ? coords.top - 16 : window.innerHeight - coords.top - 16}px`,
            zIndex: 999999,
            margin: 0,
            pointerEvents: 'auto'
          }}
        >
          <div className="dropdown-search">
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>

          <div className="dropdown-options">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(option => (
                <div
                  key={option.id}
                  className={`option-item ${tempSelectedIds.includes(option.id) ? 'selected' : ''}`}
                  onClick={() => toggleOption(option.id)}
                >
                  <div className="option-checkbox">
                    <i className="fas fa-check"></i>
                  </div>
                  <span className="option-label">{option.nom}</span>
                </div>
              ))
            ) : (
              <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                Aucun résultat
              </div>
            )}
          </div>

          <div className="dropdown-footer">
            <button className="apply-btn" onClick={handleApply}>Appliquer</button>
            <button className="clear-all-btn" onClick={clearAll}>Effacer</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const GeographicFilterWithZoom = ({
  onFiltersChange,
  onZoomToLocation,
  initialFilters = {},
  showLabels = true,
  disabled = false,
  layout = 'vertical'
}) => {
  const [hierarchy, setHierarchy] = useState([]);
  const [loading, setLoading] = useState(true);

  // Now using arrays for multi-selection
  const [filters, setFilters] = useState({
    region_id: Array.isArray(initialFilters.region_id) ? initialFilters.region_id : (initialFilters.region_id ? [initialFilters.region_id] : []),
    prefecture_id: Array.isArray(initialFilters.prefecture_id) ? initialFilters.prefecture_id : (initialFilters.prefecture_id ? [initialFilters.prefecture_id] : []),
    commune_id: Array.isArray(initialFilters.commune_id) ? initialFilters.commune_id : (initialFilters.commune_id ? [initialFilters.commune_id] : [])
  });

  const [availablePrefectures, setAvailablePrefectures] = useState([]);
  const [availableCommunes, setAvailableCommunes] = useState([]);

  const isLoadingRef = useRef(false);
  const hasLoadedRef = useRef(false);
  // Synchroniser l'affichage quand les filtres changent depuis l'extérieur (carte ↔ suivi)
  useEffect(() => {
    const handler = (e) => {
      const { region_id, prefecture_id, commune_id } = e.detail || {};
      const incoming = {
        region_id: Array.isArray(region_id) ? region_id : (region_id ? [region_id] : []),
        prefecture_id: Array.isArray(prefecture_id) ? prefecture_id : (prefecture_id ? [prefecture_id] : []),
        commune_id: Array.isArray(commune_id) ? commune_id : (commune_id ? [commune_id] : []),
      };
      // Ne mettre à jour que si les valeurs changent réellement (évite les boucles)
      setFilters(prev =>
        JSON.stringify(prev) === JSON.stringify(incoming) ? prev : incoming
      );
    };
    window.addEventListener('geographicFilterChanged', handler);
    return () => window.removeEventListener('geographicFilterChanged', handler);
  }, []);

  const updateAvailableOptions = React.useCallback(() => {
    if (!hierarchy.length) return;

    // Prefectures: belong to ANY selected region
    let prefs = [];
    if (filters.region_id.length > 0) {
      prefs = hierarchy
        .filter(r => filters.region_id.includes(r.id))
        .flatMap(r => r.prefectures);
    } else {
      prefs = hierarchy.flatMap(r => r.prefectures);
    }
    setAvailablePrefectures(prefs);

    // Communes: belong to ANY selected prefecture
    let comms = [];
    if (filters.prefecture_id.length > 0) {
      comms = prefs
        .filter(p => filters.prefecture_id.includes(p.id))
        .flatMap(p => p.communes);
    } else if (filters.region_id.length > 0) {
      comms = prefs.flatMap(p => p.communes);
    } else {
      comms = hierarchy.flatMap(r => r.prefectures.flatMap(p => p.communes));
    }
    setAvailableCommunes(comms);
  }, [hierarchy, filters.region_id, filters.prefecture_id]);

  const loadGeographyHierarchy = React.useCallback(async () => {
    if (isLoadingRef.current || hasLoadedRef.current) return;

    isLoadingRef.current = true;
    setLoading(true);

    try {
      const result = await api.geography.getHierarchy();
      if (result.success) {
        setHierarchy(result.data.hierarchy || []);
        hasLoadedRef.current = true;
      }
    } catch (error) {
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current && !isLoadingRef.current) {
      loadGeographyHierarchy();
    }
  }, [loadGeographyHierarchy]);

  useEffect(() => {
    updateAvailableOptions();
  }, [updateAvailableOptions]);

  useEffect(() => {
    if (onFiltersChange && hasLoadedRef.current) {
      onFiltersChange(filters);
    }
  }, [filters, onFiltersChange]);

  const handleRegionChange = (newIds) => {
    setFilters({
      region_id: newIds,
      prefecture_id: [], // Reset children when parent changes drastically? 
      // Actually, for multiple selection, maybe we should just filter available, 
      // but let's reset to keep it consistent with the user's current flow.
      commune_id: []
    });
  };

  const handlePrefectureChange = (newIds) => {
    setFilters({
      ...filters,
      prefecture_id: newIds,
      commune_id: []
    });
  };

  const handleCommuneChange = (newIds) => {
    setFilters({
      ...filters,
      commune_id: newIds
    });
  };

  const handleReset = () => {
    setFilters({
      region_id: [],
      prefecture_id: [],
      commune_id: []
    });
  };

  if (loading) {
    return <div className="geographic-filter">🌍 Chargement...</div>;
  }

  return (
    <div className={`geographic-filter ${layout}`}>
      <div className="filter-group">
        <div className="filter-label">
          <i className="fas fa-layer-group"></i> Régions
        </div>
        <MultiSelectDropdown
          options={hierarchy}
          selectedIds={filters.region_id}
          onChange={handleRegionChange}
          placeholder="Toutes les régions"
          disabled={disabled}
        />
        {filters.region_id.length > 0 && (
          <div className="selected-tags-container">
            <div className="tag-list">
              {filters.region_id.map(id => {
                const region = hierarchy.find(r => r.id === id);
                return region ? (
                  <span key={id} className="tag">
                    {region.nom}
                    <i className="fas fa-times tag-remove" onClick={() => handleRegionChange(filters.region_id.filter(rid => rid !== id))}></i>
                  </span>
                ) : null;
              })}
            </div>
          </div>
        )}
      </div>

      <div className="filter-group">
        <div className="filter-label">
          <i className="fas fa-map-marked-alt"></i> Préfectures
        </div>
        <MultiSelectDropdown
          options={availablePrefectures}
          selectedIds={filters.prefecture_id}
          onChange={handlePrefectureChange}
          placeholder={filters.region_id.length > 0 ? "Toutes les préfectures" : "Sélectionner une région"}
          disabled={disabled || (filters.region_id.length === 0)}
        />
        {filters.prefecture_id.length > 0 && (
          <div className="selected-tags-container">
            <div className="tag-list">
              {filters.prefecture_id.map(id => {
                const pref = availablePrefectures.find(p => p.id === id);
                return pref ? (
                  <span key={id} className="tag">
                    {pref.nom}
                    <i className="fas fa-times tag-remove" onClick={() => handlePrefectureChange(filters.prefecture_id.filter(pid => pid !== id))}></i>
                  </span>
                ) : null;
              })}
            </div>
          </div>
        )}
      </div>

      <div className="filter-group">
        <div className="filter-label">
          <i className="fas fa-building"></i> Communes
        </div>
        <MultiSelectDropdown
          options={availableCommunes}
          selectedIds={filters.commune_id}
          onChange={handleCommuneChange}
          placeholder={filters.prefecture_id.length > 0 ? "Toutes les communes" : "Sélectionner une zone"}
          disabled={disabled || (filters.prefecture_id.length === 0)}
        />
        {filters.commune_id.length > 0 && (
          <div className="selected-tags-container">
            <div className="tag-list">
              {filters.commune_id.map(id => {
                const comm = availableCommunes.find(c => c.id === id);
                return comm ? (
                  <span key={id} className="tag">
                    {comm.nom}
                    <i className="fas fa-times tag-remove" onClick={() => handleCommuneChange(filters.commune_id.filter(cid => cid !== id))}></i>
                  </span>
                ) : null;
              })}
            </div>
          </div>
        )}
      </div>

      <div className="filter-controls">
        {(filters.region_id.length > 0 || filters.prefecture_id.length > 0 || filters.commune_id.length > 0) && (
          <button type="button" className="reset-btn" onClick={handleReset}>
            <i className="fas fa-undo"></i> Réinitialiser tout
          </button>
        )}
      </div>
    </div>
  );
};

export default GeographicFilterWithZoom;
