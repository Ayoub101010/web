import os
import django
from django.db import connection

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pprcollecte.settings")
django.setup()

def delete_migration_record():
    with connection.cursor() as cursor:
        print("Removing migration record for 0006...")
        try:
            cursor.execute("DELETE FROM django_migrations WHERE app='api' AND name='0006_chaussees_enquetepolygone_pointscoupures_and_more';")
            print("✅ Migration record deleted.")
        except Exception as e:
            print(f"❌ Error deleting migration record: {e}")

if __name__ == "__main__":
    delete_migration_record()
