#!/usr/bin/env python3
"""
Importa GTFS real SNCF → assets/gtfs_france.db
Lee directamente desde el zip sin extraer.

Uso:
  python3 scripts/import_gtfs_france_real.py <ruta_al_zip>

Ejemplo:
  python3 scripts/import_gtfs_france_real.py ~/Downloads/Export_OpenData_SNCF_GTFS_NewTripId.zip

Filtra: route_type IN (2,100,101,102,103,104,105,107) — TGV, Intercités, TER intercity
Excluye: 106/109 (Transilien/RER), 700+ (bus, barco)
"""

import csv, io, os, sqlite3, sys, time, zipfile

ZIP_PATH = sys.argv[1] if len(sys.argv) > 1 else 'Export_OpenData_SNCF_GTFS_NewTripId.zip'
OUT_DB   = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'assets', 'gtfs_france.db'))

# route_type a incluir (trenes intercity/larga distancia)
RAIL_TYPES = {2, 100, 101, 102, 103, 104, 105, 107}

def log(msg): print(f'[{time.strftime("%H:%M:%S")}] {msg}', flush=True)

def zreader(zf, name):
    """DictReader BOM-safe desde archivo dentro del zip."""
    # Try the exact name first, then search case-insensitively
    names = zf.namelist()
    match = name
    if name not in names:
        for n in names:
            if n.lower().endswith('/' + name.lower()) or n.lower() == name.lower():
                match = n
                break
    data = zf.read(match).decode('utf-8-sig')
    return csv.DictReader(io.StringIO(data))

log(f'=== Importando GTFS Francia (SNCF) desde {ZIP_PATH} ===')
if not os.path.exists(ZIP_PATH):
    print(f'ERROR: no se encuentra {ZIP_PATH}')
    sys.exit(1)

zf    = zipfile.ZipFile(ZIP_PATH)
names = zf.namelist()
log(f'Archivos en zip: {names[:15]}{"..." if len(names)>15 else ""}')

# ── Detectar nombres de archivos en el zip ────────────────────────────────────
def find_file(base):
    for n in names:
        bn = n.split('/')[-1].lower()
        if bn == base.lower():
            return n
    return base

ROUTES_F    = find_file('routes.txt')
TRIPS_F     = find_file('trips.txt')
STOPS_F     = find_file('stops.txt')
STOPTIMES_F = find_file('stop_times.txt')
CALENDAR_F  = find_file('calendar.txt')
CALDATES_F  = find_file('calendar_dates.txt')
AGENCY_F    = find_file('agency.txt')

log(f'  routes: {ROUTES_F}')
log(f'  stop_times: {STOPTIMES_F}')

# ── 1. Rutas de tren ──────────────────────────────────────────────────────────
log('Leyendo routes.txt...')
rail_routes = {}
for row in zreader(zf, ROUTES_F):
    try:
        rt = int(row.get('route_type', 999))
    except ValueError:
        continue
    if rt in RAIL_TYPES:
        rid = row.get('route_id', '')
        rail_routes[rid] = {
            'short':  row.get('route_short_name', ''),
            'long':   row.get('route_long_name', ''),
            'type':   rt,
            'agency': row.get('agency_id', ''),
        }
log(f'  {len(rail_routes)} rutas de tren')

if not rail_routes:
    # Francia puede usar route_type=2 para todo — si está vacío, incluir type 2 explícitamente
    log('  → Reintentando con route_type=2 únicamente...')
    for row in zreader(zf, ROUTES_F):
        try:
            rt = int(row.get('route_type', 999))
        except ValueError:
            continue
        rid = row.get('route_id', '')
        rail_routes[rid] = {
            'short':  row.get('route_short_name', ''),
            'long':   row.get('route_long_name', ''),
            'type':   rt,
            'agency': row.get('agency_id', ''),
        }
    log(f'  {len(rail_routes)} rutas (sin filtro de tipo)')

# ── 2. Trips ──────────────────────────────────────────────────────────────────
log('Leyendo trips.txt...')
rail_trips = {}
for row in zreader(zf, TRIPS_F):
    if row.get('route_id', '') in rail_routes:
        rail_trips[row['trip_id']] = {
            'route_id':   row['route_id'],
            'service_id': row.get('service_id', ''),
            'headsign':   row.get('trip_headsign', ''),
        }
log(f'  {len(rail_trips)} trips de tren')

# ── 3. Stop_times — streaming desde zip ──────────────────────────────────────
log('Streaming stop_times.txt...')
trip_stops = {}
used_stops = set()
n = 0
with zf.open(STOPTIMES_F) as raw:
    reader = csv.DictReader(io.TextIOWrapper(raw, encoding='utf-8-sig'))
    for row in reader:
        tid = row.get('trip_id', '')
        if tid not in rail_trips:
            continue
        sid = row.get('stop_id', '')
        if tid not in trip_stops:
            trip_stops[tid] = []
        trip_stops[tid].append((
            int(row.get('stop_sequence', 0)),
            sid,
            row.get('departure_time', ''),
            row.get('arrival_time', ''),
        ))
        used_stops.add(sid)
        n += 1
        if n % 500_000 == 0:
            log(f'  ...{n:,} filas leídas')
