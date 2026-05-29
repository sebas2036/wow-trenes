#!/usr/bin/env python3
"""
WoW TRENES — Importador National Rail GB (CIF format) → SQLite
Genera assets/gtfs_gb.db

FUENTE:
  National Rail Open Data Portal — https://opendata.nationalrail.co.uk/
  Endpoint: https://opendata.nationalrail.co.uk/api/staticfeeds/3.0/timetable
  Formato: CIF (Common Interface Format) — NO es GTFS estándar.
  Este script descarga, parsea CIF y convierte a nuestro esquema SQLite.

AUTENTICACIÓN (dos modos):

  MODO A — con usuario/contraseña (recomendado):
    python3 scripts/import_gtfs_gb.py --user EMAIL --password PASS
    Variables de entorno: GB_RAIL_USER / GB_RAIL_PASS
    → autentica en /authenticate y obtiene el token automáticamente

  MODO B — con token ya obtenido:
    python3 scripts/import_gtfs_gb.py --token TU_TOKEN
    Variable de entorno: GB_RAIL_TOKEN
    Archivo: scripts/.gb_token (solo el token en la primera línea)

  Credenciales en: opendata.nationalrail.co.uk → My Feeds → API Information
  Header usado:    X-Auth-Token: {token}

FORMATO CIF (lo que parseamos):
  .MSN — Master Station Names  → stops (TIPLOC → nombre + coord OSGB)
  .MCA — Main CIF timetable    → routes + trips + stop_times

Cubre: Avanti · LNER · GWR · Southeastern · Southern · Thameslink ·
       ScotRail · CrossCountry · c2c · Chiltern · +20 TOCs
  ~2500 estaciones, toda Gran Bretaña continental
"""
import sqlite3, sys, time, shutil, os, zipfile, io, re, math, argparse, json
from pathlib import Path
try:
    import urllib.request as urlreq
    import urllib.parse as urlparse
except ImportError:
    urlreq = None

OUTPUT_DIR = Path(__file__).parent.parent / "assets"
OUTPUT_DB  = OUTPUT_DIR / "gtfs_gb.db"
CIF_URL    = "https://opendata.nationalrail.co.uk/api/staticfeeds/3.0/timetable"
COUNTRY    = "GB"
MAX_ST     = 300_000

# ─── OSGB36 → WGS84 (Helmert simplified, ~5m accuracy) ──────────────────────
def osgb_to_wgs84(easting: float, northing: float):
    """Convert OS National Grid (OSGB36) to WGS84 lat/lon."""
    # Airy 1830 ellipsoid
    a, b = 6_377_563.396, 6_356_256.909
    F0 = 0.9996012717
    lat0, lon0 = math.radians(49), math.radians(-2)
    N0, E0 = -100_000, 400_000

    e2  = 1 - (b/a)**2
    n   = (a - b) / (a + b)
    n2, n3 = n*n, n*n*n

    E = easting - E0
    lat = lat0

    for _ in range(10):
        M = b * F0 * (
            (1 + n + 5/4*n2 + 5/4*n3) * (lat - lat0)
            - (3*n + 3*n2 + 21/8*n3) * math.sin(lat - lat0) * math.cos(lat + lat0)
            + (15/8*n2 + 15/8*n3)    * math.sin(2*(lat - lat0)) * math.cos(2*(lat + lat0))
            - (35/24*n3)              * math.sin(3*(lat - lat0)) * math.cos(3*(lat + lat0))
        )
        lat += (northing - N0 - M) / (a * F0)

    sin_lat = math.sin(lat);  cos_lat = math.cos(lat);  tan_lat = math.tan(lat)
    nu  = a * F0 / math.sqrt(1 - e2 * sin_lat**2)
    rho = a * F0 * (1 - e2) / (1 - e2 * sin_lat**2)**1.5
    eta2 = nu/rho - 1

    lat_1 = tan_lat / (2 * rho * nu)
    lat_2 = tan_lat / (24 * rho * nu**3) * (5 + 3*tan_lat**2 + eta2 - 9*tan_lat**2*eta2)
    lat_sec = lat - lat_1 * E**2 + lat_2 * E**4

    lon_1 = 1 / (cos_lat * nu)
    lon_2 = 1 / (6 * cos_lat * nu**3) * (nu/rho + 2*tan_lat**2)
    lon_sec = lon0 + lon_1 * E - lon_2 * E**3

    # Helmert shift OSGB36 → WGS84 (dx=-446.448, dy=125.157, dz=-542.060 m)
    lat_d = math.degrees(lat_sec) - 0.1502 / 3600
    lon_d = math.degrees(lon_sec) + 0.2470 / 3600
    return round(lat_d, 6), round(lon_d, 6)


