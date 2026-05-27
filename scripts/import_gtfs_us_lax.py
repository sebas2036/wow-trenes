#!/usr/bin/env python3
"""
WoW TRENES - Importador GTFS LA Metro Rail → SQLite
Genera assets/gtfs_us_lax.db

══════════════════════════════════════════════════════════════════
FUENTE (gratuita, sin registro):
──────────────────────────────────────────────────────────────────
LA Metro (Los Angeles County Metropolitan Transportation Authority)

  URL directa (GitLab oficial, ~1.5 MB):
    https://gitlab.com/LACMTA/gtfs_rail/raw/master/gtfs_rail.zip

  Alternativa (MobilityDatabase, mismos datos):
    https://files.mobilitydatabase.org/mdb-30/mdb-30-202605240039/mdb-30-202605240039.zip

  NOTA: La URL antigua developer.metro.net/gtfs/google_transit.zip
        devuelve 404 — usar las URLs de arriba.

  Pasos:
    1. curl -L "https://gitlab.com/LACMTA/gtfs_rail/raw/master/gtfs_rail.zip" \
            -o ~/Downloads/gtfs_rail.zip
    2. unzip ~/Downloads/gtfs_rail.zip -d ~/Downloads/LA\ Metro/
    3. python3 scripts/import_gtfs_us_lax.py

  Cubre: A/B/C/D/E/K Lines (Rail) + Silver Line BRT
         ~100 estaciones de metro/light rail

══════════════════════════════════════════════════════════════════
"""
import sqlite3, csv, sys, time, shutil
from pathlib import Path

_POSSIBLE_DIRS = [
    Path.home() / "Downloads" / "LA Metro",
    Path.home() / "Downloads" / "LAMetro",
    Path.home() / "Downloads" / "la_metro",
    Path.home() / "Downloads" / "US_LAX",
    Path.home() / "Downloads" / "Los Angeles Metro",
]
GTFS_DIR   = next((d for d in _POSSIBLE_DIRS if d.exists()), _POSSIBLE_DIRS[0])
OUTPUT_DIR = Path(__file__).parent.parent / "assets"
OUTPUT_DB  = OUTPUT_DIR / "gtfs_us_lax.db"
COUNTRY    = "US"
MAX_ST     = 200_000
MAX_CD     = 30_000

# LA Metro Rail lines only (route_type 0 = light rail, 1 = subway)
RAIL_TYPES = {"0", "1", "2"}

def read_csv(path):
    try:
        with open(path, encoding="utf-8-sig", newline="") as f:
            return list(csv.DictReader(f))
    except FileNotFoundError:
        print(f"  WARN: {path} no encontrado")
        return []

def setup(conn):
    conn.executescript("""
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous  = NORMAL;
        CREATE TABLE IF NOT EXISTS agency (
            agency_id TEXT PRIMARY KEY, agency_name TEXT,
            agency_url TEXT, agency_timezone TEXT);
        CREATE TABLE IF NOT EXISTS stops (
            stop_id TEXT PRIMARY KEY, stop_name TEXT NOT NULL,
            stop_lat REAL NOT NULL, stop_lon REAL NOT NULL,
            country_code TEXT DEFAULT 'US', location_type INTEGER DEFAULT 0,
            parent_station TEXT);
        CREATE TABLE IF NOT EXISTS routes (
            route_id TEXT PRIMARY KEY, agency_id TEXT,
            route_short_name TEXT, route_long_name TEXT, route_type INTEGER,
            route_color TEXT, source_region TEXT);
        CREATE TABLE IF NOT EXISTS trips (
            trip_id TEXT PRIMARY KEY, route_id TEXT, service_id TEXT,
            trip_headsign TEXT, direction_id INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS stop_times (
            trip_id TEXT NOT NULL, arrival_time TEXT, departure_time TEXT,
            stop_id TEXT NOT NULL, stop_sequence INTEGER,
            PRIMARY KEY (trip_id, stop_sequence));
        CREATE TABLE IF NOT EXISTS calendar (
            service_id TEXT PRIMARY KEY, monday INTEGER, tuesday INTEGER,
            wednesday INTEGER, thursday INTEGER, friday INTEGER,
            saturday INTEGER, sunday INTEGER, start_date TEXT, end_date TEXT);
        CREATE TABLE IF NOT EXISTS calendar_dates (
            service_id TEXT, date TEXT, exception_type INTEGER,
            PRIMARY KEY (service_id, date));
    """)
    conn.commit()

