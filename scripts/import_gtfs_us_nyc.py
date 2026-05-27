#!/usr/bin/env python3
"""
WoW TRENES - Importador GTFS New York City -> SQLite
Fusiona MTA Subway + LIRR + Metro-North (+ PATH opcional) en gtfs_usa_nyc.db

══════════════════════════════════════════════════════════════════════
FUENTES (todas gratuitas, sin registro):
──────────────────────────────────────────────────────────────────────
1. MTA NYC SUBWAY — route_type 1 (metro)
   ZIP: http://web.mta.info/developers/data/nyct/subway/google_transit.zip
   Carpeta: ~/Downloads/NYC Subway/
   Cubre: todas las líneas A→Z + numeradas, ~500 estaciones

2. MTA LIRR (Long Island Rail Road) — route_type 2 (rail)
   ZIP: http://web.mta.info/developers/data/lirr/google_transit.zip
   Carpeta: ~/Downloads/NYC LIRR/
   Cubre: Penn Station → Long Island (~130 estaciones)

3. MTA METRO-NORTH — route_type 2 (rail)
   ZIP: http://web.mta.info/developers/data/mnr/google_transit.zip
   Carpeta: ~/Downloads/NYC MetroNorth/
   Cubre: Grand Central → Connecticut / Hudson Valley (~120 estaciones)

Prefijos para evitar colisión de IDs:
  Subway:      SUB_
  LIRR:        LIR_
  Metro-North: MNR_
══════════════════════════════════════════════════════════════════════
"""
import sqlite3, csv, sys, time, shutil
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent.parent / "assets"
OUTPUT_DB  = OUTPUT_DIR / "gtfs_usa_nyc.db"
COUNTRY    = "US"
MAX_ST     = 200_000
MAX_CD     = 30_000

# Subway (metro) + rail
VALID_TYPES = {
    "1",  # Subway/Metro
    "2",  # Rail
    "100","101","102","103","104","105",
    "106","107","108","109","110","111",
    "112","113","114","115","116","117",
}

SOURCES = [
    {
        "name": "MTA Subway",
        "dirs": [
            Path.home() / "Downloads" / "NYC Subway",
            Path.home() / "Downloads" / "NYC SUBWAY",
            Path.home() / "Downloads" / "nyc_subway",
            Path.home() / "Downloads" / "subway",
            Path.home() / "Downloads" / "SUBWAY",
        ],
        "prefix": "SUB_",
        "timezone": "America/New_York",
    },
    {
        "name": "LIRR",
        "dirs": [
            Path.home() / "Downloads" / "NYC LIRR",
            Path.home() / "Downloads" / "LIRR",
            Path.home() / "Downloads" / "lirr",
            Path.home() / "Downloads" / "NYC_LIRR",
        ],
        "prefix": "LIR_",
        "timezone": "America/New_York",
    },
    {
        "name": "Metro-North",
        "dirs": [
            Path.home() / "Downloads" / "NYC MetroNorth",
            Path.home() / "Downloads" / "NYC METRONORTH",
            Path.home() / "Downloads" / "MetroNorth",
            Path.home() / "Downloads" / "metro_north",
            Path.home() / "Downloads" / "MNR",
        ],
        "prefix": "MNR_",
        "timezone": "America/New_York",
    },
]

def read_csv(path):
    try:
        with open(path, encoding="utf-8-sig", newline="") as f:
            return list(csv.DictReader(f))
    except FileNotFoundError:
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

