#!/usr/bin/env python3
"""
Importa GTFS real SBB 2026 → assets/gtfs_switzerland.db
Lee directamente desde el zip sin extraer (no necesita espacio en disco).

Uso:
  python3 scripts/import_gtfs_switzerland_real.py <ruta_al_zip>

Ejemplo:
  python3 scripts/import_gtfs_switzerland_real.py ~/Downloads/gtfs_fp2026_20260527.zip

Filtra: route_type IN (100,101,102,103,104,105,107) — trenes intercity SBB/CFF
Excluye: 106 (S-Bahn), 109 (suburban/Cercanias), 700+ (bus, barco, etc.)
"""

import csv, io, os, sqlite3, sys, time, zipfile

ZIP_PATH = sys.argv[1] if len(sys.argv) > 1 else 'gtfs_fp2026_20260527.zip'
OUT_DB   = os.path.join(os.path.dirname(__file__), '..', 'assets', 'gtfs_switzerland.db')
OUT_DB   = os.path.normpath(OUT_DB)

RAIL_TYPES = {100, 101, 102, 103, 104, 105, 107}  # excluye 106/109 S-Bahn

def log(msg): print(f'[{time.strftime("%H:%M:%S")}] {msg}', flush=True)

def zreader(zf, name):
    """DictReader desde un archivo dentro del zip (BOM-safe)."""
    data = zf.read(name).decode('utf-8-sig')
    return csv.DictReader(io.StringIO(data))

log(f'=== Importando GTFS Suiza 2026 desde {ZIP_PATH} ===')
if not os.path.exists(ZIP_PATH):
    print(f'ERROR: no se encuentra {ZIP_PATH}')
    sys.exit(1)

zf = zipfile.ZipFile(ZIP_PATH)
names = zf.namelist()
log(f'Archivos en zip: {names}')

# ── 1. Rutas de tren ──────────────────────────────────────────────────────────
log('Leyendo routes.txt...')
rail_routes = {}  # route_id → {short, long, type, agency_id}
for row in zreader(zf, 'routes.txt'):
    rt = int(row['route_type'])
    if rt in RAIL_TYPES:
        rail_routes[row['route_id']] = {
            'short':  row.get('route_short_name', ''),
            'long':   row.get('route_long_name', ''),
            'type':   rt,
            'agency': row.get('agency_id', ''),
        }
log(f'  {len(rail_routes)} rutas de tren')

# ── 2. Trips de esas rutas ────────────────────────────────────────────────────
log('Leyendo trips.txt...')
rail_trips = {}
for row in zreader(zf, 'trips.txt'):
    if row['route_id'] in rail_routes:
        rail_trips[row['trip_id']] = {
            'route_id':   row['route_id'],
            'service_id': row['service_id'],
            'headsign':   row.get('trip_headsign', ''),
        }
log(f'  {len(rail_trips)} trips de tren')

# ── 3. Stop_times — streaming desde zip ──────────────────────────────────────
log('Streaming stop_times.txt...')
trip_stops  = {}   # trip_id → [(seq, stop_id, dep, arr)]
used_stops  = set()
n = 0
# stream line by line from zip to avoid loading 1.7GB into RAM
with zf.open('stop_times.txt') as raw:
    reader = csv.DictReader(io.TextIOWrapper(raw, encoding='utf-8-sig'))
    for row in reader:
        tid = row['trip_id']
        if tid not in rail_trips:
            continue
        sid = row['stop_id']
        if tid not in trip_stops:
            trip_stops[tid] = []
        trip_stops[tid].append((
            int(row['stop_sequence']),
            sid,
            row.get('departure_time', ''),
            row.get('arrival_time', ''),
        ))
        used_stops.add(sid)
        n += 1
        if n % 500_000 == 0:
            log(f'  ...{n:,} filas leídas')
log(f'  {n:,} stop_times para {len(trip_stops)} trips')
log(f'  {len(used_stops)} stops únicos')

# ── 4. Stops ──────────────────────────────────────────────────────────────────
log('Leyendo stops.txt...')
stops_by_id = {}
parent_of   = {}
for row in zreader(zf, 'stops.txt'):
    sid = row['stop_id']
    stops_by_id[sid] = row
    ps = row.get('parent_station', '')
    if ps:
        parent_of[sid] = ps

def resolve(sid):
    return parent_of.get(sid, sid)

needed = set(resolve(s) for s in used_stops) | {s for s in used_stops if s not in parent_of}
log(f'  {len(needed)} parent stops a importar')

# ── 5. Calendar ───────────────────────────────────────────────────────────────
log('Leyendo calendar.txt...')
needed_services = {t['service_id'] for t in rail_trips.values()}
calendars = []
for row in zreader(zf, 'calendar.txt'):
    if row['service_id'] in needed_services:
        calendars.append(row)
log(f'  {len(calendars)} servicios')

# ── 6. Agency ─────────────────────────────────────────────────────────────────
log('Leyendo agency.txt...')
agencies = list(zreader(zf, 'agency.txt'))
log(f'  {len(agencies)} agencias')
zf.close()

# ── 7. Escribir SQLite ────────────────────────────────────────────────────────
log(f'Escribiendo {OUT_DB}...')
if os.path.exists(OUT_DB):
    os.remove(OUT_DB)

