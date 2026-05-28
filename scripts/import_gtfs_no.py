#!/usr/bin/env python3
"""
WoW TRENES - Importador GTFS Noruega -> SQLite
Lee ~/Downloads/Wow trains Norway/ y genera assets/gtfs_no.db

Fuente: Entur — NLOD (Norwegian Licence for Open Government Data)
  URL: https://storage.googleapis.com/marduk-production/outbound/gtfs/rb_norway-aggregated-gtfs.zip
  Descarga directa — feed nacional agregado de Entur (NAP oficial noruego). Licencia NLOD.

Incluye: Entur nacional — Oslo, Bergen, Trondheim, Stavanger, Tromsø

Resultado esperado: ~500-800 estaciones rail, ~50-100k stop_times, ~10-25 MB
"""
import sqlite3, csv, sys, time, shutil
from pathlib import Path

_POSSIBLE_DIRS = [
    Path.home() / "Downloads" / "Wow trains Norway",
    Path.home() / "Downloads" / "Wow trains Norway ",
    Path.home() / "Downloads" / "NORWAY",
    Path.home() / "Downloads" / "Norway",
    Path.home() / "Downloads" / "NORUEGA",
    Path.home() / "Downloads" / "entur",
    Path.home() / "Downloads" / "rb_norway",]
GTFS_DIR   = next((d for d in _POSSIBLE_DIRS if d.exists()), _POSSIBLE_DIRS[0])
OUTPUT_DIR = Path(__file__).parent.parent / "assets"
OUTPUT_DB  = OUTPUT_DIR / "gtfs_norway.db"
COUNTRY    = "NO"

