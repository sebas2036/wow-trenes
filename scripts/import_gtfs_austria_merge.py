#!/usr/bin/env python3
"""
Merge de dos feeds GTFS Austria → assets/gtfs_austria.db

Feed 1 (VOR/regional): GTFS_Fahrplan_2026.zip   — S-Bahn Viena, REX corto
Feed 2 (ÖBB nacional): GTFS_Fahrplan_2026 (1).zip — Railjet, IC, líneas A1-A20

Uso:
  python3 scripts/import_gtfs_austria_merge.py <feed_regional.zip> <feed_nacional.zip>

Ejemplo:
  python3 scripts/import_gtfs_austria_merge.py \
    ~/Downloads/GTFS_Fahrplan_2026.zip \
    ~/Downloads/GTFS_Fahrplan_2026\ \(1\).zip
"""

import csv, io, os, sqlite3, sys, time, zipfile

if len(sys.argv) < 3:
    print('Uso: python3 import_gtfs_austria_merge.py <feed1.zip> <feed2.zip>')
    sys.exit(1)

ZIP1 = sys.argv[1]
ZIP2 = sys.argv[2]
OUT_DB = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'assets', 'gtfs_austria.db'))
RAIL_TYPES = {2, 3, 100, 101, 102, 103, 104, 105, 106, 107, 109}
COUNTRY_CODE = 'AT'

def log(msg): print(f'[{time.strftime("%H:%M:%S")}] {msg}', flush=True)

def find_file(zf, base):
    names = zf.namelist()
    return next((n for n in names if n.split('/')[-1].lower() == base.lower()), None)

def zreader(zf, base):
    m = find_file(zf, base)
    if not m: raise FileNotFoundError(f'{base} not found in zip')
    data = zf.read(m).decode('utf-8-sig')
    return csv.DictReader(io.StringIO(data))

