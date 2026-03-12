from rest_framework import serializers # type: ignore
from rest_framework_gis.serializers import GeoFeatureModelSerializer # type: ignore
from rest_framework_gis.fields import GeometryField # type: ignore
from django.contrib.gis.geos import Point, LineString, MultiLineString, GEOSGeometry # type: ignore
from .models import *


# ==================== GEOGRAPHIE ====================

class RegionSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = Region
        geo_field = "geom"
        fields = '__all__'


class PrefectureSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = Prefecture
        geo_field = "geom"
        fields = '__all__'


class CommuneRuraleSerializer(GeoFeatureModelSerializer):
    prefecture_nom = serializers.CharField(source='prefectures_id.nom', read_only=True)
    prefecture_id = serializers.IntegerField(source='prefectures_id.id', read_only=True)
    region_nom = serializers.CharField(source='prefectures_id.regions_id.nom', read_only=True)
    region_id = serializers.IntegerField(source='prefectures_id.regions_id.id', read_only=True)
    localisation_complete = serializers.SerializerMethodField()
    
    class Meta:
        model = CommuneRurale
        geo_field = "geom"
        fields = '__all__'
    
    def get_localisation_complete(self, obj):
        prefecture = obj.prefectures_id.nom if obj.prefectures_id else "N/A"
        region = obj.prefectures_id.regions_id.nom if obj.prefectures_id and obj.prefectures_id.regions_id else "N/A"
        return f"{obj.nom}, {prefecture}, {region}"


# ==================== UTILISATEURS ====================

class LoginSerializer(serializers.ModelSerializer):
    """Enhanced serializer with RBAC support"""
    commune_complete = serializers.ReadOnlyField()
    commune_nom = serializers.CharField(source='communes_rurales_id.nom', read_only=True)
    prefecture_nom = serializers.CharField(source='communes_rurales_id.prefectures_id.nom', read_only=True)
    prefecture_id = serializers.IntegerField(source='communes_rurales_id.prefectures_id.id', read_only=True)
    region_nom = serializers.CharField(source='communes_rurales_id.prefectures_id.regions_id.nom', read_only=True)
    region_id = serializers.IntegerField(source='communes_rurales_id.prefectures_id.regions_id.id', read_only=True)
    
    # New RBAC fields
    assigned_regions = serializers.SerializerMethodField()
    assigned_prefectures = serializers.SerializerMethodField()
    allowed_interfaces = serializers.SerializerMethodField()
    is_admin = serializers.SerializerMethodField()

    class Meta:
        model = Login
        fields = [
            'id', 'nom', 'prenom', 'mail', 'role', 'communes_rurales_id',
            'commune_complete', 'commune_nom', 'prefecture_nom', 'prefecture_id',
            'region_nom', 'region_id', 'is_active', 'last_login',
            'assigned_regions', 'assigned_prefectures', 'allowed_interfaces', 'is_admin'
        ]
    
    def get_assigned_regions(self, obj):
        """Get list of assigned regions for BTGR users"""
        if obj.is_btgr():
            return list(UserRegion.objects.filter(login=obj).values(
                'region_id', 'region__nom'
            ))
        return []
    
    def get_assigned_prefectures(self, obj):
        """Get list of assigned prefectures for SPGR users"""
        if obj.is_spgr():
            return list(UserPrefecture.objects.filter(login=obj).values(
                'prefecture_id', 'prefecture__nom'
            ))
        return []
    
    def get_allowed_interfaces(self, obj):
        """Get list of allowed interfaces"""
        return obj.get_allowed_interfaces()
    
    def get_is_admin(self, obj):
        """Check if user is admin"""
        return obj.is_admin()


class UserRegionSerializer(serializers.ModelSerializer):
    """Serializer for user-region assignments"""
    region_nom = serializers.CharField(source='region.nom', read_only=True)
    user_nom = serializers.CharField(source='login.nom', read_only=True)
    user_prenom = serializers.CharField(source='login.prenom', read_only=True)
    
    class Meta:
        model = UserRegion
        fields = ['id', 'login', 'region', 'region_nom', 'user_nom', 'user_prenom', 'created_at']
        read_only_fields = ['created_at']


