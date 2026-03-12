import os
import django
from django.db import connection

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pprcollecte.settings")
django.setup()

def dump_cols():
    cursor = connection.cursor()
    cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'ppr_itial' ORDER BY column_name;")
    cols = [c[0] for c in cursor.fetchall()]
    with open('ppr_cols.txt', 'w') as f:
        f.write('\n'.join(cols))
    print(f"Dumped {len(cols)} columns to ppr_cols.txt")

if __name__ == "__main__":
    dump_cols()
