#!/usr/bin/env python3
"""
Importa GTFS real NMBS/SNCB → assets/gtfs_belgium.db

Uso:
  python3 scripts/import_gtfs_belgium_real.py <ruta_al_zip>

Ejemplo:
  python3 scripts/import_gtfs_belgium_real.py ~/Downloads/Wow\ trains\ Belgium.zip

Filtra: route_type IN (2,100,101,102,103,104,105,107) — IC, ICE, Thalys, Eurostar
"""

import csv, io, os, sqlite3, sys, time, zipfile

SRC_PATH = sys.argv[1] if len(sys.argv) > 1 else 'Wow trains Belgium.zip'
OUT_DB   = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'assets', 'gtfs_belgium.db'))
RAIL_TYPES = {2, 100, 101, 102, 103, 104, 105, 107}
COUNTRY_CODE = 'BE'

def log(msg): print(f'[{time.strftime("%H:%M:%S")}] {msg}', flush=True)

def find_and_open(zf, base):
    names = zf.namelist()
    match = next((n for n in names if n.split('/')[-1].lower() == base.lower()), None)
    if not match:
        raise FileNotFoundError(f'{base} not found. Available: {names[:15]}')
    return match

def zreader(zf, base):
    m = find_and_open(zf, base)
    data = zf.read(m).decode('utf-8-sig')
    return csv.DictReader(io.StringIO(data))

log(f'=== Importando GTFS Bélgica (NMBS/SNCB) desde {SRC_PATH} ===')
if not os.path.exists(SRC_PATH):
    print(f'ERROR: no se encuentra {SRC_PATH}'); sys.exit(1)

zf    = zipfile.ZipFile(SRC_PATH)
names = zf.namelist()
log(f'Archivos: {[n for n in names if not n.endswith("/")][:15]}')

# ── Routes ────────────────────────────────────────────────────────────────────
log('Leyendo routes.txt...')
rail_routes = {}
type_counts = {}
for row in zreader(zf, 'routes.txt'):
    try: rt = int(row.get('route_type', 999))
    except: continue
    type_counts[rt] = type_counts.get(rt, 0) + 1
    if rt in RAIL_TYPES:
        rail_routes[row['route_id']] = {
            'short': row.get('route_short_name',''), 'long': row.get('route_long_name',''),
            'type': rt, 'agency': row.get('agency_id',''),
        }
log(f'  route_type counts: {sorted(type_counts.items())}')
if not rail_routes:
    log('  → Importando todas las rutas (sin filtro de tipo)')
    for row in zreader(zf, 'routes.txt'):
        try: rt = int(row.get('route_type', 2))
        except: rt = 2
        rail_routes[row['route_id']] = {
            'short': row.get('route_short_name',''), 'long': row.get('route_long_name',''),
            'type': rt, 'agency': row.get('agency_id',''),
        }
log(f'  {len(rail_routes)} rutas')

# ── Trips ─────────────────────────────────────────────────────────────────────
log('Leyendo trips.txt...')
rail_trips = {}
for row in zreader(zf, 'trips.txt'):
    if row.get('route_id','') in rail_routes:
        rail_trips[row['trip_id']] = {
            'route_id': row['route_id'], 'service_id': row.get('service_id',''),
            'headsign': row.get('trip_headsign',''),
        }
log(f'  {len(rail_trips)} trips')

# ── Stop_times streaming ──────────────────────────────────────────────────────
log('Streaming stop_times.txt...')
trip_stops = {}; used_stops = set(); n = 0
st_match = find_and_open(zf, 'stop_times.txt')
with zf.open(st_match) as raw:
    for row in csv.DictReader(io.TextIOWrapper(raw, encoding='utf-8-sig')):
        tid = row.get('trip_id','')
        if tid not in rail_trips: continue
        sid = row.get('stop_id','')
        if tid not in trip_stops: trip_stops[tid] = []
        trip_stops[tid].append((int(row.get('stop_sequence',0)), sid,
            row.get('departure_time',''), row.get('arrival_time','')))
        used_stops.add(sid); n += 1
        if n % 500_000 == 0: log(f'  ...{n:,}')
