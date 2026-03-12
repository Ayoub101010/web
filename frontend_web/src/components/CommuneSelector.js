import React, { useState, useEffect } from 'react';

const CommuneSelector = ({ selectedCommune, onCommuneSelect }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [communes, setCommunes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedCommuneData, setSelectedCommuneData] = useState(null);

  // Recherche des communes
  const searchCommunes = async (query) => {
    if (!query || query.length < 2) {
      setCommunes([]);
      return;
    }

    setLoading(true);
    try {


      // Utiliser l'API communes_rurales avec filtre q
      const response = await fetch(`/api/communes/search/?q=${encodeURIComponent(query)}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();


      if (data.communes && Array.isArray(data.communes)) {

        setCommunes(data.communes);
      } else {

        setCommunes([]);
      }

    } catch (error) {

      setCommunes([]);
    } finally {
      setLoading(false);
    }
  };

  // Déclencher la recherche avec délai
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchCommunes(searchTerm);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // Mettre à jour quand selectedCommune change depuis le parent
  useEffect(() => {
    if (selectedCommune && communes.length > 0) {
      const commune = communes.find(c => c.id === parseInt(selectedCommune));
      if (commune) {
        setSelectedCommuneData(commune);
        setSearchTerm(commune.nom);
      }
    }
    // Supprimé la partie qui réinitialise searchTerm
  }, [selectedCommune, communes]);

  const handleInputChange = (event) => {
    const value = event.target.value;
    setSearchTerm(value);

    // Reset selection si on modifie
    if (selectedCommuneData && value !== selectedCommuneData.nom) {
      setSelectedCommuneData(null);
      onCommuneSelect('');
    }
  };

  const handleCommuneSelect = (commune) => {

    setSelectedCommuneData(commune);
    setSearchTerm(commune.nom);
    onCommuneSelect(commune.id);
    setCommunes([]); // Fermer la liste

    // Zoom si disponible
    if (window.zoomToCommune) {
      window.zoomToCommune(commune);
    }
  };

  const clearSelection = () => {
    setSelectedCommuneData(null);
    setSearchTerm('');
    setCommunes([]);
    onCommuneSelect('');
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Input de recherche */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Rechercher une commune..."
          value={searchTerm}
          onChange={handleInputChange}
          style={{
            width: '100%',
            padding: '0.7rem',
            paddingRight: selectedCommuneData ? '35px' : '12px',
            border: '1px solid #cbd5e0',
            borderRadius: '6px',
            fontSize: '1rem',
            background: selectedCommuneData ? '#e8f5e8' : 'white'
          }}
          disabled={loading}
        />

        {selectedCommuneData && (
          <button
            onClick={clearSelection}
            style={{
              position: 'absolute',
              right: '8px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#666',
              fontSize: '16px',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Informations commune sélectionnée */}
      {selectedCommuneData && (
        <div style={{
          marginTop: '8px',
          padding: '8px',
          background: '#f0f8f0',
          border: '1px solid #d4edda',
          borderRadius: '4px',
          fontSize: '0.9rem'
        }}>
          <div style={{ fontWeight: '500', color: '#155724' }}>
            📍 {selectedCommuneData.nom}
          </div>
          {selectedCommuneData.prefecture && (
            <div style={{ color: '#6c757d', fontSize: '0.8rem' }}>
              {selectedCommuneData.prefecture} • {selectedCommuneData.region}
            </div>
          )}
        </div>
      )}

      {/* Liste des résultats */}
      {searchTerm && !selectedCommuneData && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: 'white',
          border: '1px solid #ddd',
          borderTop: 'none',
          borderRadius: '0 0 4px 4px',
          maxHeight: '200px',
          overflowY: 'auto',
          zIndex: 1000,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          {loading && (
            <div style={{ padding: '12px', textAlign: 'center', color: '#666' }}>
              Recherche en cours...
            </div>
          )}

          {!loading && communes.length > 0 && communes.map((commune) => (
            <div
              key={commune.id}
              onClick={() => handleCommuneSelect(commune)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                borderBottom: '1px solid #f0f0f0'
              }}
              onMouseEnter={(e) => e.target.style.background = '#f8f9fa'}
              onMouseLeave={(e) => e.target.style.background = 'white'}
            >
              <div style={{ fontWeight: '500' }}>{commune.nom}</div>
              <div style={{ fontSize: '12px', color: '#666' }}>
                {commune.prefecture} • {commune.region}
              </div>
            </div>
          ))}

          {!loading && searchTerm.length >= 2 && communes.length === 0 && (
            <div style={{ padding: '12px', color: '#666', textAlign: 'center' }}>
              Aucune commune trouvée pour "{searchTerm}"
            </div>
          )}
        </div>
      )}

      {/* Statut */}
      <div style={{ fontSize: '11px', marginTop: '4px', color: '#666' }}>
        {loading && 'Recherche...'}
        {!loading && !selectedCommuneData && searchTerm.length > 0 && searchTerm.length < 2 && 'Tapez au moins 2 caractères'}
      </div>

      {/* Input caché pour compatibilité */}
      <input
        type="hidden"
        id="communeFilter"
        value={selectedCommuneData ? selectedCommuneData.id : ''}
        readOnly
      />
    </div>
  );
};

export default CommuneSelector;