import json
import time
from rest_framework.views import APIView # type: ignore
from rest_framework.response import Response # type: ignore
from rest_framework import status # type: ignore
from django.utils import timezone # type: ignore
from django.views.decorators.gzip import gzip_page # type: ignore
from django.utils.decorators import method_decorator # type: ignore
from .models import *

@method_decorator(gzip_page, name='dispatch')
class CollectesGeoAPIView(APIView):
    """
    Retourne les données avec filtrage géographique hiérarchique
    """
    
    def get(self, request):
        """Retourne les infrastructures en GeoJSON avec filtres géographiques"""
        
        start_time = time.time()
        
        #  RÉCUPÉRER LES FILTRES GÉOGRAPHIQUES
        region_id = request.GET.get('region_id')
        prefecture_id = request.GET.get('prefecture_id')
        commune_id = request.GET.get('commune_id')
        types = request.GET.getlist('types', [])
        
        print(f"🌍 [CollectesGeoAPI] Filtres reçus - Region: {region_id}, Prefecture: {prefecture_id}, Commune: {commune_id}, Types: {types}")
        
        results = {
            'type': 'FeatureCollection',
            'features': [],
            'total': 0,
            'filters_applied': {
                'region_id': region_id,
                'prefecture_id': prefecture_id,
                'commune_id': commune_id,
                'types': types
            },
            'timestamp': timezone.now().isoformat()
        }
        
        try:
            #  CALCULER LES COMMUNES À INCLURE selon la hiérarchie et les permissions
            target_commune_ids = self._get_target_communes(region_id, prefecture_id, commune_id, request)
            
            if target_commune_ids is not None and len(target_commune_ids) == 0:
                # Aucune commune trouvée pour les filtres donnés
                print("⚠️ Aucune commune trouvée pour ces filtres")
                return Response(results)
            
            print(f"🎯 Communes ciblées: {len(target_commune_ids) if target_commune_ids else 'toutes'}")
            
            # Chargement des infrastructures avec filtrage
            self._load_point_infrastructures(results, target_commune_ids, types)
            self._load_linear_infrastructures(results, target_commune_ids, types)
            self._load_polygon_infrastructures(results, target_commune_ids, types)
            
            processing_time = time.time() - start_time
            results['total'] = len(results['features'])
            results['processing_time'] = f"{processing_time:.2f}s"
            
            print(f"✅ {results['total']} features retournées en {processing_time:.2f}s")
            
            return Response(results)
            
        except Exception as e:
            print(f" Erreur dans CollectesGeoAPIView: {e}")
            import traceback
            traceback.print_exc()
            return Response({
                'error': str(e), 
                'type': type(e).__name__,
                'details': 'Erreur lors de la récupération des données spatiales'
            }, status=500)

    def _get_user_from_request(self, request):
        """Identifie l'utilisateur via le token JWT"""
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return None
        try:
            from rest_framework_simplejwt.authentication import JWTAuthentication
            authenticator = JWTAuthentication()
            raw_token = authenticator.get_raw_token(authenticator.get_header(request))
            validated_token = authenticator.get_validated_token(raw_token)
            user_id = validated_token['user_id']
            return Login.objects.get(id=user_id)
        except Exception:
            return None

    def _get_target_communes(self, region_id, prefecture_id, commune_id, request):
        """
        Calcule la liste des communes à inclure selon les filtres hiérarchiques
        ET les permissions de l'utilisateur.
        """
        try:
            user = self._get_user_from_request(request)
            
            # 1. Obtenir le périmètre de base de l'utilisateur
            if user and not user.is_admin():
                accessible_qs = user.get_accessible_communes()
            else:
                accessible_qs = CommuneRurale.objects.all()

            # 2. Appliquer les filtres demandés sur ce périmètre
            if commune_id:
                accessible_qs = accessible_qs.filter(id=int(commune_id))
            elif prefecture_id:
                accessible_qs = accessible_qs.filter(prefectures_id_id=int(prefecture_id))
            elif region_id:
                accessible_qs = accessible_qs.filter(prefectures_id__regions_id_id=int(region_id))
            
            # 3. Optimisation pour admin sans filtre (tout voir)
            if (not user or user.is_admin()) and not any([region_id, prefecture_id, commune_id]):
                return None
                
            return list(accessible_qs.values_list('id', flat=True))
                
        except (ValueError, TypeError) as e:
            print(f" Erreur calcul communes cibles: {e}")
            return []

    def _should_include_type(self, type_name, types_filter):
        """Vérifie si ce type doit être inclus selon les filtres"""
        if not types_filter:
            return True
        return type_name in types_filter

    def _add_geographic_properties(self, properties, commune):
        """Ajoute les noms de région, préfecture et commune aux propriétés"""
        if not commune:
            return
            
        try:
            properties['commune_nom'] = commune.nom
            if commune.prefectures_id:
                properties['prefecture_nom'] = commune.prefectures_id.nom
                properties['prefecture_id'] = commune.prefectures_id.id
                if commune.prefectures_id.regions_id:
                    properties['region_nom'] = commune.prefectures_id.regions_id.nom
                    properties['region_id'] = commune.prefectures_id.regions_id.id
        except Exception:
            pass

    def _load_point_infrastructures(self, results, target_commune_ids, types_filter):
        point_models = {
            'services_santes': ServicesSantes,
            'ponts': Ponts,
            'buses': Buses,
            'dalots': Dalots,
            'ecoles': Ecoles,
            'marches': Marches,
            'batiments_administratifs': BatimentsAdministratifs,
            'infrastructures_hydrauliques': InfrastructuresHydrauliques,
            'localites': Localites,
            'autres_infrastructures': AutresInfrastructures,
            'points_coupures': PointsCoupures,      
            'points_critiques': PointsCritiques,
            'ppr_itial': PprItial,
        }
        
        for type_name, model_class in point_models.items():
            if not self._should_include_type(type_name, types_filter):
                continue
                
            try:
                queryset = model_class.objects.filter(geom__isnull=False)
                
                # Dynamically determine the commune field name
                model_fields = [f.name for f in model_class._meta.fields]
                commune_field = 'commune_id' if 'commune_id' in model_fields else 'communes_rurales_id' if 'communes_rurales_id' in model_fields else None
                
                if target_commune_ids is not None and commune_field:
                    queryset = queryset.filter(**{f"{commune_field}__in": target_commune_ids})
                
                for item in queryset:
                    try:
                        if item.geom:
                            # Use _id for the raw integer value of the ForeignKey
                            commune_obj = None
                            raw_commune_id = None
                            
                            if commune_field:
                                raw_commune_id = getattr(item, f"{commune_field}_id", None)
                                # For _add_geographic_properties, we need the object
                                try:
                                    commune_obj = getattr(item, commune_field, None)
                                except Exception:
                                    pass

                            # Dynamically extract all fields from the model
                            properties = {
                                'fid': int(item.fid) if hasattr(item, 'fid') else int(item.id),
                                'type': type_name,
                                'commune_id': raw_commune_id  # Raw ID for filtering in frontend
                            }
                            
                            # Add all other fields from the model
                            for field in item._meta.fields:
                                field_name = field.name
                                # Skip these technical fields
                                if field_name in ['fid', 'id', 'geom', 'commune_id', 'communes_rurales_id', 'login_id', 'sqlite_id', 
                                                 'x_site', 'y_site', 'x_ecole', 'y_ecole', 'x_sante', 'y_sante',
                                                 'x_marche', 'y_marche', 'x_batiment', 'y_batiment', 
                                                 'x_infrastr', 'y_infrastr', 'x_localite', 'y_localite',
                                                 'x_autre_in', 'y_autre_in', 'x_point_co', 'y_point_co',
                                                 'x_point_cr', 'y_point_cr', 'x_pont', 'y_pont',
                                                 'x_dalot', 'y_dalot', 'x_buse', 'y_buse']:
                                    continue
                                
                                try:
                                    # Handle ForeignKeys: get the ID instead of the object
                                    if field.is_relation and not field.many_to_many:
                                        target_key = f"{field_name}_id"
                                        field_value = getattr(item, target_key, None)
                                    else:
                                        field_value = getattr(item, field_name, None)
                                        
                                    if field_value is not None:
                                        target_key = field_name
                                        if field_name == 'type':
                                            target_key = 'type_infra'
                                            
                                        if hasattr(field_value, 'isoformat'):  # DateTime/Date
                                            properties[target_key] = field_value.isoformat()
                                        elif isinstance(field_value, (int, float, str, bool)):
                                            properties[target_key] = field_value
                                        else:
                                            properties[target_key] = str(field_value)
                                except Exception:
                                    continue
                            
                            # Add geographic names using the commune object we fetched
                            if commune_obj:
                                self._add_geographic_properties(properties, commune_obj)
                            
                            feature = {
                                'type': 'Feature',
                                'id': f"{type_name}_{properties['fid']}",
                                'geometry': {
                                    'type': 'Point',
                                    'coordinates': [float(item.geom.x), float(item.geom.y)]
                                },
                                'properties': properties
                            }
                            results['features'].append(feature)
                    except Exception as e:
                        print(f"Error processing item in {type_name}: {e}")
                        continue
                        
            except Exception as e:
                print(f"Error loading {type_name}: {e}")
                continue

        
    def _load_linear_infrastructures(self, results, target_commune_ids, types_filter):
        """Charge les infrastructures linéaires (pistes, chaussées, passages, bacs)"""
        
        # 1. CHARGEMENT DES BACS
        if self._should_include_type('bacs', types_filter):
            try:
                bacs_queryset = Bacs.objects.filter(geom__isnull=False)
                if target_commune_ids is not None:
                    bacs_queryset = bacs_queryset.filter(commune_id__in=target_commune_ids)
                
                for bac in bacs_queryset:
                    try:
                        if bac.geom:
                            geom_json = json.loads(bac.geom.json)
                            coordinates = geom_json.get('coordinates')
                            if not coordinates: continue
                            
                            properties = {
                                'fid': int(bac.fid),
                                'type': 'bacs',
                                'commune_id': bac.commune_id_id
                            }
                            
                            for field in Bacs._meta.fields:
                                field_name = field.name
                                if field_name in ['fid', 'geom', 'commune_id', 'login_id', 'sqlite_id']:
                                    continue
                                try:
                                    if field.is_relation: properties[field_name] = getattr(bac, f"{field_name}_id", None)
                                    else:
                                        val = getattr(bac, field_name, None)
                                        if hasattr(val, 'isoformat'): properties[field_name] = val.isoformat()
                                        elif isinstance(val, (int, float, str, bool)): properties[field_name] = val
                                        else: properties[field_name] = str(val) if val is not None else None
                                except Exception: continue

                            if bac.commune_id:
                                self._add_geographic_properties(properties, bac.commune_id)
                            
                            results['features'].append({
                                'type': 'Feature',
                                'id': f"bac_{bac.fid}",
                                'geometry': {'type': bac.geom.geom_type, 'coordinates': coordinates},
                                'properties': properties
                            })
                    except Exception: continue
            except Exception: pass

        # 2. CHARGEMENT DES PISTES
        # 2. CHARGEMENT DES PISTES
        if self._should_include_type('pistes', types_filter):
            try:
                # 1. OPTIMIZATION: Use select_related to fetch the hierarchy in one go
                # matching your DB schema: communes_rurales -> prefectures -> regions
                piste_queryset = Piste.objects.filter(geom__isnull=False).select_related(
                    'communes_rurales_id',
                    'communes_rurales_id__prefectures_id',
                    'communes_rurales_id__prefectures_id__regions_id'
                )
                
                if target_commune_ids is not None:
                    piste_queryset = piste_queryset.filter(communes_rurales_id__in=target_commune_ids)
                
                for piste in piste_queryset:
                    try:
                        if piste.geom:
                            simplified_geom = piste.geom.simplify(0.01)
                            if simplified_geom.empty: continue
                            
                            geom_json = json.loads(simplified_geom.json)
                            coordinates = geom_json.get('coordinates')
                            
                            if coordinates:
                                properties = {
                                    'id': int(piste.id),
                                    'type': 'pistes',
                                    # Use the raw ID from the Foreign Key
                                    'commune_id': piste.communes_rurales_id_id if piste.communes_rurales_id_id else None
                                }
                                
                                # Add standard fields
                                for field in Piste._meta.fields:
                                    field_name = field.name
                                    if field_name in ['id', 'geom', 'communes_rurales_id', 'login_id', 'sqlite_id']:
                                        continue
                                    try:
                                        val = getattr(piste, field_name, None)
                                        if hasattr(val, 'isoformat'): properties[field_name] = val.isoformat()
                                        elif isinstance(val, (int, float, str, bool)): properties[field_name] = val
                                        else: properties[field_name] = str(val) if val is not None else None
                                    except Exception: continue

                                # --- FIX START: EXPLICITLY FETCH NAMES VIA ORM ---
                                # Based on your CSV schema
                                if piste.communes_rurales_id:
                                    # 1. Get Commune Name
                                    properties['commune_nom'] = piste.communes_rurales_id.nom
                                    
                                    # 2. Get Prefecture Name
                                    if piste.communes_rurales_id.prefectures_id:
                                        properties['prefecture_nom'] = piste.communes_rurales_id.prefectures_id.nom
                                        properties['prefecture_id'] = piste.communes_rurales_id.prefectures_id.id 
                                        
                                        # 3. Get Region Name
                                        if piste.communes_rurales_id.prefectures_id.regions_id:
                                            properties['region_nom'] = piste.communes_rurales_id.prefectures_id.regions_id.nom
                                            properties['region_id'] = piste.communes_rurales_id.prefectures_id.regions_id.id
                                # --- FIX END ---

                                if 'piste_id' not in properties:
                                    properties['piste_id'] = str(piste.id)
                                
                                results['features'].append({
                                    'type': 'Feature',
                                    'id': f"piste_{piste.id}",
                                    'geometry': {'type': simplified_geom.geom_type, 'coordinates': coordinates},
                                    'properties': properties
                                })
                    except Exception as e:
                        print(f"Error processing piste {piste.id}: {e}")
                        continue
            except Exception as e:
                print(f"Error loading pistes: {e}")
        # CHARGEMENT DES CHAUSSÉES
        if self._should_include_type('chaussees', types_filter):
            try:
                chaussees_queryset = Chaussees.objects.filter(geom__isnull=False)
                if target_commune_ids is not None:
                    chaussees_queryset = chaussees_queryset.filter(communes_rurales_id__in=target_commune_ids)
                
                for chaussee in chaussees_queryset:
                    try:
                        if chaussee.geom:
                            geom_json = json.loads(chaussee.geom.json)
                            coordinates = geom_json.get('coordinates')
                            if not coordinates: continue
                            
                            properties = {
                                'fid': int(chaussee.fid),
                                'type': 'chaussees',
                                'commune_id': chaussee.communes_rurales_id_id
                            }
                            
                            for field in Chaussees._meta.fields:
                                field_name = field.name
                                if field_name in ['fid', 'geom', 'communes_rurales_id', 'login_id', 'sqlite_id', 'code_piste']:
                                    continue
                                try:
                                    if field.is_relation: properties[field_name] = getattr(chaussee, f"{field_name}_id", None)
                                    else:
                                        val = getattr(chaussee, field_name, None)
                                        if hasattr(val, 'isoformat'): properties[field_name] = val.isoformat()
                                        elif isinstance(val, (int, float, str, bool)): properties[field_name] = val
                                        else: properties[field_name] = str(val) if val is not None else None
                                except Exception: continue
                            
                            # Re-ajouter code_piste proprement
                            properties['code_piste'] = chaussee.code_piste_id

                            if chaussee.communes_rurales_id:
                                self._add_geographic_properties(properties, chaussee.communes_rurales_id)
                                
                            results['features'].append({
                                'type': 'Feature',
                                'id': f"chaussee_{chaussee.fid}",
                                'geometry': {'type': chaussee.geom.geom_type, 'coordinates': coordinates},
                                'properties': properties
                            })
                    except Exception: continue
            except Exception: pass

        # PASSAGES_SUBMERSIBLES
        if self._should_include_type('passages_submersibles', types_filter):
            try:
                queryset = PassagesSubmersibles.objects.filter(geom__isnull=False)
                if target_commune_ids is not None:
                    queryset = queryset.filter(commune_id__in=target_commune_ids)
                
                for passage in queryset:
                    try:
                        if passage.geom:
                            geom_json = json.loads(passage.geom.json)
                            coordinates = geom_json.get('coordinates')
                            
                            properties = {
                                'fid': int(passage.fid),
                                'type': 'passages_submersibles',
                                'commune_id': passage.commune_id_id
                            }
                            
                            for field in PassagesSubmersibles._meta.fields:
                                field_name = field.name
                                if field_name in ['fid', 'geom', 'commune_id', 'login_id', 'sqlite_id']:
                                    continue
                                try:
                                    if field.is_relation: properties[field_name] = getattr(passage, f"{field_name}_id", None)
                                    else:
                                        val = getattr(passage, field_name, None)
                                        if hasattr(val, 'isoformat'): properties[field_name] = val.isoformat()
                                        elif isinstance(val, (int, float, str, bool)): properties[field_name] = val
                                        else: properties[field_name] = str(val) if val is not None else None
                                except Exception: continue

                            if passage.commune_id:
                                self._add_geographic_properties(properties, passage.commune_id)
                            
                            results['features'].append({
                                'type': 'Feature',
                                'id': f"passages_submersibles_{passage.fid}",
                                'geometry': {'type': 'LineString', 'coordinates': coordinates},
                                'properties': properties
                            })
                    except Exception: continue
            except Exception: pass

    def _load_polygon_infrastructures(self, results, target_commune_ids, types_filter):
        """Charge les infrastructures polygonales avec filtrage géographique"""
        
        # CHARGEMENT DES ENQUETE_POLYGONE
        if self._should_include_type('enquete_polygone', types_filter):
            try:
                queryset = EnquetePolygone.objects.filter(geom__isnull=False)
                
                if target_commune_ids is not None:
                    queryset = queryset.filter(communes_rurales_id__in=target_commune_ids)
                    print(f"  Filtrage enquete_polygone: {queryset.count()} éléments dans les communes {target_commune_ids}")
                
                for polygone in queryset:
                    try:
                        if polygone.geom:
                            # Simplifier la géométrie pour réduire la taille
                            simplified_geom = polygone.geom.simplify(0.001)
                            
                            if simplified_geom.empty:
                                continue
                            
                            # Extraire les coordonnées via JSON pour compatibilité maximale
                            geom_json = json.loads(simplified_geom.json)
                            coordinates = geom_json.get('coordinates')
                            
                            if coordinates:
                                feature = {
                                    'type': 'Feature',
                                    'id': f"enquete_polygone_{polygone.id}",
                                    'geometry': {
                                        'type': simplified_geom.geom_type,
                                        'coordinates': coordinates
                                    },
                                    'properties': {
                                        'id': int(polygone.id),
                                        'type': 'enquete_polygone',
                                        'commune_id': polygone.communes_rurales_id.id if hasattr(polygone.communes_rurales_id, 'id') else polygone.communes_rurales_id,
                                        'superficie_en_ha': polygone.superficie_en_ha if polygone.superficie_en_ha else None,
                                    }
                                }
                                if polygone.communes_rurales_id and hasattr(polygone.communes_rurales_id, 'nom'):
                                    self._add_geographic_properties(feature['properties'], polygone.communes_rurales_id)
                                results['features'].append(feature)
                    except Exception as e:
                        print(f"Erreur processing enquete_polygone {polygone.id}: {e}")
                        continue
                        
            except Exception as e:
                print(f"Erreur chargement enquete_polygone: {e}")



