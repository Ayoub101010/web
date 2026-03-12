import os
import django
from django.db import connection

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pprcollecte.settings")
django.setup()

def list_cols():
    with connection.cursor() as cursor:
        cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'ppr_itial'")
        cols = [c[0] for c in cursor.fetchall()]
        print(cols)

if __name__ == "__main__":
    list_cols()
