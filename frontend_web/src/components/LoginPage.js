// src/components/LoginPage.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

import "./LoginPage.css";
import backgroundLogo from "../assets/guinea_background.png";
import ndgrLogo from "../assets/NDGR_Logo.png";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  //  États pour gérer le formulaire
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePublicAccess = () => {
    navigate("/user"); // Accès public vers UserPage
  };

  useEffect(() => {
    document.body.style.backgroundColor = "#ffffff";
    // Allow scrolling on login page (index.js sets #root overflow: hidden)
    const root = document.getElementById("root");
    if (root) {
      root.style.overflow = "auto";
    }
    return () => {
      if (root) {
        root.style.overflow = "hidden";
      }
    };
  }, []);

  // MODIFICATION: Remplacer votre handleLogin existant par celui-ci
  const handleLogin = async () => {
    setError("");

    if (!email || !password) {
      setError("Veuillez remplir tous les champs.");
      return;
    }

    setLoading(true);

    try {
      const result = await login(email, password);

      if (result.success) {
        // MODIFICATION : Redirection selon le rôle
        if (result.user.role === 'Super_admin') {
          navigate("/superadmin");
        } else if (result.user.role === 'Admin') {
          navigate("/admin");
        } else if (['BTGR', 'SPGR'].includes(result.user.role)) {
          navigate("/manager");
        } else {
          setError(`Accès restreint pour le rôle ${result.user.role}.`);
        }
      } else {
        setError(result.error || "Identifiants incorrects");
      }
    } catch (err) {
      setError("Erreur de connexion. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  };

  // AJOUT: Gestion de la touche Entrée
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    <>
      <div className="loginpage-wrapper">
        <div className="background-image-right">
          <img src={backgroundLogo} alt="Guinée Background" />
        </div>

        <div className="container">
          <div className="left-panel">
            <h1 className="geodngr-text">GeoDNGR</h1>
            <p>Plateforme de Suivi & Évaluation</p>
            <button onClick={handlePublicAccess}>
              Accéder à la plateforme publique
            </button>
          </div>

          <div className="right-panel">
            <img src={ndgrLogo} alt="Logo NDGR" className="logo" />
            <div className="form-group">
              {/* MODIFICATION: Remplacer vos inputs existants */}
              <input
                id="username"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={loading}
              />
              <input
                id="password"
                type="password"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={loading}
              />

              {/* AJOUT: Affichage des erreurs */}
              {error && (
                <div style={{
                  color: '#ff4444',
                  fontSize: '14px',
                  marginTop: '10px',
                  textAlign: 'center'
                }}>
                  {error}
                </div>
              )}

              {/* MODIFICATION: Bouton avec état de chargement */}
              <button
                className="login-btn"
                onClick={handleLogin}
                disabled={loading}
              >
                {loading ? "Connexion..." : "Se connecter"}
              </button>

              <div className="small-text">
                "Connexion réservée aux DNGR"
              </div>
              <div
                className="forgot"
                onClick={() => alert("Contactez l'administrateur pour réinitialiser votre mot de passe")}
              >
                Mot de passe oublié
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}