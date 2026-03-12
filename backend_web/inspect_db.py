import psycopg2

try:
    conn = psycopg2.connect(
        dbname="geodngr_db",
        user="postgres",
        password="postgres",
        host="127.0.0.1",
        port="5432"
    )
    cur = conn.cursor()
    
    # Check columns of 'pistes'
    print("Columns in 'pistes' table:")
    cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'pistes'")
    columns = cur.fetchall()
    for col in columns:
        print(f" - {col[0]} ({col[1]})")
    
    # Check a sample row
    print("\nSample row for PISTE_EQ3_031:")
    cur.execute("SELECT id, code_piste, communes_rurales_id, nom_origine_piste FROM pistes WHERE code_piste = 'PISTE_EQ3_031'")
    row = cur.fetchone()
    print(f"Row: {row}")
    
    # Check joins
    print("\nJoin test for PISTE_EQ3_031:")
    query = """
    SELECT 
        p.id,
        c.nom AS commune,
        pref.nom AS prefecture,
        r.nom AS region
    FROM public.pistes p
    LEFT JOIN public.communes_rurales c ON p.communes_rurales_id = c.id
    LEFT JOIN public.prefectures pref ON c.prefectures_id = pref.id
    LEFT JOIN public.regions r ON pref.regions_id = r.id
    WHERE p.code_piste = 'PISTE_EQ3_031'
    """
    cur.execute(query)
    join_row = cur.fetchone()
    print(f"Join result: {join_row}")
    
    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
