#

from django.urls import path, include # type: ignore
from rest_framework_simplejwt.views import TokenRefreshView # type: ignore
from .views import *
from .spatial_views import *
from .temporal_views import *
from .geographic_api import *
from .update_views import InfrastructureUpdateAPIView




urlpatterns = [
    # ==================== AUTHENTIFICATION ====================
    path('api/login/', LoginAPIView.as_view(), name='api-login'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('api/users/', UserManagementAPIView.as_view(), name='api-user-management'),
    path('api/users/<int:user_id>/', UserManagementAPIView.as_view(), name='api-user-detail'),
    
    # ==================== RBAC MANAGEMENT ====================
    path('api/users/<int:user_id>/regions/', UserRegionsAPIView.as_view(), name='api-user-regions'),
    path('api/users/<int:user_id>/prefectures/', UserPrefecturesAPIView.as_view(), name='api-user-prefectures'),
    path('api/users/<int:user_id>/interfaces/', UserInterfacesAPIView.as_view(), name='api-user-interfaces'),
    path('api/users/<int:user_id>/permissions/', UserPermissionsAPIView.as_view(), name='api-user-permissions'),

    # ==================== GEOGRAPHIE ====================
    path('api/geography/hierarchy/', GeographyHierarchyAPIView.as_view(), name='api-geography-hierarchy'),
    path('api/geography/zoom/', ZoomToLocationAPIView.as_view(), name='api-geography-zoom'),
    path('api/geography/boundaries/', AdministrativeBoundariesAPIView.as_view(), name='api-geography-boundaries'),
    
    path('api/regions/', RegionsListCreateAPIView.as_view(), name='api-regions'),
    path('api/prefectures/', PrefecturesListCreateAPIView.as_view(), name='api-prefectures'),
    path('api/communes_rurales/', CommunesRuralesListCreateAPIView.as_view(), name='api-communes-rurales'),

    # ==================== INFRASTRUCTURES ROUTIERES ====================
    path('api/pistes/', PisteListCreateAPIView.as_view(), name='api-pistes'),
    path('api/pistes/web/', PisteWebListAPIView.as_view(), name='pistes-web-list'),
    path('api/chaussees/', ChausseesListCreateAPIView.as_view(), name='api-chaussees'),
    path('api/points_coupures/', PointsCoupuresListCreateAPIView.as_view(), name='api-points-coupures'),
    path('api/points_critiques/', PointsCritiquesListCreateAPIView.as_view(), name='api-points-critiques'),

    # ==================== INFRASTRUCTURES SOCIALES ====================
    path('api/services_santes/', ServicesSantesListCreateAPIView.as_view(), name='api-services-santes'),
    path('api/ecoles/', EcolesListCreateAPIView.as_view(), name='api-ecoles'),
    path('api/batiments_administratifs/', BatimentsAdministratifsListCreateAPIView.as_view(), name='api-batiments-administratifs'),
    path('api/marches/', MarchesListCreateAPIView.as_view(), name='api-marches'),

    # ==================== INFRASTRUCTURES HYDRAULIQUES ====================
    path('api/buses/', BusesListCreateAPIView.as_view(), name='api-buses'),
    path('api/dalots/', DalotsListCreateAPIView.as_view(), name='api-dalots'),
    path('api/ponts/', PontsListCreateAPIView.as_view(), name='api-ponts'),
    path('api/bacs/', BacsListCreateAPIView.as_view(), name='api-bacs'),
    path('api/passages_submersibles/', PassagesSubmersiblesListCreateAPIView.as_view(), name='api-passages-submersibles'),
    path('api/infrastructures_hydrauliques/', InfrastructuresHydrauliquesListCreateAPIView.as_view(), name='api-infrastructures-hydrauliques'),

    # ==================== AUTRES INFRASTRUCTURES ====================
    path('api/localites/', LocalitesListCreateAPIView.as_view(), name='api-localites'),
    path('api/autres_infrastructures/', AutresInfrastructuresListCreateAPIView.as_view(), name='api-autres-infrastructures'),

    # ==================== ENQUETES ====================
    path('api/ppr_itial/', PprItialListCreateAPIView.as_view(), name='api-ppr-itial'),          # conservé pour compatibilité frontend
    path('api/site_enquete/', PprItialListCreateAPIView.as_view(), name='api-site-enquete'),    # nouvelle URL
    path('api/enquete_polygone/', EnquetePolygoneListCreateAPIView.as_view(), name='api-enquete-polygone'),

    # ==================== ANALYSES ====================
    path('api/temporal-analysis/', TemporalAnalysisAPIView.as_view(), name='api-temporal-analysis'),
    
    # ==================== ROUTES SPATIALES ====================
    path('', include('api.spatial_urls')),

    # ==================== MISE A JOUR GENERIQUE ====================
    path(
        'api/update/<str:table>/<int:fid>/',
        InfrastructureUpdateAPIView.as_view(),
        name='api-update-infrastructure',
    ),

    path('api/password-reset-requests/', PasswordResetRequestsAPIView.as_view(), name='api-password-reset-requests'),

    path('api/action-history/', ActionHistoryAPIView.as_view(), name='api-action-history'),
]