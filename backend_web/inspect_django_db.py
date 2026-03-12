import os
import django
from django.db import connection

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pprcollecte.settings")
django.setup()

def inspect():
    with connection.cursor() as cursor:
        introspection = connection.introspection
        table_list = introspection.get_table_list(cursor)
        table_names = [t.name for t in table_list]
        
        print(f"found {len(table_names)} tables.")
        
        target_tables = ['sites']
        
        for table in target_tables:
            if table in table_names:
                print(f"\n✅ Table '{table}' found. Columns:")
                try:
                    columns = introspection.get_table_description(cursor, table)
                    for col in columns:
                        # col is a named tuple: name, type_code, display_size, internal_size, precision, scale, null_ok
                        print(f"   - {col.name}")
                except Exception as e:
                    print(f"   ⚠️ Error getting description: {e}")
            else:
                print(f"\n❌ Table '{table}' NOT found in default schema.")

if __name__ == "__main__":
    inspect()
