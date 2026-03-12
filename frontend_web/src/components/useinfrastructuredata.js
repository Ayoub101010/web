import { useState, useEffect } from 'react';
import dataservice from './dataservice';
import dataprocessor from './dataprocessor';
import hybridCache from './hybridcache';
import { isLoading, lockLoading, unlockLoading, getLoadingPromise, setCachedData, getCachedData, setRawData, getRawData } from './globalloadinglock';
const useInfrastructureData = (filters = {}) => {
  const [pistesCounts, setPistesCounts] = useState({});
  const [globalStats, setGlobalStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const filterStr = JSON.stringify(filters);
  const [error, setError] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function loadEverything() {
      const hasFilters = filters && (filters.region_id || filters.prefecture_id || filters.commune_id || filters.commune_ids);

      // Le lock global n'est utilisé que sans filtres actifs.
      // Avec des filtres, on bypass toujours pour faire un appel API frais.
      if (!hasFilters && isLoading() && getLoadingPromise()) {
        try {
          await getLoadingPromise();
          // Tenter d'abord le cache mémoire (plus fiable pour la synchro immédiate)
          const memCached = getCachedData();

          if (memCached && mounted) {
            setPistesCounts(memCached.pistesCounts);
            setGlobalStats(memCached.globalStats);
            setLoading(false);
            return; // ✅ ON S'ARRÊTE ICI SI ON A TROUVÉ
          }

          // Fallback sur les données brutes en mémoire (si MapContainer a chargé en premier)
          const rawData = getRawData();
          if (rawData) {
            const processed = dataprocessor.processAll(rawData);
            if (processed.success) {
              setCachedData({ pistesCounts: processed.pistesCounts, globalStats: processed.globalStats });
              if (mounted) {
                setPistesCounts(processed.pistesCounts);
                setGlobalStats(processed.globalStats);
                setLoading(false);
              }
            }
            return;
          }

          // Fallback sur le cache disque (survit au refresh)
          const cachedInfra = await hybridCache.getInfrastructureData();
          if (cachedInfra) {
            const processed = dataprocessor.processAll(cachedInfra);
            if (processed.success && mounted) {
              setCachedData({ pistesCounts: processed.pistesCounts, globalStats: processed.globalStats });
              setPistesCounts(processed.pistesCounts);
              setGlobalStats(processed.globalStats);
              setLoading(false);
              return;
            }
          }

          // Si on arrive ici, pas de cache -> On continue l'exécution vers l'API !
        } catch (err) {
        }
        // NE PAS faire setLoading(false) ni return ici si on n'a pas trouvé de données !
      }

      // ✅ CRÉER LA PROMISE IMMÉDIATEMENT
      const loadPromise = (async () => {
        try {
          // 1. Gestion du Cache
          // On n'utilise le cache global que si aucun filtre spécifique n'est actif

          if (!hasFilters) {
            const cachedInfra = await hybridCache.getInfrastructureData();
            if (cachedInfra) {
              const processed = dataprocessor.processAll(cachedInfra);
              if (processed.success && mounted) {
                setCachedData({ pistesCounts: processed.pistesCounts, globalStats: processed.globalStats });
                setPistesCounts(processed.pistesCounts);
                setGlobalStats(processed.globalStats);
                setLoading(false);
                return;
              }
            }
          }

          // 2. Charger depuis API avec filtres SERVEUR
          if (mounted) {
            setLoadingProgress(10);
          }

          const result = await dataservice.loadAllInfrastructures(filters);

          // Ne PAS vérifier mounted ici — on doit toujours sauvegarder le cache
          // même si ce composant s'est démonté (le cache est partagé entre tous les composants)

          if (result.success && result.data) {
            // Sauvegarder les données brutes pour la carte + DataTracking + refresh
            setRawData(result.data);
            if (!hasFilters) {
              hybridCache.saveInfrastructureData(result.data);
            }
            const processed = dataprocessor.processAll(result.data);

            if (processed.success) {
              // ✅ TOUJOURS sauvegarder en cache mémoire (partagé) — indépendant de mounted
              if (!hasFilters) {
                setCachedData({
                  pistesCounts: processed.pistesCounts,
                  globalStats: processed.globalStats
                });
              }

              // Mettre à jour l'état du composant seulement s'il est encore monté
              if (mounted) {
                setPistesCounts(processed.pistesCounts);
                setGlobalStats(processed.globalStats);
                setLoadingProgress(100);
              }
            } else {
              throw new Error(processed.error || 'Erreur traitement');
            }
          } else {
            throw new Error(result.error || 'Aucune donnée');
          }
        } catch (err) {
          if (mounted) {
            setError(err.message);
          }
          throw err;
        } finally {
          unlockLoading();
          if (mounted) {
            setLoading(false);
          }
        }
      })();

      lockLoading(loadPromise, 'Dashboard');
      await loadPromise;
    }

    loadEverything();

    return () => {
      mounted = false;
    };
  }, [filterStr]); // filterStr suffit — user retiré (login/logout = remontage complet)

  const reloadData = async () => {
    setLoading(true);
    setError(null);

    try {
      await hybridCache.clearAll();
      // Le reload forcé utilisera les filtres actuels via le useEffect (grâce au clearAll qui va invalider le cache)
      // Mais pour forcer l'exécution immédiate:
      const result = await dataservice.loadAllInfrastructures(filters);

      if (result.success && result.data) {
        const processed = dataprocessor.processAll(result.data);
        if (processed.success) {
          setPistesCounts(processed.pistesCounts);
          setGlobalStats(processed.globalStats);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return {
    pistesCounts,
    globalStats,
    loading,
    error,
    reloadData,
    loadingProgress
  };
};

export default useInfrastructureData;