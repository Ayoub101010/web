import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'pprcollecte.settings')
django.setup()

from api.models import Piste, CommuneRurale, Prefecture, Region

def debug_piste(code_piste):
    print(f"--- Debugging Piste: {code_piste} ---")
    try:
        piste = Piste.objects.get(code_piste=code_piste)
        print(f"Found Piste ID: {piste.id}")
        print(f"Code Piste: {piste.code_piste}")
        print(f"Communes Rurales ID (raw): {piste.communes_rurales_id_id}")
        
        # Test direct access
        commune_obj = piste.communes_rurales_id
        if commune_obj:
            print(f"Commune object found: {commune_obj.nom}")
            # Test following hierarchy
            pref = commune_obj.prefectures_id
            if pref:
                print(f"Prefecture found: {pref.nom}")
                reg = pref.regions_id
                if reg:
                    print(f"Region found: {reg.nom}")
                else:
                    print("Region NOT found on prefecture")
            else:
                print("Prefecture NOT found on commune")
        else:
            print("Commune object NOT found (is None)")
            
    except Piste.DoesNotExist:
        print(f"Piste with code {code_piste} not found.")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    debug_piste('PISTE_EQ4_0152')
    debug_piste('PISTE_EQ3_031')
