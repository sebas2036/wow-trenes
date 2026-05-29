#!/usr/bin/env python3
"""
WoW TRENES — Importar GTFS Barcelona TMB via API oficial
Usa las credenciales de developer.tmb.cat para descargar datos reales.

Uso:
    python3 scripts/import_gtfs_es_bcn_api.py --app-id e69d854f --app-key TU_KEY

Qué hace:
  1. Descarga todas las paradas de metro via /transit/parades
  2. Descarga todas las líneas via /transit/linies/metro
  3. Construye stop_times aproximados (la API TMB no expone GTFS completo,
     solo tiempo real — para horarios estáticos usamos frecuencias reales)
  4. Genera assets/gtfs_es_bcn.db con coordenadas GPS reales de TMB
"""
import argparse, sqlite3, shutil, time, json, urllib.request
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent.parent / "assets"
OUTPUT_DB  = OUTPUT_DIR / "gtfs_es_bcn.db"
BASE_URL   = "https://api.tmb.cat/v1"

# Colores oficiales TMB
LINE_COLORS = {
    "1": "DB1F25", "2": "A455A4", "3": "3FA63D",
    "4": "FFD616", "5": "0059A7", "9": "F06B00",
    "10": "0095B7", "11": "7ED348",
    "91": "F06B00",  # L9S
}

HEADWAY = {  # minutos entre trenes (día laborable punta)
    "1": 3, "2": 5, "3": 3, "4": 4, "5": 4,
    "9": 6, "10": 6, "11": 10, "91": 8,
}
_FIRST_MIN = 300    # 05:00
_LAST_MIN  = 1440   # 00:00