class UserPrefectureSerializer(serializers.ModelSerializer):
    """Serializer for user-prefecture assignments"""
    prefecture_nom = serializers.CharField(source='prefecture.nom', read_only=True)
    user_nom = serializers.CharField(source='login.nom', read_only=True)
    user_prenom = serializers.CharField(source='login.prenom', read_only=True)
    
    class Meta:
        model = UserPrefecture
        fields = ['id', 'login', 'prefecture', 'prefecture_nom', 'user_nom', 'user_prenom', 'created_at']
        read_only_fields = ['created_at']


class UserInterfacePermissionSerializer(serializers.ModelSerializer):
    """Serializer for user interface permissions"""
    interface_display = serializers.CharField(source='get_interface_name_display', read_only=True)
    user_nom = serializers.CharField(source='login.nom', read_only=True)
    user_prenom = serializers.CharField(source='login.prenom', read_only=True)
    
    class Meta:
        model = UserInterfacePermission
        fields = ['id', 'login', 'interface_name', 'interface_display', 'user_nom', 'user_prenom', 'created_at']
        read_only_fields = ['created_at']


class UserCreateSerializer(serializers.ModelSerializer):
    """Enhanced serializer for creating users with RBAC support"""
    communes_rurales_id = serializers.PrimaryKeyRelatedField(
        queryset=CommuneRurale.objects.all(),
        required=False,
        allow_null=True
    )
    commune_id = serializers.PrimaryKeyRelatedField(
        queryset=CommuneRurale.objects.all(),
        required=False,
        allow_null=True,
        write_only=True
    )
    
    # RBAC fields
    region_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        write_only=True,
        help_text="List of region IDs for BTGR users"
    )
    prefecture_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        write_only=True,
        help_text="List of prefecture IDs for SPGR users"
    )
    interface_names = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        write_only=True,
        help_text="List of interface names the user can access"
    )
    
    class Meta:
        model = Login
        fields = [
            'nom', 'prenom', 'mail', 'mdp', 'role', 'communes_rurales_id', 'commune_id',
            'region_ids', 'prefecture_ids', 'interface_names'
        ]
    
    def validate(self, attrs):
        if 'commune_id' in attrs and attrs['commune_id']:
            attrs['communes_rurales_id'] = attrs.pop('commune_id')
        return attrs
    
    def validate_role(self, value):
        """Validate role is one of the allowed values"""
        valid_roles = ['Super_admin', 'Admin', 'BTGR', 'SPGR']
        if value not in valid_roles:
            raise serializers.ValidationError(f"Role invalide. Valeurs autorisees : {valid_roles}")
        return value
    
    def validate_mail(self, value):
        """Ensure email is unique"""
        if Login.objects.filter(mail=value).exists():
            raise serializers.ValidationError("Cette adresse email est deja utilisee.")
        return value
    
    def validate_region_ids(self, value):
        """Validate region IDs exist"""
        if value:
            existing_ids = set(Region.objects.filter(id__in=value).values_list('id', flat=True))
            invalid_ids = set(value) - existing_ids
            if invalid_ids:
                raise serializers.ValidationError(f"Regions invalides: {invalid_ids}")
        return value
    
    def validate_prefecture_ids(self, value):
        """Validate prefecture IDs exist"""
        if value:
            existing_ids = set(Prefecture.objects.filter(id__in=value).values_list('id', flat=True))
            invalid_ids = set(value) - existing_ids
            if invalid_ids:
                raise serializers.ValidationError(f"Prefectures invalides: {invalid_ids}")
        return value
    
    def validate_interface_names(self, value):
        """Validate interface names"""
        if value:
            valid_interfaces = [choice[0] for choice in UserInterfacePermission.INTERFACE_CHOICES]
            invalid = set(value) - set(valid_interfaces)
            if invalid:
                raise serializers.ValidationError(f"Interfaces invalides: {invalid}")
        return value
    
    def create(self, validated_data):
        """Create user with RBAC assignments"""
        # Extract RBAC data
        region_ids = validated_data.pop('region_ids', [])
        prefecture_ids = validated_data.pop('prefecture_ids', [])
        interface_names = validated_data.pop('interface_names', [])
        
        # Create user
        user = Login.objects.create(**validated_data)
        
        # Assign regions (for BTGR)
        if region_ids and user.role == 'BTGR':
            for region_id in region_ids:
                UserRegion.objects.create(login=user, region_id=region_id)
        
        # Assign prefectures (for SPGR)
        if prefecture_ids and user.role == 'SPGR':
            for prefecture_id in prefecture_ids:
                UserPrefecture.objects.create(login=user, prefecture_id=prefecture_id)
        
        # Assign interfaces (for BTGR and SPGR)
        if interface_names and user.role in ['BTGR', 'SPGR']:
            for interface_name in interface_names:
                UserInterfacePermission.objects.create(login=user, interface_name=interface_name)
        
        # Super_admin and Admin get all interfaces automatically
        if user.role in ['Super_admin', 'Admin']:
            for interface_name, _ in UserInterfacePermission.INTERFACE_CHOICES:
                UserInterfacePermission.objects.get_or_create(login=user, interface_name=interface_name)
        
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    """Enhanced serializer for updating users with RBAC support"""
    communes_rurales_id = serializers.IntegerField(required=False, allow_null=True)
    
    # RBAC fields
    region_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        write_only=True
    )
    prefecture_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        write_only=True
    )
    interface_names = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        write_only=True
    )
    
    class Meta:
        model = Login
        fields = [
            'nom', 'prenom', 'mail', 'role', 'communes_rurales_id', 'is_active',
            'region_ids', 'prefecture_ids', 'interface_names'
        ]
    
    def validate_communes_rurales_id(self, value):
        """Verify commune exists if provided"""
        if value is not None:
            try:
                CommuneRurale.objects.get(id=value)
                return value
            except CommuneRurale.DoesNotExist:
                raise serializers.ValidationError("Cette commune n'existe pas.")
        return value
    
    def validate_mail(self, value):
        """Verify email is unique when modifying"""
        instance = getattr(self, 'instance', None)
        
        if instance and instance.mail != value:
            if Login.objects.filter(mail=value).exists():
                raise serializers.ValidationError("Cette adresse email est deja utilisee.")
        
        return value
    
    def validate_role(self, value):
        """Verify role is valid"""
        valid_roles = ['Super_admin', 'Admin', 'BTGR', 'SPGR']
        if value and value not in valid_roles:
            raise serializers.ValidationError(f"Role invalide. Valeurs autorisees : {valid_roles}")
        return value
    
    def update(self, instance, validated_data):
        """Update user with RBAC assignments"""
        # Extract RBAC data
        region_ids = validated_data.pop('region_ids', None)
        prefecture_ids = validated_data.pop('prefecture_ids', None)
        interface_names = validated_data.pop('interface_names', None)
        
        # Extract commune_id
        commune_id = validated_data.pop('communes_rurales_id', None)
        
        # Update basic fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        
        # Handle commune assignment
        if commune_id is not None:
            try:
                commune = CommuneRurale.objects.get(id=commune_id)
                instance.communes_rurales_id = commune
            except CommuneRurale.DoesNotExist:
                pass
        else:
            instance.communes_rurales_id = None
        
        instance.save()
        
        # Update regions (for BTGR)
        if region_ids is not None:
            UserRegion.objects.filter(login=instance).delete()
            if instance.role == 'BTGR':
                for region_id in region_ids:
                    UserRegion.objects.create(login=instance, region_id=region_id)
        
        # Update prefectures (for SPGR)
        if prefecture_ids is not None:
            UserPrefecture.objects.filter(login=instance).delete()
            if instance.role == 'SPGR':
                for prefecture_id in prefecture_ids:
                    UserPrefecture.objects.create(login=instance, prefecture_id=prefecture_id)
        
        # Update interfaces
        if interface_names is not None:
            UserInterfacePermission.objects.filter(login=instance).delete()
            if instance.role in ['BTGR', 'SPGR']:
                for interface_name in interface_names:
                    UserInterfacePermission.objects.create(login=instance, interface_name=interface_name)
            elif instance.role in ['Super_admin', 'Admin']:
                # Grant all interfaces to admins
                for interface_name, _ in UserInterfacePermission.INTERFACE_CHOICES:
                    UserInterfacePermission.objects.get_or_create(login=instance, interface_name=interface_name)
        
        return instance