log(f'  {n:,} stop_times para {len(trip_stops)} trips')

# ── Stops ─────────────────────────────────────────────────────────────────────
log('Leyendo stops.txt...')
stops_by_id = {}; parent_of = {}
for row in zreader(zf, 'stops.txt'):
    sid = row.get('stop_id','')
    if not sid: continue
    stops_by_id[sid] = row
    ps = row.get('parent_station','')
    if ps and ps != sid: parent_of[sid] = ps

def resolve(sid): return parent_of.get(sid, sid)
needed = set(resolve(s) for s in used_stops)
log(f'  {len(needed)} parent stops')

# ── Calendar ──────────────────────────────────────────────────────────────────
needed_services = {t['service_id'] for t in rail_trips.values()}
calendars, cal_dates = [], []
try:
    for row in zreader(zf, 'calendar.txt'):
        if row.get('service_id','') in needed_services: calendars.append(row)
    log(f'  calendar: {len(calendars)} servicios')
except Exception as e: log(f'  calendar.txt: {e}')
try:
    for row in zreader(zf, 'calendar_dates.txt'):
        if row.get('service_id','') in needed_services: cal_dates.append(row)
    log(f'  calendar_dates: {len(cal_dates)}')
except Exception as e: log(f'  calendar_dates.txt: {e}')

agencies = []
try:
    agencies = list(zreader(zf, 'agency.txt'))
    log(f'  agency: {len(agencies)}')
except Exception as e: log(f'  agency.txt: {e}')
zf.close()

# ── SQLite ────────────────────────────────────────────────────────────────────
log(f'Escribiendo {OUT_DB}...')
if os.path.exists(OUT_DB): os.remove(OUT_DB)
con = sqlite3.connect(OUT_DB); cur = con.cursor()
cur.executescript(f'''
PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
CREATE TABLE stops (stop_id TEXT PRIMARY KEY, stop_name TEXT NOT NULL,
  stop_lat REAL, stop_lon REAL, country_code TEXT DEFAULT "{COUNTRY_CODE}",
  location_type INTEGER DEFAULT 0, parent_station TEXT);
CREATE TABLE routes (route_id TEXT PRIMARY KEY, agency_id TEXT,
  route_short_name TEXT, route_long_name TEXT, route_type INTEGER);
CREATE TABLE trips (trip_id TEXT PRIMARY KEY, route_id TEXT, service_id TEXT,
  trip_headsign TEXT, direction_id INTEGER DEFAULT 0);
CREATE TABLE stop_times (trip_id TEXT, arrival_time TEXT, departure_time TEXT,
  stop_id TEXT, stop_sequence INTEGER, PRIMARY KEY (trip_id, stop_sequence));
CREATE TABLE calendar (service_id TEXT PRIMARY KEY,
  monday INTEGER, tuesday INTEGER, wednesday INTEGER, thursday INTEGER,
  friday INTEGER, saturday INTEGER, sunday INTEGER, start_date TEXT, end_date TEXT);
CREATE TABLE calendar_dates (service_id TEXT, date TEXT, exception_type INTEGER,
  PRIMARY KEY (service_id, date));
CREATE TABLE agency (agency_id TEXT PRIMARY KEY, agency_name TEXT,
  agency_url TEXT, agency_timezone TEXT);
''')

stop_rows = []
for sid in needed:
    row = stops_by_id.get(sid)
    if not row: continue
    lt_raw = row.get('location_type','')
    lt = int(lt_raw) if str(lt_raw).strip().isdigit() else 0
    try: lat = float(row.get('stop_lat',0) or 0)
    except: lat = 0.0
    try: lon = float(row.get('stop_lon',0) or 0)
    except: lon = 0.0
    stop_rows.append((sid, row.get('stop_name',''), lat, lon, COUNTRY_CODE, lt, row.get('parent_station','')))
