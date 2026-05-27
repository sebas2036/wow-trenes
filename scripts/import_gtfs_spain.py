#!/usr/bin/env python3
"""
WoW TRENES - Importador GTFS España -> SQLite
Lee ~/Downloads/Wow trains Spain/ y genera assets/gtfs_spain.db (~30-60MB)

Fuente: Renfe Data (data.renfe.com) — Creative Commons BY 4.0
  Dataset: Horarios de Alta Velocidad, Larga Distancia y Media Distancia
  URL:     https://data.renfe.com/dataset/horarios-de-alta-velocidad-larga-distancia-y-media-distancia
  ZIP:     https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip

Incluye: AVE, Alvia, Avant, Alaris, Euromed, Intercity, Trenhotel, MD
No incluye: Cercanías, FEVE (redes de cercanías separadas)

Resultado esperado: ~700-1000 estaciones, ~50-80k stop_times, ~25-45 MB
"""
import sqlite3, csv, os, sys, time
from pathlib import Path

# Acepta cualquiera de estos nombres de carpeta
_POSSIBLE_DIRS = [
    Path.home() / "Downloads" / "Wow trains Spain",
    Path.home() / "Downloads" / "google_transit",
    Path.home() / "Downloads" / "Wow trains Spain ",  # trailing space
]
GTFS_DIR = next((d for d in _POSSIBLE_DIRS if d.exists()), _POSSIBLE_DIRS[0])
OUTPUT_DIR = Path(__file__).parent.parent / "assets"
OUTPUT_DB  = OUTPUT_DIR / "gtfs_spain.db"
COUNTRY    = "ES"

# Límites — objetivo ~40-50 MB final
MAX_ST     = 200_000   # stop_times max rows
MAX_CD     = 30_000    # calendar_dates max rows