# ==================== PISTES ====================

class PisteWriteSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = Piste
        geo_field = "geom"
        fields = "__all__"

    def to_internal_value(self, data):
        if 'geom' in data and data['geom'] is not None:
            geom = GEOSGeometry(str(data['geom']))
            geom.srid = 32628
            data['geom'] = geom
        return super().to_internal_value(data)


class PisteReadSerializer(GeoFeatureModelSerializer):
    geom = GeometryField(read_only=True)

    # ✅ Ces 3 champs sont NÉCESSAIRES pour le Dashboard
    utilisateur = serializers.SerializerMethodField()
    commune = serializers.SerializerMethodField()
    kilometrage = serializers.SerializerMethodField()

    # Geographic hierarchy for filtering
    region_id = serializers.IntegerField(source='communes_rurales_id.prefectures_id.regions_id.id', read_only=True)
    prefecture_id = serializers.IntegerField(source='communes_rurales_id.prefectures_id.id', read_only=True)
    commune_id = serializers.IntegerField(source='communes_rurales_id.id', read_only=True)

    # ✅ Noms affichés dans la popup de la carte
    commune_nom = serializers.CharField(source='communes_rurales_id.nom', read_only=True, default='N/A')
    prefecture_nom = serializers.CharField(source='communes_rurales_id.prefectures_id.nom', read_only=True, default='N/A')
    region_nom = serializers.CharField(source='communes_rurales_id.prefectures_id.regions_id.nom', read_only=True, default='N/A')

    class Meta:
        model = Piste
        geo_field = "geom"
        fields = '__all__'
    
    def get_utilisateur(self, obj):
        if obj.login_id:
            return f"{obj.login_id.nom} {obj.login_id.prenom}".strip()
        return "Non assigné"
    
    def get_commune(self, obj):
        if obj.communes_rurales_id:
            return obj.communes_rurales_id.nom
        return "N/A"
    
    def get_kilometrage(self, obj):
        if obj.geom and obj.geom.geom_type == 'MultiLineString':
            try:
                geom_utm = obj.geom.transform(32628, clone=True)
                return round(geom_utm.length / 1000, 2)
            except Exception as e:
                return 0.0
        return 0.0