def tmb_get(path: str, app_id: str, app_key: str) -> dict:
    url = f"{BASE_URL}{path}?app_id={app_id}&app_key={app_key}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def fmt_time(minutes: int) -> str:
    h, m = divmod(minutes, 60)
    return f"{h:02d}:{m:02d}:00"


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
            country_code TEXT DEFAULT 'ES', location_type INTEGER DEFAULT 0,
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
    """)
    conn.commit()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app-id",  required=True)
    ap.add_argument("--app-key", required=True)
    args = ap.parse_args()

    print("\nWoW TRENES — Barcelona TMB API Import")
    print("=" * 42)
    t0 = time.time()

    # ── 1. Descargar líneas ───────────────────────────────────────────────────
    print("  Descargando líneas metro TMB...")
    linies_data = tmb_get("/transit/linies/metro", args.app_id, args.app_key)
    linies = linies_data.get("data", {}).get("features", [])
    print(f"  → {len(linies)} líneas")

    # ── 2. Descargar paradas ──────────────────────────────────────────────────
    print("  Descargando paradas metro TMB...")
    parades_data = tmb_get("/transit/parades", args.app_id, args.app_key)
    parades = parades_data.get("data", {}).get("features", [])
    # Filtrar solo metro (TIPUS_PARADA = "M")
    metro_parades = [
        p for p in parades
        if p.get("properties", {}).get("TIPUS_PARADA") == "M"
    ]
    print(f"  → {len(metro_parades)} paradas metro")

    # ── 3. Construir DB ───────────────────────────────────────────────────────
    tmp_db = Path("/tmp/gtfs_es_bcn_api.db")
    if tmp_db.exists():
        tmp_db.unlink()

    conn = sqlite3.connect(str(tmp_db))
    setup(conn)

    # Agency
    conn.execute("INSERT OR IGNORE INTO agency VALUES (?,?,?,?)",
        ("TMB", "Transports Metropolitans de Barcelona",
         "https://www.tmb.cat", "Europe/Madrid"))
    conn.commit()

    # Routes
    route_names = {}
    for linia in linies:
        props = linia.get("properties", {})
        codi  = str(props.get("CODI_LINIA", ""))
        nom   = props.get("NOM_LINIA", f"L{codi}")
        color = LINE_COLORS.get(codi, "888888")
        route_id = f"L{codi}" if codi not in ("9", "91", "10") else (
            "L9N" if codi == "9" else ("L9S" if codi == "91" else "L10N"))
        route_names[codi] = route_id
        conn.execute("INSERT OR IGNORE INTO routes VALUES (?,?,?,?,?,?,?)",
            (route_id, "TMB", route_id, nom, 1, color, "Barcelona"))
    conn.commit()
    print(f"  Rutas: {len(route_names)}")

    # Stops
    stop_rows = []
    for p in metro_parades:
        props = p.get("properties", {})
        geo   = p.get("geometry", {}).get("coordinates", [0, 0])
        sid   = f"TMB_{props.get('CODI_PARADA', '')}"
        name  = props.get("NOM_PARADA", "")
        lat   = float(geo[1]) if geo[1] else 0.0
        lon   = float(geo[0]) if geo[0] else 0.0
        if not name or not lat:
            continue
        stop_rows.append((sid, name, lat, lon, "ES", 0, ""))
    conn.executemany("INSERT OR IGNORE INTO stops VALUES (?,?,?,?,?,?,?)", stop_rows)
    conn.commit()
    print(f"  Paradas: {len(stop_rows)}")

    # Trips + stop_times por línea y dirección ─────────────────────────────────
    # La API TMB no expone GTFS con secuencias de paradas completas por viaje,
    # solo /properes-arribades en tiempo real.
    # Usamos frecuencias reales y orden geográfico aproximado.
    trip_count = 0
    st_count   = 0
    trips_batch = []
    st_batch    = []

    for codi, route_id in route_names.items():
        # Paradas de esta línea
        line_stops = []
        for p in metro_parades:
            props = p.get("properties", {})
            linies_parada = str(props.get("LINIES", ""))
            if codi in linies_parada.split(",") or \
               f"L{codi}" in linies_parada or route_id in linies_parada:
                sid = f"TMB_{props.get('CODI_PARADA', '')}"
                geo = p.get("geometry", {}).get("coordinates", [0, 0])
                line_stops.append((sid, float(geo[1]), float(geo[0])))

        if len(line_stops) < 2:
            continue

        # Ordenar por latitud (aproximación para direcciones N↔S)
        line_stops.sort(key=lambda x: x[1])
        headway = HEADWAY.get(codi, 5)
        dwell   = 2  # minutos entre paradas

        for direction in (0, 1):
            seq = line_stops if direction == 0 else list(reversed(line_stops))
            headsign = seq[-1][0]
            dep = _FIRST_MIN
            while dep <= _LAST_MIN:
                trip_id = f"{route_id}_d{direction}_{dep:04d}"
                trips_batch.append((trip_id, route_id, "ALL", headsign, direction))
                for i, (sid, _, __) in enumerate(seq):
                    ts = fmt_time(dep + i * dwell)
                    st_batch.append((trip_id, ts, ts, sid, i))
                trip_count += 1
                st_count   += len(seq)
                dep        += headway

    conn.executemany("INSERT OR IGNORE INTO trips VALUES (?,?,?,?,?)", trips_batch)
    conn.executemany("INSERT OR IGNORE INTO stop_times VALUES (?,?,?,?,?)", st_batch)
    conn.commit()
    print(f"  Trips:      {trip_count:,}")
    print(f"  Stop_times: {st_count:,}")

    # Calendar
    conn.execute("INSERT OR IGNORE INTO calendar VALUES (?,?,?,?,?,?,?,?,?,?)",
        ("WD",  1,1,1,1,1,0,0, "20260101","20261231"))
    conn.execute("INSERT OR IGNORE INTO calendar VALUES (?,?,?,?,?,?,?,?,?,?)",
        ("WE",  0,0,0,0,0,1,1, "20260101","20261231"))
    conn.execute("INSERT OR IGNORE INTO calendar VALUES (?,?,?,?,?,?,?,?,?,?)",
        ("ALL", 1,1,1,1,1,1,1, "20260101","20261231"))
    conn.commit()

    # Índices
    conn.executescript("""
        CREATE INDEX IF NOT EXISTS idx_stops_ll    ON stops (stop_lat, stop_lon);
        CREATE INDEX IF NOT EXISTS idx_st_stop     ON stop_times (stop_id);
        CREATE INDEX IF NOT EXISTS idx_trips_route ON trips (route_id);
    """)
    conn.commit()
    conn.close()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(str(tmp_db), str(OUTPUT_DB))
    tmp_db.unlink()

    elapsed = time.time() - t0
    mb = OUTPUT_DB.stat().st_size / 1_048_576
    print(f"\n  ✓ Listo en {elapsed:.1f}s  —  {mb:.2f} MB")
    print(f"  Archivo: {OUTPUT_DB}")
    print(f"\n  Ejecuta en tu terminal:")
    print(f"  python3 scripts/import_gtfs_es_bcn_api.py \\")
    print(f"    --app-id {args.app_id} --app-key TU_APP_KEY")


if __name__ == "__main__":
    main()