cur.executemany('INSERT OR IGNORE INTO stops VALUES (?,?,?,?,?,?,?)', stop_rows)
log(f'  {len(stop_rows)} stops')

cur.executemany('INSERT OR IGNORE INTO routes VALUES (?,?,?,?,?)',
    [(rid, v['agency'], v['short'], v['long'], v['type']) for rid, v in rail_routes.items()])
cur.executemany('INSERT OR IGNORE INTO trips VALUES (?,?,?,?,?)',
    [(tid, v['route_id'], v['service_id'], v['headsign'], 0) for tid, v in rail_trips.items()])

log('Insertando stop_times...')
batch, total_st = [], 0
for tid, rows in trip_stops.items():
    for seq, sid, dep, arr in sorted(rows, key=lambda x: x[0]):
        batch.append((tid, arr, dep, resolve(sid), seq))
    if len(batch) >= 100_000:
        cur.executemany('INSERT OR IGNORE INTO stop_times VALUES (?,?,?,?,?)', batch)
        total_st += len(batch); batch = []
if batch:
    cur.executemany('INSERT OR IGNORE INTO stop_times VALUES (?,?,?,?,?)', batch)
    total_st += len(batch)
log(f'  {total_st:,} stop_times')

if calendars:
    cur.executemany('INSERT OR IGNORE INTO calendar VALUES (?,?,?,?,?,?,?,?,?,?)', [
        (r['service_id'], int(r.get('monday',0) or 0), int(r.get('tuesday',0) or 0),
         int(r.get('wednesday',0) or 0), int(r.get('thursday',0) or 0),
         int(r.get('friday',0) or 0), int(r.get('saturday',0) or 0),
         int(r.get('sunday',0) or 0), r.get('start_date',''), r.get('end_date',''))
        for r in calendars])
if cal_dates:
    cur.executemany('INSERT OR IGNORE INTO calendar_dates VALUES (?,?,?)',
        [(r['service_id'], r['date'], int(r.get('exception_type',1))) for r in cal_dates])
if agencies:
    cur.executemany('INSERT OR IGNORE INTO agency VALUES (?,?,?,?)',
        [(r.get('agency_id',''), r.get('agency_name',''),
          r.get('agency_url',''), r.get('agency_timezone','')) for r in agencies])

cur.executescript('''
CREATE INDEX IF NOT EXISTS idx_st_stop ON stop_times(stop_id);
CREATE INDEX IF NOT EXISTS idx_st_trip ON stop_times(trip_id);
CREATE INDEX IF NOT EXISTS idx_trips_route ON trips(route_id);
CREATE INDEX IF NOT EXISTS idx_stops_name ON stops(stop_name);
''')
con.commit(); con.close()

size = os.path.getsize(OUT_DB)
log(f'=== LISTO: {OUT_DB} ({size/1024/1024:.1f} MB) ===')
con2 = sqlite3.connect(OUT_DB); c2 = con2.cursor()
for t in ['stops','routes','trips','stop_times','calendar']:
    c2.execute(f'SELECT COUNT(*) FROM {t}')
    print(f'  {t}: {c2.fetchone()[0]:,}')
c2.execute("""
    SELECT s_o.stop_name, s_d.stop_name, st_o.departure_time
    FROM stop_times st_o
    JOIN stop_times st_d ON st_d.trip_id=st_o.trip_id AND st_d.stop_sequence>st_o.stop_sequence+2
    JOIN stops s_o ON s_o.stop_id=st_o.stop_id
    JOIN stops s_d ON s_d.stop_id=st_d.stop_id
    WHERE (s_o.stop_name LIKE '%Bruxelles%' OR s_o.stop_name LIKE '%Brussel%' OR s_o.stop_name LIKE '%Brussels%')
      AND st_o.departure_time >= '08:00:00'
    LIMIT 5
""")
print('Sample desde Bruselas:', c2.fetchall())
con2.close()
