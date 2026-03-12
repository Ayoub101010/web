import os
import django
from django.db import connection

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pprcollecte.settings")
django.setup()

def check_geom_type():
    cursor = connection.cursor()
    cursor.execute("SELECT type FROM geometry_columns WHERE f_table_name = 'ppr_itial';")
    res = cursor.fetchone()
    if res:
        print(f"Geometry type: {res[0]}")
    else:
        # Fallback for some PostGIS versions
        cursor.execute("SELECT ST_GeometryType(geom) FROM ppr_itial LIMIT 1;")
        res = cursor.fetchone()
        if res:
            print(f"Geometry type (data): {res[0]}")
        else:
            print("No geometry info found.")

if __name__ == "__main__":
    check_geom_type()