class PisteWebSerializer(GeoFeatureModelSerializer):
    """Serializer ultra-léger pour web"""
    
    geom = GeometryField(read_only=True)
    utilisateur = serializers.SerializerMethodField()
    date = serializers.SerializerMethodField()  # Calculé depuis created_at
    
    region_id = serializers.IntegerField(source='communes_rurales_id.prefectures_id.regions_id.id', read_only=True)
    prefecture_id = serializers.IntegerField(source='communes_rurales_id.prefectures_id.id', read_only=True)
    
    def get_utilisateur(self, obj):
        if obj.login_id:
            return f"{obj.login_id.nom} {obj.login_id.prenom}".strip()
        return "Non assigné"
    
    def get_date(self, obj):
        """Retourner created_at formaté comme date"""
        if obj.created_at:
            return obj.created_at.date()
        return None
    
    class Meta:
        model = Piste
        geo_field = "geom"
        fields = [
            'id',
            'code_piste',
            'date',  # ← SerializerMethodField (calculé)
            'utilisateur',
            'nom_origine_piste',
            'nom_destination_piste',
            'geom',
            'region_id',
            'prefecture_id',
            'communes_rurales_id',
        ]


# ==================== INFRASTRUCTURES ====================

class ServicesSantesSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = ServicesSantes
        geo_field = "geom"
        fields = '__all__'
        extra_kwargs = {
            'fid': {'required': False},
            'sqlite_id': {'required': False, 'allow_null': True},
        }
    
    def to_internal_value(self, data):
        if 'x_sante' in data and 'y_sante' in data:
            x = float(data['x_sante'])
            y = float(data['y_sante'])
            data['geom'] = Point(x, y, srid=4326)
        return super().to_internal_value(data)


class AutresInfrastructuresSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = AutresInfrastructures
        geo_field = "geom"
        fields = '__all__'
        extra_kwargs = {
            'fid': {'required': False},
            'sqlite_id': {'required': False, 'allow_null': True},
        }
    
    def to_internal_value(self, data):
        # CORRECTION: Utiliser x_autre_in et y_autre_in (noms reels)
        if 'x_autre_in' in data and 'y_autre_in' in data:
            x = float(data['x_autre_in'])
            y = float(data['y_autre_in'])
            data['geom'] = Point(x, y, srid=4326)
        return super().to_internal_value(data)


class BacsSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = Bacs
        geo_field = "geom"
        fields = '__all__'
        extra_kwargs = {
            'fid': {'required': False},
            'sqlite_id': {'required': False, 'allow_null': True},
        }
    
    def to_internal_value(self, data):
        if ('x_debut_tr' in data and 'y_debut_tr' in data and 
            'x_fin_trav' in data and 'y_fin_trav' in data):
            x_debut = float(data['x_debut_tr'])
            y_debut = float(data['y_debut_tr'])
            x_fin = float(data['x_fin_trav'])
            y_fin = float(data['y_fin_trav'])
            data['geom'] = LineString((x_debut, y_debut), (x_fin, y_fin), srid=4326)
        return super().to_internal_value(data)


class BatimentsAdministratifsSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = BatimentsAdministratifs
        geo_field = "geom"
        fields = '__all__'
        extra_kwargs = {
            'fid': {'required': False},
            'sqlite_id': {'required': False, 'allow_null': True},
        }
    
    def to_internal_value(self, data):
        # CORRECTION: Utiliser x_batiment et y_batiment (noms reels)
        if 'x_batiment' in data and 'y_batiment' in data:
            x = float(data['x_batiment'])
            y = float(data['y_batiment'])
            data['geom'] = Point(x, y, srid=4326)
        return super().to_internal_value(data)


class BusesSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = Buses
        geo_field = "geom"
        fields = '__all__'
        extra_kwargs = {
            'fid': {'required': False},
            'sqlite_id': {'required': False, 'allow_null': True},
        }
    
    def to_internal_value(self, data):
        if 'x_buse' in data and 'y_buse' in data:
            x = float(data['x_buse'])
            y = float(data['y_buse'])
            data['geom'] = Point(x, y, srid=4326)
        return super().to_internal_value(data)


class DalotsSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = Dalots
        geo_field = "geom"
        fields = '__all__'
        extra_kwargs = {
            'fid': {'required': False},
            'sqlite_id': {'required': False, 'allow_null': True},
        }
    
    def to_internal_value(self, data):
        if 'x_dalot' in data and 'y_dalot' in data:
            x = float(data['x_dalot'])
            y = float(data['y_dalot'])
            data['geom'] = Point(x, y, srid=4326)
        return super().to_internal_value(data)


class EcolesSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = Ecoles
        geo_field = "geom"
        fields = '__all__'
        extra_kwargs = {
            'fid': {'required': False},
            'sqlite_id': {'required': False, 'allow_null': True},
        }
    
    def to_internal_value(self, data):
        if 'x_ecole' in data and 'y_ecole' in data:
            x = float(data['x_ecole'])
            y = float(data['y_ecole'])
            data['geom'] = Point(x, y, srid=4326)
        return super().to_internal_value(data)


class InfrastructuresHydrauliquesSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = InfrastructuresHydrauliques
        geo_field = "geom"
        fields = '__all__'
        extra_kwargs = {
            'fid': {'required': False},
            'sqlite_id': {'required': False, 'allow_null': True},
        }
    
    def to_internal_value(self, data):
        if 'x_infrastr' in data and 'y_infrastr' in data:
            x = float(data['x_infrastr'])
            y = float(data['y_infrastr'])
            data['geom'] = Point(x, y, srid=4326)
        return super().to_internal_value(data)


class LocalitesSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = Localites
        geo_field = "geom"
        fields = '__all__'
        extra_kwargs = {
            'fid': {'required': False},
            'sqlite_id': {'required': False, 'allow_null': True},
        }
    
    def to_internal_value(self, data):
        if 'x_localite' in data and 'y_localite' in data:
            x = float(data['x_localite'])
            y = float(data['y_localite'])
            data['geom'] = Point(x, y, srid=4326)
        return super().to_internal_value(data)


class MarchesSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = Marches
        geo_field = "geom"
        fields = '__all__'
        extra_kwargs = {
            'fid': {'required': False},
            'sqlite_id': {'required': False, 'allow_null': True},
        }
    
    def to_internal_value(self, data):
        if 'x_marche' in data and 'y_marche' in data:
            x = float(data['x_marche'])
            y = float(data['y_marche'])
            data['geom'] = Point(x, y, srid=4326)
        return super().to_internal_value(data)


class PassagesSubmersiblesSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = PassagesSubmersibles
        geo_field = "geom"
        fields = "__all__"
        extra_kwargs = {
            "fid": {"required": False},
            "sqlite_id": {"required": False, "allow_null": True},
        }

    def to_internal_value(self, data):
        if all(k in data for k in ("x_debut_pa", "y_debut_pa", "x_fin_pass", "y_fin_pass")):
            x_debut = float(data["x_debut_pa"])
            y_debut = float(data["y_debut_pa"])
            x_fin = float(data["x_fin_pass"])
            y_fin = float(data["y_fin_pass"])
            data["geom"] = LineString((y_debut, x_debut), (y_fin, x_fin), srid=4326)
        return super().to_internal_value(data)


class PontsSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = Ponts
        geo_field = "geom"
        fields = '__all__'
        extra_kwargs = {
            'fid': {'required': False},
            'sqlite_id': {'required': False, 'allow_null': True},
        }
    
    def to_internal_value(self, data):
        if 'x_pont' in data and 'y_pont' in data:
            x = float(data['x_pont'])
            y = float(data['y_pont'])
            data['geom'] = Point(x, y, srid=4326)
        return super().to_internal_value(data)


class CommuneSearchSerializer(serializers.ModelSerializer):
    prefecture_nom = serializers.CharField(source='prefectures_id.nom', read_only=True)
    region_nom = serializers.CharField(source='prefectures_id.regions_id.nom', read_only=True)
    localisation_complete = serializers.SerializerMethodField()
    
    class Meta:
        model = CommuneRurale
        fields = ['id', 'nom', 'prefecture_nom', 'region_nom', 'localisation_complete']
    
    def get_localisation_complete(self, obj):
        prefecture = obj.prefectures_id.nom if obj.prefectures_id else "N/A"
        region = obj.prefectures_id.regions_id.nom if obj.prefectures_id and obj.prefectures_id.regions_id else "N/A"
        return f"{obj.nom}, {prefecture}, {region}"


