import os
import django
from django.db import connection

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pprcollecte.settings")
django.setup()

def check_pc():
    cursor = connection.cursor()
    cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'points_critiques' ORDER BY column_name;")
    print("COLS START")
    for col in cursor.fetchall():
        print(col[0])
    print("COLS END")

check_pc()
