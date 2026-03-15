import authService from './authService';

const API_BASE_URL = 'http://localhost:8000/api';

class UserManagementService {

  // Récupérer tous les utilisateurs
  async getUsers(filters = {}) {
    try {
      const params = new URLSearchParams();

      if (filters.role) params.append('role', filters.role);
      if (filters.region_id) params.append('region_id', filters.region_id);
      if (filters.prefecture_id) params.append('prefecture_id', filters.prefecture_id);
      if (filters.commune_id) params.append('commune_id', filters.commune_id);

      const url = `${API_BASE_URL}/users/${params.toString() ? '?' + params.toString() : ''}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeader()
        }
      });

      const data = await response.json();

      if (response.ok) {
        return { success: true, data };
      } else {
        return {
          success: false,
          error: data.error || 'Erreur lors de la récupération des utilisateurs'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: 'Erreur de connexion au serveur'
      };
    }
  }

  // Créer un nouvel utilisateur
  async createUser(userData) {
    try {
      const response = await fetch(`${API_BASE_URL}/users/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeader()
        },
        body: JSON.stringify(userData)
      });

      const data = await response.json();

      if (response.ok) {
        return { success: true, data };
      } else {
        return {
          success: false,
          error: data.error || data.errors || 'Erreur lors de la création de l\'utilisateur'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: 'Erreur de connexion au serveur'
      };
    }
  }

  // Modifier un utilisateur existant
  async updateUser(userId, userData) {
    try {
      const response = await fetch(`${API_BASE_URL}/users/${userId}/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeader()
        },
        body: JSON.stringify(userData)
      });

      const data = await response.json();

      if (response.ok) {
        return { success: true, data };
      } else {
        return {
          success: false,
          error: data.error || data.errors || 'Erreur lors de la modification de l\'utilisateur'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: 'Erreur de connexion au serveur'
      };
    }
  }

  // Supprimer un utilisateur
  async deleteUser(userId) {
    try {
      const response = await fetch(`${API_BASE_URL}/users/${userId}/`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeader()
        }
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, data };
      } else {
        const data = await response.json();
        return {
          success: false,
          error: data.error || 'Erreur lors de la suppression de l\'utilisateur'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: 'Erreur de connexion au serveur'
      };
    }
  }

  // Rechercher des communes
  async searchCommunes(query) {
    try {
      if (!query || query.length < 2) {
        return { success: true, data: { communes: [] } };
      }

      const response = await fetch(`${API_BASE_URL}/communes/search/?q=${encodeURIComponent(query)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeader()
        }
      });

      const data = await response.json();

      if (response.ok) {
        return { success: true, data };
      } else {
        return {
          success: false,
          error: data.error || 'Erreur lors de la recherche de communes'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: 'Erreur de connexion au serveur'
      };
    }
  }
}

const userManagementServiceInstance = new UserManagementService();
export default userManagementServiceInstance;