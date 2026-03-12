import os
import django
import sys

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pprcollecte.settings")
django.setup()

from api.models import PprItial
from api.serializers import PprItialSerializer

def test_ppr_fetch():
    try:
        print("Fetching ALL PprItial objects...")
        qs = PprItial.objects.all()
        count = qs.count()
        print(f"Total objects found: {count}")
        
        print("Serializing all objects...")
        serializer = PprItialSerializer(qs, many=True)
        data = serializer.data
        print(f"Successfully serialized {len(data)} features!")
        
    except Exception as e:
        import traceback
        print("❌ Error during fetch or serialization:")
        traceback.print_exc()

if __name__ == "__main__":
    test_ppr_fetch()