# ─── Parser MSN — Master Station Names ───────────────────────────────────────
def parse_msn(text: str) -> dict:
    """Returns {tiploc: (name, lat, lon, crs)}"""
    stations = {}
    for line in text.splitlines():
        if not line.startswith('A') or len(line) < 60:
            continue
        # Format (fixed-width 80 chars):
        # [0]   'A'
        # [1:5] spaces
        # [5:12] TIPLOC (7 chars)
        # [12]  space
        # [13:43] name (30 chars)
        # [43:49] easting (in 100m units)
        # [49:55] northing (in 100m units)
        # [55:58] CRS (3-char NLC/CRS code)
        try:
            tiploc = line[5:12].strip()
            name   = line[13:43].strip().title()
            east_s = line[43:49].strip()
            nrth_s = line[49:55].strip()
            crs    = line[55:58].strip()

            if not tiploc or not name:
                continue
            if east_s.isdigit() and nrth_s.isdigit():
                e = float(east_s) * 100
                n = float(nrth_s) * 100
                if e > 0 and n > 0:
                    lat, lon = osgb_to_wgs84(e, n)
                else:
                    lat, lon = 0.0, 0.0
            else:
                lat, lon = 0.0, 0.0

            stations[tiploc] = (name, lat, lon, crs or tiploc[:3])
        except Exception:
            continue
    return stations


# ─── Parser MCA — schedules ───────────────────────────────────────────────────
def parse_mca(text: str, stations: dict):
    """Yields (route_id, route_name, trip_id, headsign, stops[])
    stops = [(tiploc, arr_hhmm, dep_hhmm, seq)]
    """
    trips = []
    current_bs = None
    current_stops = []
    seq = 0

    for line in text.splitlines():
        rt = line[:2]

        if rt == 'BS':  # Basic Schedule
            # Save previous trip
            if current_bs and current_stops:
                trips.append((current_bs, current_stops))
            current_stops = []
            seq = 0
            try:
                uid       = line[3:9].strip()
                runs_from = line[9:15].strip()   # YYMMDD
                category  = line[30:32].strip()  # OO=ordinary, XX=express, etc.
                identity  = line[32:36].strip()  # headcode
                atoc      = line[64:66].strip()  # TOC code (e.g. VT=Avanti, GW=GWR)
                current_bs = {
                    'uid': uid, 'from': runs_from,
                    'cat': category, 'id': identity, 'atoc': atoc,
                }
            except Exception:
                current_bs = None

        elif rt == 'BX' and current_bs:  # Basic Schedule Extra
            try:
                atoc = line[11:13].strip()
                if atoc:
                    current_bs['atoc'] = atoc
            except Exception:
                pass

        elif rt == 'LO' and current_bs:  # Location Origin
            try:
                tiploc = line[2:9].strip()
                dep    = line[15:19].strip() or line[10:14].strip()
                seq += 1
                current_stops.append((tiploc, dep, dep, seq))
            except Exception:
                pass

        elif rt == 'LI' and current_bs:  # Location Intermediate
            try:
                tiploc = line[2:9].strip()
                arr    = line[10:14].strip()
                dep    = line[15:19].strip() or arr
                seq += 1
                current_stops.append((tiploc, arr, dep, seq))
            except Exception:
                pass

        elif rt == 'LT' and current_bs:  # Location Terminus
            try:
                tiploc = line[2:9].strip()
                arr    = line[10:14].strip()
                seq += 1
                current_stops.append((tiploc, arr, arr, seq))
            except Exception:
                pass

        elif rt == 'ZZ':  # End of file
            if current_bs and current_stops:
                trips.append((current_bs, current_stops))
            break

    # Flush last trip
    if current_bs and current_stops:
        trips.append((current_bs, current_stops))

    return trips


# ─── DB setup ─────────────────────────────────────────────────────────────────
def setup(conn):
    conn.executescript("""
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous  = NORMAL;
        CREATE TABLE IF NOT EXISTS stops (
            stop_id TEXT PRIMARY KEY, stop_name TEXT NOT NULL,
            stop_lat REAL NOT NULL, stop_lon REAL NOT NULL,
            country_code TEXT DEFAULT 'GB', location_type INTEGER DEFAULT 0,
            parent_station TEXT DEFAULT '');
        CREATE TABLE IF NOT EXISTS routes (
            route_id TEXT PRIMARY KEY, agency_id TEXT DEFAULT 'NR',
            route_short_name TEXT, route_long_name TEXT, route_type INTEGER DEFAULT 2);
        CREATE TABLE IF NOT EXISTS trips (
            trip_id TEXT PRIMARY KEY, route_id TEXT, service_id TEXT DEFAULT 'WD',
            trip_headsign TEXT, direction_id INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS stop_times (
            trip_id TEXT NOT NULL, arrival_time TEXT, departure_time TEXT,
            stop_id TEXT NOT NULL, stop_sequence INTEGER,
            PRIMARY KEY (trip_id, stop_sequence));
    """)
    conn.commit()


