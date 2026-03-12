import urllib.request
import json

try:
    with urllib.request.urlopen("http://127.0.0.1:8001/api/ppr_itial/") as response:
        if response.status == 200:
            data = json.loads(response.read().decode())
            features = data.get("features", [])
            # Find first feature where commune_nom is not N/A
            found = False
            for f in features:
                props = f.get("properties", {})
                if props.get("commune_nom") and props.get("commune_nom") != "N/A":
                    print(json.dumps(props, indent=2))
                    found = True
                    break
            if not found and features:
                print("No feature with commune_nom found, showing first one:")
                print(json.dumps(features[0].get("properties", {}), indent=2))
        else:
            print(f"Error: {response.status}")
except Exception as e:
    print(f"Error: {e}")
