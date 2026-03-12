
import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./components/AuthContext";

import LoginPage from "./components/LoginPage";
import SuperAdminPage from "./components/SuperAdminPage";
import UserPage from "./components/UserPage";
import Dashboard from "./components/DashBoard";
import AdminPage from "./components/AdminPage";

import "leaflet/dist/leaflet.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "./components/responsive-global.css";

// Protection des routes
const ProtectedRoute = ({ children, requiredRole = null, allowedRoles = [], requiredInterface = null }) => {
  const { isAuthenticated, user, loading, hasInterfaceAccess } = useAuth();

  if (loading) {
    return <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh'
    }}>Chargement...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Check interface access if required
  if (requiredInterface && !hasInterfaceAccess(requiredInterface)) {
    // Redirect to a base page they have access to or back to login
    if (user?.role === 'Super_admin' || user?.role === 'Admin') {
      return children; // Admins have access to everything
    }
    return <Navigate to="/" replace />;
  }

  // Check role if required
  if (requiredRole && user?.role !== requiredRole) {
    // Super_admin can access Admin pages
    if (requiredRole === 'Admin' && user?.role === 'Super_admin') {
      return children;
    }

    // Redirection based on role
    if (user?.role === 'Super_admin') return <Navigate to="/superadmin" replace />;
    if (user?.role === 'Admin') return <Navigate to="/admin" replace />;
    if (user?.role === 'BTGR' || user?.role === 'SPGR') return <Navigate to="/manager" replace />;
    return <Navigate to="/" replace />;
  }

  // Check if role is in allowed list
  if (allowedRoles.length > 0 && !allowedRoles.includes(user?.role)) {
    // Admins are usually allowed on all dashboard-like pages
    if (user?.role === 'Super_admin' || user?.role === 'Admin') {
      return children;
    }
    return <Navigate to="/" replace />;
  }

  return children;
};

// Routes
function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/user" element={<UserPage />} />

      <Route
        path="/superadmin"
        element={
          <ProtectedRoute allowedRoles={["Super_admin"]}>
            <SuperAdminPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["Super_admin", "Admin"]}>
            <AdminPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/manager"
        element={
          <ProtectedRoute allowedRoles={["BTGR", "SPGR"]}>
            <AdminPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute allowedRoles={["Super_admin", "Admin", "BTGR", "SPGR"]} requiredInterface="tableau_bord">
            <Dashboard />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}

export default App;