# ─── Main ─────────────────────────────────────────────────────────────────────
AUTH_URL = "https://opendata.nationalrail.co.uk/authenticate"

def authenticate(user: str, password: str) -> str:
    """POST to NRDP /authenticate → returns token string."""
    payload = json.dumps({"username": user, "password": password}).encode()
    req = urlreq.Request(AUTH_URL, data=payload,
                         headers={'Content-Type': 'application/json'})
    try:
        with urlreq.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode())
        token = data.get('token') or data.get('Token') or data.get('UserToken', '')
        if not token:
            print(f"ERROR: respuesta inesperada de /authenticate: {data}")
            sys.exit(1)
        return token.strip()
    except Exception as e:
        print(f"\nERROR autenticando en NRDP: {e}")
        print("Comprueba usuario/contraseña en opendata.nationalrail.co.uk")
        sys.exit(1)


def get_token(args) -> str:
    """Prioridad: --token arg > GB_RAIL_TOKEN env > .gb_token file."""
    if args.token:
        return args.token.strip()
    env = os.environ.get('GB_RAIL_TOKEN', '').strip()
    if env:
        return env
    token_file = Path(__file__).parent / '.gb_token'
    if token_file.exists():
        return token_file.read_text().splitlines()[0].strip()
    return ''


def main():
    parser = argparse.ArgumentParser(description='Importar CIF National Rail → SQLite')
    parser.add_argument('--token',    help='Token NRDP ya obtenido (My Feeds → API Information)')
    parser.add_argument('--user',     help='Email de NRDP (alternativa a --token)')
    parser.add_argument('--password', help='Contraseña de NRDP (alternativa a --token)')
    args = parser.parse_args()

    print("\nWoW TRENES — Importador National Rail GB (CIF)")
    print("=" * 55)

    token = get_token(args)

    if not token:
        # Intentar con --user/--password o vars de entorno
        user = args.user     or os.environ.get('GB_RAIL_USER', '').strip()
        pw   = args.password or os.environ.get('GB_RAIL_PASS', '').strip()
        if user and pw:
            print(f"  Autenticando como {user}...")
            token = authenticate(user, pw)
            print(f"  Token obtenido: {token[:8]}...")
        else:
            print("\nERROR: Se requieren credenciales de National Rail Open Data Portal.")
            print("\n  OPCIÓN A — autenticar automáticamente:")
            print("    python3 scripts/import_gtfs_gb.py --user EMAIL --password PASS")
            print("    export GB_RAIL_USER=EMAIL && export GB_RAIL_PASS=PASS")
            print("\n  OPCIÓN B — token ya obtenido:")
            print("    python3 scripts/import_gtfs_gb.py --token TU_TOKEN")
            print("    echo TU_TOKEN > scripts/.gb_token")
            print("\n  Regístrate en: opendata.nationalrail.co.uk")
            sys.exit(1)

    print(f"  Token: {token[:8]}...")
    print(f"  URL:   {CIF_URL}")
    print(f"  Dest:  {OUTPUT_DB}\n")

    # ── Descargar ─────────────────────────────────────────────────────────────
    print("  Descargando timetable CIF (~70 MB)...")
    t0  = time.time()
    req = urlreq.Request(CIF_URL, headers={'X-Auth-Token': token})
    try:
        with urlreq.urlopen(req, timeout=120) as r:
            zip_bytes = r.read()
    except Exception as e:
        print(f"\nERROR descargando: {e}")
        print("Comprueba que el token sea válido — prueba con --user/--password para renovarlo")
        sys.exit(1)

    print(f"  Descargado: {len(zip_bytes)/1_048_576:.1f} MB en {time.time()-t0:.1f}s")

    # ── Extraer ficheros CIF ──────────────────────────────────────────────────
    print("  Extrayendo archivos CIF...")
    msn_text = mca_text = ''
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for name in zf.namelist():
            ext = name.upper().split('.')[-1]
            if ext == 'MSN':
                msn_text = zf.read(name).decode('latin-1', errors='replace')
                print(f"    MSN: {name} ({len(msn_text):,} chars)")
            elif ext == 'MCA':
                mca_text = zf.read(name).decode('latin-1', errors='replace')
                print(f"    MCA: {name} ({len(mca_text):,} chars)")

    if not msn_text or not mca_text:
        print("\nERROR: No se encontraron archivos MSN o MCA en el ZIP.")
        print("Contenido del ZIP:")
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            for n in zf.namelist(): print(f"  {n}")
        sys.exit(1)

    # ── Parsear MSN (estaciones) ──────────────────────────────────────────────
    print("  Parseando estaciones (MSN)...")
    stations = parse_msn(msn_text)
    print(f"    {len(stations)} TIPLOCs con coordenadas")

    # ── Parsear MCA (viajes) ──────────────────────────────────────────────────
    print("  Parseando horarios (MCA)...")
    trips_raw = parse_mca(mca_text, stations)
    print(f"    {len(trips_raw):,} viajes")

    # ── Construir DB ──────────────────────────────────────────────────────────
    tmp_db = Path("/tmp/gtfs_gb_build.db")
    if tmp_db.exists(): tmp_db.unlink()
    conn = sqlite3.connect(str(tmp_db))
    setup(conn)

    # Stops — solo TIPLOCs con coordenadas válidas
    stops_data = [
        (tiploc, name, lat, lon, COUNTRY, 0, '')
        for tiploc, (name, lat, lon, crs) in stations.items()
        if lat != 0.0 and lon != 0.0
        and 49.0 < lat < 61.5      # bounding box UK
        and -8.5 < lon < 2.0
    ]
    conn.executemany("INSERT OR IGNORE INTO stops VALUES (?,?,?,?,?,?,?)", stops_data)
    conn.commit()
    valid_stops = {r[0] for r in stops_data}
    print(f"    {len(stops_data)} estaciones con coordenadas UK válidas")

    # Routes y trips — agrupar por ATOC code
    routes_seen: set = set()
    trips_data, st_data = [], []
    st_count = 0

    for bs, stops in trips_raw:
        if st_count >= MAX_ST:
            break

        # Filtrar stops sin coordenadas
        valid = [(t, a, d, s) for (t, a, d, s) in stops if t in valid_stops]
        if len(valid) < 2:
            continue

        atoc      = bs.get('atoc', 'ZZ') or 'ZZ'
        route_id  = atoc
        trip_id   = f"{atoc}_{bs['uid']}_{bs['from']}"
        headsign  = stations.get(valid[-1][0], (valid[-1][0],'','',''))[0]

        if route_id not in routes_seen:
            routes_seen.add(route_id)

        trips_data.append((trip_id, route_id, bs['from'], headsign, 0))

        for tiploc, arr, dep, seq in valid:
            # Normalizar HHMM → HH:MM:SS
            def fmt(t):
                t = t.strip().rstrip('H')  # 'H' suffix = passing time
                if len(t) == 4 and t.isdigit():
                    return f"{t[:2]}:{t[2:]}:00"
                return "00:00:00"
            st_data.append((trip_id, fmt(arr), fmt(dep), tiploc, seq))
            st_count += 1
            if st_count >= MAX_ST:
                break

    routes_data = [(rid, 'NR', rid, f"National Rail {rid}", 2) for rid in routes_seen]
    conn.executemany("INSERT OR IGNORE INTO routes VALUES (?,?,?,?,?)", routes_data)
    conn.executemany("INSERT OR IGNORE INTO trips VALUES (?,?,?,?,?)", trips_data)
    conn.executemany("INSERT OR IGNORE INTO stop_times VALUES (?,?,?,?,?)", st_data)
    conn.commit()

    print(f"    {len(routes_data)} operadores (TOCs)")
    print(f"    {len(trips_data):,} viajes")
    print(f"    {len(st_data):,} stop_times")

    # Índices
    conn.executescript("""
        CREATE INDEX IF NOT EXISTS idx_stops_ll ON stops (stop_lat, stop_lon);
        CREATE INDEX IF NOT EXISTS idx_st_stop  ON stop_times (stop_id);
        CREATE INDEX IF NOT EXISTS idx_st_trip  ON stop_times (trip_id);
    """)
    conn.commit()
    conn.close()

    shutil.copy2(str(tmp_db), str(OUTPUT_DB))
    mb = OUTPUT_DB.stat().st_size / 1_048_576
    elapsed = time.time() - t0
    print(f"\nListo en {elapsed:.1f}s | {mb:.1f} MB")
    print(f"Archivo: {OUTPUT_DB}")
    print(f"\nGB National Rail importado — {len(stops_data)} estaciones, {len(trips_data):,} servicios.")


if __name__ == "__main__":
    main()
