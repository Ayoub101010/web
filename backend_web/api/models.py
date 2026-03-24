

from django.contrib.gis.db import models # type: ignore
from django.utils import timezone # type: ignore


class Login(models.Model):
    """
    Modele utilisateur avec support RBAC
    Roles: Super_admin, Admin, BTGR, SPGR
    """
    nom = models.TextField()
    prenom = models.TextField()
    mail = models.TextField(unique=True)
    mdp = models.TextField()
    role = models.TextField()  # Super_admin, Admin, BTGR, SPGR
    
    # Legacy commune assignment (kept for backward compatibility)
    communes_rurales_id = models.ForeignKey(
        'CommuneRurale',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='communes_rurales_id',
        related_name='utilisateurs'
    )
    
    # New RBAC fields
    is_active = models.BooleanField(default=True, null=True, blank=True)
    last_login = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'login'
        managed = False

    def __str__(self):
        return f"{self.nom} {self.prenom} ({self.mail})"
    
    def is_admin(self):
        """Check if user is Super_admin or Admin"""
        return self.role in ['Super_admin', 'Admin']
    
    def is_btgr(self):
        """Check if user is BTGR (regional manager)"""
        return self.role == 'BTGR'
    
    def is_spgr(self):
        """Check if user is SPGR (prefecture manager)"""
        return self.role == 'SPGR'
    
    def has_interface_access(self, interface_name):
        """Check if user has access to a specific interface"""
        if self.is_admin():
            return True
        return UserInterfacePermission.objects.filter(
            login=self,
            interface_name=interface_name
        ).exists()
    
    def get_accessible_regions(self):
        """Get all regions accessible to this user"""
        if self.is_admin():
            return Region.objects.all()
        if self.is_btgr():
            return Region.objects.filter(
                id__in=UserRegion.objects.filter(login=self).values_list('region_id', flat=True)
            )
        if self.is_spgr():
            # SPGR can see regions of their assigned prefectures
            prefecture_ids = UserPrefecture.objects.filter(login=self).values_list('prefecture_id', flat=True)
            return Region.objects.filter(
                id__in=Prefecture.objects.filter(id__in=prefecture_ids).values_list('regions_id', flat=True)
            ).distinct()
        return Region.objects.none()
    
    def get_accessible_prefectures(self):
        """Get all prefectures accessible to this user"""
        if self.is_admin():
            return Prefecture.objects.all()
        if self.is_btgr():
            # BTGR can see all prefectures in their assigned regions
            region_ids = UserRegion.objects.filter(login=self).values_list('region_id', flat=True)
            return Prefecture.objects.filter(regions_id__in=region_ids)
        if self.is_spgr():
            prefecture_ids = UserPrefecture.objects.filter(login=self).values_list('prefecture_id', flat=True)
            return Prefecture.objects.filter(id__in=prefecture_ids)
        return Prefecture.objects.none()
    
    def get_accessible_communes(self):
        """Get all communes accessible to this user"""
        if self.is_admin():
            return CommuneRurale.objects.all()
        if self.is_btgr():
            # BTGR can see all communes in their assigned regions
            region_ids = UserRegion.objects.filter(login=self).values_list('region_id', flat=True)
            prefecture_ids = Prefecture.objects.filter(regions_id__in=region_ids).values_list('id', flat=True)
            return CommuneRurale.objects.filter(prefectures_id__in=prefecture_ids)
        if self.is_spgr():
            # SPGR can see all communes in their assigned prefectures
            prefecture_ids = UserPrefecture.objects.filter(login=self).values_list('prefecture_id', flat=True)
            return CommuneRurale.objects.filter(prefectures_id__in=prefecture_ids)
        return CommuneRurale.objects.none()
    
    def get_allowed_interfaces(self):
        """Get list of interfaces this user can access"""
        if self.is_admin():
            return [
                'carte_globale',
                'gestion_donnees',
                'tableau_bord',
                'gestion_utilisateurs',
                'suivi_donnees',
                'export_carte'
            ]
        return list(UserInterfacePermission.objects.filter(
            login=self
        ).values_list('interface_name', flat=True))

    @property
    def commune_complete(self):
        """Retourne les informations completes de localisation (legacy)"""
        if not self.communes_rurales_id:
            return None
        
        commune = self.communes_rurales_id
        prefecture = commune.prefectures_id if commune.prefectures_id else None
        region = prefecture.regions_id if prefecture and prefecture.regions_id else None
        
        return {
            'commune': commune.nom,
            'commune_id': commune.id,
            'prefecture': prefecture.nom if prefecture else None,
            'prefecture_id': prefecture.id if prefecture else None,
            'region': region.nom if region else None,
            'region_id': region.id if region else None
        }