def extract_feed(zip_path, prefix=''):
    """Extrae datos de un feed GTFS, añade prefix a IDs para evitar colisiones."""
    log(f'  Procesando {os.path.basename(zip_path)} (prefix="{prefix}")...')
    zf = zipfile.ZipFile(zip_path)
    names = zf.namelist()

    # Routes
    rail_routes = {}
    type_counts = {}
    for row in zreader(zf, 'routes.txt'):
        try: rt = int(row.get('route_type', 999))
        except: continue
        type_counts[rt] = type_counts.get(rt, 0) + 1
        if rt in RAIL_TYPES:
            rid = prefix + row['route_id']
            rail_routes[rid] = {
                'short': row.get('route_short_name',''), 'long': row.get('route_long_name',''),
                'type': rt, 'agency': prefix + row.get('agency_id',''),
                'orig_id': row['route_id'],
            }
    log(f'    route_type counts: {sorted(type_counts.items())}')
    if not rail_routes:
        for row in zreader(zf, 'routes.txt'):
            try: rt = int(row.get('route_type', 2))
            except: rt = 2
            rid = prefix + row['route_id']
            rail_routes[rid] = {
                'short': row.get('route_short_name',''), 'long': row.get('route_long_name',''),
                'type': rt, 'agency': prefix + row.get('agency_id',''),
                'orig_id': row['route_id'],
            }
    log(f'    {len(rail_routes)} rutas')

    # Trips — map original route_id → prefixed
    orig_to_prefixed_route = {v['orig_id']: k for k, v in rail_routes.items()}
    rail_trips = {}
    for row in zreader(zf, 'trips.txt'):
        orig_rid = row.get('route_id','')
        if orig_rid not in orig_to_prefixed_route: continue
        tid = prefix + row['trip_id']
        rail_trips[tid] = {
            'route_id': orig_to_prefixed_route[orig_rid],
            'service_id': prefix + row.get('service_id',''),
            'headsign': row.get('trip_headsign',''),
            'orig_tid': row['trip_id'],
        }
    log(f'    {len(rail_trips)} trips')

    # Stop times (streaming)
    orig_trips_set = {v['orig_tid'] for v in rail_trips.values()}
    orig_tid_to_prefixed = {v['orig_tid']: k for k, v in rail_trips.items()}
    trip_stops = {}; used_stops = set(); n = 0
    st_match = find_file(zf, 'stop_times.txt')
    with zf.open(st_match) as raw:
        for row in csv.DictReader(io.TextIOWrapper(raw, encoding='utf-8-sig')):
            orig_tid = row.get('trip_id','')
            if orig_tid not in orig_trips_set: continue
            tid = orig_tid_to_prefixed[orig_tid]
            sid = prefix + row.get('stop_id','')
            if tid not in trip_stops: trip_stops[tid] = []
            try: seq = int(row.get('stop_sequence',0))
            except: seq = 0
            trip_stops[tid].append((seq, sid, row.get('departure_time',''), row.get('arrival_time','')))
            used_stops.add(sid); n += 1
    log(f'    {n:,} stop_times para {len(trip_stops)} trips')

    # Stops
    stops_by_id = {}; parent_of = {}
    for row in zreader(zf, 'stops.txt'):
        orig_sid = row.get('stop_id','')
        if not orig_sid: continue
        sid = prefix + orig_sid
        stops_by_id[sid] = row
        ps = row.get('parent_station','')
        if ps and ps != orig_sid: parent_of[sid] = prefix + ps

    def resolve(sid): return parent_of.get(sid, sid)
    needed = set(resolve(s) for s in used_stops)
    log(f'    {len(needed)} parent stops')

    # Calendar
    needed_services = {t['service_id'] for t in rail_trips.values()}
    orig_needed_services = {s.replace(prefix, '', 1) for s in needed_services}
    calendars, cal_dates = [], []
    try:
        for row in zreader(zf, 'calendar.txt'):
            if row.get('service_id','') in orig_needed_services:
                row = dict(row); row['service_id'] = prefix + row['service_id']
                calendars.append(row)
        log(f'    calendar: {len(calendars)} servicios')
    except Exception as e: log(f'    calendar.txt: {e}')
    try:
        for row in zreader(zf, 'calendar_dates.txt'):
            if row.get('service_id','') in orig_needed_services:
                row = dict(row); row['service_id'] = prefix + row['service_id']
                cal_dates.append(row)
        log(f'    calendar_dates: {len(cal_dates)}')
    except Exception as e: log(f'    calendar_dates.txt: {e}')

    # Agency
    agencies = []
    try:
        for row in zreader(zf, 'agency.txt'):
            row = dict(row); row['agency_id'] = prefix + row.get('agency_id','')
            agencies.append(row)
    except Exception as e: log(f'    agency.txt: {e}')

    zf.close()
    return {
        'rail_routes': rail_routes, 'rail_trips': rail_trips,
        'trip_stops': trip_stops, 'stops_by_id': stops_by_id,
        'resolve': resolve, 'needed': needed,
        'calendars': calendars, 'cal_dates': cal_dates, 'agencies': agencies,
    }

log('=== Merge GTFS Austria (VOR regional + ÖBB nacional) ===')
for p in [ZIP1, ZIP2]:
    if not os.path.exists(p):
        print(f'ERROR: no se encuentra {p}'); sys.exit(1)

log('Feed 1 — regional (VOR/S-Bahn):')
f1 = extract_feed(ZIP1, prefix='f1_')
log('Feed 2 — nacional (ÖBB/Railjet):')
f2 = extract_feed(ZIP2, prefix='f2_')

# ── Merge ─────────────────────────────────────────────────────────────────────
all_routes    = {**f1['rail_routes'],  **f2['rail_routes']}
all_trips     = {**f1['rail_trips'],   **f2['rail_trips']}
all_trip_stops= {**f1['trip_stops'],   **f2['trip_stops']}
all_stops_by  = {**f1['stops_by_id'],  **f2['stops_by_id']}
all_needed    = f1['needed'] | f2['needed']
all_calendars = f1['calendars']  + f2['calendars']
all_cal_dates = f1['cal_dates']  + f2['cal_dates']
all_agencies  = f1['agencies']   + f2['agencies']

