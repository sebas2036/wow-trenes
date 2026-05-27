#!/usr/bin/env python3
"""
WoW TRENES - Importador GTFS Italia -> SQLite (multi-región)
Fusiona múltiples feeds regionales en assets/gtfs_italy.db

SITUACIÓN: Trenitalia/RFI no publica GTFS nacional (violación de directiva UE 2017/1926).
Usamos los feeds regionales públicos disponibles y los fusionamos en un solo DB.

══════════════════════════════════════════════════════════════════════
FUENTES CONFIRMADAS:
──────────────────────────────────────────────────────────────────────
1. LOMBARDÍA (Trenord) — Regione Lombardia, CC BY 4.0
   ZIP:  https://www.dati.lombardia.it/download/3z4k-mxz9/application/zip
   Carpeta: ~/Downloads/TRENITALIA/  (o "Wow trains Italy/")
   Cubre: Milano, Bergamo, Brescia, Como, Varese, Malpensa, Mantova

2. TOSCANA (Trenitalia regionale) — Regione Toscana, CC BY 4.0
   ZIP:  https://dati.toscana.it/dataset/8bb8f8fe-fe7d-41d0-90dc-49f2456180d1/resource/4f85393b-357d-443d-8378-65de4198505f/download/trenitalia.gtfs
   Carpeta: ~/Downloads/TOSCANA TRENITALIA/
   Cubre: Firenze, Pisa, Livorno, Siena, Arezzo, Grosseto, Lucca
   Actualizado: enero 2026

3. EMILIA-ROMAGNA (Trenitalia TPER) — pendiente
   Carpeta: ~/Downloads/EMILIA TRENITALIA/
   Cubre: Bologna, Ferrara, Rimini, Modena, Parma, Reggio Emilia

══════════════════════════════════════════════════════════════════════
INSTRUCCIONES DE DESCARGA:
──────────────────────────────────────────────────────────────────────
Lombardía (Trenord) — ya deberías tenerla en ~/Downloads/TRENITALIA/

Toscana (Trenitalia) — baja el ZIP desde:
  https://dati.toscana.it/dataset/8bb8f8fe-fe7d-41d0-90dc-49f2456180d1/resource/4f85393b-357d-443d-8378-65de4198505f/download/trenitalia.gtfs
  Descomprime en: ~/Downloads/TOSCANA TRENITALIA/

El script importa automáticamente las carpetas que encuentre y salta las que faltan.
══════════════════════════════════════════════════════════════════════

Resultado esperado con todas las fuentes:
  ~1.200-1.500 estaciones, ~200k stop_times, ~20-35 MB
"""
import sqlite3, csv, sys, time, shutil
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent.parent / "assets"
OUTPUT_DB  = OUTPUT_DIR / "gtfs_italy.db"
COUNTRY    = "IT"
MAX_ST_PER_SOURCE = 200_000
MAX_CD_PER_SOURCE = 30_000

RAIL_TYPES = {
    "2",
    "100","101","102","103","104","105",
    "106","107","108","109","110","111",
    "112","113","114","115","116","117",
}

