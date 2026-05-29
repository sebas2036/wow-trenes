#!/usr/bin/env python3
"""
WoW TRENES — Importar GTFS Barcelona TMB via API oficial
Usa las credenciales de developer.tmb.cat

NOTA: El plan gratuito de TMB solo expone:
  ✓ GET /transit/linies/metro         → 11 líneas con colores reales
  ✓ GET /transit/parades/{id}/properes-arribades → tiempo real por parada
  ✗ GET /transit/linies/metro/{codi}/parades → 404 en plan free

Para la DB estática usa: python3 scripts/create_gtfs_es_bcn.py (hardcoded, funciona)
Este script es útil solo para obtener los colores oficiales de líneas desde la API.

Uso:
  python3 scripts/import_gtfs_es_bcn_api.py --app-id e69d854f --app-key TU_KEY
"""
import argparse, sqlite3, shutil, time, json, urllib.request, ssl, sys
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent.parent / "assets"
OUTPUT_DB  = OUTPUT_DIR / "gtfs_es_bcn.db"
BASE_URL   = "https://api.tmb.cat/v1"

# Fix SSL Mac+pyenv
try:
    import certifi
    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL_CTX = ssl.create_default_context()
    _SSL_CTX.check_hostname = False
    _SSL_CTX.verify_mode = ssl.CERT_NONE

# Headway real por línea (minutos, hora punta día laborable)
HEADWAY = {
    "L1": 3, "L2": 5, "L3": 3, "L4": 4, "L5": 4,
    "L9N": 6, "L9S": 8, "L10N": 6, "L10S": 8, "L11": 10,
    "FM": 7,
}
_FIRST_MIN = 300   # 05:00
_LAST_MIN  = 1440  # 00:00
_DWELL     = 2     # minutos entre paradas


