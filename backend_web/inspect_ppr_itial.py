import os
import django
from django.db import connection

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pprcollecte.settings")
django.setup()

def inspect_ppr():
    cursor = connection.cursor()
    print("Inspecting table 'ppr_itial'...")
    try:
        cursor.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ppr_itial' ORDER BY column_name;")
        cols = cursor.fetchall()
        print(f"Total columns: {len(cols)}")
        for col in cols:
            print(f"- {col[0]} ({col[1]})")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_ppr()
