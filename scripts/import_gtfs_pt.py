#!/usr/bin/env python3
"""
WoW TRENES — Importador GTFS Portugal (CP) → SQLite
Genera assets/gtfs_portugal.db

FUENTE (sin registro, público):
  https://publico.cp.pt/gtfs/gtfs.zip
  Actualizado diariamente. Licencia: ver https://nap-portugal.imt-ip.pt/nap/multimodalsupplydetail/176

Incluye: CP (Comboios de Portugal) — todas las líneas nacionales
  Linha do Norte, Linha de Cascais, Linha de Sintra, Linha do Algarve,
  Linha do Sul, Linha do Minho, Linha do Douro, Linha da Beira Alta/Baixa, etc.

Resultado esperado: ~150-300 estaciones, ~30-100k stop_times, ~5-20 MB

Uso:
  python3 scripts/import_gtfs_pt.py
  python3 scripts/import_gtfs_pt.py --local ~/Downloads/gtfs_cp.zip  # ZIP ya descargado
"""
import sqlite3, csv, sys, time, shutil, zipfile, io, argparse
from pathlib import Path
try:
    import urllib.request as urlreq
except ImportError:
    urlreq = None

GTFS_URL   = "https://publico.cp.pt/gtfs/gtfs.zip"
OUTPUT_DIR = Path(__file__).parent.parent / "assets"
OUTPUT_DB  = OUTPUT_DIR / "gtfs_portugal.db"
COUNTRY    = "PT"
MAX_ST     = 300_000
MAX_CD     = 50_000

RAIL_TYPES = {
    "2",
    "100","101","102","103","104","105",
    "106","107","108","109","110","111",
    "112","113","114","115","116","117",
}


def read_csv_zip(zf: zipfile.ZipFile, name: str):
    """Lee un archivo CSV del ZIP. Devuelve lista de dicts."""
    try:
        with zf.open(name) as f:
            text = f.read().decode("utf-8-sig", errors="replace")
            return list(csv.DictReader(text.splitlines()))
    except KeyError:
        print(f"  WARN: {name} no encontrado en el ZIP, ignorando")
        return []


