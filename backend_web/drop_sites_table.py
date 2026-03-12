import os
import django
from django.db import connection

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pprcollecte.settings")
django.setup()

def drop_sites():
    with connection.cursor() as cursor:
        print("Dropping table 'sites'...")
        try:
            cursor.execute("DROP TABLE IF EXISTS sites CASCADE;")
            print("✅ Table 'sites' dropped successfully.")
        except Exception as e:
            print(f"❌ Error dropping table: {e}")

if __name__ == "__main__":
    drop_sites()