MAX_ST = 200_000
MAX_CD = 30_000

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
            country_code TEXT DEFAULT 'NO', location_type INTEGER DEFAULT 0,
            parent_station TEXT);
        CREATE TABLE IF NOT EXISTS routes (
            route_id TEXT PRIMARY KEY, agency_id TEXT,
            route_short_name TEXT, route_long_name TEXT, route_type INTEGER);
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
    print(f"\nWoW TRENES - Importador GTFS Noruega (Entur)")
    print("=" * 55)

    if not GTFS_DIR.exists():
        print(f"\nERROR: Carpeta no encontrada. Probé:")
        for d in _POSSIBLE_DIRS: print(f"  {d}")
        print("\nDescarga:")
        print("  https://storage.googleapis.com/marduk-production/outbound/gtfs/rb_norway-aggregated-gtfs.zip")
        print("  Descarga directa — feed nacional agregado de Entur (NAP oficial noruego). Licencia NLOD.")
        print(f"  Descomprime en: ~/Downloads/Wow trains Norway/")
        sys.exit(1)

    required = ["stops.txt", "routes.txt", "trips.txt", "stop_times.txt"]
    missing  = [f for f in required if not (GTFS_DIR / f).exists()]
    if missing:
        print(f"\nERROR: Faltan archivos: {missing}")
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    tmp_db = Path("/tmp/gtfs_norway_build.db")
    if tmp_db.exists(): tmp_db.unlink()

    print(f"  Origen:  {GTFS_DIR}")
    print(f"  Destino: {OUTPUT_DB}\n")

    t0   = time.time()
    conn = sqlite3.connect(str(tmp_db))

    try:
        setup(conn)

        rows = read_csv(GTFS_DIR / "agency.txt")
        conn.executemany("INSERT OR IGNORE INTO agency VALUES (?,?,?,?)",
            [(r.get("agency_id",""), r.get("agency_name",""),
              r.get("agency_url",""), r.get("agency_timezone","Europe/Oslo"))
             for r in rows])
        conn.commit()
        print(f"  Agencias: {len(rows)}")

        rows = read_csv(GTFS_DIR / "routes.txt")
        rail_routes = [(r["route_id"], r.get("agency_id",""),
                        r.get("route_short_name",""), r.get("route_long_name",""),
                        int(r.get("route_type","2")))
                       for r in rows if r.get("route_type","") in RAIL_TYPES]
        if not rail_routes:
            print("  WARN: No rail types found, using all routes as fallback")
            all_types = {}
            for r in rows:
                t = r.get("route_type","?")
                all_types[t] = all_types.get(t,0) + 1
            print("  Tipos encontrados:", dict(sorted(all_types.items())))
            rail_routes = [(r["route_id"], r.get("agency_id",""),
                            r.get("route_short_name",""), r.get("route_long_name",""),
                            int(r.get("route_type","2"))) for r in rows]
        conn.executemany("INSERT OR IGNORE INTO routes VALUES (?,?,?,?,?)", rail_routes)
        conn.commit()
        rail_route_ids = {r[0] for r in rail_routes}
        print(f"  Rutas: {len(rail_routes)}")

        rows = read_csv(GTFS_DIR / "trips.txt")
        rail_trips = [(r["trip_id"], r["route_id"], r.get("service_id",""),
                       r.get("trip_headsign",""), int(r.get("direction_id",0) or 0))
                      for r in rows if r.get("route_id","") in rail_route_ids]
        conn.executemany("INSERT OR IGNORE INTO trips VALUES (?,?,?,?,?)", rail_trips)
        conn.commit()
        rail_trip_ids = {r[0] for r in rail_trips}
        print(f"  Viajes: {len(rail_trips)}")

        print(f"  Leyendo stop_times (max {MAX_ST:,})...")
        st_data, rail_stop_ids, n = [], set(), 0
        with open(GTFS_DIR / "stop_times.txt", encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                if row.get("trip_id","") not in rail_trip_ids: continue
                sid = row.get("stop_id","")
                rail_stop_ids.add(sid)
                st_data.append((row["trip_id"], row.get("arrival_time",""),
                                row.get("departure_time",""), sid,
                                int(row.get("stop_sequence",0) or 0)))
                n += 1
                if n >= MAX_ST:
                    print(f"  Límite {MAX_ST:,} alcanzado"); break
                if n % 50_000 == 0: print(f"    {n:,} filas...")
        conn.executemany("INSERT OR IGNORE INTO stop_times VALUES (?,?,?,?,?)", st_data)
        conn.commit()
        print(f"  Stop times: {n:,} | Estaciones: {len(rail_stop_ids)}")

        rows = read_csv(GTFS_DIR / "stops.txt")
        stops_data = []
        for r in rows:
            if r.get("stop_id","") not in rail_stop_ids: continue
            try:
                lat = float(r.get("stop_lat",0))
                lon = float(r.get("stop_lon",0))
                if lat == 0 and lon == 0: continue
                stops_data.append((r["stop_id"], r.get("stop_name","").strip(),
                                   lat, lon, COUNTRY,
                                   int(r.get("location_type",0) or 0),
                                   r.get("parent_station","")))
            except: continue
        conn.executemany("INSERT OR IGNORE INTO stops VALUES (?,?,?,?,?,?,?)", stops_data)
        conn.commit()
        print(f"  Estaciones importadas: {len(stops_data)}")

        rows = read_csv(GTFS_DIR / "calendar.txt")
        if rows:
            conn.executemany("INSERT OR IGNORE INTO calendar VALUES (?,?,?,?,?,?,?,?,?,?)",
                [(r.get("service_id",""), r.get("monday",0), r.get("tuesday",0),
                  r.get("wednesday",0), r.get("thursday",0), r.get("friday",0),
                  r.get("saturday",0), r.get("sunday",0),
                  r.get("start_date",""), r.get("end_date","")) for r in rows])
            conn.commit()
            print(f"  Calendarios: {len(rows)}")

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

        print("  Creando índices...")
        conn.executescript("""
            CREATE INDEX IF NOT EXISTS idx_stops_ll    ON stops      (stop_lat, stop_lon);
            CREATE INDEX IF NOT EXISTS idx_st_stop     ON stop_times (stop_id);
            CREATE INDEX IF NOT EXISTS idx_st_trip     ON stop_times (trip_id);
            CREATE INDEX IF NOT EXISTS idx_trips_route ON trips      (route_id);
        """)
        conn.commit()

        elapsed = time.time() - t0
        conn.close()
        shutil.copy2(str(tmp_db), str(OUTPUT_DB))
        mb = OUTPUT_DB.stat().st_size / 1_048_576
        print(f"\nListo en {elapsed:.1f}s | {mb:.1f} MB")
        print(f"Archivo: {OUTPUT_DB}")
        print(f"\nNoruega lista con datos de Entur.")

    except Exception:
        import traceback; traceback.print_exc()
        conn.close(); sys.exit(1)

if __name__ == "__main__":
    main()
