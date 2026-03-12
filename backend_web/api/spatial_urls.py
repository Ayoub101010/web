#  - Nouvelles routes pour les APIs GeoDjango

from django.urls import path # type: ignore
from .spatial_views import (
    CollectesGeoAPIView,
    CommunesSearchAPIView,
    TypesInfrastructuresAPIView
)
from .temporal_views import *

urlpatterns = [
    # API principale pour récupérer les collectes avec filtrage spatial
    path('api/collectes/', CollectesGeoAPIView.as_view(), name='api-collectes-geo'),
    
    
    # API de recherche communes
    path('api/communes/search/', CommunesSearchAPIView.as_view(), name='api-communes-search'),
    
    # API pour les types d'infrastructures
    path('api/types/', TypesInfrastructuresAPIView.as_view(), name='api-types-infrastructures'),
    path('api/temporal-analysis/', TemporalAnalysisAPIView.as_view(), name='api-temporal-analysis'),
]