con = sqlite3.connect(OUT_DB)
cur = con.cursor()
cur.executescript('''
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
CREATE TABLE stops (
  stop_id TEXT PRIMARY KEY, stop_name TEXT NOT NULL,
  stop_lat REAL, stop_lon REAL,
  country_code TEXT DEFAULT "CH",
  location_type INTEGER DEFAULT 1,
  parent_station TEXT
);
CREATE TABLE routes (
  route_id TEXT PRIMARY KEY, agency_id TEXT,
  route_short_name TEXT, route_long_name TEXT, route_type INTEGER
);
CREATE TABLE trips (
  trip_id TEXT PRIMARY KEY, route_id TEXT, service_id TEXT,
  trip_headsign TEXT, direction_id INTEGER DEFAULT 0
);
CREATE TABLE stop_times (
  trip_id TEXT, arrival_time TEXT, departure_time TEXT,
  stop_id TEXT, stop_sequence INTEGER,
  PRIMARY KEY (trip_id, stop_sequence)
);
CREATE TABLE calendar (
  service_id TEXT PRIMARY KEY,
  monday INTEGER, tuesday INTEGER, wednesday INTEGER, thursday INTEGER,
  friday INTEGER, saturday INTEGER, sunday INTEGER,
  start_date TEXT, end_date TEXT
);
CREATE TABLE calendar_dates (
  service_id TEXT, date TEXT, exception_type INTEGER,
  PRIMARY KEY (service_id, date)
);
CREATE TABLE agency (
  agency_id TEXT PRIMARY KEY, agency_name TEXT,
  agency_url TEXT, agency_timezone TEXT
);
''')

# Stops
stop_rows = []
for sid in needed:
    row = stops_by_id.get(sid)
    if not row:
        continue
    lt = 1 if row.get('location_type') == '1' else 0
    stop_rows.append((
        sid, row['stop_name'],
        float(row['stop_lat'] or 0), float(row['stop_lon'] or 0),
        'CH', lt, row.get('parent_station', '')
    ))
cur.executemany('INSERT OR IGNORE INTO stops VALUES (?,?,?,?,?,?,?)', stop_rows)
log(f'  {len(stop_rows)} stops')

# Routes
cur.executemany('INSERT OR IGNORE INTO routes VALUES (?,?,?,?,?)',
    [(rid, v['agency'], v['short'], v['long'], v['type']) for rid, v in rail_routes.items()])
log(f'  {len(rail_routes)} routes')

# Trips
cur.executemany('INSERT OR IGNORE INTO trips VALUES (?,?,?,?,?)',
    [(tid, v['route_id'], v['service_id'], v['headsign'], 0) for tid, v in rail_trips.items()])
log(f'  {len(rail_trips)} trips')

# Stop_times (batch insert)
log('Insertando stop_times...')
batch = []
total_st = 0
for tid, rows in trip_stops.items():
    for seq, sid, dep, arr in sorted(rows, key=lambda x: x[0]):
        batch.append((tid, arr, dep, resolve(sid), seq))
    if len(batch) >= 100_000:
        cur.executemany('INSERT OR IGNORE INTO stop_times VALUES (?,?,?,?,?)', batch)
        total_st += len(batch)
        batch = []
if batch:
    cur.executemany('INSERT OR IGNORE INTO stop_times VALUES (?,?,?,?,?)', batch)
    total_st += len(batch)
log(f'  {total_st:,} stop_times')

# Calendar
cur.executemany('INSERT OR IGNORE INTO calendar VALUES (?,?,?,?,?,?,?,?,?,?)', [
    (r['service_id'], int(r.get('monday',0)), int(r.get('tuesday',0)),
     int(r.get('wednesday',0)), int(r.get('thursday',0)), int(r.get('friday',0)),
     int(r.get('saturday',0)), int(r.get('sunday',0)),
     r['start_date'], r['end_date']) for r in calendars
])

# Agency
cur.executemany('INSERT OR IGNORE INTO agency VALUES (?,?,?,?)', [
    (r.get('agency_id',''), r.get('agency_name',''),
     r.get('agency_url',''), r.get('agency_timezone','')) for r in agencies
])

# Indexes
cur.executescript('''
CREATE INDEX IF NOT EXISTS idx_st_stop ON stop_times(stop_id);
CREATE INDEX IF NOT EXISTS idx_st_trip ON stop_times(trip_id);
CREATE INDEX IF NOT EXISTS idx_trips_route ON trips(route_id);
CREATE INDEX IF NOT EXISTS idx_trips_service ON trips(service_id);
CREATE INDEX IF NOT EXISTS idx_stops_name ON stops(stop_name);
''')

con.commit()
con.close()

size = os.path.getsize(OUT_DB)
log(f'=== LISTO: {OUT_DB} ({size/1024/1024:.1f} MB) ===')

# Verificación rápida
con2 = sqlite3.connect(OUT_DB)
c2   = con2.cursor()
for table in ['stops', 'routes', 'trips', 'stop_times', 'calendar', 'agency']:
    c2.execute(f'SELECT COUNT(*) FROM {table}')
    print(f'  {table}: {c2.fetchone()[0]:,}')

c2.execute("""
    SELECT s_o.stop_name, s_d.stop_name, st_o.departure_time
    FROM stop_times st_o
    JOIN stop_times st_d ON st_d.trip_id=st_o.trip_id AND st_d.stop_sequence>st_o.stop_sequence
    JOIN stops s_o ON s_o.stop_id=st_o.stop_id
    JOIN stops s_d ON s_d.stop_id=st_d.stop_id
    WHERE s_o.stop_name LIKE '%Zürich HB%' AND s_d.stop_name LIKE '%Genève%'
      AND st_o.departure_time >= '08:00:00'
    LIMIT 5
""")
print('Sample Zürich→Genève:', c2.fetchall())
con2.close()