class ChausseesSerializer(GeoFeatureModelSerializer):
    # ✅ Ce champ est NÉCESSAIRE pour afficher "Chaussées: 2 (3.2 km)"
    length_km = serializers.SerializerMethodField()
    commune_nom = serializers.CharField(source='communes_rurales_id.nom', read_only=True, default='N/A')
    prefecture_nom = serializers.CharField(source='communes_rurales_id.prefectures_id.nom', read_only=True, default='N/A')
    region_nom = serializers.CharField(source='communes_rurales_id.prefectures_id.regions_id.nom', read_only=True, default='N/A')

    class Meta:
        model = Chaussees
        geo_field = "geom"
        fields = "__all__"
        extra_kwargs = {'fid': {'required': False}}

    def to_internal_value(self, data):
        # ... code existant ...
        return super().to_internal_value(data)
    
    def get_length_km(self, obj):
        if obj.geom and obj.geom.geom_type == 'MultiLineString':
            try:
                geom_utm = obj.geom.transform(32628, clone=True)
                return round(geom_utm.length / 1000, 2)
            except Exception as e:
                return 0.0
        return 0.0


class PointsCoupuresSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = PointsCoupures
        geo_field = "geom"
        fields = '__all__'
        extra_kwargs = {
            'fid': {'required': False},
            'sqlite_id': {'required': False, 'allow_null': True},
        }

    def to_internal_value(self, data):
        """Generation automatique de geometrie depuis coordonnees"""
        if 'x_point_co' in data and 'y_point_co' in data and not data.get('geom'):
            x = float(data['x_point_co'])
            y = float(data['y_point_co'])
            data['geom'] = Point(x, y, srid=4326)
        return super().to_internal_value(data)


class PointsCritiquesSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = PointsCritiques
        geo_field = "geom"
        fields = '__all__'
        extra_kwargs = {
            'fid': {'required': False},
            'sqlite_id': {'required': False, 'allow_null': True},
        }

    def to_internal_value(self, data):
        """Generation automatique de geometrie depuis coordonnees"""
        if 'x_point_cr' in data and 'y_point_cr' in data and not data.get('geom'):
            x = float(data['x_point_cr'])
            y = float(data['y_point_cr'])
            data['geom'] = Point(x, y, srid=4326)
        return super().to_internal_value(data)

