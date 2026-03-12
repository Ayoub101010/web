import os
import django
from django.db import connection

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pprcollecte.settings")
django.setup()

def check_tables():
    cursor = connection.cursor()
    print("Checking tables in PostgreSQL database...")
    
    # Check for 'sites'
    cursor.execute("SELECT to_regclass('public.sites');")
    sites_exists = cursor.fetchone()[0]
    print(f"Table 'sites' exists: {sites_exists is not None}")

    # Check for 'site_enquete'
    cursor.execute("SELECT to_regclass('public.site_enquete');")
    site_enquete_exists = cursor.fetchone()[0]
    print(f"Table 'site_enquete' exists: {site_enquete_exists is not None}")
    
    # Force print because site_enquete_exists check might be failing or returning unexpected type
    print("\nColumns in 'points_critiques':")
    cursor.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'points_critiques';")
    for col in cursor.fetchall():
        print(f"- {col[0]} ({col[1]})")

    # Only inspect site_enquete for now to save space
    # if sites_exists: ...

check_tables()
