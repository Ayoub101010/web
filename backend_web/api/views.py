from django.shortcuts import render # type: ignore
from rest_framework.views import APIView # type: ignore
from rest_framework.response import Response # type: ignore
from rest_framework import status, generics # type: ignore
from django.contrib.gis.db.models.functions import Transform,Length # type: ignore
from django.db.models import Count, F # type: ignore
from django.db.models import Q # type: ignore
from django.utils import timezone # type: ignore
from rest_framework.pagination import PageNumberPagination # type: ignore

from rest_framework import status # type: ignore
from rest_framework_simplejwt.tokens import RefreshToken  # type: ignore

from .models import *
from .serializers import *

def get_current_user_from_request(request):
    """Extrait l'utilisateur (Login) du token JWT"""
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


class InfrastructureRBACMixin:
    """Mixin pour filtrer automatiquement la liste selon les communes accessibles ET les filtres passés"""
    def get_queryset(self):
        # On appelle le super pour garder les filtres existants (si définis dans le queryset de base)
        qs = super().get_queryset()
        user = get_current_user_from_request(self.request)
        
        # 1. FILTRAGE PAR PARAMÈTRES DE REQUÊTE (Public ou Admin ou Restricted)
        # Support multi-sélection via getlist
        region_ids = self.request.query_params.getlist('region_id') or self.request.query_params.getlist('region_ids')
        prefecture_ids = self.request.query_params.getlist('prefecture_id') or self.request.query_params.getlist('prefecture_ids')
        commune_ids_param = self.request.query_params.getlist('commune_id') or \
                           self.request.query_params.getlist('commune_ids') or \
                           self.request.query_params.getlist('communes_rurales_id')
        
        # Fallback pour les valeurs simples si getlist est vide (parfois DRF parse mal selon le format)
        if not region_ids and self.request.query_params.get('region_id'): 
            region_ids = [self.request.query_params.get('region_id')]
        if not prefecture_ids and self.request.query_params.get('prefecture_id'):
            prefecture_ids = [self.request.query_params.get('prefecture_id')]
        if not commune_ids_param and self.request.query_params.get('commune_id'):
            commune_ids_param = [self.request.query_params.get('commune_id')]
        elif not commune_ids_param and self.request.query_params.get('communes_rurales_id'):
            commune_ids_param = [self.request.query_params.get('communes_rurales_id')]

        # Identifier le champ de commune
        model = qs.model
        fields = [f.name for f in model._meta.get_fields()]
        commune_field = 'communes_rurales_id' if 'communes_rurales_id' in fields else \
                       'commune_id' if 'commune_id' in fields else \
                       'commune_rural_id' if 'commune_rural_id' in fields else None

        if commune_field:
            if commune_ids_param:
                qs = qs.filter(**{f"{commune_field}__in": commune_ids_param})

            # Vérifier si le champ commune est une FK (traversal ORM) ou un IntegerField (sous-requête)
            try:
                field_obj = qs.model._meta.get_field(commune_field)
                is_fk = field_obj.is_relation
            except Exception:
                is_fk = False

            if is_fk:
                if prefecture_ids:
                    qs = qs.filter(**{f"{commune_field}__prefectures_id__in": prefecture_ids})
                if region_ids:
                    qs = qs.filter(**{f"{commune_field}__prefectures_id__regions_id__in": region_ids})
            else:
                # IntegerField → sous-requête via CommuneRurale
                if prefecture_ids:
                    commune_ids_in = CommuneRurale.objects.filter(
                        prefectures_id__in=prefecture_ids
                    ).values_list('id', flat=True)
                    qs = qs.filter(**{f"{commune_field}__in": commune_ids_in})
                if region_ids:
                    commune_ids_in = CommuneRurale.objects.filter(
                        prefectures_id__regions_id__in=region_ids
                    ).values_list('id', flat=True)
                    qs = qs.filter(**{f"{commune_field}__in": commune_ids_in})

        # 2. FILTRAGE DE SÉCURITÉ RBAC
        # Si c'est un admin, on s'arrête là (ils ont déjà les filtres manuels s'il y en a)
        if not user or user.is_admin():
            return qs

        # Pour les utilisateurs restreints (BTGR, SPGR), on restreint au scope autorisé
        # même si aucun filtre n'est passé ou si un filtre hors-scope est passé.
        user_allowed_commune_ids = user.get_accessible_communes().values_list('id', flat=True)
        
        if commune_field:
            qs = qs.filter(**{f"{commune_field}__in": user_allowed_commune_ids})
            
        return qs