log(f'  {n:,} stop_times para {len(trip_stops)} trips')

# ── 4. Stops ──────────────────────────────────────────────────────────────────
log('Leyendo stops.txt...')
stops_by_id = {}
parent_of   = {}
for row in zreader(zf, STOPS_F):
    sid = row.get('stop_id', '')
    if not sid:
        continue
    stops_by_id[sid] = row
    ps = row.get('parent_station', '')
    if ps and ps != sid:
        parent_of[sid] = ps

def resolve(sid):
    return parent_of.get(sid, sid)

needed = set(resolve(s) for s in used_stops)
log(f'  {len(needed)} parent stops')

# ── 5. Calendar ───────────────────────────────────────────────────────────────
log('Leyendo calendar.txt...')
needed_services = {t['service_id'] for t in rail_trips.values()}
calendars = []
try:
    for row in zreader(zf, CALENDAR_F):
        if row.get('service_id', '') in needed_services:
            calendars.append(row)
    log(f'  {len(calendars)} servicios')
except Exception as e:
    log(f'  calendar.txt no disponible: {e}')

# ── 6. Calendar_dates ─────────────────────────────────────────────────────────
log('Leyendo calendar_dates.txt...')
cal_dates = []
try:
    for row in zreader(zf, CALDATES_F):
        if row.get('service_id', '') in needed_services:
            cal_dates.append(row)
    log(f'  {len(cal_dates)} calendar_dates')
except Exception as e:
    log(f'  calendar_dates.txt no disponible: {e}')

# ── 7. Agency ─────────────────────────────────────────────────────────────────
log('Leyendo agency.txt...')
agencies = []
try:
    agencies = list(zreader(zf, AGENCY_F))
    log(f'  {len(agencies)} agencias')
except Exception as e:
    log(f'  agency.txt no disponible: {e}')

zf.close()

# ── 8. Escribir SQLite ────────────────────────────────────────────────────────
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
  country_code TEXT DEFAULT "FR",
  location_type INTEGER DEFAULT 0,
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
    lt_raw = row.get('location_type', '')
    lt = int(lt_raw) if lt_raw.strip().isdigit() else 0
    try:
        lat = float(row.get('stop_lat', 0) or 0)
        lon = float(row.get('stop_lon', 0) or 0)
    except ValueError:
        lat, lon = 0.0, 0.0
    stop_rows.append((sid, row.get('stop_name',''), lat, lon, 'FR', lt, row.get('parent_station','')))
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

# Stop_times
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
if calendars:
    cal_rows = []
    for r in calendars:
        try:
            cal_rows.append((
                r['service_id'],
                int(r.get('monday',0) or 0), int(r.get('tuesday',0) or 0),
                int(r.get('wednesday',0) or 0), int(r.get('thursday',0) or 0),
                int(r.get('friday',0) or 0), int(r.get('saturday',0) or 0),
                int(r.get('sunday',0) or 0),
                r.get('start_date',''), r.get('end_date','')
            ))
        except Exception:
            pass
    cur.executemany('INSERT OR IGNORE INTO calendar VALUES (?,?,?,?,?,?,?,?,?,?)', cal_rows)
    log(f'  {len(cal_rows)} calendar rows')

# Calendar_dates
if cal_dates:
    cd_rows = [(r['service_id'], r['date'], int(r.get('exception_type',1))) for r in cal_dates]
    cur.executemany('INSERT OR IGNORE INTO calendar_dates VALUES (?,?,?)', cd_rows)
    log(f'  {len(cd_rows)} calendar_dates rows')

# Agency
if agencies:
    ag_rows = [(r.get('agency_id',''), r.get('agency_name',''),
                r.get('agency_url',''), r.get('agency_timezone','')) for r in agencies]
    cur.executemany('INSERT OR IGNORE INTO agency VALUES (?,?,?,?)', ag_rows)

# Indexes
cur.executescript('''
CREATE INDEX IF NOT EXISTS idx_st_stop    ON stop_times(stop_id);
CREATE INDEX IF NOT EXISTS idx_st_trip    ON stop_times(trip_id);
CREATE INDEX IF NOT EXISTS idx_trips_route ON trips(route_id);
CREATE INDEX IF NOT EXISTS idx_stops_name  ON stops(stop_name);
''')

con.commit()
con.close()

size = os.path.getsize(OUT_DB)
log(f'=== LISTO: {OUT_DB} ({size/1024/1024:.1f} MB) ===')

# Verificación
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
    WHERE (s_o.stop_name LIKE '%Paris%' OR s_o.stop_name LIKE '%Lyon%')
      AND (s_d.stop_name LIKE '%Lyon%' OR s_d.stop_name LIKE '%Marseille%')
      AND st_o.departure_time >= '08:00:00'
    LIMIT 5
""")
print('Sample Paris/Lyon→Lyon/Marseille:', c2.fetchall())
con2.close()
