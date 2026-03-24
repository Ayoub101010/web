from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
import json

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
    SiteEnquete,
    EnquetePolygone,
    ActionHistory,
)


class InfrastructureUpdateAPIView(APIView):
    """
    API générique pour mettre à jour une ligne d'infrastructure.

    URL : /api/update/<table>/<fid>/
    Ex :  /api/update/chaussees/2/
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
        "enquete_polygone": EnquetePolygone,
    }

    def put(self, request, table, fid):
        table = table.lower()

        # 1) Vérifier que la table est connue
        model = self.MODEL_MAP.get(table)
        if model is None:
            return Response(
                {"success": False, "error": f"Table inconnue: {table}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 2) Récupérer l'objet
        try:
            obj = model.objects.get(pk=fid)
        except model.DoesNotExist:
            return Response(
                {"success": False, "error": f"{table} avec fid={fid} introuvable"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # ===== CAPTURER LES ANCIENNES VALEURS AVANT MODIFICATION =====
        import json
        old_values = {}
        for field in model._meta.get_fields():
            if getattr(field, 'concrete', False) and not field.auto_created:
                fname = field.name
                if fname in ('fid', 'id', 'geom'):
                    continue
                try:
                    val = getattr(obj, fname)
                    if hasattr(val, 'isoformat'):
                        old_values[fname] = val.isoformat()
                    elif hasattr(val, 'pk'):
                        old_values[fname] = str(val)
                    elif isinstance(val, (int, float, str, bool)) or val is None:
                        old_values[fname] = val
                    else:
                        old_values[fname] = str(val)
                except Exception:
                    pass

        # Aussi capturer le code_piste et la géographie
        code_piste_val = None
        region_nom_val = None
        prefecture_nom_val = None
        commune_nom_val = None
        try:
            cp = getattr(obj, 'code_piste', None)
            if cp:
                code_piste_val = cp.code_piste if hasattr(cp, 'code_piste') else str(cp) if cp else None

            commune_obj = getattr(obj, 'commune_id', None) or getattr(obj, 'communes_rurales_id', None)
            if commune_obj and hasattr(commune_obj, 'nom'):
                commune_nom_val = commune_obj.nom
                if hasattr(commune_obj, 'prefectures_id') and commune_obj.prefectures_id:
                    prefecture_nom_val = commune_obj.prefectures_id.nom
                    if hasattr(commune_obj.prefectures_id, 'regions_id') and commune_obj.prefectures_id.regions_id:
                        region_nom_val = commune_obj.prefectures_id.regions_id.nom
        except Exception:
            pass

        data = dict(request.data or {})
        # Pour ppr_itial : original_type est un alias frontend du champ DB "type"
        if table == "ppr_itial" and "original_type" in data:
            data["type"] = data.pop("original_type")
        # amenage_ou_non_amenage : colonne boolean en DB, convertir le label frontend
        if "amenage_ou_non_amenage" in data:
            val = data["amenage_ou_non_amenage"]
            if val in ("Aménagé", "true", True):
                data["amenage_ou_non_amenage"] = True
            elif val in ("Non aménagé", "false", False):
                data["amenage_ou_non_amenage"] = False
        # existence_intersection : colonne boolean en DB
        if "existence_intersection" in data:
            val = data["existence_intersection"]
            if val in ("Oui", "1", 1, True):
                data["existence_intersection"] = True
            elif val in ("Non", "0", 0, False):
                data["existence_intersection"] = False
        # On ne touche pas à ces champs
        forbidden = {"fid", "id", "geom"}

        # Champs valides du modèle
        valid_fields = {
            f.name
            for f in model._meta.get_fields()
            if getattr(f, "concrete", False) and not f.auto_created
        }

        updated = {}

        for key, value in data.items():
            # ignorer les champs interdits ou inconnus
            if key in forbidden or key not in valid_fields:
                continue

            field = model._meta.get_field(key)

            # si le champ accepte NULL et qu'on reçoit "", on met None
            if value == "" and getattr(field, "null", False):
                value = None

            setattr(obj, key, value)
            updated[key] = value

        #  IMPORTANT : on ne renvoie plus 400 si aucun champ valide
        if not updated:
            return Response(
                {
                    "success": True,
                    "fid": obj.pk,
                    "updated_fields": {},
                    "message": "Aucun champ valide à mettre à jour (aucun changement appliqué).",
                },
                status=status.HTTP_200_OK,
            )

        fields_to_save = list(updated.keys())

        # Pour Piste : si une note est modifiée, recalculer et sauvegarder note_globale
        if model is Piste:
            NOTE_FIELDS = {
                'niveau_service', 'fonctionnalite', 'interet_socio_administratif',
                'population_desservie', 'potentiel_agricole', 'cout_investissement',
                'protection_environnement',
            }
            if NOTE_FIELDS & set(fields_to_save) and 'note_globale' not in fields_to_save:
                fields_to_save.append('note_globale')

        # Sauvegarder uniquement les champs modifiés (évite le problème SRID sur geom)
        obj.save(update_fields=fields_to_save)

        # ===== LOG HISTORIQUE WEB avec old/new values =====
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

            # Construire new_values (seulement les champs modifiés)
            new_values = {}
            for key in updated.keys():
                try:
                    val = getattr(obj, key)
                    if hasattr(val, 'isoformat'):
                        new_values[key] = val.isoformat()
                    elif hasattr(val, 'pk'):
                        new_values[key] = str(val)
                    elif isinstance(val, (int, float, str, bool)) or val is None:
                        new_values[key] = val
                    else:
                        new_values[key] = str(val)
                except Exception:
                    new_values[key] = updated[key]

            ActionHistory.objects.create(
                login_id=user_id,
                action_type='update',
                table_name=table,
                record_id=fid,
                record_label=str(obj),
                details=json.dumps(list(updated.keys())),
                old_values=json.dumps(old_values),
                new_values=json.dumps(new_values),
                code_piste=code_piste_val,
                region_nom=region_nom_val,
                prefecture_nom=prefecture_nom_val,
                commune_nom=commune_nom_val,
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
