#!/usr/bin/env python3
"""
WoW TRENES - Importador GTFS USA (Amtrak) -> SQLite
Lee ~/Downloads/Wow trains USA/ y genera assets/gtfs_usa.db

Fuente: Amtrak (National Railroad Passenger Corporation)
  Feed nacional abierto — sin registro, sin licencia restrictiva
  URL directa: https://content.amtrak.com/content/gtfs/GTFS.zip
  Licencia: datos públicos de operador regulado por FRA/Congreso USA

Cubre toda la red Amtrak (~500 estaciones):
  Northeast Corridor  — Boston, New York, Philadelphia, Washington DC
  Acela / Northeast Regional
  California Zephyr   — Chicago → Denver → Salt Lake → San Francisco
  Coast Starlight     — Seattle → Portland → San Francisco → Los Angeles
  Empire Builder      — Chicago → Minneapolis → Seattle
  Southwest Chief     — Chicago → Albuquerque → Los Angeles
  Sunset Limited      — New Orleans → Houston → Los Angeles
  Auto Train          — Washington DC → Orlando (Florida)
  Crescent            — New York → Atlanta → New Orleans
  Silver Star/Meteor  — New York → Miami

Resultado esperado: ~500 estaciones, ~30-60k stop_times, ~10-20 MB
"""
import sqlite3, csv, sys, time, shutil
from pathlib import Path

_POSSIBLE_DIRS = [
    Path.home() / "Downloads" / "Wow trains USA",
    Path.home() / "Downloads" / "Wow trains USA ",
    Path.home() / "Downloads" / "AMTRAK",
    Path.home() / "Downloads" / "Amtrak",
    Path.home() / "Downloads" / "amtrak",
    Path.home() / "Downloads" / "gtfs_amtrak",
    Path.home() / "Downloads" / "USA",
    Path.home() / "Downloads" / "usa",
]
GTFS_DIR   = next((d for d in _POSSIBLE_DIRS if d.exists()), _POSSIBLE_DIRS[0])
OUTPUT_DIR = Path(__file__).parent.parent / "assets"
OUTPUT_DB  = OUTPUT_DIR / "gtfs_usa.db"
COUNTRY    = "US"

MAX_ST = 200_000
MAX_CD = 30_000

# Amtrak usa route_type 2 (Rail) para todos sus servicios
RAIL_TYPES = {
    "2",
    "100","101","102","103","104","105",
    "106","107","108","109","110","111",
    "112","113","114","115","116","117",
}

def read_csv(path):
    try:
        with open(path, encoding="utf-8-sig", newline="") as f:
            return list(csv.DictReader(f))
    except FileNotFoundError:
        print(f"  WARN: {path} not found, skipping")
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
            source_region TEXT);
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

def clean_stop_name(name: str) -> str:
    """Amtrak usa nombres ya bien formateados tipo 'New York Penn Station'."""
    name = name.strip()
    # Algunos stops tienen sufijos de código en paréntesis: "Chicago Union Station (CHI)"
    if name.endswith(')') and '(' in name:
        code = name[name.rfind('(')+1:-1].strip()
        if code.isupper() and len(code) <= 4:
            name = name[:name.rfind('(')].strip()
    return name