def main():
    print("\nWoW TRENES - Importador GTFS LA Metro Rail")
    print("=" * 50)

    if not GTFS_DIR.exists():
        print(f"\nERROR: Carpeta no encontrada. Probé:")
        for d in _POSSIBLE_DIRS: print(f"  {d}")
        print("\nPasos:")
        print("  1. Descarga el ZIP desde GitLab (oficial, ~1.5 MB):")
        print("     curl -L 'https://gitlab.com/LACMTA/gtfs_rail/raw/master/gtfs_rail.zip' \\")
        print("          -o ~/Downloads/gtfs_rail.zip")
        print("  2. Descomprime en: ~/Downloads/LA\\ Metro/")
        print("     unzip ~/Downloads/gtfs_rail.zip -d ~/Downloads/LA\\ Metro/")
        print("  3. Ejecuta: python3 scripts/import_gtfs_us_lax.py")
        sys.exit(1)

    required = ["stops.txt", "routes.txt", "trips.txt", "stop_times.txt"]
    missing  = [f for f in required if not (GTFS_DIR / f).exists()]
    if missing:
        print(f"ERROR: Faltan archivos GTFS: {missing}")
        sys.exit(1)

    print(f"  Origen:  {GTFS_DIR}")
    print(f"  Destino: {OUTPUT_DB}\n")

    tmp_db = Path("/tmp/gtfs_us_lax_build.db")
    if tmp_db.exists(): tmp_db.unlink()

    t0   = time.time()
    conn = sqlite3.connect(str(tmp_db))
    setup(conn)

    # Agency
    rows = read_csv(GTFS_DIR / "agency.txt")
    conn.executemany("INSERT OR IGNORE INTO agency VALUES (?,?,?,?)",
        [(r.get("agency_id","LACMTA"), r.get("agency_name","LA Metro"),
          r.get("agency_url","https://www.metro.net"),
          r.get("agency_timezone","America/Los_Angeles")) for r in rows])
    conn.commit()

    # Routes — filtrar solo rail (type 0, 1, 2)
    rows = read_csv(GTFS_DIR / "routes.txt")
    routes = []
    for r in rows:
        rt = str(r.get("route_type","1")).strip()
        if rt not in RAIL_TYPES: continue
        routes.append((
            r["route_id"], r.get("agency_id","LACMTA"),
            r.get("route_short_name",""), r.get("route_long_name",""),
            int(rt or "1"), r.get("route_color",""), "LA Metro Rail"
        ))
    # Si no hay rutas rail, incluir todo
    if not routes:
        for r in rows:
            rt = str(r.get("route_type","1")).strip()
            routes.append((
                r["route_id"], r.get("agency_id","LACMTA"),
                r.get("route_short_name",""), r.get("route_long_name",""),
                int(rt or "1"), r.get("route_color",""), "LA Metro"
            ))
        print(f"  WARN: No se detectaron rutas rail, incluyendo todas ({len(routes)})")

    conn.executemany("INSERT OR IGNORE INTO routes VALUES (?,?,?,?,?,?,?)", routes)
    conn.commit()
    route_ids = {r[0] for r in routes}
    print(f"  Rutas rail: {len(routes)}")

    # Trips
    rows = read_csv(GTFS_DIR / "trips.txt")
    trips = [(r["trip_id"], r["route_id"], r.get("service_id",""),
              r.get("trip_headsign",""), int(r.get("direction_id","0") or "0"))
             for r in rows if r.get("route_id","") in route_ids]
    conn.executemany("INSERT OR IGNORE INTO trips VALUES (?,?,?,?,?)", trips)
    conn.commit()
    trip_ids = {r[0] for r in trips}
    print(f"  Viajes: {len(trips)}")

    # Stop times
    st_data  = []
    stop_ids = set()
    n = 0
    with open(GTFS_DIR / "stop_times.txt", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if row.get("trip_id","") not in trip_ids: continue
            sid = row.get("stop_id","")
            stop_ids.add(sid)
            st_data.append((row["trip_id"], row.get("arrival_time",""),
                            row.get("departure_time",""), sid,
                            int(row.get("stop_sequence","0") or "0")))
            n += 1
            if n >= MAX_ST:
                print(f"  Límite {MAX_ST:,} alcanzado"); break
    conn.executemany("INSERT OR IGNORE INTO stop_times VALUES (?,?,?,?,?)", st_data)
    conn.commit()
    print(f"  Stop times: {n:,}")

    # Stops
    rows = read_csv(GTFS_DIR / "stops.txt")
    stops_data = []
    for r in rows:
        if r.get("stop_id","") not in stop_ids: continue
        try:
            lat = float(r.get("stop_lat","0"))
            lon = float(r.get("stop_lon","0"))
            if lat == 0 and lon == 0: continue
            stops_data.append((r["stop_id"], r.get("stop_name","").strip(),
                               lat, lon, COUNTRY,
                               int(r.get("location_type","0") or "0"),
                               r.get("parent_station","")))
        except: continue
    conn.executemany("INSERT OR IGNORE INTO stops VALUES (?,?,?,?,?,?,?)", stops_data)
    conn.commit()
    print(f"  Estaciones: {len(stops_data)}")

    # Calendar
    rows = read_csv(GTFS_DIR / "calendar.txt")
    if rows:
        conn.executemany("INSERT OR IGNORE INTO calendar VALUES (?,?,?,?,?,?,?,?,?,?)",
            [(r.get("service_id",""), r.get("monday",0), r.get("tuesday",0),
              r.get("wednesday",0), r.get("thursday",0), r.get("friday",0),
              r.get("saturday",0), r.get("sunday",0),
              r.get("start_date",""), r.get("end_date","")) for r in rows])
        conn.commit()

    # Calendar dates
    cd_file = GTFS_DIR / "calendar_dates.txt"
    if cd_file.exists():
        cd_data = []
        with open(cd_file, encoding="utf-8-sig", newline="") as f:
            for i, row in enumerate(csv.DictReader(f)):
                if i >= MAX_CD: break
                cd_data.append((row.get("service_id",""), row.get("date",""),
                                int(row.get("exception_type","1"))))
        conn.executemany("INSERT OR IGNORE INTO calendar_dates VALUES (?,?,?)", cd_data)
        conn.commit()

    # Índices
    conn.executescript("""
        CREATE INDEX IF NOT EXISTS idx_stops_ll    ON stops      (stop_lat, stop_lon);
        CREATE INDEX IF NOT EXISTS idx_st_stop     ON stop_times (stop_id);
        CREATE INDEX IF NOT EXISTS idx_st_trip     ON stop_times (trip_id);
        CREATE INDEX IF NOT EXISTS idx_trips_route ON trips      (route_id);
    """)
    conn.commit()
    conn.close()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(str(tmp_db), str(OUTPUT_DB))
    tmp_db.unlink()

    elapsed = time.time() - t0
    mb = OUTPUT_DB.stat().st_size / 1_048_576
    print(f"\nListo en {elapsed:.1f}s  —  {mb:.1f} MB")
    print(f"Archivo: {OUTPUT_DB}")
    print(f"\nLA Metro Rail: A/B/C/D/E/K Lines · ~100 estaciones")

if __name__ == "__main__":
    main()
