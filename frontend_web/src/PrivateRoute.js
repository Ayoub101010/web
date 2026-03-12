
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

const PrivateRoute = ({ children, requiredRole = null }) => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontSize: '18px'
      }}>
        Chargement...
      </div>
    );
  }

  // Si pas authentifié, rediriger vers login
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Si un rôle spécifique est requis
  if (requiredRole && user?.role !== requiredRole) {
    // Si admin essaie d'accéder à une page super_admin
    if (requiredRole === 'super_admin' && user?.role === 'admin') {
      return <Navigate to="/admin" replace />;
    }
    // Sinon rediriger vers login
    return <Navigate to="/" replace />;
  }

  // Si admin ou super_admin, autoriser l'accès
  if (user?.role === 'admin' || user?.role === 'super_admin') {
    return children;
  }

  // Pour tout autre cas, rediriger vers login
  return <Navigate to="/" replace />;
};

export default PrivateRoute;