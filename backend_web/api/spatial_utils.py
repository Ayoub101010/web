#

from django.contrib.gis.geos import GEOSGeometry # type: ignore
from django.contrib.gis.db.models.functions import Transform # type: ignore
from .models import CommuneRurale, Prefecture, Region

class GeoQueryHelper:
    """Classe utilitaire pour les requêtes géospatiales"""
    
    @staticmethod
    def get_commune_geometry(commune_id):
        """Récupérer la géométrie d'une commune rurale"""
        try:
            commune = CommuneRurale.objects.get(id=commune_id)
            return commune.geom
        except CommuneRurale.DoesNotExist:
            return None
    
    @staticmethod
    def transform_geometry(geom, target_srid=4326):
        """Retourne la géométrie telle quelle, SRID déjà 4326"""
        return geom


class InfrastructureTypeMapper:
    """Classe pour mapper les types d'infrastructures"""
    
    TYPE_ICONS = {
        'services_santes': 'hospital',
        'bacs': 'ship', 
        'ponts': 'bridge',
        'buses': 'bus',
        'dalots': 'water',
        'ecoles': 'graduation-cap',
        'marches': 'shopping-cart',
        'batiments_administratifs': 'building',
        'infrastructures_hydrauliques': 'tint',
        'localites': 'home',
        'passages_submersibles': 'water',
        'autres_infrastructures': 'map-pin',
        'pistes': 'road'
    }
    
    TYPE_COLORS = {
        'services_santes': '#E74C3C',
        'bacs': '#F39C12',
        'ponts': '#9B59B6', 
        'buses': '#E74C3C',
        'dalots': '#3498DB',
        'ecoles': '#27AE60',
        'marches': '#F1C40F',
        'batiments_administratifs': '#34495E',
        'infrastructures_hydrauliques': '#3498DB',
        'localites': '#E67E22',
        'passages_submersibles': '#1ABC9C',
        'autres_infrastructures': '#95A5A6',
        'pistes': '#2C3E50'
    }
    
    @classmethod
    def get_icon(cls, type_name):
        return cls.TYPE_ICONS.get(type_name, 'map-pin')
    
    @classmethod  
    def get_color(cls, type_name):
        return cls.TYPE_COLORS.get(type_name, '#95A5A6')

def validate_coordinates(x, y):
    """Valider des coordonnées géographiques"""
    try:
        x_float = float(x)
        y_float = float(y)
        
        # Vérifier les limites géographiques pour la Guinée
        if not (-16 <= x_float <= -6):
            return False, "Longitude hors limites Guinée"
        if not (6 <= y_float <= 14):
            return False, "Latitude hors limites Guinée"
            
        return True, None
    except (ValueError, TypeError):
        return False, "Coordonnées invalides"