def resolve_merged(sid):
    # intentar en f1 primero, luego f2
    r = f1['resolve'](sid)
    if r == sid: r = f2['resolve'](sid)
    return r

log(f'Total merge: {len(all_routes)} rutas, {len(all_trips)} trips, {len(all_needed)} stops')

# ── SQLite ─────────────────────────────────────────────────────────────────────
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
for sid in all_needed:
    row = all_stops_by.get(sid)
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
    [(rid, v['agency'], v['short'], v['long'], v['type']) for rid, v in all_routes.items()])
cur.executemany('INSERT OR IGNORE INTO trips VALUES (?,?,?,?,?)',
    [(tid, v['route_id'], v['service_id'], v['headsign'], 0) for tid, v in all_trips.items()])

log('Insertando stop_times...')
batch, total_st = [], 0
for tid, rows in all_trip_stops.items():
    for seq, sid, dep, arr in sorted(rows, key=lambda x: x[0]):
        batch.append((tid, arr, dep, resolve_merged(sid), seq))
    if len(batch) >= 100_000:
        cur.executemany('INSERT OR IGNORE INTO stop_times VALUES (?,?,?,?,?)', batch)
        total_st += len(batch); batch = []
if batch:
    cur.executemany('INSERT OR IGNORE INTO stop_times VALUES (?,?,?,?,?)', batch)
    total_st += len(batch)
log(f'  {total_st:,} stop_times')

if all_calendars:
    cur.executemany('INSERT OR IGNORE INTO calendar VALUES (?,?,?,?,?,?,?,?,?,?)', [
        (r['service_id'], int(r.get('monday',0) or 0), int(r.get('tuesday',0) or 0),
         int(r.get('wednesday',0) or 0), int(r.get('thursday',0) or 0),
         int(r.get('friday',0) or 0), int(r.get('saturday',0) or 0),
         int(r.get('sunday',0) or 0), r.get('start_date',''), r.get('end_date',''))
        for r in all_calendars])
if all_cal_dates:
    cur.executemany('INSERT OR IGNORE INTO calendar_dates VALUES (?,?,?)',
        [(r['service_id'], r['date'], int(r.get('exception_type',1))) for r in all_cal_dates])
# Deduplicar agencies (mismo agency_id puede venir dos veces)
seen_agencies = set()
for r in all_agencies:
    aid = r.get('agency_id','')
    if aid in seen_agencies: continue
    seen_agencies.add(aid)
    cur.execute('INSERT OR IGNORE INTO agency VALUES (?,?,?,?)',
        (aid, r.get('agency_name',''), r.get('agency_url',''), r.get('agency_timezone','')))

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
for t in ['stops','routes','trips','stop_times','calendar','calendar_dates']:
    c2.execute(f'SELECT COUNT(*) FROM {t}')
    print(f'  {t}: {c2.fetchone()[0]:,}')
c2.execute("""
    SELECT s_o.stop_name, s_d.stop_name, st_o.departure_time
    FROM stop_times st_o
    JOIN stop_times st_d ON st_d.trip_id=st_o.trip_id AND st_d.stop_sequence>st_o.stop_sequence+2
    JOIN stops s_o ON s_o.stop_id=st_o.stop_id
    JOIN stops s_d ON s_d.stop_id=st_d.stop_id
    WHERE (s_o.stop_name LIKE '%Wien%') AND st_o.departure_time >= '08:00:00'
    LIMIT 5
""")
print('Sample Wien:', c2.fetchall())
c2.execute("SELECT route_short_name, count(*) FROM routes r JOIN trips t ON t.route_id=r.route_id GROUP BY route_short_name ORDER BY count(*) DESC LIMIT 12")
print('Top rutas:', c2.fetchall())
con2.close()