def tmb_get(path: str, app_id: str, app_key: str) -> dict:
    url = f"{BASE_URL}{path}?app_id={app_id}&app_key={app_key}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:300]
        print(f"  HTTP {e.code} — {path}: {body}", file=sys.stderr)
        raise
    except urllib.error.URLError as e:
        print(f"  URLError — {path}: {e.reason}", file=sys.stderr)
        raise


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

    # ── 1. Líneas ─────────────────────────────────────────────────────────────
    print("  Descargando líneas...")
    linies_data = tmb_get("/transit/linies/metro", args.app_id, args.app_key)
    linies = linies_data.get("features", [])
    print(f"  → {len(linies)} líneas encontradas")

    # ── 2. Para cada línea, descargar sus paradas en orden ────────────────────
    # Endpoint: /transit/linies/metro/{codi_linia}/parades
    all_stops: dict[str, tuple] = {}   # stop_id → (name, lat, lon)
    line_stop_seqs: dict[str, list] = {}  # route_id → [stop_id, ...]

    for linia in linies:
        props    = linia.get("properties", {})
        codi     = props.get("CODI_LINIA", "")
        nom      = props.get("NOM_LINIA", str(codi))   # "L1", "L9S", "FM", etc.
        route_id = nom  # usar NOM_LINIA directamente como route_id

        print(f"  Descargando paradas {route_id} (codi {codi})...", end=" ")
        try:
            p_data = tmb_get(
                f"/transit/linies/metro/{codi}/parades",
                args.app_id, args.app_key
            )
        except Exception:
            print("ERROR — saltando")
            continue

        p_feats = p_data.get("features", [])
        print(f"{len(p_feats)} paradas")

        seq = []
        for feat in p_feats:
            pp  = feat.get("properties", {})
            geo = feat.get("geometry", {}).get("coordinates", [0, 0])
            codi_parada = pp.get("CODI_PARADA") or pp.get("ID_PARADA", "")
            sid  = f"TMB_{codi_parada}"
            name = pp.get("NOM_PARADA") or pp.get("NOM_ESTACIO", f"Parada {codi_parada}")
            lat  = float(geo[1]) if geo and geo[1] else 0.0
            lon  = float(geo[0]) if geo and geo[0] else 0.0
            if not name or not lat:
                continue
            all_stops[sid] = (name, lat, lon)
            seq.append(sid)

        if len(seq) >= 2:
            line_stop_seqs[route_id] = seq

    print(f"\n  Total paradas únicas: {len(all_stops)}")
    print(f"  Líneas con secuencia: {len(line_stop_seqs)}")

    # ── 3. Construir DB ───────────────────────────────────────────────────────
    tmp_db = Path("/tmp/gtfs_es_bcn_api.db")
    if tmp_db.exists():
        tmp_db.unlink()

    conn = sqlite3.connect(str(tmp_db))
    setup(conn)

    conn.execute("INSERT OR IGNORE INTO agency VALUES (?,?,?,?)",
        ("TMB", "Transports Metropolitans de Barcelona",
         "https://www.tmb.cat", "Europe/Madrid"))
    conn.commit()

    # Routes — usar colores reales de la API
    for linia in linies:
        props    = linia.get("properties", {})
        codi     = props.get("CODI_LINIA", "")
        nom      = props.get("NOM_LINIA", str(codi))
        desc     = props.get("DESC_LINIA", nom)
        color    = props.get("COLOR_LINIA", "888888")
        transport = props.get("NOM_TIPUS_TRANSPORT", "METRO")
        rtype    = 0 if transport == "FUNICULAR" else 1  # 0=tram/funicular, 1=metro
        conn.execute("INSERT OR IGNORE INTO routes VALUES (?,?,?,?,?,?,?)",
            (nom, "TMB", nom, desc, rtype, color, "Barcelona"))
    conn.commit()
    print(f"  Rutas insertadas: {len(linies)}")

    # Stops
    stop_rows = [(sid, name, lat, lon, "ES", 0, "")
                 for sid, (name, lat, lon) in all_stops.items()]
    conn.executemany("INSERT OR IGNORE INTO stops VALUES (?,?,?,?,?,?,?)", stop_rows)
    conn.commit()
    print(f"  Paradas insertadas: {len(stop_rows)}")

    # Trips + stop_times
    trips_batch = []
    st_batch    = []
    trip_count  = 0
    st_count    = 0

    for route_id, seq in line_stop_seqs.items():
        headway = HEADWAY.get(route_id, 5)
        for direction in (0, 1):
            stop_seq = seq if direction == 0 else list(reversed(seq))
            headsign = stop_seq[-1]
            dep = _FIRST_MIN
            while dep <= _LAST_MIN:
                trip_id = f"{route_id}_d{direction}_{dep:04d}"
                trips_batch.append((trip_id, route_id, "ALL", headsign, direction))
                for i, sid in enumerate(stop_seq):
                    ts = fmt_time(dep + i * _DWELL)
                    st_batch.append((trip_id, ts, ts, sid, i))
                trip_count += 1
                st_count   += len(stop_seq)
                dep        += headway

    conn.executemany("INSERT OR IGNORE INTO trips VALUES (?,?,?,?,?)", trips_batch)
    conn.executemany("INSERT OR IGNORE INTO stop_times VALUES (?,?,?,?,?)", st_batch)
    conn.commit()
    print(f"  Trips:      {trip_count:,}")
    print(f"  Stop_times: {st_count:,}")

    # Calendar
    for svc, m,t,w,th,f,sa,su in [
        ("WD", 1,1,1,1,1,0,0), ("WE", 0,0,0,0,0,1,1), ("ALL", 1,1,1,1,1,1,1)
    ]:
        conn.execute("INSERT OR IGNORE INTO calendar VALUES (?,?,?,?,?,?,?,?,?,?)",
            (svc, m,t,w,th,f,sa,su, "20260101","20261231"))
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


if __name__ == "__main__":
    main()