class UserRegion(models.Model):
    """
    Many-to-many relationship between users and regions
    Used for BTGR role to assign multiple regions
    """
    login = models.ForeignKey(
        Login,
        on_delete=models.CASCADE,
        db_column='login_id',
        related_name='assigned_regions'
    )
    region = models.ForeignKey(
        'Region',
        on_delete=models.CASCADE,
        db_column='region_id',
        related_name='assigned_users'
    )
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    created_by = models.ForeignKey(
        Login,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='created_by',
        related_name='regions_created'
    )

    class Meta:
        db_table = 'user_regions'
        managed = False
        unique_together = ('login', 'region')

    def __str__(self):
        return f"{self.login.nom} - {self.region.nom}"


class UserPrefecture(models.Model):
    """
    Many-to-many relationship between users and prefectures
    Used for SPGR role to assign multiple prefectures
    """
    login = models.ForeignKey(
        Login,
        on_delete=models.CASCADE,
        db_column='login_id',
        related_name='assigned_prefectures'
    )
    prefecture = models.ForeignKey(
        'Prefecture',
        on_delete=models.CASCADE,
        db_column='prefecture_id',
        related_name='assigned_users'
    )
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    created_by = models.ForeignKey(
        Login,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='created_by',
        related_name='prefectures_created'
    )

    class Meta:
        db_table = 'user_prefectures'
        managed = False
        unique_together = ('login', 'prefecture')

    def __str__(self):
        return f"{self.login.nom} - {self.prefecture.nom}"


