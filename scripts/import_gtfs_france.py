#!/usr/bin/env python3
"""
WoW TRENES - Importador GTFS Francia -> SQLite
Lee ~/Downloads/Wow trains France/ y genera assets/gtfs_france.db (~30-50MB)

Fuente: data.sncf.com
  Dataset: "Horaires des TER" + "Horaires des trains Intercites"
  URL: https://data.sncf.com/explore/dataset/horaires-des-trains-voyageurs-gtfs/

Solo trenes de viajeros largo recorrido (route_type 2 y 100-117).
Excluye metro, tramvia, Transilien (IDFM), autobuses sustitutivos.

Resultado esperado: ~3.000 estaciones, ~150k stop_times, ~20-35 MB
"""
import sqlite3, csv, os, sys, time
from pathlib import Path

GTFS_DIR   = Path.home() / "Downloads" / "Wow trains France"
OUTPUT_DIR = Path(__file__).parent.parent / "assets"
OUTPUT_DB  = OUTPUT_DIR / "gtfs_france.db"
COUNTRY    = "FR"

# Limitadores — ajustar si queda muy grande (>60MB)
MAX_ST     = 120_000   # stop_times max rows  → ~60-70 MB objetivo
MAX_CD     = 20_000    # calendar_dates max rows

# GTFS route_type para tren:
#   2   = Rail (estandar)
#   100 = Railway Service
#   101 = High-Speed Rail
#   102 = Long Distance Rail
#   103 = Inter Regional Rail
#   105 = Sleeper Rail
#   106 = Regional Rail
#   107 = Tourist Railway
#   109 = Suburban Railway
RAIL_TYPES = {
    "2",
    "100", "101", "102", "103", "104", "105",
    "106", "107", "108", "109", "110", "111",
    "112", "113", "114", "115", "116", "117",
}

