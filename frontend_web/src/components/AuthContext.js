
import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import authService from './authService';

import hybridCache from './hybridcache';
import { clearCachedData } from './globalloadinglock';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState(null);

  const handleLogout = useCallback(() => {
    // 1. Déconnexion service
    authService.logout();

    // 2. Nettoyage TOTAL des caches pour éviter les fuites de données entre sessions
    clearCachedData(); // Cache mémoire
    hybridCache.clearAll(); // Cache disque

    // 3. Reset state
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const isAuth = authService.isAuthenticated();

      if (isAuth) {
        const currentUser = authService.getCurrentUser();

        if (currentUser) {
          setUser(currentUser);
          setIsAuthenticated(true);
          authService.startTokenRefresh();
        } else {
          handleLogout();
        }
      } else {
        // Token expiré — essayer de le rafraîchir avant de déconnecter
        const refreshed = await authService.refreshAccessToken();
        if (refreshed) {
          const currentUser = authService.getCurrentUser();
          if (currentUser) {
            setUser(currentUser);
            setIsAuthenticated(true);
            authService.startTokenRefresh();
          } else {
            handleLogout();
          }
        } else {
          handleLogout();
        }
      }
    } catch (error) {
      handleLogout();
    } finally {
      setLoading(false);
    }
  }, [handleLogout]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email, password) => {
    // ⚠️ Nettoyage PRÉVENTIF des caches avant toute tentative de connexion
    // Cela garantit qu'on ne mixe pas les données d'une session précédente
    clearCachedData();
    try {
      await hybridCache.clearAll();
    } catch (e) {
    }

    setLoading(true);
    setError(null);

    try {
      const result = await authService.login(email, password);

      if (result.success) {
        setUser(result.user);
        setIsAuthenticated(true);
        setError(null);
      } else {
        setError(result.error);
      }

      return result;
    } catch (error) {
      const errorMsg = 'Erreur de connexion au serveur';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    handleLogout();
  };

  const refreshUser = async () => {
    const updatedUser = authService.getCurrentUser();
    if (updatedUser) {
      setUser({ ...updatedUser });
    }
  };

  const hasRole = (role) => {
    if (!user) return false;
    return user.role === role;
  };

  const hasAnyRole = (roles) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  const value = {
    user,
    isAuthenticated,
    loading,
    error,
    login,
    logout,
    refreshUser,
    checkAuth,
    hasRole,
    hasAnyRole,
    isSuperAdmin: () => user?.role === 'Super_admin',
    isAdmin: () => user?.role === 'Admin' || user?.role === 'Super_admin',
    isBTGR: () => user?.role === 'BTGR',
    isSPGR: () => user?.role === 'SPGR',
    hasInterfaceAccess: (interfaceName) => {
      if (!user) return false;
      if (user.role === 'Super_admin' || user.role === 'Admin') return true;
      return user.allowed_interfaces?.includes(interfaceName);
    },
    getUserRole: () => user?.role || null,
    getUserCommune: () => user?.commune || null,
    getUserPrefecture: () => user?.prefecture || null,
    getUserRegion: () => user?.region || null,
    getAssignedRegions: () => user?.assigned_regions || [],
    getAssignedPrefectures: () => user?.assigned_prefectures || [],
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};