class UserInterfacePermission(models.Model):
    """
    Defines which interfaces each user can access
    Interfaces: carte_globale, gestion_donnees, tableau_bord, 
                gestion_utilisateurs, suivi_donnees, export_carte
    """
    INTERFACE_CHOICES = [
        ('carte_globale', 'Carte Globale'),
        ('gestion_donnees', 'Gestion Données'),
        ('tableau_bord', 'Tableau de Bord'),
        ('gestion_utilisateurs', 'Gestion Utilisateurs'),
        ('suivi_donnees', 'Suivi Données'),
        ('export_carte', 'Export Carte'),
    ]
    
    login = models.ForeignKey(
        Login,
        on_delete=models.CASCADE,
        db_column='login_id',
        related_name='interface_permissions'
    )
    interface_name = models.CharField(max_length=100, choices=INTERFACE_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    created_by = models.ForeignKey(
        Login,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='created_by',
        related_name='permissions_created'
    )

    class Meta:
        db_table = 'user_interface_permissions'
        managed = False
        unique_together = ('login', 'interface_name')

    def __str__(self):
        return f"{self.login.nom} - {self.get_interface_name_display()}"


class UserPermissionAudit(models.Model):
    """
    Audit log for tracking permission changes
    """
    login = models.ForeignKey(
        Login,
        on_delete=models.CASCADE,
        db_column='login_id',
        related_name='audit_logs'
    )
    action = models.CharField(max_length=50)  # role_changed, region_added, etc.
    old_value = models.TextField(null=True, blank=True)
    new_value = models.TextField(null=True, blank=True)
    changed_by = models.ForeignKey(
        Login,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='changed_by',
        related_name='changes_made'
    )
    changed_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    ip_address = models.CharField(max_length=45, null=True, blank=True)
    notes = models.TextField(null=True, blank=True)

    class Meta:
        db_table = 'user_permission_audit'
        managed = False

    def __str__(self):
        return f"{self.login.nom} - {self.action} - {self.changed_at}"


class Region(models.Model):
    nom = models.CharField(max_length=80, null=True, blank=True)
    geom = models.MultiPolygonField(srid=4326, null=True, blank=True)
    created_at = models.DateField(null=True, blank=True)
    updated_at = models.CharField(max_length=80, null=True, blank=True)

    class Meta:
        db_table = 'regions'
        managed = False

    def __str__(self):
        return self.nom or "Region sans nom"


class Prefecture(models.Model):
    regions_id = models.ForeignKey(
        Region,
        db_column='regions_id',
        on_delete=models.CASCADE
    )
    nom = models.CharField(max_length=80, null=True, blank=True)
    geom = models.MultiPolygonField(srid=4326, null=True, blank=True)
    created_at = models.DateField(null=True, blank=True)
    updated_at = models.CharField(max_length=80, null=True, blank=True)

    class Meta:
        db_table = 'prefectures'
        managed = False

    def __str__(self):
        return self.nom or "Prefecture sans nom"


class CommuneRurale(models.Model):
    prefectures_id = models.ForeignKey(
        Prefecture,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='prefectures_id'
    )
    nom = models.CharField(max_length=80, null=True, blank=True)
    geom = models.MultiPolygonField(srid=4326, null=True, blank=True)
    created_at = models.CharField(max_length=80, null=True, blank=True)
    updated_at = models.CharField(max_length=80, null=True, blank=True)

    class Meta:
        db_table = 'communes_rurales'
        managed = False

    def __str__(self):
        return self.nom or "Commune sans nom"


class Piste(models.Model):
    """
    Modele Piste avec geometrie en SRID 32628 (UTM)
    """
    communes_rurales_id = models.ForeignKey(
        CommuneRurale,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='communes_rurales_id'
    )
    code_piste = models.CharField(max_length=50, unique=True, null=True, blank=True)
    geom = models.MultiLineStringField(srid=32628, null=True, blank=True)
    
    # Informations horaires
    heure_debut = models.TimeField(null=True, blank=True)
    heure_fin = models.TimeField(null=True, blank=True)
    
    # Origine
    nom_origine_piste = models.TextField(null=True, blank=True)
    x_origine = models.FloatField(null=True, blank=True)
    y_origine = models.FloatField(null=True, blank=True)
    
    # Destination
    nom_destination_piste = models.TextField(null=True, blank=True)
    x_destination = models.FloatField(null=True, blank=True)
    y_destination = models.FloatField(null=True, blank=True)
    
    # Intersection
    existence_intersection = models.BooleanField(null=True, blank=True)
    
    # Occupation
    type_occupation = models.TextField(null=True, blank=True)
    debut_occupation = models.DateTimeField(null=True, blank=True)
    fin_occupation = models.DateTimeField(null=True, blank=True)
    
    # Caracteristiques
    largeur_emprise = models.FloatField(null=True, blank=True)
    frequence_trafic = models.CharField(max_length=50, null=True, blank=True)
    type_trafic = models.TextField(null=True, blank=True)
    
    # Travaux
    travaux_realises = models.TextField(null=True, blank=True)
    date_travaux = models.TextField(null=True, blank=True)
    entreprise = models.TextField(null=True, blank=True)

    # Caractéristiques physiques et administratives
    plateforme = models.TextField(null=True, blank=True)
    relief = models.TextField(null=True, blank=True)
    vegetation = models.TextField(null=True, blank=True)
    debut_travaux = models.DateField(null=True, blank=True)
    fin_travaux = models.DateField(null=True, blank=True)
    financement = models.TextField(null=True, blank=True)
    projet = models.TextField(null=True, blank=True)

    # Nouveaux champs (Calcul NG)
    niveau_service = models.FloatField(null=True, blank=True)
    fonctionnalite = models.FloatField(null=True, blank=True)
    interet_socio_administratif = models.FloatField(null=True, blank=True)
    population_desservie = models.FloatField(null=True, blank=True)
    potentiel_agricole = models.FloatField(null=True, blank=True)
    cout_investissement = models.FloatField(null=True, blank=True)
    protection_environnement = models.FloatField(null=True, blank=True)
    note_globale = models.FloatField(null=True, blank=True)

    # Intersections (calculées)
    intersections_json = models.JSONField(null=True, blank=True)
    nombre_intersections = models.IntegerField(null=True, blank=True)

    # Metadonnees
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    login_id = models.ForeignKey(
        'Login',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='login_id'
    )

    class Meta:
        db_table = 'pistes'
        managed = True

    def save(self, *args, **kwargs):
        # Calcul automatique de la Note Globale (NG) = moyenne simple des notes renseignées
        NOTE_FIELDS = [
            'niveau_service', 'fonctionnalite', 'interet_socio_administratif',
            'population_desservie', 'potentiel_agricole', 'cout_investissement',
            'protection_environnement',
        ]
        values = [getattr(self, f) for f in NOTE_FIELDS if getattr(self, f) is not None]
        if values:
            self.note_globale = round(sum(values) / len(values), 2)
        else:
            self.note_globale = None
        super(Piste, self).save(*args, **kwargs)

    def __str__(self):
        return f"Piste {self.code_piste} - {self.nom_origine_piste} vers {self.nom_destination_piste}"


# ==================== INFRASTRUCTURES ====================

class ServicesSantes(models.Model):
    fid = models.BigAutoField(primary_key=True)
    geom = models.PointField(srid=4326)
    sqlite_id = models.IntegerField(null=True, blank=True, db_column='id')
    
    x_sante = models.FloatField(null=True, blank=True)
    y_sante = models.FloatField(null=True, blank=True)
    nom = models.CharField(max_length=254, null=True, blank=True)
    type = models.CharField(max_length=254, null=True, blank=True)
    date_creat = models.DateField(null=True, blank=True)
    code_gps = models.CharField(max_length=254, null=True, blank=True)
    
    code_piste = models.ForeignKey(
        Piste,
        to_field='code_piste',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='code_piste'
    )
    login_id = models.ForeignKey(
        Login,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='login_id'
    )
    commune_id = models.ForeignKey(
        CommuneRurale,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='commune_id',
        related_name='services_santes'
    )
    
    created_at = models.CharField(max_length=24, null=True, blank=True)
    updated_at = models.CharField(max_length=24, null=True, blank=True)

    class Meta:
        db_table = 'services_santes'
        managed = False

    def __str__(self):
        return f"{self.nom} ({self.fid})"


class AutresInfrastructures(models.Model):
    fid = models.BigAutoField(primary_key=True)
    geom = models.PointField(srid=4326)
    sqlite_id = models.IntegerField(null=True, blank=True, db_column='id')
    
    # CORRECTION: Noms reels de la DB mobile
    x_autre_in = models.FloatField(null=True, blank=True)
    y_autre_in = models.FloatField(null=True, blank=True)
    type = models.CharField(max_length=254, null=True, blank=True)
    date_creat = models.DateField(null=True, blank=True)
    code_gps = models.CharField(max_length=254, null=True, blank=True)
    
    code_piste = models.ForeignKey(
        Piste,
        to_field='code_piste',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='code_piste'
    )
    login_id = models.ForeignKey(
        Login,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='login_id'
    )
    commune_id = models.ForeignKey(
        CommuneRurale,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='commune_id',
        related_name='autres_infrastructures'
    )
    
    created_at = models.CharField(max_length=24, null=True, blank=True)
    updated_at = models.CharField(max_length=24, null=True, blank=True)

    class Meta:
        db_table = 'autres_infrastructures'
        managed = False

    def __str__(self):
        return f"Autre infrastructure ({self.fid})"


class Bacs(models.Model):
    fid = models.BigAutoField(primary_key=True)
    geom = models.GeometryField(srid=4326)
    sqlite_id = models.IntegerField(null=True, blank=True, db_column='id')
    
    x_debut_tr = models.FloatField(null=True, blank=True)
    y_debut_tr = models.FloatField(null=True, blank=True)
    x_fin_trav = models.FloatField(null=True, blank=True)
    y_fin_trav = models.FloatField(null=True, blank=True)
    type_bac = models.CharField(max_length=254, null=True, blank=True)
    nom_cours = models.CharField(max_length=254, null=True, blank=True, db_column='nom_cours_')
    code_gps = models.CharField(max_length=254, null=True, blank=True)
    endroit = models.CharField(max_length=254, null=True, blank=True)
    
    code_piste = models.ForeignKey(
        Piste,
        to_field='code_piste',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='code_piste'
    )
    login_id = models.ForeignKey(
        Login,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='login_id'
    )
    commune_id = models.ForeignKey(
        CommuneRurale,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='commune_id',
        related_name='bacs'
    )
    
    created_at = models.CharField(max_length=24, null=True, blank=True)
    updated_at = models.CharField(max_length=24, null=True, blank=True)

    class Meta:
        db_table = 'bacs'
        managed = False

    def __str__(self):
        return f"Bac {self.fid}"


class BatimentsAdministratifs(models.Model):
    fid = models.BigAutoField(primary_key=True)
    geom = models.PointField(srid=4326)
    sqlite_id = models.IntegerField(null=True, blank=True, db_column='id')
    
    # CORRECTION: Noms reels de la DB mobile
    x_batiment = models.FloatField(null=True, blank=True)
    y_batiment = models.FloatField(null=True, blank=True)
    nom = models.CharField(max_length=254, null=True, blank=True)
    type = models.CharField(max_length=254, null=True, blank=True)
    date_creat = models.DateField(null=True, blank=True)
    code_gps = models.CharField(max_length=254, null=True, blank=True)
    
    code_piste = models.ForeignKey(
        Piste,
        to_field='code_piste',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='code_piste'
    )
    login_id = models.ForeignKey(
        Login,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='login_id'
    )
    commune_id = models.ForeignKey(
        CommuneRurale,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='commune_id',
        related_name='batiments_administratifs'
    )
    
    created_at = models.CharField(max_length=24, null=True, blank=True)
    updated_at = models.CharField(max_length=24, null=True, blank=True)

    class Meta:
        db_table = 'batiments_administratifs'
        managed = False

    def __str__(self):
        return f"{self.nom} ({self.fid})"


class Buses(models.Model):
    fid = models.BigAutoField(primary_key=True)
    geom = models.PointField(srid=4326)
    sqlite_id = models.IntegerField(null=True, blank=True, db_column='id')
    
    x_buse = models.FloatField(null=True, blank=True)
    y_buse = models.FloatField(null=True, blank=True)
    # CORRECTION: type_buse n'existe PAS dans la DB mobile
    code_gps = models.CharField(max_length=254, null=True, blank=True)
    
    code_piste = models.ForeignKey(
        Piste,
        to_field='code_piste',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='code_piste'
    )
    login_id = models.ForeignKey(
        Login,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='login_id'
    )
    commune_id = models.ForeignKey(
        CommuneRurale,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='commune_id',
        related_name='buses'
    )
    
    created_at = models.CharField(max_length=24, null=True, blank=True)
    updated_at = models.CharField(max_length=24, null=True, blank=True)

    class Meta:
        db_table = 'buses'
        managed = False

    def __str__(self):
        return f"Buse {self.fid}"


class Dalots(models.Model):
    fid = models.BigAutoField(primary_key=True)
    geom = models.PointField(srid=4326)
    sqlite_id = models.IntegerField(null=True, blank=True, db_column='id')
    
    x_dalot = models.FloatField(null=True, blank=True)
    y_dalot = models.FloatField(null=True, blank=True)
    # CORRECTION: type_dalot n'existe PAS, c'est "situation" dans la DB mobile
    situation = models.CharField(max_length=254, null=True, blank=True, db_column='situation_')
    code_gps = models.CharField(max_length=254, null=True, blank=True)
    
    code_piste = models.ForeignKey(
        Piste,
        to_field='code_piste',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='code_piste'
    )
    login_id = models.ForeignKey(
        Login,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='login_id'
    )
    commune_id = models.ForeignKey(
        CommuneRurale,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='commune_id',
        related_name='dalots'
    )
    
    created_at = models.CharField(max_length=24, null=True, blank=True)
    updated_at = models.CharField(max_length=24, null=True, blank=True)

    class Meta:
        db_table = 'dalots'
        managed = False

    def __str__(self):
        return f"Dalot {self.fid}"


class Ecoles(models.Model):
    fid = models.BigAutoField(primary_key=True)
    geom = models.PointField(srid=4326)
    sqlite_id = models.IntegerField(null=True, blank=True, db_column='id')
    
    x_ecole = models.FloatField(null=True, blank=True)
    y_ecole = models.FloatField(null=True, blank=True)
    nom = models.CharField(max_length=254, null=True, blank=True)
    type = models.CharField(max_length=254, null=True, blank=True)
    date_creat = models.DateField(null=True, blank=True)
    code_gps = models.CharField(max_length=254, null=True, blank=True)
    
    code_piste = models.ForeignKey(
        Piste,
        to_field='code_piste',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='code_piste'
    )
    login_id = models.ForeignKey(
        Login,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='login_id'
    )
    commune_id = models.ForeignKey(
        CommuneRurale,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='commune_id',
        related_name='ecoles'
    )
    
    created_at = models.CharField(max_length=24, null=True, blank=True)
    updated_at = models.CharField(max_length=24, null=True, blank=True)

    class Meta:
        db_table = 'ecoles'
        managed = False

    def __str__(self):
        return f"{self.nom} ({self.fid})"


class InfrastructuresHydrauliques(models.Model):
    fid = models.BigAutoField(primary_key=True)
    geom = models.PointField(srid=4326)
    sqlite_id = models.IntegerField(null=True, blank=True, db_column='id')
    
    x_infrastr = models.FloatField(null=True, blank=True)
    y_infrastr = models.FloatField(null=True, blank=True)
    nom = models.CharField(max_length=254, null=True, blank=True)
    type = models.CharField(max_length=254, null=True, blank=True)
    date_creat = models.DateField(null=True, blank=True)
    code_gps = models.CharField(max_length=254, null=True, blank=True)
    
    code_piste = models.ForeignKey(
        Piste,
        to_field='code_piste',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='code_piste'
    )
    login_id = models.ForeignKey(
        Login,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='login_id'
    )
    commune_id = models.ForeignKey(
        CommuneRurale,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='commune_id',
        related_name='infrastructures_hydrauliques'
    )
    
    created_at = models.CharField(max_length=24, null=True, blank=True)
    updated_at = models.CharField(max_length=24, null=True, blank=True)

    class Meta:
        db_table = 'infrastructures_hydrauliques'
        managed = False

    def __str__(self):
        return f"{self.nom} ({self.fid})"


class Localites(models.Model):
    fid = models.BigAutoField(primary_key=True)
    geom = models.PointField(srid=4326)
    sqlite_id = models.IntegerField(null=True, blank=True, db_column='id')
    
    x_localite = models.FloatField(null=True, blank=True)
    y_localite = models.FloatField(null=True, blank=True)
    nom = models.CharField(max_length=254, null=True, blank=True)
    type = models.CharField(max_length=254, null=True, blank=True)
    code_gps = models.CharField(max_length=254, null=True, blank=True)
    
    code_piste = models.ForeignKey(
        Piste,
        to_field='code_piste',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='code_piste'
    )
    login_id = models.ForeignKey(
        Login,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='login_id'
    )
    commune_id = models.ForeignKey(
        CommuneRurale,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='commune_id',
        related_name='localites'
    )
    
    created_at = models.CharField(max_length=24, null=True, blank=True)
    updated_at = models.CharField(max_length=24, null=True, blank=True)

    class Meta:
        db_table = 'localites'
        managed = False

    def __str__(self):
        return f"{self.nom} ({self.fid})"


class Marches(models.Model):
    fid = models.BigAutoField(primary_key=True)
    geom = models.PointField(srid=4326)
    sqlite_id = models.IntegerField(null=True, blank=True, db_column='id')
    
    x_marche = models.FloatField(null=True, blank=True)
    y_marche = models.FloatField(null=True, blank=True)
    nom = models.CharField(max_length=254, null=True, blank=True)
    type = models.CharField(max_length=254, null=True, blank=True)
    code_gps = models.CharField(max_length=254, null=True, blank=True)
    
    code_piste = models.ForeignKey(
        Piste,
        to_field='code_piste',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='code_piste'
    )
    login_id = models.ForeignKey(
        Login,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='login_id'
    )
    commune_id = models.ForeignKey(
        CommuneRurale,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='commune_id',
        related_name='marches'
    )
    
    created_at = models.CharField(max_length=24, null=True, blank=True)
    updated_at = models.CharField(max_length=24, null=True, blank=True)

    class Meta:
        db_table = 'marches'
        managed = False

    def __str__(self):
        return f"{self.nom} ({self.fid})"


class PassagesSubmersibles(models.Model):
    fid = models.BigAutoField(primary_key=True)
    geom = models.LineStringField(srid=4326)
    sqlite_id = models.IntegerField(null=True, blank=True, db_column='id')
    
    x_debut_pa = models.FloatField(null=True, blank=True)
    y_debut_pa = models.FloatField(null=True, blank=True)
    x_fin_pass = models.FloatField(null=True, blank=True)
    y_fin_pass = models.FloatField(null=True, blank=True)
    type_mater = models.CharField(max_length=254, null=True, blank=True)
    code_gps = models.CharField(max_length=254, null=True, blank=True)
    endroit = models.CharField(max_length=32, null=True, blank=True)
    
    code_piste = models.ForeignKey(
        Piste,
        to_field='code_piste',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='code_piste'
    )
    login_id = models.ForeignKey(
        Login,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='login_id'
    )
    commune_id = models.ForeignKey(
        CommuneRurale,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='commune_id',
        related_name='passages_submersibles'
    )
    
    created_at = models.CharField(max_length=24, null=True, blank=True)
    updated_at = models.CharField(max_length=24, null=True, blank=True)

    class Meta:
        db_table = 'passages_submersibles'
        managed = False

    def __str__(self):
        return f"Passage {self.fid}"


class Ponts(models.Model):
    fid = models.BigAutoField(primary_key=True)
    geom = models.PointField(srid=4326)
    sqlite_id = models.IntegerField(null=True, blank=True, db_column='id')
    
    x_pont = models.FloatField(null=True, blank=True)
    y_pont = models.FloatField(null=True, blank=True)
    situation = models.CharField(max_length=254, null=True, blank=True, db_column='situation_')
    type_pont = models.CharField(max_length=254, null=True, blank=True)
    nom_cours = models.CharField(max_length=254, null=True, blank=True, db_column='nom_cours_')
    code_gps = models.CharField(max_length=254, null=True, blank=True)
    
    code_piste = models.ForeignKey(
        Piste,
        to_field='code_piste',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='code_piste'
    )
    login_id = models.ForeignKey(
        Login,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='login_id'
    )
    commune_id = models.ForeignKey(
        CommuneRurale,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='commune_id',
        related_name='ponts'
    )
    
    created_at = models.CharField(max_length=24, null=True, blank=True)
    updated_at = models.CharField(max_length=24, null=True, blank=True)

    class Meta:
        db_table = 'ponts'
        managed = False

    def __str__(self):
        return f"Pont {self.fid} - {self.nom_cours or ''}"


class Chaussees(models.Model):
    """Modele Chaussees - present dans la base finale"""
    fid = models.BigAutoField(primary_key=True, db_column='fid')
    geom = models.MultiLineStringField(srid=4326, null=True, blank=True)
    sqlite_id = models.BigIntegerField(null=True, blank=True, db_column='id')
    
    # Coordonnees
    x_debut_ch = models.FloatField(null=True, blank=True)
    y_debut_ch = models.FloatField(null=True, blank=True)
    x_fin_ch = models.FloatField(null=True, blank=True)
    y_fin_chau = models.FloatField(null=True, blank=True)
    
    # Caracteristiques
    type_chaus = models.CharField(max_length=254, null=True, blank=True)
    etat_piste = models.CharField(max_length=254, null=True, blank=True)
    endroit = models.CharField(max_length=32, null=True, blank=True)
    code_gps = models.CharField(max_length=254, null=True, blank=True)
    
    # Relations - IMPORTANT: utilise communes_rurales_id dans la DB finale
    code_piste = models.ForeignKey(
        Piste,
        to_field='code_piste',
        db_column='code_piste',
        on_delete=models.CASCADE,
        related_name='chaussees'
    )
    login_id = models.ForeignKey(
        Login,
        db_column='login_id',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='chaussees'
    )
    communes_rurales_id = models.ForeignKey(
        CommuneRurale,
        db_column='communes_rurales_id',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='chaussees'
    )
    
    # Metadonnees
    created_at = models.CharField(max_length=50, null=True, blank=True)
    updated_at = models.CharField(max_length=50, null=True, blank=True)

    class Meta:
        db_table = 'chaussees'
        managed = False

    def __str__(self):
        return f"Chaussee {self.fid} ({self.code_piste_id})"


class PointsCoupures(models.Model):
    """Points de coupure"""
    fid = models.BigAutoField(primary_key=True, db_column='fid')
    geom = models.PointField(srid=4326, null=True, blank=True)
    sqlite_id = models.BigIntegerField(null=True, blank=True, db_column='id')

    # Informations
    cause_coup = models.CharField(max_length=50, null=True, blank=True)
    x_point_co = models.FloatField(null=True, blank=True)
    y_point_co = models.FloatField(null=True, blank=True)
    code_gps = models.CharField(max_length=254, null=True, blank=True)

    # Relations
    chaussee_id = models.BigIntegerField(null=True, blank=True, db_column='chaussee_id')
    code_piste = models.ForeignKey(
        Piste,
        to_field='code_piste',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='code_piste',
        related_name='points_coupures'
    )
    commune_id = models.ForeignKey(
        CommuneRurale,
        db_column='commune_id',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='points_coupures'
    )
    login_id = models.IntegerField(null=True, blank=True)

    # Metadonnees
    created_at = models.CharField(max_length=24, null=True, blank=True)
    updated_at = models.CharField(max_length=24, null=True, blank=True)

    class Meta:
        db_table = 'points_coupures'
        managed = False

    def __str__(self):
        return f"Point coupure {self.fid}"


class PointsCritiques(models.Model):
    """Points critiques"""
    fid = models.BigAutoField(primary_key=True, db_column='fid')
    geom = models.PointField(srid=4326, null=True, blank=True)
    sqlite_id = models.BigIntegerField(null=True, blank=True, db_column='id')

    # Informations
    type_point = models.CharField(max_length=50, null=True, blank=True)
    x_point_cr = models.FloatField(null=True, blank=True)
    y_point_cr = models.FloatField(null=True, blank=True)
    code_gps = models.CharField(max_length=254, null=True, blank=True)

    # Relations
    chaussee_id = models.BigIntegerField(null=True, blank=True, db_column='chaussee_id')
    code_piste = models.ForeignKey(
        Piste,
        to_field='code_piste',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='code_piste',
        related_name='points_critiques'
    )
    commune_id = models.ForeignKey(
        CommuneRurale,
        db_column='commune_id',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='points_critiques'
    )
    login_id = models.IntegerField(null=True, blank=True)

    # Metadonnees
    created_at = models.CharField(max_length=24, null=True, blank=True)
    updated_at = models.CharField(max_length=24, null=True, blank=True)

    class Meta:
        db_table = 'points_critiques'
        managed = False

    def __str__(self):
        return f"Point critique {self.fid}"


class EnquetePolygone(models.Model):
    id = models.AutoField(primary_key=True)
    geom = models.MultiPolygonField(srid=4326)
    superficie_en_ha = models.FloatField(null=True, blank=True)
    communes_rurales_id = models.IntegerField(null=True, blank=True)
    nom = models.CharField(max_length=254, null=True, blank=True)
    created_at = models.CharField(max_length=24, null=True, blank=True)
    updated_at = models.CharField(max_length=24, null=True, blank=True)
    code_piste = models.CharField(max_length=254, null=True, blank=True)
    login_id = models.IntegerField(null=True, blank=True)
    code_gps = models.CharField(max_length=254, null=True, blank=True)
    sqlite_id = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = 'enquete_polygone'
        managed = False


class SiteEnquete(models.Model):
    """Model for site_enquete table (anciennement ppr_itial)"""
    fid = models.BigAutoField(primary_key=True)
    geom = models.PointField(srid=4326, null=True, blank=True)
    id = models.IntegerField(null=True, blank=True)
    type = models.CharField(max_length=254, null=True, blank=True)
    projet = models.CharField(max_length=254, null=True, blank=True)
    entreprise = models.CharField(max_length=254, null=True, blank=True)
    financement = models.CharField(max_length=254, null=True, blank=True)
    travaux_debut = models.DateField(null=True, blank=True)
    travaux_fin = models.DateField(null=True, blank=True)
    type_de_realisation = models.CharField(max_length=254, null=True, blank=True)
    amenage_ou_non_amenage = models.CharField(max_length=100, null=True, blank=True)
    superficie_enquetes_ha = models.FloatField(null=True, blank=True, db_column='superficie_estimee_lors_des_enquetes_ha')
    superficie_digitalisee = models.FloatField(null=True, blank=True)
    x_site = models.FloatField(null=True, blank=True)
    y_site = models.FloatField(null=True, blank=True)
    nom = models.CharField(max_length=254, null=True, blank=True)
    created_at = models.CharField(max_length=24, null=True, blank=True)
    updated_at = models.CharField(max_length=24, null=True, blank=True)
    code_gps = models.CharField(max_length=254, null=True, blank=True)
    code_piste = models.CharField(max_length=254, null=True, blank=True)
    login_id = models.IntegerField(null=True, blank=True)
    commune_id = models.ForeignKey(
        CommuneRurale,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='commune_id',
        related_name='site_enquetes'
    )

    class Meta:
        db_table = 'site_enquete'
        managed = False

    def __str__(self):
        return f"Site Enquete {self.fid}"


# Alias pour compatibilité avec l'ancien nom
PprItial = SiteEnquete

class PasswordResetRequest(models.Model):
    """Demandes de réinitialisation de mot de passe (lecture côté web)"""
    login = models.ForeignKey(
        Login,
        on_delete=models.CASCADE,
        db_column='login_id',
        null=True,
        blank=True,
        related_name='reset_requests',
    )
    email = models.TextField()
    telephone = models.TextField()
    status = models.TextField(default='pending')
    handled_by = models.ForeignKey(
        Login,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='handled_by',
        related_name='handled_resets',
    )
    handled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'password_reset_requests'
        managed = False

class ActionHistory(models.Model):
    login = models.ForeignKey(
        Login, on_delete=models.SET_NULL, null=True, blank=True,
        db_column='login_id', related_name='action_history',
    )
    action_type = models.TextField()
    table_name = models.TextField(null=True, blank=True)
    record_id = models.BigIntegerField(null=True, blank=True)
    record_label = models.TextField(null=True, blank=True)
    details = models.TextField(null=True, blank=True)
    old_values = models.TextField(null=True, blank=True)
    new_values = models.TextField(null=True, blank=True)
    sync_summary = models.TextField(null=True, blank=True)
    code_piste = models.TextField(null=True, blank=True)
    region_nom = models.TextField(null=True, blank=True)
    prefecture_nom = models.TextField(null=True, blank=True)
    commune_nom = models.TextField(null=True, blank=True)
    source = models.TextField(default='web')
    synced_from_mobile = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'action_history'
        managed = False
        ordering = ['-created_at']