# Prefijos de agency_id a EXCLUIR (Transilien IDFM, Keolis bus, etc.)
# Dejar vacio [] para incluir todo y filtrar solo por route_type
EXCLUDE_AGENCY_PREFIXES: list[str] = []

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
            agency_id   TEXT PRIMARY KEY,
            agency_name TEXT,
            agency_url  TEXT,
            agency_timezone TEXT
        );

        CREATE TABLE IF NOT EXISTS stops (
            stop_id        TEXT PRIMARY KEY,
            stop_name      TEXT NOT NULL,
            stop_lat       REAL NOT NULL,
            stop_lon       REAL NOT NULL,
            country_code   TEXT DEFAULT 'FR',
            location_type  INTEGER DEFAULT 0,
            parent_station TEXT
        );

        CREATE TABLE IF NOT EXISTS routes (
            route_id         TEXT PRIMARY KEY,
            agency_id        TEXT,
            route_short_name TEXT,
            route_long_name  TEXT,
            route_type       INTEGER
        );

        CREATE TABLE IF NOT EXISTS trips (
            trip_id       TEXT PRIMARY KEY,
            route_id      TEXT,
            service_id    TEXT,
            trip_headsign TEXT,
            direction_id  INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS stop_times (
            trip_id        TEXT NOT NULL,
            arrival_time   TEXT,
            departure_time TEXT,
            stop_id        TEXT NOT NULL,
            stop_sequence  INTEGER,
            PRIMARY KEY (trip_id, stop_sequence)
        );

        CREATE TABLE IF NOT EXISTS calendar (
            service_id TEXT PRIMARY KEY,
            monday     INTEGER,
            tuesday    INTEGER,
            wednesday  INTEGER,
            thursday   INTEGER,
            friday     INTEGER,
            saturday   INTEGER,
            sunday     INTEGER,
            start_date TEXT,
            end_date   TEXT
        );

        CREATE TABLE IF NOT EXISTS calendar_dates (
            service_id     TEXT,
            date           TEXT,
            exception_type INTEGER,
            PRIMARY KEY (service_id, date)
        );
    """)
    conn.commit()

def clean_stop_name(name: str) -> str:
    """
    SNCF a veces incluye sufijos como '(Paris)' o '[RATP]' en stop_name.
    Los limpiamos para un display mas limpio.
    """
    name = name.strip()
    for suffix in [" (Paris)", " [RATP]", " (Gare)", " (Gare SNCF)"]:
        if name.endswith(suffix):
            name = name[: -len(suffix)].strip()
    return name

def main():
    print("\nWoW TRENES - Importador GTFS Francia")
    print("=" * 40)

    if not GTFS_DIR.exists():
        print(f"\nERROR: Carpeta no encontrada: {GTFS_DIR}")
        print("\nPasos para descargar:")
        print("  1. Ve a: https://data.sncf.com/explore/dataset/horaires-des-trains-voyageurs-gtfs/")
        print("  2. Click 'Exporter' -> 'Fichier GTFS complet (.zip)'")
        print("  3. Descomprime en: ~/Downloads/Wow trains France/")
        print("     (tiene que quedar: ~/Downloads/Wow trains France/stops.txt, etc.)")
        sys.exit(1)

    # Verificar archivos minimos
    required = ["stops.txt", "routes.txt", "trips.txt", "stop_times.txt"]
    missing  = [f for f in required if not (GTFS_DIR / f).exists()]
    if missing:
        print(f"\nERROR: Faltan archivos: {missing}")
        print(f"Asegurate de descomprimir el ZIP en: {GTFS_DIR}")
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if OUTPUT_DB.exists():
        OUTPUT_DB.unlink()
        print("  DB anterior eliminada")

    print(f"  Origen:  {GTFS_DIR}")
    print(f"  Destino: {OUTPUT_DB}\n")

    t0   = time.time()
    conn = sqlite3.connect(OUTPUT_DB)

    try:
        print("Configurando schema...")
        setup(conn)

        # ── Agency ──────────────────────────────────────────────────────────
        rows = read_csv(GTFS_DIR / "agency.txt")
        conn.executemany("INSERT OR IGNORE INTO agency VALUES (?,?,?,?)",
            [(r.get("agency_id",""), r.get("agency_name",""),
              r.get("agency_url",""), r.get("agency_timezone","UTC"))
             for r in rows])
        conn.commit()
        print(f"  Agencias: {len(rows)}")

        # ── Routes (solo rail) ───────────────────────────────────────────────
        rows = read_csv(GTFS_DIR / "routes.txt")
        rail_routes = []
        for r in rows:
            rt = r.get("route_type", "")
            if rt not in RAIL_TYPES:
                continue
            if EXCLUDE_AGENCY_PREFIXES:
                agency = r.get("agency_id", "")
                if any(agency.startswith(p) for p in EXCLUDE_AGENCY_PREFIXES):
                    continue
            rail_routes.append((
                r["route_id"],
                r.get("agency_id", ""),
                r.get("route_short_name", ""),
                r.get("route_long_name", ""),
                int(rt),
            ))
        conn.executemany("INSERT OR IGNORE INTO routes VALUES (?,?,?,?,?)", rail_routes)
        conn.commit()
        rail_route_ids = {r[0] for r in rail_routes}
        print(f"  Rutas ferroviarias: {len(rail_routes)}")

        if not rail_routes:
            print("\nADVERTENCIA: 0 rutas ferroviarias encontradas.")
            print("El GTFS de SNCF puede usar route_type diferente.")
            print("Revisando todos los route_type en el archivo...")
            rows2 = read_csv(GTFS_DIR / "routes.txt")
            types = {}
            for r in rows2:
                t = r.get("route_type","?")
                types[t] = types.get(t,0) + 1
            print("  Tipos encontrados:", dict(sorted(types.items())))
            print("Edita RAIL_TYPES en este script y vuelve a correr.")
            conn.close()
            sys.exit(1)

        # ── Trips (solo rail) ────────────────────────────────────────────────
        rows = read_csv(GTFS_DIR / "trips.txt")
        rail_trips = [
            (r["trip_id"], r["route_id"], r.get("service_id",""),
             r.get("trip_headsign",""), int(r.get("direction_id",0) or 0))
            for r in rows if r.get("route_id","") in rail_route_ids
        ]
        conn.executemany("INSERT OR IGNORE INTO trips VALUES (?,?,?,?,?)", rail_trips)
        conn.commit()
        rail_trip_ids = {r[0] for r in rail_trips}
        print(f"  Viajes ferroviarios: {len(rail_trips)}")

        # ── Stop times (limitado) ─────────────────────────────────────────────
        print(f"  Leyendo stop_times (max {MAX_ST:,})...")
        st_data       = []
        rail_stop_ids = set()
        n             = 0

        st_file = GTFS_DIR / "stop_times.txt"
        with open(st_file, encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                trip = row.get("trip_id","")
                if trip not in rail_trip_ids:
                    continue
                sid = row.get("stop_id","")
                rail_stop_ids.add(sid)
                st_data.append((
                    trip,
                    row.get("arrival_time",""),
                    row.get("departure_time",""),
                    sid,
                    int(row.get("stop_sequence",0) or 0),
                ))
                n += 1
                if n >= MAX_ST:
                    print(f"  Limite {MAX_ST:,} filas alcanzado")
                    break
                if n % 50_000 == 0:
                    print(f"    {n:,} filas procesadas...")

        conn.executemany("INSERT OR IGNORE INTO stop_times VALUES (?,?,?,?,?)", st_data)
        conn.commit()
        print(f"  Stop times: {n:,} | Estaciones con tren: {len(rail_stop_ids)}")

        # ── Stops (solo las que tienen servicio ferroviario) ─────────────────
        rows = read_csv(GTFS_DIR / "stops.txt")
        stops_data = []
        for r in rows:
            sid = r.get("stop_id","")
            if sid not in rail_stop_ids:
                continue
            try:
                lat = float(r.get("stop_lat", 0))
                lon = float(r.get("stop_lon", 0))
                if lat == 0.0 and lon == 0.0:
                    continue
                stops_data.append((
                    sid,
                    clean_stop_name(r.get("stop_name","")),
                    lat,
                    lon,
                    COUNTRY,
                    int(r.get("location_type", 0) or 0),
                    r.get("parent_station", ""),
                ))
            except (ValueError, TypeError):
                continue

        conn.executemany("INSERT OR IGNORE INTO stops VALUES (?,?,?,?,?,?,?)", stops_data)
        conn.commit()
        print(f"  Estaciones importadas: {len(stops_data)}")

        # ── Calendar ─────────────────────────────────────────────────────────
        rows = read_csv(GTFS_DIR / "calendar.txt")
        if rows:
            conn.executemany("INSERT OR IGNORE INTO calendar VALUES (?,?,?,?,?,?,?,?,?,?)",
                [(r.get("service_id",""), r.get("monday",0), r.get("tuesday",0),
                  r.get("wednesday",0), r.get("thursday",0), r.get("friday",0),
                  r.get("saturday",0), r.get("sunday",0),
                  r.get("start_date",""), r.get("end_date","")) for r in rows])
            conn.commit()
            print(f"  Calendarios: {len(rows)}")

        # ── Calendar dates (limitado) ─────────────────────────────────────────
        cd_data  = []
        cd_file  = GTFS_DIR / "calendar_dates.txt"
        if cd_file.exists():
            with open(cd_file, encoding="utf-8-sig", newline="") as f:
                for i, row in enumerate(csv.DictReader(f)):
                    if i >= MAX_CD:
                        break
                    cd_data.append((
                        row.get("service_id",""),
                        row.get("date",""),
                        int(row.get("exception_type",1)),
                    ))
            conn.executemany("INSERT OR IGNORE INTO calendar_dates VALUES (?,?,?)", cd_data)
            conn.commit()
            print(f"  Excepciones calendario: {len(cd_data)} (limitado a {MAX_CD:,})")

        # ── Indices ───────────────────────────────────────────────────────────
        print("  Creando indices...")
        conn.executescript("""
            CREATE INDEX IF NOT EXISTS idx_stops_ll   ON stops      (stop_lat, stop_lon);
            CREATE INDEX IF NOT EXISTS idx_st_stop    ON stop_times (stop_id);
            CREATE INDEX IF NOT EXISTS idx_st_trip    ON stop_times (trip_id);
            CREATE INDEX IF NOT EXISTS idx_trips_route ON trips     (route_id);
        """)
        conn.commit()

        # ── Resumen ───────────────────────────────────────────────────────────
        elapsed = time.time() - t0
        mb      = OUTPUT_DB.stat().st_size / 1_048_576

        print(f"\nListo en {elapsed:.1f}s")
        print(f"Archivo: {OUTPUT_DB}")
        print(f"Tamano:  {mb:.1f} MB")
        print("\nFrancia lista con datos reales de SNCF.")

    except Exception:
        import traceback
        traceback.print_exc()
        conn.close()
        sys.exit(1)

    conn.close()

if __name__ == "__main__":
    main()
