from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

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

        # 👉 IMPORTANT : on ne renvoie plus 400 si aucun champ valide
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

        return Response(
            {
                "success": True,
                "fid": obj.pk,
                "updated_fields": updated,
            },
            status=status.HTTP_200_OK,
        )
