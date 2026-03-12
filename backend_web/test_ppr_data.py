import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pprcollecte.settings")
django.setup()

from api.models import PprItial, CommuneRurale

def test_data():
    items = PprItial.objects.exclude(commune_id__isnull=True)[:5]
    print(f"Found {items.count()} items with commune_id")
    for item in items:
        print(f"\n--- Item {item.fid} ---")
        print(f"Type: {item.type}")
        print(f"Projet: {item.projet}")
        print(f"Commune FK: {item.commune_id}")
        if item.commune_id:
            print(f"Commune Name: {item.commune_id.nom}")
        else:
            print(f"Commune ID from DB: {item.commune_id_id}")

if __name__ == "__main__":
    test_data()
