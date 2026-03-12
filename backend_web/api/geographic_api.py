# api/geographic_api.py
from rest_framework.views import APIView # type: ignore
from rest_framework.response import Response # type: ignore
from rest_framework import status # type: ignore
from django.contrib.gis.geos import Point # type: ignore
from django.contrib.gis.measure import Distance  # type: ignore
from .models import Region, Prefecture, CommuneRurale
from .serializers import RegionSerializer, PrefectureSerializer, CommuneRuraleSerializer
import json 
from .views import get_current_user_from_request

class GeographyHierarchyAPIView(APIView):
    """
    API pour récupérer la hiérarchie géographique complète
    RÉgion > Préfecture > Commune avec données géométriques
    """
    
    def get(self, request):
        try:
            print("🌍 [Geographic API] Chargement hiérarchie complète...")
            user = get_current_user_from_request(request)
            
            # Récupérer toute la hiérarchie avec select_related pour optimiser
            regions = Region.objects.prefetch_related(
                'prefecture_set__communerurale_set'
            ).order_by('nom')

            # 🔥 FILTRAGE RBAC
            if user and not user.is_admin():
                accessible_regions = user.get_accessible_regions()
                regions = regions.filter(id__in=accessible_regions.values_list('id', flat=True))
            
            hierarchy_data = []
            total_prefectures = 0
            total_communes = 0
            
            for region in regions:
                prefectures_data = []
                
                for prefecture in region.prefecture_set.all().order_by('nom'):
                    communes_data = []
                    total_prefectures += 1
                    
                    for commune in prefecture.communerurale_set.all().order_by('nom'):
                        communes_data.append({
                            'id': commune.id,
                            'nom': commune.nom,
                            'bounds': self._get_geometry_bounds(commune.geom) if commune.geom else None,
                            'center': self._get_geometry_center(commune.geom) if commune.geom else None
                        })
                        total_communes += 1
                    
                    prefectures_data.append({
                        'id': prefecture.id,
                        'nom': prefecture.nom,
                        'region_id': region.id,
                        'bounds': self._get_geometry_bounds(prefecture.geom) if prefecture.geom else None,
                        'center': self._get_geometry_center(prefecture.geom) if prefecture.geom else None,
                        'communes': communes_data
                    })
                
                hierarchy_data.append({
                    'id': region.id,
                    'nom': region.nom,
                    'bounds': self._get_geometry_bounds(region.geom) if region.geom else None,
                    'center': self._get_geometry_center(region.geom) if region.geom else None,
                    'prefectures': prefectures_data
                })
            
            print(f"✅ Hiérarchie chargée: {len(hierarchy_data)} régions, {total_prefectures} préfectures, {total_communes} communes")
            
            return Response({
                'success': True,
                'hierarchy': hierarchy_data,
                'total_regions': len(hierarchy_data),
                'total_prefectures': total_prefectures,
                'total_communes': total_communes
            })
            
        except Exception as e:
            print(f"❌ Erreur chargement hiérarchie: {e}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def _get_geometry_bounds(self, geometry):
        """Calculer les bounds [minLng, minLat, maxLng, maxLat] pour zoom automatique"""
        if not geometry:
            return None
        
        try:
            extent = geometry.extent  # [minLng, minLat, maxLng, maxLat]
            return extent
        except:
            return None
    
    def _get_geometry_center(self, geometry):
        """Calculer le centre [lng, lat] pour zoom automatique"""
        if not geometry:
            return None
        
        try:
            centroid = geometry.centroid
            return [centroid.x, centroid.y]
        except:
            return None


class ZoomToLocationAPIView(APIView):
    """
    API pour obtenir les données de zoom pour une localisation spécifique
    """
    
    def get(self, request):
        location_type = request.GET.get('type')  # 'region', 'prefecture', 'commune'
        location_id = request.GET.get('id')
        
        if not location_type or not location_id:
            return Response({
                'success': False,
                'error': 'Paramètres type et id requis'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            location_id = int(location_id)
            
            if location_type == 'region':
                location = Region.objects.get(id=location_id)
            elif location_type == 'prefecture':
                location = Prefecture.objects.get(id=location_id)
            elif location_type == 'commune':
                location = CommuneRurale.objects.get(id=location_id)
            else:
                return Response({
                    'success': False,
                    'error': 'Type invalide. Utilisez: region, prefecture, commune'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            bounds = self._get_geometry_bounds(location.geom) if location.geom else None
            center = self._get_geometry_center(location.geom) if location.geom else None
            
            return Response({
                'success': True,
                'location': {
                    'id': location.id,
                    'nom': location.nom,
                    'type': location_type,
                    'bounds': bounds,
                    'center': center
                }
            })
            
        except (ValueError, TypeError):
            return Response({
                'success': False,
                'error': 'ID invalide'
            }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_404_NOT_FOUND)
    
    def _get_geometry_bounds(self, geometry):
        """Calculer les bounds pour zoom automatique"""
        if not geometry:
            return None
        
        try:
            extent = geometry.extent  # [minLng, minLat, maxLng, maxLat]
            return extent
        except:
            return None
    
    def _get_geometry_center(self, geometry):
        """Calculer le centre pour zoom automatique"""
        if not geometry:
            return None
        
        try:
            centroid = geometry.centroid
            return [centroid.x, centroid.y]
        except:
            return None # type: ignore

class AdministrativeBoundariesAPIView(APIView):
    """
    API pour récupérer les limites administratives (régions, préfectures, communes)
    avec simplification géométrique selon le niveau de zoom
    """
    
    def get(self, request):
        try:
            user = get_current_user_from_request(request)
            # Paramètres optionnels
            zoom_level = request.GET.get('zoom')
            region_id = request.GET.get('region_id')
            prefecture_id = request.GET.get('prefecture_id')
            
            print(f"[Boundaries API] Zoom: {zoom_level}, Region: {region_id}, Prefecture: {prefecture_id}")
            
            result = {
                'type': 'FeatureCollection',
                'features': []
            }
            
            # RÉGIONS
            regions_query = Region.objects.filter(geom__isnull=False)
            if user and not user.is_admin():
                regions_query = regions_query.filter(id__in=user.get_accessible_regions().values_list('id', flat=True))
            
            if region_id:
                regions_query = regions_query.filter(id=int(region_id))
            
            for region in regions_query:
                # ✅ PAS DE SIMPLIFICATION
                result['features'].append({
                    'type': 'Feature',
                    'geometry': json.loads(region.geom.json),  # Géométrie originale
                    'properties': {
                        'id': region.id,
                        'nom': region.nom,
                        'type': 'region',
                        'level': 1
                    }
                })
            
            # PRÉFECTURES
            prefectures_query = Prefecture.objects.filter(geom__isnull=False).select_related('regions_id')
            if user and not user.is_admin():
                prefectures_query = prefectures_query.filter(id__in=user.get_accessible_prefectures().values_list('id', flat=True))

            if region_id:
                prefectures_query = prefectures_query.filter(regions_id_id=int(region_id))
            elif prefecture_id:
                prefectures_query = prefectures_query.filter(id=int(prefecture_id))
            
            for prefecture in prefectures_query:
                # ✅ PAS DE SIMPLIFICATION
                result['features'].append({
                    'type': 'Feature',
                    'geometry': json.loads(prefecture.geom.json),  # Géométrie originale
                    'properties': {
                        'id': prefecture.id,
                        'nom': prefecture.nom,
                        'region_id': prefecture.regions_id_id,
                        'region_nom': prefecture.regions_id.nom if prefecture.regions_id else None,
                        'type': 'prefecture',
                        'level': 2
                    }
                })
            
            # COMMUNES
            communes_query = CommuneRurale.objects.filter(geom__isnull=False).select_related('prefectures_id__regions_id')
            if user and not user.is_admin():
                communes_query = communes_query.filter(id__in=user.get_accessible_communes().values_list('id', flat=True))

            if prefecture_id:
                communes_query = communes_query.filter(prefectures_id_id=int(prefecture_id))
            elif region_id:
                communes_query = communes_query.filter(prefectures_id__regions_id_id=int(region_id))
            
            for commune in communes_query:
                # ✅ PAS DE SIMPLIFICATION
                result['features'].append({
                    'type': 'Feature',
                    'geometry': json.loads(commune.geom.json),  # Géométrie originale
                    'properties': {
                        'id': commune.id,
                        'nom': commune.nom,
                        'prefecture_id': commune.prefectures_id_id,
                        'prefecture_nom': commune.prefectures_id.nom if commune.prefectures_id else None,
                        'region_id': commune.prefectures_id.regions_id_id if commune.prefectures_id and commune.prefectures_id.regions_id else None,
                        'region_nom': commune.prefectures_id.regions_id.nom if commune.prefectures_id and commune.prefectures_id.regions_id else None,
                        'type': 'commune',
                        'level': 3
                    }
                })
            
            print(f"✅ {len(result['features'])} limites retournées (SANS simplification)")
            
            return Response(result)
            
        except Exception as e:
            print(f"❌ Erreur boundaries API: {e}")
            import traceback
            traceback.print_exc()
            return Response({
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)