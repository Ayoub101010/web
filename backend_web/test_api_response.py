import requests
import json

def test_api():
    url = "http://127.0.0.1:8000/api/infrastructure/spatial/"
    params = {
        'types': 'pistes'
    }
    # No Auth for now, hope it works or I'll use a token if I can find one
    try:
        response = requests.get(url, params=params)
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            features = data.get('features', [])
            print(f"Total features: {len(features)}")
            for f in features:
                props = f.get('properties', {})
                if props.get('code_piste') == 'PISTE_EQ3_031':
                    print(f"Found PISTE_EQ3_031 properties: {props}")
                    break
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    test_api()