# ── Fuentes regionales ─────────────────────────────────────────────────────────
# Cada fuente tiene una lista de posibles carpetas (se usa la primera que exista)
SOURCES = [
    {
        "name": "Lombardía (Trenord)",
        "dirs": [
            Path.home() / "Downloads" / "TRENITALIA",
            Path.home() / "Downloads" / "TRENITALIA ",
            Path.home() / "Downloads" / "Wow trains Italy",
            Path.home() / "Downloads" / "Wow trains Italy ",
            Path.home() / "Downloads" / "trenord",
            Path.home() / "Downloads" / "Trenord",
        ],
        "timezone": "Europe/Rome",
    },
    {
        "name": "Toscana (Trenitalia)",
        "dirs": [
            Path.home() / "Downloads" / "TOSCANA TRENITALIA",
            Path.home() / "Downloads" / "TOSCANA",
            Path.home() / "Downloads" / "Toscana",
            Path.home() / "Downloads" / "toscana",
            Path.home() / "Downloads" / "trenitalia_toscana",
            Path.home() / "Downloads" / "TRENITALIA TOSCANA",
        ],
        "timezone": "Europe/Rome",
    },
    {
        "name": "Emilia-Romagna (TPER)",
        "dirs": [
            Path.home() / "Downloads" / "EMILIA TRENITALIA",
            Path.home() / "Downloads" / "EMILIA",
            Path.home() / "Downloads" / "Emilia",
            Path.home() / "Downloads" / "tper",
            Path.home() / "Downloads" / "TPER",
            Path.home() / "Downloads" / "trenitalia_emilia",
        ],
        "timezone": "Europe/Rome",
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
            country_code TEXT DEFAULT 'IT', location_type INTEGER DEFAULT 0,
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
    name = name.strip()
    if name.isupper() and len(name) > 3:
        name = name.title()
    for suffix in [" (Long)", " (Short)", " (Bus)", " Fs", " Fs "]:
        if name.endswith(suffix):
            name = name[:-len(suffix)].strip()
    return name

def import_source(conn, source: dict, prefix: str) -> dict:
    """
    Importa una fuente regional al DB. Usa 'prefix' para evitar colisiones
    de IDs entre fuentes distintas (ej: stop_id "100" puede existir en varias).
    Retorna estadísticas.
    """
    name = source["name"]
    dirs = source["dirs"]
    gtfs_dir = next((d for d in dirs if d.exists()), None)

    if not gtfs_dir:
        return {"skipped": True, "reason": "carpeta no encontrada"}

    required = ["stops.txt", "routes.txt", "trips.txt", "stop_times.txt"]
    missing  = [f for f in required if not (gtfs_dir / f).exists()]
    if missing:
        return {"skipped": True, "reason": f"faltan archivos: {missing}"}

    print(f"\n  [{name}]")
    print(f"    Origen: {gtfs_dir}")

    # Agency
    rows = read_csv(gtfs_dir / "agency.txt")
    agency_ids = set()
    for r in rows:
        aid = prefix + r.get("agency_id", "")
        agency_ids.add(aid)
        conn.execute("INSERT OR IGNORE INTO agency VALUES (?,?,?,?)",
            (aid, r.get("agency_name",""), r.get("agency_url",""),
             source["timezone"]))
    conn.commit()

    # Routes
    rows = read_csv(gtfs_dir / "routes.txt")
    rail_routes = []
    for r in rows:
        rt = r.get("route_type","")
        if rt not in RAIL_TYPES:
            continue
        rail_routes.append((
            prefix + r["route_id"],
            prefix + r.get("agency_id",""),
            r.get("route_short_name",""), r.get("route_long_name",""),
            int(rt), name
        ))
    # fallback: include all if no rail types found
    if not rail_routes:
        rail_routes = [(
            prefix + r["route_id"], prefix + r.get("agency_id",""),
            r.get("route_short_name",""), r.get("route_long_name",""),
            int(r.get("route_type","2") or "2"), name
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
            int(r.get("direction_id",0) or 0)
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
                            int(row.get("stop_sequence",0) or 0)))
            n += 1
            if n >= MAX_ST_PER_SOURCE: break
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
            lat = float(r.get("stop_lat",0))
            lon = float(r.get("stop_lon",0))
            if lat == 0 and lon == 0: continue
            parent = r.get("parent_station","")
            stops_data.append((
                sid, clean_stop_name(r.get("stop_name","")),
                lat, lon, COUNTRY,
                int(r.get("location_type",0) or 0),
                (prefix + parent) if parent else ""
            ))
        except: continue
    conn.executemany("INSERT OR IGNORE INTO stops VALUES (?,?,?,?,?,?,?)", stops_data)
    conn.commit()
    print(f"    Estaciones importadas: {len(stops_data)}")

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
                if i >= MAX_CD_PER_SOURCE: break
                cd_data.append((prefix + row.get("service_id",""),
                                row.get("date",""), int(row.get("exception_type",1))))
        conn.executemany("INSERT OR IGNORE INTO calendar_dates VALUES (?,?,?)", cd_data)
        conn.commit()
        print(f"    Excepciones calendario: {len(cd_data)}")

    return {"skipped": False, "stops": len(stops_data), "trips": len(rail_trips), "stop_times": n}

def main():
    print("\nWoW TRENES - Importador GTFS Italia (multi-región)")
    print("=" * 52)
    print("  Fusiona: Lombardía + Toscana + Emilia-Romagna")
    print("  (procesa las carpetas que encuentre, salta las que faltan)\n")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Crear en /tmp primero para evitar problemas de permisos con WAL
    tmp_db = Path("/tmp/gtfs_italy_build.db")
    if tmp_db.exists(): tmp_db.unlink()

    t0   = time.time()
    conn = sqlite3.connect(str(tmp_db))

    print("Configurando schema...")
    setup(conn)

    # Agregar columna source_region a routes si no existe
    try:
        conn.execute("ALTER TABLE routes ADD COLUMN source_region TEXT")
        conn.commit()
    except: pass

    total_stops = 0
    total_trips = 0
    imported    = 0

    # Prefijos para evitar colisión de IDs entre regiones
    PREFIXES = ["LOM_", "TOS_", "EMR_", "VEN_", "CAM_", "LAZ_"]

    for i, source in enumerate(SOURCES):
        prefix = PREFIXES[i] if i < len(PREFIXES) else f"REG{i}_"
        result = import_source(conn, source, prefix)
        if result.get("skipped"):
            print(f"\n  [{source['name']}] → SALTADO ({result['reason']})")
        else:
            total_stops += result["stops"]
            total_trips += result["trips"]
            imported    += 1

    if imported == 0:
        print("\nERROR: No se encontró ninguna fuente. Descarga al menos una carpeta:")
        print("  Lombardía: https://www.dati.lombardia.it/download/3z4k-mxz9/application/zip")
        print("  → Descomprime en: ~/Downloads/TRENITALIA/")
        print()
        print("  Toscana:   https://dati.toscana.it/dataset/8bb8f8fe-fe7d-41d0-90dc-49f2456180d1/")
        print("             resource/4f85393b-357d-443d-8378-65de4198505f/download/trenitalia.gtfs")
        print("  → Descomprime en: ~/Downloads/TOSCANA TRENITALIA/")
        conn.close()
        sys.exit(1)

    # Índices
    print("\n  Creando índices...")
    conn.executescript("""
        CREATE INDEX IF NOT EXISTS idx_stops_ll    ON stops      (stop_lat, stop_lon);
        CREATE INDEX IF NOT EXISTS idx_st_stop     ON stop_times (stop_id);
        CREATE INDEX IF NOT EXISTS idx_st_trip     ON stop_times (trip_id);
        CREATE INDEX IF NOT EXISTS idx_trips_route ON trips      (route_id);
    """)
    conn.commit()
    conn.close()

    # Copiar al destino final
    shutil.copy2(str(tmp_db), str(OUTPUT_DB))
    tmp_db.unlink()

    elapsed = time.time() - t0
    mb      = OUTPUT_DB.stat().st_size / 1_048_576

    print(f"\n{'='*52}")
    print(f"Listo en {elapsed:.1f}s")
    print(f"Archivo: {OUTPUT_DB}")
    print(f"Tamaño:  {mb:.1f} MB")
    print(f"Fuentes: {imported} región(es) importada(s)")
    print(f"Total:   ~{total_stops} estaciones · ~{total_trips} viajes")
    print()
    print("Cobertura:")
    if any(next((d for d in s["dirs"] if d.exists()), None) for s in SOURCES[:1]):
        print("  ✓ Lombardía — Milano, Bergamo, Brescia, Como, Varese, Malpensa")
    if any(next((d for d in s["dirs"] if d.exists()), None) for s in SOURCES[1:2]):
        print("  ✓ Toscana   — Firenze, Pisa, Livorno, Siena, Arezzo, Grosseto")
    if any(next((d for d in s["dirs"] if d.exists()), None) for s in SOURCES[2:3]):
        print("  ✓ Emilia    — Bologna, Ferrara, Rimini, Modena, Parma")

if __name__ == "__main__":
    main()