class CommunesSearchAPIView(APIView):
    """API de recherche communes"""
    
    def get(self, request):
        query = request.GET.get('q', '').strip()
        
        if not query or len(query) < 2:
            return Response({
                'communes': [],
                'message': 'Tapez au moins 2 caractères'
            })
        
        try:
            communes = CommuneRurale.objects.filter(
                nom__icontains=query
            ).select_related('prefectures_id__regions_id').order_by('nom')[:20]
            
            results = []
            for commune in communes:
                prefecture_nom = commune.prefectures_id.nom if commune.prefectures_id else "N/A"
                region_nom = commune.prefectures_id.regions_id.nom if commune.prefectures_id and commune.prefectures_id.regions_id else "N/A"
                
                results.append({
                    'id': commune.id,
                    'nom': commune.nom,
                    'prefecture': prefecture_nom,
                    'region': region_nom,
                })
            
            return Response({
                'communes': results,
                'total': len(results)
            })
            
        except Exception as e:
            return Response({
                'error': str(e),
                'communes': []
            }, status=500)


class TypesInfrastructuresAPIView(APIView):
    """API pour les types d'infrastructures"""
    
    def get(self, request):
        types_config = {
            'pistes': {'label': 'Pistes', 'icon': 'road', 'color': '#2C3E50'},
            'chaussees': {'label': 'Chaussées', 'icon': 'road', 'color': '#8e44ad'},
            'ponts': {'label': 'Ponts', 'icon': 'bridge', 'color': '#9B59B6'},
            'buses': {'label': 'Buses', 'icon': 'bus', 'color': '#E74C3C'},
            'dalots': {'label': 'Dalots', 'icon': 'water', 'color': '#3498DB'},
            'bacs': {'label': 'Bacs', 'icon': 'ship', 'color': '#F39C12'},
            'passages_submersibles': {'label': 'Passages submersibles', 'icon': 'water', 'color': '#1ABC9C'},
            'points_coupures': {'label': 'Points de coupure', 'icon': 'times-circle', 'color': '#C0392B'},      
            'points_critiques': {'label': 'Points critiques', 'icon': 'exclamation-triangle', 'color': '#D35400'},  
            'localites': {'label': 'Localités', 'icon': 'home', 'color': '#E67E22'},
            'ecoles': {'label': 'Écoles', 'icon': 'graduation-cap', 'color': '#27AE60'},
            'services_santes': {'label': 'Services de santé', 'icon': 'hospital', 'color': '#E74C3C'},
            'marches': {'label': 'Marchés', 'icon': 'shopping-cart', 'color': '#F1C40F'},
            'batiments_administratifs': {'label': 'Bâtiments administratifs', 'icon': 'building', 'color': '#34495E'},
            'infrastructures_hydrauliques': {'label': 'Infrastructures hydrauliques', 'icon': 'tint', 'color': '#3498DB'},
            'autres_infrastructures': {'label': 'Autres infrastructures', 'icon': 'map-pin', 'color': '#95A5A6'},
            'sites': {'label': 'Sites', 'icon': 'map-marker', 'color': '#E67E22'},
            'enquete_polygone': {'label': 'Polygones d\'enquête', 'icon': 'draw-polygon', 'color': '#27AE60'}
        }
        
        return Response({
            'types': types_config,
            'total': len(types_config)
        })