# Renfe usa route_type estándar:
#   2   = Rail
#   100-117 = Extended rail types
RAIL_TYPES = {
    "2",
    "100", "101", "102", "103", "104", "105",
    "106", "107", "108", "109", "110", "111",
    "112", "113", "114", "115", "116", "117",
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
            country_code   TEXT DEFAULT 'ES',
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
    Renfe a veces incluye sufijos como '(MADRID)' en mayúsculas.
    Normalizamos a Title Case limpio.
    """
    name = name.strip()
    # Renfe usa MAYÚSCULAS en muchos nombres — convertimos a Title Case
    if name.isupper():
        name = name.title()
    # Correcciones comunes
    replacements = {
        " (Ave)": "", " (Md)": "", " (Ld)": "",
        "Huelva-": "Huelva ", "Madrid-": "Madrid ",
    }
    for old, new in replacements.items():
        name = name.replace(old, new)
    return name.strip()

def main():
    print("\nWoW TRENES - Importador GTFS España (Renfe)")
    print("=" * 44)

    if not GTFS_DIR.exists():
        print(f"\nERROR: Carpeta no encontrada: {GTFS_DIR}")
        print("\nPasos para descargar:")
        print("  1. Baja el ZIP desde:")
        print("     https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip")
        print("  2. Descomprime en: ~/Downloads/Wow trains Spain/")
        print("     (tiene que quedar: ~/Downloads/Wow trains Spain/stops.txt, etc.)")
        sys.exit(1)

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
              r.get("agency_url",""), r.get("agency_timezone","Europe/Madrid"))
             for r in rows])
        conn.commit()
        print(f"  Agencias: {len(rows)}")

        # ── Routes (solo rail) ───────────────────────────────────────────────
        rows = read_csv(GTFS_DIR / "routes.txt")
        rail_routes = [
            (r["route_id"], r.get("agency_id",""),
             r.get("route_short_name",""), r.get("route_long_name",""),
             int(r.get("route_type","2")))
            for r in rows if r.get("route_type","") in RAIL_TYPES
        ]
        # Si no hay rutas con tipos rail, incluir TODAS (Renfe a veces usa solo tipo 2)
        if not rail_routes:
            print("  WARN: No se encontraron rutas con tipos rail estándar.")
            print("  Revisando todos los route_type disponibles...")
            all_types = {}
            for r in rows:
                t = r.get("route_type","?")
                all_types[t] = all_types.get(t,0) + 1
            print("  Tipos encontrados:", dict(sorted(all_types.items())))
            # Incluir todas las rutas como fallback
            rail_routes = [
                (r["route_id"], r.get("agency_id",""),
                 r.get("route_short_name",""), r.get("route_long_name",""),
                 int(r.get("route_type","2")))
                for r in rows
            ]
            print(f"  Usando todas las rutas como fallback: {len(rail_routes)}")

        conn.executemany("INSERT OR IGNORE INTO routes VALUES (?,?,?,?,?)", rail_routes)
        conn.commit()
        rail_route_ids = {r[0] for r in rail_routes}
        print(f"  Rutas ferroviarias: {len(rail_routes)}")

        # ── Trips ────────────────────────────────────────────────────────────
        rows = read_csv(GTFS_DIR / "trips.txt")
        rail_trips = [
            (r["trip_id"], r["route_id"], r.get("service_id",""),
             r.get("trip_headsign",""), int(r.get("direction_id",0) or 0))
            for r in rows if r.get("route_id","") in rail_route_ids
        ]
        conn.executemany("INSERT OR IGNORE INTO trips VALUES (?,?,?,?,?)", rail_trips)
        conn.commit()
        rail_trip_ids = {r[0] for r in rail_trips}
        print(f"  Viajes: {len(rail_trips)}")

        # ── Stop times ───────────────────────────────────────────────────────
        print(f"  Leyendo stop_times (max {MAX_ST:,})...")
        st_data       = []
        rail_stop_ids = set()
        n             = 0

        with open(GTFS_DIR / "stop_times.txt", encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                if row.get("trip_id","") not in rail_trip_ids:
                    continue
                sid = row.get("stop_id","")
                rail_stop_ids.add(sid)
                st_data.append((
                    row["trip_id"],
                    row.get("arrival_time",""),
                    row.get("departure_time",""),
                    sid,
                    int(row.get("stop_sequence",0) or 0),
                ))
                n += 1
                if n >= MAX_ST:
                    print(f"  Límite {MAX_ST:,} filas alcanzado")
                    break
                if n % 50_000 == 0:
                    print(f"    {n:,} filas procesadas...")

        conn.executemany("INSERT OR IGNORE INTO stop_times VALUES (?,?,?,?,?)", st_data)
        conn.commit()
        print(f"  Stop times: {n:,} | Estaciones con tren: {len(rail_stop_ids)}")

        # ── Stops (solo las que tienen servicio) ─────────────────────────────
        rows = read_csv(GTFS_DIR / "stops.txt")
        stops_data = []
        for r in rows:
            sid = r.get("stop_id","")
            if sid not in rail_stop_ids:
                continue
            try:
                lat = float(r.get("stop_lat",0))
                lon = float(r.get("stop_lon",0))
                if lat == 0.0 and lon == 0.0:
                    continue
                stops_data.append((
                    sid,
                    clean_stop_name(r.get("stop_name","")),
                    lat,
                    lon,
                    COUNTRY,
                    int(r.get("location_type",0) or 0),
                    r.get("parent_station",""),
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

        # ── Calendar dates ────────────────────────────────────────────────────
        cd_data = []
        cd_file = GTFS_DIR / "calendar_dates.txt"
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
            print(f"  Excepciones calendario: {len(cd_data)}")

        # ── Índices ───────────────────────────────────────────────────────────
        print("  Creando índices...")
        conn.executescript("""
            CREATE INDEX IF NOT EXISTS idx_stops_ll    ON stops      (stop_lat, stop_lon);
            CREATE INDEX IF NOT EXISTS idx_st_stop     ON stop_times (stop_id);
            CREATE INDEX IF NOT EXISTS idx_st_trip     ON stop_times (trip_id);
            CREATE INDEX IF NOT EXISTS idx_trips_route ON trips      (route_id);
        """)
        conn.commit()

        elapsed = time.time() - t0
        mb      = OUTPUT_DB.stat().st_size / 1_048_576
        print(f"\nListo en {elapsed:.1f}s")
        print(f"Archivo: {OUTPUT_DB}")
        print(f"Tamaño:  {mb:.1f} MB")
        print("\nEspaña lista con datos reales de Renfe (AVE + LD + MD).")

    except Exception:
        import traceback
        traceback.print_exc()
        conn.close()
        sys.exit(1)

    conn.close()

if __name__ == "__main__":
    main()
