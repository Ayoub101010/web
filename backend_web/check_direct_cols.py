import os
import django
from django.db import connection

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pprcollecte.settings")
django.setup()

def check_columns():
    cursor = connection.cursor()
    print("Direct select to check columns...")
    try:
        cursor.execute("SELECT * FROM site_enquete LIMIT 0;")
        col_names = [desc[0] for desc in cursor.description]
        print(f"Columns in site_enquete: {col_names}")
    except Exception as e:
        print(f"Error: {e}")

check_columns()