def import_source(conn, source: dict, remaining_st: int) -> dict:
    name   = source["name"]
    prefix = source["prefix"]
    dirs   = source["dirs"]
    gtfs_dir = next((d for d in dirs if d.exists()), None)

    if not gtfs_dir:
        return {"skipped": True, "reason": "carpeta no encontrada", "st_used": 0}

    required = ["stops.txt", "routes.txt", "trips.txt", "stop_times.txt"]
    missing  = [f for f in required if not (gtfs_dir / f).exists()]
    if missing:
        return {"skipped": True, "reason": f"faltan: {missing}", "st_used": 0}

    print(f"\n  [{name}]  {gtfs_dir}")

    # Agency
    rows = read_csv(gtfs_dir / "agency.txt")
    for r in rows:
        conn.execute("INSERT OR IGNORE INTO agency VALUES (?,?,?,?)",
            (prefix + r.get("agency_id",""), r.get("agency_name",""),
             r.get("agency_url",""), source["timezone"]))
    conn.commit()

    # Routes — subway (1) + rail (2)
    rows = read_csv(gtfs_dir / "routes.txt")
    rail_routes = []
    for r in rows:
        rt = str(r.get("route_type","")).strip()
        if rt not in VALID_TYPES: continue
        rail_routes.append((
            prefix + r["route_id"], prefix + r.get("agency_id",""),
            r.get("route_short_name",""), r.get("route_long_name",""),
            int(rt), name
        ))
    if not rail_routes:
        rail_routes = [(
            prefix + r["route_id"], prefix + r.get("agency_id",""),
            r.get("route_short_name",""), r.get("route_long_name",""),
            int(r.get("route_type","1") or "1"), name
        ) for r in rows]
    conn.executemany("INSERT OR IGNORE INTO routes VALUES (?,?,?,?,?,?)", rail_routes)
    conn.commit()
    rail_route_ids = {r[0] for r in rail_routes}
    print(f"    Rutas: {len(rail_routes)}")

    # Trips
    rows = read_csv(gtfs_dir / "trips.txt")
    rail_trips = []
    for r in rows:
        rid = prefix + r.get("route_id","")
        if rid not in rail_route_ids: continue
        rail_trips.append((
            prefix + r["trip_id"], rid,
            prefix + r.get("service_id",""),
            r.get("trip_headsign",""),
            int(r.get("direction_id","0") or "0")
        ))
    conn.executemany("INSERT OR IGNORE INTO trips VALUES (?,?,?,?,?)", rail_trips)
    conn.commit()
    rail_trip_ids = {r[0] for r in rail_trips}
    print(f"    Viajes: {len(rail_trips)}")

    # Stop times
    st_data = []
    rail_stop_ids = set()
    n = 0
    with open(gtfs_dir / "stop_times.txt", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            tid = prefix + row.get("trip_id","")
            if tid not in rail_trip_ids: continue
            sid = prefix + row.get("stop_id","")
            rail_stop_ids.add(sid)
            st_data.append((tid, row.get("arrival_time",""),
                            row.get("departure_time",""), sid,
                            int(row.get("stop_sequence","0") or "0")))
            n += 1
            if n >= remaining_st:
                print(f"    Límite global alcanzado")
                break
    conn.executemany("INSERT OR IGNORE INTO stop_times VALUES (?,?,?,?,?)", st_data)
    conn.commit()
    print(f"    Stop times: {n:,} | Estaciones: {len(rail_stop_ids)}")

    # Stops
    rows = read_csv(gtfs_dir / "stops.txt")
    stops_data = []
    for r in rows:
        sid = prefix + r.get("stop_id","")
        if sid not in rail_stop_ids: continue
        try:
            lat = float(r.get("stop_lat","0"))
            lon = float(r.get("stop_lon","0"))
            if lat == 0 and lon == 0: continue
            parent = r.get("parent_station","")
            stops_data.append((
                sid, r.get("stop_name","").strip(),
                lat, lon, COUNTRY,
                int(r.get("location_type","0") or "0"),
                (prefix + parent) if parent else ""
            ))
        except: continue
    conn.executemany("INSERT OR IGNORE INTO stops VALUES (?,?,?,?,?,?,?)", stops_data)
    conn.commit()
    print(f"    Estaciones: {len(stops_data)}")

    # Calendar
    rows = read_csv(gtfs_dir / "calendar.txt")
    if rows:
        conn.executemany("INSERT OR IGNORE INTO calendar VALUES (?,?,?,?,?,?,?,?,?,?)",
            [(prefix + r.get("service_id",""), r.get("monday",0), r.get("tuesday",0),
              r.get("wednesday",0), r.get("thursday",0), r.get("friday",0),
              r.get("saturday",0), r.get("sunday",0),
              r.get("start_date",""), r.get("end_date","")) for r in rows])
        conn.commit()

    # Calendar dates
    cd_file = gtfs_dir / "calendar_dates.txt"
    if cd_file.exists():
        cd_data = []
        with open(cd_file, encoding="utf-8-sig", newline="") as f:
            for i, row in enumerate(csv.DictReader(f)):
                if i >= MAX_CD: break
                cd_data.append((prefix + row.get("service_id",""),
                                row.get("date",""), int(row.get("exception_type","1"))))
        conn.executemany("INSERT OR IGNORE INTO calendar_dates VALUES (?,?,?)", cd_data)
        conn.commit()

    return {"skipped": False, "stops": len(stops_data), "trips": len(rail_trips), "st_used": n}


def main():
    print("\nWoW TRENES - Importador GTFS New York City (MTA)")
    print("=" * 52)
    print("  Fusiona: Subway + LIRR + Metro-North")
    print("  (procesa las carpetas que encuentre)\n")

    tmp_db = Path("/tmp/gtfs_nyc_build.db")
    if tmp_db.exists(): tmp_db.unlink()

    t0 = time.time()
    conn = sqlite3.connect(str(tmp_db))
    setup(conn)

    total_stops = 0
    total_trips = 0
    imported    = 0
    st_used     = 0

    for source in SOURCES:
        result = import_source(conn, source, MAX_ST - st_used)
        if result.get("skipped"):
            print(f"\n  [{source['name']}] → SALTADO ({result['reason']})")
        else:
            total_stops += result["stops"]
            total_trips += result["trips"]
            st_used     += result["st_used"]
            imported    += 1

    if imported == 0:
        print("\nERROR: No se encontró ninguna fuente MTA. Descargá al menos una:")
        print("  Subway:     http://web.mta.info/developers/data/nyct/subway/google_transit.zip")
        print("  → ~/Downloads/NYC Subway/")
        print("  LIRR:       http://web.mta.info/developers/data/lirr/google_transit.zip")
        print("  → ~/Downloads/NYC LIRR/")
        print("  Metro-North:http://web.mta.info/developers/data/mnr/google_transit.zip")
        print("  → ~/Downloads/NYC MetroNorth/")
        conn.close()
        sys.exit(1)

    print("\n  Creando índices...")
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

    print(f"\n{'='*52}")
    print(f"Listo en {elapsed:.1f}s")
    print(f"Archivo: {OUTPUT_DB}")
    print(f"Tamaño:  {mb:.1f} MB")
    print(f"Fuentes: {imported} importada(s)")
    print(f"Total:   ~{total_stops} estaciones · ~{total_trips} viajes")

if __name__ == "__main__":
    main()