class PisteDashboardSerializer(serializers.Serializer):
    """Serializer pour dashboard - Basé sur l'ancien backend web"""
    
    id = serializers.IntegerField()
    code_piste = serializers.CharField()
    created_at = serializers.DateTimeField()
    utilisateur = serializers.SerializerMethodField()
    commune = serializers.SerializerMethodField()
    commune_id = serializers.SerializerMethodField()
    prefecture_id = serializers.SerializerMethodField()
    prefecture_nom = serializers.SerializerMethodField()
    region_id = serializers.SerializerMethodField()
    region_nom = serializers.SerializerMethodField()
    kilometrage = serializers.SerializerMethodField()
    infrastructures_par_type = serializers.SerializerMethodField()
    
    def get_utilisateur(self, obj):
        if hasattr(obj, 'login_id') and obj.login_id:
            return f"{obj.login_id.nom} {obj.login_id.prenom}".strip()
        return "Non assigné"
    
    def get_commune(self, obj):
        if hasattr(obj, 'communes_rurales_id') and obj.communes_rurales_id:
            return obj.communes_rurales_id.nom
        return "N/A"

    def get_commune_id(self, obj):
        if hasattr(obj, 'communes_rurales_id') and obj.communes_rurales_id:
            return obj.communes_rurales_id.id
        return None

    def get_prefecture_id(self, obj):
        if (hasattr(obj, 'communes_rurales_id') and obj.communes_rurales_id and 
            obj.communes_rurales_id.prefectures_id):
            return obj.communes_rurales_id.prefectures_id.id
        return None

    def get_region_id(self, obj):
        if (hasattr(obj, 'communes_rurales_id') and obj.communes_rurales_id and
            obj.communes_rurales_id.prefectures_id and
            obj.communes_rurales_id.prefectures_id.regions_id):
            return obj.communes_rurales_id.prefectures_id.regions_id.id
        return None

    def get_prefecture_nom(self, obj):
        if (hasattr(obj, 'communes_rurales_id') and obj.communes_rurales_id and
                obj.communes_rurales_id.prefectures_id):
            return obj.communes_rurales_id.prefectures_id.nom
        return "N/A"

    def get_region_nom(self, obj):
        if (hasattr(obj, 'communes_rurales_id') and obj.communes_rurales_id and
                obj.communes_rurales_id.prefectures_id and
                obj.communes_rurales_id.prefectures_id.regions_id):
            return obj.communes_rurales_id.prefectures_id.regions_id.nom
        return "N/A"

    def get_kilometrage(self, obj):
        """Calculer la longueur exacte de la piste en km en transformant le SRID en métrique"""
        if not obj.geom:
            return 0
        
        try:
            # Transformer la géométrie de 4326 vers 32628 (UTM Zone 28N)
            geom_utm = obj.geom.transform(32628, clone=True)
            length_m = geom_utm.length  # longueur en mètres
            length_km = round(length_m / 1000, 2)  # conversion en km
            return length_km
        except Exception as e:
            print(f"⚠️ Erreur calcul longueur piste {obj.id}: {e}")
            return 0

    
    def get_infrastructures_par_type(self, obj):
        """Retourner les compteurs déjà calculés par annotate()"""
        
        # ⭐ CHAUSSÉES avec compteur ET kilométrage
        chaussees_qs = Chaussees.objects.filter(code_piste=obj)
        chaussees_count = chaussees_qs.count()
        
        # Calculer la longueur totale en mètres
        total_length_m = 0
        for chaussee in chaussees_qs:
            if chaussee.geom:
                try:
                    # Transformer en SRID 32628 (UTM Zone 28N pour Guinée)
                    geom_utm = chaussee.geom.transform(32628, clone=True)
                    total_length_m += geom_utm.length  # longueur en mètres
                except Exception as e:
                    print(f"⚠️ Erreur calcul longueur chaussée {chaussee.fid}: {e}")
                    continue
        
        chaussees_km = round(total_length_m / 1000, 2)  # conversion en km
        
        return {
            'Chaussées': {
                'count': chaussees_count,
                'km': chaussees_km
            },
            'Buses': getattr(obj, 'nb_buses', 0),
            'Ponts': getattr(obj, 'nb_ponts', 0),
            'Dalots': getattr(obj, 'nb_dalots', 0),
            'Bacs': getattr(obj, 'nb_bacs', 0),
            'Écoles': getattr(obj, 'nb_ecoles', 0),
            'Marchés': getattr(obj, 'nb_marches', 0),
            'Services Santé': getattr(obj, 'nb_services_santes', 0),
            'Autres Infrastructures': getattr(obj, 'nb_autres_infrastructures', 0),
            'Bâtiments Administratifs': getattr(obj, 'nb_batiments_administratifs', 0),
            'Infrastructures Hydrauliques': getattr(obj, 'nb_infrastructures_hydrauliques', 0),
            'Localités': getattr(obj, 'nb_localites', 0),
            'Passages Submersibles': getattr(obj, 'nb_passages_submersibles', 0)
        }


class EnquetePolygoneSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = EnquetePolygone
        geo_field = "geom"
        fields = '__all__'


class SiteEnqueteSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = SiteEnquete
        geo_field = "geom"
        fields = '__all__'

    def to_representation(self, instance):
        """Force type='ppr_itial' for clustering et compatibilité frontend"""
        try:
            data = super().to_representation(instance)
            if 'properties' in data:
                # Add commune name
                if instance.commune_id:
                    data['properties']['commune_nom'] = instance.commune_id.nom
                else:
                    data['properties']['commune_nom'] = "N/A"

                # Preserve the original 'type' from database for display
                if 'type' in data['properties']:
                    data['properties']['original_type'] = data['properties']['type']

                data['properties']['type'] = 'ppr_itial'
            return data
        except Exception as e:
            return super().to_representation(instance)


# Alias pour compatibilité
PprItialSerializer = SiteEnqueteSerializer