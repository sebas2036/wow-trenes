#!/usr/bin/env python3
"""
WoW TRENES — Importador GTFS Great Britain National Rail → SQLite
Genera assets/gtfs_gb.db

══════════════════════════════════════════════════════════════════
FUENTE (gratuita, registro requerido):
──────────────────────────────────────────────────────────────────
National Rail Open Data (ATOC/RSP)
  1. Registro gratuito en: https://opendata.nationalrail.co.uk/
  2. Login → Data Feeds → GTFS (UK National Rail GTFS)
  3. Descarga el ZIP (gtfs_[fecha].zip)
  4. Descomprime en: ~/Downloads/GB National Rail/
  5. Ejecuta: python3 scripts/import_gtfs_gb.py

Cubre: Avanti, LNER, GWR, Southeastern, Southern, Thameslink,
       ScotRail, CrossCountry, c2c, Chiltern Railways, y +20 TOCs
       ~2500 estaciones · toda Gran Bretaña

══════════════════════════════════════════════════════════════════
"""
import sqlite3, csv, sys, time, shutil
from pathlib import Path

_POSSIBLE_DIRS = [
    Path.home() / "Downloads" / "GB National Rail",
    Path.home() / "Downloads" / "NationalRail",
    Path.home() / "Downloads" / "GB_Rail",
    Path.home() / "Downloads" / "gtfs_gb",
    Path.home() / "Downloads" / "UK Rail",
]
GTFS_DIR   = next((d for d in _POSSIBLE_DIRS if d.exists()), _POSSIBLE_DIRS[0])
OUTPUT_DIR = Path(__file__).parent.parent / "assets"
OUTPUT_DB  = OUTPUT_DIR / "gtfs_gb.db"
COUNTRY    = "GB"
MAX_ST     = 300_000

# Solo trenes de pasajeros (route_type 2 = rail)
RAIL_TYPES = {"2"}

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
            country_code TEXT DEFAULT 'GB', location_type INTEGER DEFAULT 0,
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
    print("\nWoW TRENES — Importador GTFS GB National Rail")
    print("=" * 50)

    if not GTFS_DIR.exists():
        print(f"\nERROR: Carpeta no encontrada. Probé:")
        for d in _POSSIBLE_DIRS: print(f"  {d}")
        print("\nPasos para obtener los datos:")
        print("  1. Registrate gratis en: https://opendata.nationalrail.co.uk/")
        print("  2. Login → Data Feeds → GTFS (UK National Rail GTFS)")
        print("  3. Descargá el ZIP y descomprimí en:")
        print("     ~/Downloads/GB National Rail/")
        print("  4. Volvé a ejecutar este script")
        sys.exit(1)

    required = ["stops.txt", "routes.txt", "trips.txt", "stop_times.txt"]
    missing  = [f for f in required if not (GTFS_DIR / f).exists()]
    if missing:
        print(f"ERROR: Faltan archivos GTFS: {missing}")
        sys.exit(1)

    print(f"  Origen:  {GTFS_DIR}")
    print(f"  Destino: {OUTPUT_DB}\n")

    tmp_db = Path("/tmp/gtfs_gb_build.db")
    if tmp_db.exists(): tmp_db.unlink()

    t0   = time.time()
    conn = sqlite3.connect(str(tmp_db))
    setup(conn)

    # Agency
    rows = read_csv(GTFS_DIR / "agency.txt")
    conn.executemany("INSERT OR IGNORE INTO agency VALUES (?,?,?,?)",
        [(r.get("agency_id","NR"), r.get("agency_name","National Rail"),
          r.get("agency_url","https://www.nationalrail.co.uk"),
          r.get("agency_timezone","Europe/London")) for r in rows])
    conn.commit()

    # Routes
    rows   = read_csv(GTFS_DIR / "routes.txt")
    routes = []
    for r in rows:
        rt = str(r.get("route_type","2")).strip()
        if rt not in RAIL_TYPES: continue
        routes.append((
            r["route_id"], r.get("agency_id","NR"),
            r.get("route_short_name",""), r.get("route_long_name",""),
            int(rt), r.get("route_color",""), "GB National Rail"
        ))
    if not routes:
        # Si no filtra correctamente, incluir todo
        for r in rows:
            routes.append((
                r["route_id"], r.get("agency_id","NR"),
                r.get("route_short_name",""), r.get("route_long_name",""),
                int(r.get("route_type","2") or "2"), r.get("route_color",""), "GB National Rail"
            ))
        print(f"  WARN: Incluyendo todas las rutas ({len(routes)})")

    conn.executemany("INSERT OR IGNORE INTO routes VALUES (?,?,?,?,?,?,?)", routes)
    conn.commit()
    route_ids = {r[0] for r in routes}
    print(f"  Rutas: {len(routes)}")

    # Trips
    rows  = read_csv(GTFS_DIR / "trips.txt")
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
    rows       = read_csv(GTFS_DIR / "stops.txt")
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
                if i >= 50_000: break
                cd_data.append((row.get("service_id",""), row.get("date",""),
                                int(row.get("exception_type","1"))))
        conn.executemany("INSERT OR IGNORE INTO calendar_dates VALUES (?,?,?)", cd_data)
        conn.commit()

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
    print(f"\nGB National Rail: Avanti · LNER · GWR · ScotRail · +20 TOCs")

if __name__ == "__main__":
    main()