# ==================== GEOGRAPHIE ====================

class RegionsListCreateAPIView(generics.ListCreateAPIView):
    queryset = Region.objects.all()
    serializer_class = RegionSerializer


class PrefecturesListCreateAPIView(generics.ListCreateAPIView):
    queryset = Prefecture.objects.all()
    serializer_class = PrefectureSerializer


class CommunesRuralesListCreateAPIView(InfrastructureRBACMixin, generics.ListCreateAPIView):
    serializer_class = CommuneRuraleSerializer
    
    def get_queryset(self):
        queryset = CommuneRurale.objects.select_related(
            'prefectures_id',
            'prefectures_id__regions_id'
        )
        search = self.request.GET.get('q', '')
        if search:
            queryset = queryset.filter(nom__icontains=search)
        return queryset.order_by('nom')


# ==================== UTILISATEURS ====================

class LoginAPIView(APIView):
    """API de connexion avec JWT - Format compatible frontend avec support RBAC"""

    def get(self, request):
        """Recuperer tous les utilisateurs"""
        users = Login.objects.all()
        serializer = LoginSerializer(users, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        """Authentification avec generation de tokens JWT et donnees RBAC"""
        mail = request.data.get('mail')
        mdp = request.data.get('mdp')

        if not mail or not mdp:
            return Response({
                "error": "Mail et mot de passe requis"
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = Login.objects.select_related(
                'communes_rurales_id',
                'communes_rurales_id__prefectures_id',
                'communes_rurales_id__prefectures_id__regions_id'
            ).get(mail=mail)
           
        except Login.DoesNotExist:
            return Response({
                "error": "Utilisateur non trouve"
            }, status=status.HTTP_404_NOT_FOUND)

        # Check if user is active
        if not user.is_active:
            return Response({
                "error": "Compte desactive"
            }, status=status.HTTP_403_FORBIDDEN)

        # Verification du mot de passe (simple pour l'instant)
        if user.mdp != mdp:
            return Response({
                "error": "Mot de passe incorrect"
            }, status=status.HTTP_401_UNAUTHORIZED)

        # Update last login
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])

        # Generation des tokens JWT
        refresh = RefreshToken()
        refresh['user_id'] = user.id
        refresh['email'] = user.mail
        refresh['role'] = user.role
        
        # Preparation des donnees utilisateur de base
        user_data = {
            'id': user.id,
            'nom': user.nom,
            'prenom': user.prenom,
            'mail': user.mail,
            'role': user.role,
            'is_active': user.is_active,
        }
        
        # Ajout des infos geographiques legacy (commune)
        if user.communes_rurales_id:
            commune = user.communes_rurales_id
            user_data['commune'] = {
                'id': commune.id,
                'nom': commune.nom
            }
            
            if commune.prefectures_id:
                prefecture = commune.prefectures_id
                user_data['prefecture'] = {
                    'id': prefecture.id,
                    'nom': prefecture.nom
                }
                
                if prefecture.regions_id:
                    region = prefecture.regions_id
                    user_data['region'] = {
                        'id': region.id,
                        'nom': region.nom
                    }
        
        # RBAC: Add assigned regions (for BTGR users)
        if user.is_btgr():
            assigned_regions = list(UserRegion.objects.filter(login=user).select_related('region').values(
                'region_id', 
                region_nom=models.F('region__nom')
            ))
            user_data['assigned_regions'] = assigned_regions
        
        # RBAC: Add assigned prefectures (for SPGR users)
        if user.is_spgr():
            assigned_prefectures = list(UserPrefecture.objects.filter(login=user).select_related('prefecture').values(
                'prefecture_id',
                prefecture_nom=models.F('prefecture__nom')
            ))
            user_data['assigned_prefectures'] = assigned_prefectures
        
        # RBAC: Add allowed interfaces
        user_data['allowed_interfaces'] = user.get_allowed_interfaces()
        
        # RBAC: Add permission flags
        user_data['permissions'] = {
            'is_admin': user.is_admin(),
            'can_export': user.is_admin(),  # Only admins can export
            'can_access_suivi_donnees': user.is_admin(),  # Only admins
            'can_manage_users': user.is_admin(),  # Only admins
        }
        
        # ===== LOG HISTORIQUE : Connexion web =====
        try:
            ActionHistory.objects.create(
                login=user,
                action_type='login',
                source='web',
            )
        except Exception:
            pass

        # IMPORTANT: Format attendu par le frontend
        # Les tokens sont directement dans la reponse, PAS dans un sous-objet
        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": user_data,
            "expires_in": 3600
        }, status=status.HTTP_200_OK)


