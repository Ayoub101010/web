import React from "react";
import "./SuperAdminPage.css"; // Pour réutiliser le style existant

const AddUserModal = ({ onClose, onSubmit, formData, setFormData }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Ajouter un nouvel utilisateur</h2>
        <form
          className="modal-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <div className="form-group">
            <label className="modal-label">Nom</label>
            <input
              type="text"
              className="modal-input"
              value={formData.nom}
              onChange={(e) =>
                setFormData({ ...formData, nom: e.target.value })
              }
              required
            />
          </div>
          <div className="form-group">
            <label className="modal-label">Prénom</label>
            <input
              type="text"
              className="modal-input"
              value={formData.prenom}
              onChange={(e) =>
                setFormData({ ...formData, prenom: e.target.value })
              }
              required
            />
          </div>
          <div className="form-group">
            <label className="modal-label">Email</label>
            <input
              type="email"
              className="modal-input"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              required
            />
          </div>
          <div className="form-group">
            <label className="modal-label">Mot de passe</label>
            <input
              type="password"
              className="modal-input"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              required
            />
          </div>

          <div className="modal-buttons">
            <button type="submit">Ajouter</button>
            <button type="button" onClick={onClose}>
              Annuler
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddUserModal;