def setup(conn):
    conn.executescript("""
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous  = NORMAL;
        CREATE TABLE IF NOT EXISTS stops (
            stop_id TEXT PRIMARY KEY, stop_name TEXT NOT NULL,
            stop_lat REAL NOT NULL, stop_lon REAL NOT NULL,
            country_code TEXT DEFAULT 'PT', location_type INTEGER DEFAULT 0,
            parent_station TEXT DEFAULT '');
        CREATE TABLE IF NOT EXISTS routes (
            route_id TEXT PRIMARY KEY, agency_id TEXT DEFAULT 'CP',
            route_short_name TEXT, route_long_name TEXT, route_type INTEGER DEFAULT 2);
        CREATE TABLE IF NOT EXISTS trips (
            trip_id TEXT PRIMARY KEY, route_id TEXT, service_id TEXT DEFAULT 'WD',
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
    parser = argparse.ArgumentParser(description='Importar GTFS CP Portugal → SQLite')
    parser.add_argument('--local', help='Ruta a un ZIP GTFS ya descargado (opcional)')
    args = parser.parse_args()

    print("\nWoW TRENES — Importador GTFS CP Portugal")
    print("=" * 55)

    # ── Obtener el ZIP ─────────────────────────────────────────────────────────
    if args.local:
        local_path = Path(args.local).expanduser()
        if not local_path.exists():
            print(f"\nERROR: Archivo no encontrado: {local_path}")
            sys.exit(1)
        print(f"  Usando ZIP local: {local_path}")
        zip_bytes = local_path.read_bytes()
    else:
        print(f"  Descargando desde {GTFS_URL}")
        print("  (sin registro, datos públicos de CP)")
        t0 = time.time()
        try:
            req = urlreq.Request(GTFS_URL, headers={
                'User-Agent': 'WoW-TRENES/1.0 (gtfs-importer)'
            })
            with urlreq.urlopen(req, timeout=120) as r:
                zip_bytes = r.read()
        except Exception as e:
            print(f"\nERROR descargando: {e}")
            print("Prueba con --local si ya tienes el ZIP:")
            print("  curl -L -o /tmp/gtfs_cp.zip https://publico.cp.pt/gtfs/gtfs.zip")
            print("  python3 scripts/import_gtfs_pt.py --local /tmp/gtfs_cp.zip")
            sys.exit(1)
        print(f"  Descargado: {len(zip_bytes)/1_048_576:.1f} MB en {time.time()-t0:.1f}s")

    print(f"  Destino: {OUTPUT_DB}\n")

    # ── Parsear ZIP ────────────────────────────────────────────────────────────
    t0 = time.time()
    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile:
        print("\nERROR: El archivo descargado no es un ZIP válido.")
        print("  Puede que el servidor haya devuelto una página de error.")
        print("  Prueba a descargar manualmente: https://publico.cp.pt/gtfs/gtfs.zip")
        sys.exit(1)

    print("  Archivos en el ZIP:", [n for n in zf.namelist() if n.endswith('.txt')])
    print()

    tmp_db = Path("/tmp/gtfs_portugal_build.db")
    if tmp_db.exists():
        tmp_db.unlink()
    conn = sqlite3.connect(str(tmp_db))

    try:
        setup(conn)

        # Agencia
        rows = read_csv_zip(zf, "agency.txt")
        print(f"  Agencias: {len(rows)}")

        # Rutas ferroviarias
        rows = read_csv_zip(zf, "routes.txt")
        rail_routes = [
            (r["route_id"], r.get("agency_id", "CP"),
             r.get("route_short_name", ""), r.get("route_long_name", ""),
             int(r.get("route_type", "2") or "2"))
            for r in rows if r.get("route_type", "") in RAIL_TYPES
        ]
        # Fallback: si CP usa tipos no estándar, tomar todo
        if not rail_routes:
            print("  WARN: Sin tipos ferroviarios estándar — importando todas las rutas")
            type_count = {}
            for r in rows:
                t = r.get("route_type", "?")
                type_count[t] = type_count.get(t, 0) + 1
            print("  Tipos encontrados:", dict(sorted(type_count.items())))
            rail_routes = [
                (r["route_id"], r.get("agency_id", "CP"),
                 r.get("route_short_name", ""), r.get("route_long_name", ""),
                 int(r.get("route_type", "2") or "2"))
                for r in rows
            ]
        conn.executemany("INSERT OR IGNORE INTO routes VALUES (?,?,?,?,?)", rail_routes)
        conn.commit()
        rail_route_ids = {r[0] for r in rail_routes}
        print(f"  Rutas: {len(rail_routes)}")

        # Viajes
        rows = read_csv_zip(zf, "trips.txt")
        rail_trips = [
            (r["trip_id"], r["route_id"], r.get("service_id", ""),
             r.get("trip_headsign", ""), int(r.get("direction_id", 0) or 0))
            for r in rows if r.get("route_id", "") in rail_route_ids
        ]
        conn.executemany("INSERT OR IGNORE INTO trips VALUES (?,?,?,?,?)", rail_trips)
        conn.commit()
        rail_trip_ids = {r[0] for r in rail_trips}
        print(f"  Viajes: {len(rail_trips)}")

        # Stop times (streaming para no saturar RAM)
        print(f"  Leyendo stop_times (máx {MAX_ST:,})...")
        rail_stop_ids = set()
        st_data = []
        n = 0
        with zf.open("stop_times.txt") as raw_f:
            text = raw_f.read().decode("utf-8-sig", errors="replace")
            for row in csv.DictReader(text.splitlines()):
                if row.get("trip_id", "") not in rail_trip_ids:
                    continue
                sid = row.get("stop_id", "")
                rail_stop_ids.add(sid)
                st_data.append((
                    row["trip_id"],
                    row.get("arrival_time", ""),
                    row.get("departure_time", ""),
                    sid,
                    int(row.get("stop_sequence", 0) or 0)
                ))
                n += 1
                if n >= MAX_ST:
                    print(f"  Límite {MAX_ST:,} alcanzado")
                    break
                if n % 50_000 == 0:
                    print(f"    {n:,} filas...")
        conn.executemany("INSERT OR IGNORE INTO stop_times VALUES (?,?,?,?,?)", st_data)
        conn.commit()
        print(f"  Stop times: {n:,} | Paradas únicas: {len(rail_stop_ids)}")

        # Paradas (solo las que aparecen en stop_times ferroviarios)
        rows = read_csv_zip(zf, "stops.txt")
        stops_data = []
        for r in rows:
            if r.get("stop_id", "") not in rail_stop_ids:
                continue
            try:
                lat = float(r.get("stop_lat", 0) or 0)
                lon = float(r.get("stop_lon", 0) or 0)
                if lat == 0.0 and lon == 0.0:
                    continue
                stops_data.append((
                    r["stop_id"], r.get("stop_name", "").strip(),
                    lat, lon, COUNTRY,
                    int(r.get("location_type", 0) or 0),
                    r.get("parent_station", "")
                ))
            except Exception:
                continue
        conn.executemany("INSERT OR IGNORE INTO stops VALUES (?,?,?,?,?,?,?)", stops_data)
        conn.commit()
        print(f"  Estaciones: {len(stops_data)}")

        # Calendario
        rows = read_csv_zip(zf, "calendar.txt")
        if rows:
            conn.executemany("INSERT OR IGNORE INTO calendar VALUES (?,?,?,?,?,?,?,?,?,?)",
                [(r.get("service_id",""), r.get("monday",0), r.get("tuesday",0),
                  r.get("wednesday",0), r.get("thursday",0), r.get("friday",0),
                  r.get("saturday",0), r.get("sunday",0),
                  r.get("start_date",""), r.get("end_date","")) for r in rows])
            conn.commit()
            print(f"  Calendarios: {len(rows)}")

        # Calendar dates
        rows = read_csv_zip(zf, "calendar_dates.txt")
        if rows:
            cd = [(r.get("service_id",""), r.get("date",""),
                   int(r.get("exception_type", 1) or 1))
                  for r in rows[:MAX_CD]]
            conn.executemany("INSERT OR IGNORE INTO calendar_dates VALUES (?,?,?)", cd)
            conn.commit()
            print(f"  Excepciones calendario: {len(cd)}")

        # Índices
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
        zf.close()

        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(tmp_db), str(OUTPUT_DB))
        mb = OUTPUT_DB.stat().st_size / 1_048_576

        print(f"\n✅  Portugal lista:")
        print(f"    {len(stops_data)} estaciones CP")
        print(f"    {n:,} stop_times")
        print(f"    {mb:.1f} MB — {elapsed:.1f}s")
        print(f"    {OUTPUT_DB}")

    except Exception:
        import traceback
        traceback.print_exc()
        conn.close()
        sys.exit(1)


if __name__ == "__main__":
    main()