class PasswordResetRequestsAPIView(APIView):
    """
    GET  : Lister les demandes de reset (pour le SuperAdmin)
    POST : Marquer une demande comme traitée
    """

    def get(self, request):
        """Lister les demandes pending (+ optionnel: toutes)"""
        status_filter = request.GET.get('status', 'pending')

        if status_filter == 'all':
            qs = PasswordResetRequest.objects.select_related('login').order_by('-created_at')
        else:
            qs = PasswordResetRequest.objects.select_related('login').filter(
                status=status_filter
            ).order_by('-created_at')

        serializer = PasswordResetRequestSerializer(qs, many=True)

        # Compter les pending pour le badge
        pending_count = PasswordResetRequest.objects.filter(status='pending').count()

        return Response({
            "results": serializer.data,
            "pending_count": pending_count,
        }, status=status.HTTP_200_OK)

    def post(self, request):
        """Marquer une demande comme traitée"""
        request_id = request.data.get('request_id')

        if not request_id:
            return Response(
                {"error": "request_id requis"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            reset_req = PasswordResetRequest.objects.get(id=request_id)
        except PasswordResetRequest.DoesNotExist:
            return Response(
                {"error": "Demande introuvable"},
                status=status.HTTP_404_NOT_FOUND,
            )

        reset_req.status = 'handled'
        reset_req.handled_at = timezone.now()
        # Identifier le SuperAdmin qui traite la demande
        try:
            from rest_framework_simplejwt.authentication import JWTAuthentication
            auth = JWTAuthentication()
            raw_token = auth.get_raw_token(auth.get_header(request))
            validated = auth.get_validated_token(raw_token)
            reset_req.handled_by_id = validated['user_id']
        except Exception:
            pass

        reset_req.save(update_fields=['status', 'handled_at', 'handled_by'])

        return Response(
            {"message": "Demande marquée comme traitée."},
            status=status.HTTP_200_OK,
        )
    
    
class UserManagementAPIView(APIView):
    """API dediee a la gestion des utilisateurs par le super_admin"""
    
    def post(self, request):
        """Creer un nouvel utilisateur"""
        serializer = UserCreateSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            response_serializer = LoginSerializer(user)
            return Response(response_serializer.data, status=status.HTTP_201_CREATED)
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def get(self, request, user_id=None):
        """Lister tous les utilisateurs ou recuperer un utilisateur specifique"""
        if user_id:
            try:
                user = Login.objects.select_related(
                    'communes_rurales_id',
                    'communes_rurales_id__prefectures_id',
                    'communes_rurales_id__prefectures_id__regions_id'
                ).get(id=user_id)
                serializer = LoginSerializer(user)
                return Response(serializer.data, status=status.HTTP_200_OK)
            except Login.DoesNotExist:
                return Response({"error": "Utilisateur non trouve"}, status=status.HTTP_404_NOT_FOUND)
        else:
            queryset = Login.objects.select_related(
                'communes_rurales_id',
                'communes_rurales_id__prefectures_id',
                'communes_rurales_id__prefectures_id__regions_id'
            )
            
            role = request.GET.get('role')
            region_id = request.GET.get('region_id')
            prefecture_id = request.GET.get('prefecture_id')
            commune_id = request.GET.get('commune_id') or request.GET.get('communes_rurales_id')
            
            if role:
                queryset = queryset.filter(role=role)
            if region_id:
                queryset = queryset.filter(communes_rurales_id__prefectures_id__regions_id=region_id)
            if prefecture_id:
                queryset = queryset.filter(communes_rurales_id__prefectures_id=prefecture_id)
            if commune_id:
                queryset = queryset.filter(communes_rurales_id=commune_id)
            
            serializer = LoginSerializer(queryset, many=True)
            return Response({
                'users': serializer.data,
                'total': queryset.count()
            }, status=status.HTTP_200_OK)
    
    def put(self, request, user_id=None):
        """Modifier un utilisateur existant"""
        if not user_id:
            return Response({"error": "ID utilisateur requis"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = Login.objects.get(id=user_id)
        except Login.DoesNotExist:
            return Response({"error": "Utilisateur non trouve"}, status=status.HTTP_404_NOT_FOUND)
        
        serializer = UserUpdateSerializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            user.refresh_from_db()
            response_serializer = LoginSerializer(user)
            return Response(response_serializer.data, status=status.HTTP_200_OK)
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def delete(self, request, user_id=None):
        """Supprimer un utilisateur"""
        if not user_id:
            return Response({"error": "ID utilisateur requis"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = Login.objects.get(id=user_id)
            user_info = f"{user.nom} {user.prenom}"
            user.delete()
            return Response({
                "message": f"Utilisateur {user_info} supprime avec succes"
            }, status=status.HTTP_200_OK)
        except Login.DoesNotExist:
            return Response({"error": "Utilisateur non trouve"}, status=status.HTTP_404_NOT_FOUND)


# ==================== RBAC MANAGEMENT ====================

class UserRegionsAPIView(APIView):
    """API for managing user-region assignments (BTGR role)"""
    
    def get(self, request, user_id=None):
        """Get regions assigned to a user"""
        if not user_id:
            return Response({"error": "User ID required"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = Login.objects.get(id=user_id)
            assignments = UserRegion.objects.filter(login=user).select_related('region')
            serializer = UserRegionSerializer(assignments, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Login.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)
    
    def post(self, request, user_id=None):
        """Assign regions to a user"""
        if not user_id:
            return Response({"error": "User ID required"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = Login.objects.get(id=user_id)
            region_ids = request.data.get('region_ids', [])
            
            # Clear existing assignments
            UserRegion.objects.filter(login=user).delete()
            
            # Create new assignments
            for region_id in region_ids:
                UserRegion.objects.create(login=user, region_id=region_id)
            
            return Response({"message": "Regions assigned successfully"}, status=status.HTTP_200_OK)
        except Login.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)


class UserPrefecturesAPIView(APIView):
    """API for managing user-prefecture assignments (SPGR role)"""
    
    def get(self, request, user_id=None):
        """Get prefectures assigned to a user"""
        if not user_id:
            return Response({"error": "User ID required"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = Login.objects.get(id=user_id)
            assignments = UserPrefecture.objects.filter(login=user).select_related('prefecture')
            serializer = UserPrefectureSerializer(assignments, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Login.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)
    
    def post(self, request, user_id=None):
        """Assign prefectures to a user"""
        if not user_id:
            return Response({"error": "User ID required"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = Login.objects.get(id=user_id)
            prefecture_ids = request.data.get('prefecture_ids', [])
            
            # Clear existing assignments
            UserPrefecture.objects.filter(login=user).delete()
            
            # Create new assignments
            for prefecture_id in prefecture_ids:
                UserPrefecture.objects.create(login=user, prefecture_id=prefecture_id)
            
            return Response({"message": "Prefectures assigned successfully"}, status=status.HTTP_200_OK)
        except Login.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)


class UserInterfacesAPIView(APIView):
    """API for managing user interface permissions"""
    
    def get(self, request, user_id=None):
        """Get interfaces assigned to a user"""
        if not user_id:
            return Response({"error": "User ID required"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = Login.objects.get(id=user_id)
            permissions = UserInterfacePermission.objects.filter(login=user)
            serializer = UserInterfacePermissionSerializer(permissions, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Login.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)
    
    def post(self, request, user_id=None):
        """Assign interfaces to a user"""
        if not user_id:
            return Response({"error": "User ID required"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = Login.objects.get(id=user_id)
            interface_names = request.data.get('interface_names', [])
            
            # Clear existing permissions
            UserInterfacePermission.objects.filter(login=user).delete()
            
            # Create new permissions
            for interface_name in interface_names:
                UserInterfacePermission.objects.create(login=user, interface_name=interface_name)
            
            return Response({"message": "Interfaces assigned successfully"}, status=status.HTTP_200_OK)
        except Login.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)


class UserPermissionsAPIView(APIView):
    """API for getting comprehensive user permissions"""
    
    def get(self, request, user_id=None):
        """Get all permissions for a user"""
        if not user_id:
            return Response({"error": "User ID required"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = Login.objects.get(id=user_id)
            
            data = {
                'user_id': user.id,
                'role': user.role,
                'is_admin': user.is_admin(),
                'assigned_regions': [],
                'assigned_prefectures': [],
                'allowed_interfaces': user.get_allowed_interfaces(),
                'accessible_region_ids': list(user.get_accessible_regions().values_list('id', flat=True)),
                'accessible_prefecture_ids': list(user.get_accessible_prefectures().values_list('id', flat=True)),
                'accessible_commune_ids': list(user.get_accessible_communes().values_list('id', flat=True)),
            }
            
            # Add assigned regions for BTGR
            if user.is_btgr():
                data['assigned_regions'] = list(UserRegion.objects.filter(login=user).values(
                    'region_id', region_nom=F('region__nom')
                ))
            
            # Add assigned prefectures for SPGR
            if user.is_spgr():
                data['assigned_prefectures'] = list(UserPrefecture.objects.filter(login=user).values(
                    'prefecture_id', prefecture_nom=F('prefecture__nom')
                ))
            
            return Response(data, status=status.HTTP_200_OK)
        except Login.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)


# ==================== PISTES ====================

class PisteListCreateAPIView(InfrastructureRBACMixin, generics.ListCreateAPIView):
    queryset = Piste.objects.all()
    pagination_class = None  # Désactiver la pagination
    """Vue unifiee pour les pistes"""
    
    def get_queryset(self):
        return super().get_queryset()
    
    def get_serializer_class(self):
        if self.request.method == 'GET':
            return PisteReadSerializer
        return PisteWriteSerializer
    
    def perform_create(self, serializer):
        serializer.save()
    
from django.contrib.gis.db.models.functions import Length

class PisteWebListAPIView(InfrastructureRBACMixin, generics.ListAPIView):
    queryset = Piste.objects.all()
    serializer_class = PisteDashboardSerializer
    pagination_class = None  

    def get_queryset(self):
        # 1. Récupérer le queryset de base (filtré par le Mixin)
        qs = super().get_queryset()
        
        # Optimization select_related + Annotation pour Dashboard
        return qs.select_related(
            'login_id',
            'communes_rurales_id',
            'communes_rurales_id__prefectures_id',
            'communes_rurales_id__prefectures_id__regions_id'
        ).annotate(
            nb_buses=Count('buses', filter=Q(buses__code_piste__isnull=False)),
            nb_ponts=Count('ponts', filter=Q(ponts__code_piste__isnull=False)),
            nb_dalots=Count('dalots', filter=Q(dalots__code_piste__isnull=False)),
            nb_bacs=Count('bacs', filter=Q(bacs__code_piste__isnull=False)),
            nb_ecoles=Count('ecoles', filter=Q(ecoles__code_piste__isnull=False)),
            nb_marches=Count('marches', filter=Q(marches__code_piste__isnull=False)),
            nb_services_santes=Count('servicessantes', filter=Q(servicessantes__code_piste__isnull=False)),
            nb_autres_infrastructures=Count('autresinfrastructures', filter=Q(autresinfrastructures__code_piste__isnull=False)),
            nb_batiments_administratifs=Count('batimentsadministratifs', filter=Q(batimentsadministratifs__code_piste__isnull=False)),
            nb_infrastructures_hydrauliques=Count('infrastructureshydrauliques', filter=Q(infrastructureshydrauliques__code_piste__isnull=False)),
            nb_localites=Count('localites', filter=Q(localites__code_piste__isnull=False)),
            nb_passages_submersibles=Count('passagessubmersibles', filter=Q(passagessubmersibles__code_piste__isnull=False))
        ).order_by('-created_at')



# ==================== CHAUSSEES ====================

class ChausseesListCreateAPIView(InfrastructureRBACMixin, generics.ListCreateAPIView):
    queryset = Chaussees.objects.all()
    pagination_class = None  # Désactiver la pagination
    serializer_class = ChausseesSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        code_piste = self.request.query_params.get('code_piste')
        if code_piste:
            qs = qs.filter(code_piste_id=code_piste)
        return qs


# ==================== POINTS ====================

class PointsCoupuresListCreateAPIView(InfrastructureRBACMixin, generics.ListCreateAPIView):
    queryset = PointsCoupures.objects.all()
    pagination_class = None  # Désactiver la pagination
    serializer_class = PointsCoupuresSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        chaussee_id = self.request.query_params.get('chaussee_id')
        if chaussee_id:
            qs = qs.filter(chaussee_id=chaussee_id)
        return qs


class PointsCritiquesListCreateAPIView(InfrastructureRBACMixin, generics.ListCreateAPIView):
    queryset = PointsCritiques.objects.all()
    pagination_class = None  # Désactiver la pagination
    serializer_class = PointsCritiquesSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        chaussee_id = self.request.query_params.get('chaussee_id')
        if chaussee_id:
            qs = qs.filter(chaussee_id=chaussee_id)
        return qs


# ==================== INFRASTRUCTURES ====================

class ServicesSantesListCreateAPIView(InfrastructureRBACMixin, generics.ListCreateAPIView):
    queryset = ServicesSantes.objects.all()
    pagination_class = None  # Désactiver la pagination
    serializer_class = ServicesSantesSerializer
    
    def get_queryset(self):
        return super().get_queryset()


class AutresInfrastructuresListCreateAPIView(InfrastructureRBACMixin, generics.ListCreateAPIView):
    queryset = AutresInfrastructures.objects.all()
    pagination_class = None  # Désactiver la pagination
    serializer_class = AutresInfrastructuresSerializer
    
    def get_queryset(self):
        return super().get_queryset()


class BacsListCreateAPIView(InfrastructureRBACMixin, generics.ListCreateAPIView):
    queryset = Bacs.objects.all()
    pagination_class = None  # Désactiver la pagination
    serializer_class = BacsSerializer
    
    def get_queryset(self):
        return super().get_queryset()


class BatimentsAdministratifsListCreateAPIView(InfrastructureRBACMixin, generics.ListCreateAPIView):
    queryset = BatimentsAdministratifs.objects.all()
    pagination_class = None  # Désactiver la pagination
    serializer_class = BatimentsAdministratifsSerializer
    
    def get_queryset(self):
        return super().get_queryset()


class BusesListCreateAPIView(InfrastructureRBACMixin, generics.ListCreateAPIView):
    queryset = Buses.objects.all()
    pagination_class = None  # Désactiver la pagination
    serializer_class = BusesSerializer
    
    def get_queryset(self):
        return super().get_queryset()


class DalotsListCreateAPIView(InfrastructureRBACMixin, generics.ListCreateAPIView):
    queryset = Dalots.objects.all()
    pagination_class = None  # Désactiver la pagination
    serializer_class = DalotsSerializer
    
    def get_queryset(self):
        return super().get_queryset()


class EcolesListCreateAPIView(InfrastructureRBACMixin, generics.ListCreateAPIView):
    queryset = Ecoles.objects.all()
    pagination_class = None  # Désactiver la pagination
    serializer_class = EcolesSerializer
    
    def get_queryset(self):
        return super().get_queryset()


class InfrastructuresHydrauliquesListCreateAPIView(InfrastructureRBACMixin, generics.ListCreateAPIView):
    queryset = InfrastructuresHydrauliques.objects.all()
    pagination_class = None  # Désactiver la pagination
    serializer_class = InfrastructuresHydrauliquesSerializer
    
    def get_queryset(self):
        return super().get_queryset()


class LocalitesListCreateAPIView(InfrastructureRBACMixin, generics.ListCreateAPIView):
    queryset = Localites.objects.all()
    pagination_class = None  # Désactiver la pagination
    serializer_class = LocalitesSerializer
    
    def get_queryset(self):
        return super().get_queryset()


class MarchesListCreateAPIView(InfrastructureRBACMixin, generics.ListCreateAPIView):
    queryset = Marches.objects.all()
    pagination_class = None  # Désactiver la pagination
    serializer_class = MarchesSerializer
    
    def get_queryset(self):
        return super().get_queryset()


class PassagesSubmersiblesListCreateAPIView(InfrastructureRBACMixin, generics.ListCreateAPIView):
    queryset = PassagesSubmersibles.objects.all()
    pagination_class = None  # Désactiver la pagination
    serializer_class = PassagesSubmersiblesSerializer
    
    def get_queryset(self):
        return super().get_queryset()


class PontsListCreateAPIView(InfrastructureRBACMixin, generics.ListCreateAPIView):
    queryset = Ponts.objects.all()
    pagination_class = None  # Désactiver la pagination
    serializer_class = PontsSerializer
    
    def get_queryset(self):
        return super().get_queryset()
    
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.core.exceptions import FieldDoesNotExist

from .models import (
    Piste,
    Chaussees,
    Buses,
    Dalots,
    Ponts,
    PassagesSubmersibles,
    Bacs,
    Ecoles,
    Marches,
    ServicesSantes,
    BatimentsAdministratifs,
    InfrastructuresHydrauliques,
    Localites,
    AutresInfrastructures,
    PointsCoupures,
    PointsCritiques,
)


class InfrastructureUpdateAPIView(APIView):
    """
    API générique pour mettre à jour une ligne d'infrastructure.

    URL attendue : /api/update/<table>/<fid>/
    Exemple       : /api/update/chaussees/2/
    """

    MODEL_MAP = {
        "pistes": Piste,
        "chaussees": Chaussees,
        "buses": Buses,
        "dalots": Dalots,
        "ponts": Ponts,
        "passages_submersibles": PassagesSubmersibles,
        "bacs": Bacs,
        "ecoles": Ecoles,
        "marches": Marches,
        "services_santes": ServicesSantes,
        "batiments_administratifs": BatimentsAdministratifs,
        "infrastructures_hydrauliques": InfrastructuresHydrauliques,
        "localites": Localites,
        "autres_infrastructures": AutresInfrastructures,
        "points_coupures": PointsCoupures,
        "points_critiques": PointsCritiques,
        "ppr_itial": SiteEnquete,
        "site_enquete": SiteEnquete,
        "enquete_polygone": EnquetePolygone,
    }

    def put(self, request, table, fid):
        # 1) Vérifier que la table est connue
        model = self.MODEL_MAP.get(table)
        if model is None:
            return Response(
                {"success": False, "error": f"Table inconnue: {table}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 2) Récupérer l’objet par sa PK (fid)
        try:
            obj = model.objects.get(pk=fid)
        except model.DoesNotExist:
            return Response(
                {"success": False, "error": f"{table} avec fid={fid} introuvable"},
                status=status.HTTP_404_NOT_FOUND,
            )

        data = request.data or {}

        # On évite de modifier ces champs sensibles
        forbidden = {"fid", "id", "geom", "length_km"}

        # Tous les noms de champs "concrets" du modèle
        valid_field_names = {
            f.name
            for f in model._meta.get_fields()
            if getattr(f, "concrete", False) and not f.auto_created
        }

        updated = {}

        for key, value in data.items():
            # On ignore les champs interdits ou inconnus
            if key in forbidden or key not in valid_field_names:
                continue

            field = model._meta.get_field(key)

            # Si le champ accepte null et qu'on reçoit "", on le convertit en None
            if value == "" and getattr(field, "null", False):
                value = None

            setattr(obj, key, value)
            updated[key] = value

        if not updated:
            # Ici tu aurais un 400 avec le message ci-dessous → utile pour debug
            return Response(
                {
                    "success": False,
                    "error": "Aucun champ valide à mettre à jour pour cette table.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        obj.save()

        # ===== LOG HISTORIQUE WEB =====
        try:
            user_id = None
            try:
                from rest_framework_simplejwt.authentication import JWTAuthentication
                auth = JWTAuthentication()
                raw_token = auth.get_raw_token(auth.get_header(request))
                validated = auth.get_validated_token(raw_token)
                user_id = validated['user_id']
            except Exception:
                pass

            import json
            ActionHistory.objects.create(
                login_id=user_id,
                action_type='update',
                table_name=table,
                record_id=fid,
                record_label=str(obj),
                details=json.dumps(updated),
                source='web',
            )
        except Exception as e:
            print(f"⚠️ Erreur log action web: {e}")

        return Response(
            {
                "success": True,
                "fid": obj.pk,
                "updated_fields": updated,
            },
            status=status.HTTP_200_OK,
        )


class EnquetePolygoneListCreateAPIView(InfrastructureRBACMixin, generics.ListCreateAPIView):
    queryset = EnquetePolygone.objects.all()
    pagination_class = None
    serializer_class = EnquetePolygoneSerializer

    def get_queryset(self):
        return super().get_queryset()


class PprItialListCreateAPIView(InfrastructureRBACMixin, generics.ListCreateAPIView):
    queryset = PprItial.objects.all()
    pagination_class = None
    serializer_class = PprItialSerializer

    def get_queryset(self):
        return super().get_queryset()


class ActionHistoryAPIView(APIView):
    """
    GET : Lire l'historique des actions avec filtres et pagination.
    """

    def get(self, request):
        qs = ActionHistory.objects.select_related(
            'login',
            'login__communes_rurales_id',
            'login__communes_rurales_id__prefectures_id',
            'login__communes_rurales_id__prefectures_id__regions_id',
        ).all()

        # Filtres
        login_id = request.GET.get('login_id')
        action_type = request.GET.get('action_type')
        table_name = request.GET.get('table_name')
        source = request.GET.get('source')
        date_from = request.GET.get('date_from')
        date_to = request.GET.get('date_to')

        if login_id:
            qs = qs.filter(login_id=login_id)
        if action_type:
            qs = qs.filter(action_type=action_type)
        if table_name:
            qs = qs.filter(table_name=table_name)
        if source:
            qs = qs.filter(source=source)
        if date_from:
            qs = qs.filter(created_at__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__lte=date_to + ' 23:59:59')

        # Pagination simple
        page = int(request.GET.get('page', 1))
        per_page = int(request.GET.get('per_page', 20))
        total = qs.count()
        offset = (page - 1) * per_page
        actions = qs[offset:offset + per_page]

        serializer = ActionHistorySerializer(actions, many=True)

        # Stats rapides
        from django.db.models import Count
        today = timezone.now().date()
        stats = ActionHistory.objects.filter(
            created_at__date=today
        ).aggregate(
            total_today=Count('id'),
            creates_today=Count('id', filter=models.Q(action_type='create')),
            updates_today=Count('id', filter=models.Q(action_type='update')),
            deletes_today=Count('id', filter=models.Q(action_type='delete')),
            logins_today=Count('id', filter=models.Q(action_type='login')),
            syncs_today=Count('id', filter=models.Q(action_type='sync_upload')),
        )

        return Response({
            'results': serializer.data,
            'total': total,
            'page': page,
            'per_page': per_page,
            'total_pages': (total + per_page - 1) // per_page,
            'stats': stats,
        }, status=status.HTTP_200_OK)