def main():
    print("\nWoW TRENES - Importador GTFS USA (Amtrak)")
    print("=" * 50)
    print("  Fuente: Amtrak — Feed nacional abierto")
    print("  Cubre:  Northeast Corridor, California Zephyr, Coast Starlight...")
    print()

    if not GTFS_DIR.exists():
        print(f"ERROR: Carpeta no encontrada. Probé:")
        for d in _POSSIBLE_DIRS: print(f"  {d}")
        print()
        print("Pasos:")
        print("  1. Baja el ZIP desde:")
        print("     https://content.amtrak.com/content/gtfs/GTFS.zip")
        print("  2. Descomprime en: ~/Downloads/Wow trains USA/")
        print("     (tiene que quedar: ~/Downloads/Wow trains USA/stops.txt, etc.)")
        sys.exit(1)

    required = ["stops.txt", "routes.txt", "trips.txt", "stop_times.txt"]
    missing  = [f for f in required if not (GTFS_DIR / f).exists()]
    if missing:
        print(f"ERROR: Faltan archivos GTFS: {missing}")
        sys.exit(1)

    print(f"  Origen:  {GTFS_DIR}")
    print(f"  Destino: {OUTPUT_DB}")
    print()

    # Construir en /tmp para evitar problemas de bloqueo WAL en filesystem montado
    tmp_db = Path("/tmp/gtfs_usa_build.db")
    if tmp_db.exists(): tmp_db.unlink()

    t0   = time.time()
    conn = sqlite3.connect(str(tmp_db))

    setup(conn)

    # Agency
    rows = read_csv(GTFS_DIR / "agency.txt")
    conn.executemany("INSERT OR IGNORE INTO agency VALUES (?,?,?,?)",
        [(r.get("agency_id","amtrak"), r.get("agency_name","Amtrak"),
          r.get("agency_url","https://www.amtrak.com"),
          r.get("agency_timezone","America/New_York")) for r in rows])
    conn.commit()
    print(f"  Agencias: {len(rows) or 1}")

    # Routes — Amtrak usa route_type 2 para todo
    rows = read_csv(GTFS_DIR / "routes.txt")
    rail_routes = [(r["route_id"], r.get("agency_id","amtrak"),
                    r.get("route_short_name",""), r.get("route_long_name",""),
                    int(r.get("route_type","2") or "2"), "Amtrak")
                   for r in rows if r.get("route_type","") in RAIL_TYPES]
    if not rail_routes:
        # Fallback: incluir todas las rutas si no se detecta rail_type
        rail_routes = [(r["route_id"], r.get("agency_id","amtrak"),
                        r.get("route_short_name",""), r.get("route_long_name",""),
                        int(r.get("route_type","2") or "2"), "Amtrak") for r in rows]
        print(f"  WARN: No se detectaron rutas tipo rail, incluyendo todas ({len(rail_routes)})")
    conn.executemany("INSERT OR IGNORE INTO routes VALUES (?,?,?,?,?,?)", rail_routes)
    conn.commit()
    rail_route_ids = {r[0] for r in rail_routes}
    print(f"  Rutas Amtrak: {len(rail_routes)}")

    # Trips
    rows = read_csv(GTFS_DIR / "trips.txt")
    rail_trips = [(r["trip_id"], r["route_id"], r.get("service_id",""),
                   r.get("trip_headsign",""), int(r.get("direction_id",0) or 0))
                  for r in rows if r.get("route_id","") in rail_route_ids]
    conn.executemany("INSERT OR IGNORE INTO trips VALUES (?,?,?,?,?)", rail_trips)
    conn.commit()
    rail_trip_ids = {r[0] for r in rail_trips}
    print(f"  Viajes: {len(rail_trips)}")

    # Stop times
    print(f"  Leyendo stop_times (max {MAX_ST:,})...")
    st_data = []
    rail_stop_ids = set()
    n = 0
    with open(GTFS_DIR / "stop_times.txt", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if row.get("trip_id","") not in rail_trip_ids:
                continue
            sid = row.get("stop_id","")
            rail_stop_ids.add(sid)
            st_data.append((row["trip_id"], row.get("arrival_time",""),
                            row.get("departure_time",""), sid,
                            int(row.get("stop_sequence",0) or 0)))
            n += 1
            if n >= MAX_ST:
                print(f"  Límite {MAX_ST:,} alcanzado")
                break
            if n % 50_000 == 0:
                print(f"    {n:,} filas...")
    conn.executemany("INSERT OR IGNORE INTO stop_times VALUES (?,?,?,?,?)", st_data)
    conn.commit()
    print(f"  Stop times: {n:,} | Estaciones con servicio: {len(rail_stop_ids)}")

    # Stops
    rows = read_csv(GTFS_DIR / "stops.txt")
    stops_data = []
    for r in rows:
        if r.get("stop_id","") not in rail_stop_ids:
            continue
        try:
            lat = float(r.get("stop_lat",0))
            lon = float(r.get("stop_lon",0))
            if lat == 0 and lon == 0: continue
            stops_data.append((r["stop_id"], clean_stop_name(r.get("stop_name","")),
                               lat, lon, COUNTRY,
                               int(r.get("location_type",0) or 0),
                               r.get("parent_station","")))
        except: continue
    conn.executemany("INSERT OR IGNORE INTO stops VALUES (?,?,?,?,?,?,?)", stops_data)
    conn.commit()
    print(f"  Estaciones importadas: {len(stops_data)}")

    # Calendar
    rows = read_csv(GTFS_DIR / "calendar.txt")
    if rows:
        conn.executemany("INSERT OR IGNORE INTO calendar VALUES (?,?,?,?,?,?,?,?,?,?)",
            [(r.get("service_id",""), r.get("monday",0), r.get("tuesday",0),
              r.get("wednesday",0), r.get("thursday",0), r.get("friday",0),
              r.get("saturday",0), r.get("sunday",0),
              r.get("start_date",""), r.get("end_date","")) for r in rows])
        conn.commit()
        print(f"  Calendarios: {len(rows)}")

    # Calendar dates
    cd_file = GTFS_DIR / "calendar_dates.txt"
    if cd_file.exists():
        cd_data = []
        with open(cd_file, encoding="utf-8-sig", newline="") as f:
            for i, row in enumerate(csv.DictReader(f)):
                if i >= MAX_CD: break
                cd_data.append((row.get("service_id",""), row.get("date",""),
                                int(row.get("exception_type",1))))
        conn.executemany("INSERT OR IGNORE INTO calendar_dates VALUES (?,?,?)", cd_data)
        conn.commit()
        print(f"  Excepciones calendario: {len(cd_data)}")

    # Índices
    print("  Creando índices...")
    conn.executescript("""
        CREATE INDEX IF NOT EXISTS idx_stops_ll    ON stops      (stop_lat, stop_lon);
        CREATE INDEX IF NOT EXISTS idx_st_stop     ON stop_times (stop_id);
        CREATE INDEX IF NOT EXISTS idx_st_trip     ON stop_times (trip_id);
        CREATE INDEX IF NOT EXISTS idx_trips_route ON trips      (route_id);
    """)
    conn.commit()
    conn.close()

    # Copiar al destino final
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(str(tmp_db), str(OUTPUT_DB))
    tmp_db.unlink()

    elapsed = time.time() - t0
    mb = OUTPUT_DB.stat().st_size / 1_048_576
    print(f"\nListo en {elapsed:.1f}s")
    print(f"Archivo: {OUTPUT_DB}")
    print(f"Tamaño:  {mb:.1f} MB")
    print()
    print("Red Amtrak disponible:")
    print("  Northeast Corridor — Boston · New York · Philadelphia · Washington DC")
    print("  California Zephyr  — Chicago · Denver · Salt Lake City · San Francisco")
    print("  Coast Starlight    — Seattle · Portland · Los Angeles")
    print("  Empire Builder     — Chicago · Minneapolis · Seattle")
    print("  Southwest Chief    — Chicago · Albuquerque · Los Angeles")
    print("  Sunset Limited     — New Orleans · Houston · Los Angeles")
    print("  Auto Train         — Washington DC · Orlando")
    print("  Crescent           — New York · Atlanta · New Orleans")
    print("  Silver Star/Meteor — New York · Miami")

if __name__ == "__main__":
    main()
