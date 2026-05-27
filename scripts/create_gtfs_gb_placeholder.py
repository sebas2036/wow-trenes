#!/usr/bin/env python3
"""
WoW TRENES — Placeholder gtfs_gb.db (National Rail)
Genera un DB mínimo con ~20 estaciones clave de UK para que la app
no crashee mientras el usuario obtiene el GTFS real en:
  https://opendata.nationalrail.co.uk/ → Data Feeds → GTFS
Luego reemplazarlo con: python3 scripts/import_gtfs_gb.py
"""
import sqlite3, shutil
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent.parent / "assets"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
OUT = OUTPUT_DIR / "gtfs_gb.db"
TMP = Path("/tmp/gtfs_gb_placeholder.db")

SCHEMA = """
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous  = NORMAL;
    CREATE TABLE IF NOT EXISTS agency (
        agency_id TEXT PRIMARY KEY, agency_name TEXT,
        agency_url TEXT, agency_timezone TEXT);
    CREATE TABLE IF NOT EXISTS stops (
        stop_id TEXT PRIMARY KEY, stop_name TEXT NOT NULL,
        stop_lat REAL NOT NULL, stop_lon REAL NOT NULL,
        country_code TEXT DEFAULT 'GB', location_type INTEGER DEFAULT 0,
        parent_station TEXT);
    CREATE TABLE IF NOT EXISTS routes (
        route_id TEXT PRIMARY KEY, agency_id TEXT,
        route_short_name TEXT, route_long_name TEXT, route_type INTEGER,
        route_color TEXT DEFAULT '', source_region TEXT);
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
    CREATE INDEX IF NOT EXISTS idx_stops_ll    ON stops      (stop_lat, stop_lon);
    CREATE INDEX IF NOT EXISTS idx_st_stop     ON stop_times (stop_id);
    CREATE INDEX IF NOT EXISTS idx_trips_route ON trips      (route_id);
"""

# Estaciones principales UK National Rail — coordenadas reales NaPTAN
STOPS = [
    ("9100EUSTON",   "London Euston",           51.5282, -0.1337),
    ("9100KGX",      "London King's Cross",      51.5308, -0.1238),
    ("9100PADTON",   "London Paddington",        51.5154, -0.1755),
    ("9100VICTRIC",  "London Victoria",          51.4952, -0.1441),
    ("9100WATRLMN",  "London Waterloo",          51.5031, -0.1132),
    ("9100LIVST",    "London Liverpool Street",  51.5178, -0.0822),
    ("9100LNDNBDG",  "London Bridge",            51.5053, -0.0865),
    ("9100STPX",     "London St Pancras",        51.5309, -0.1233),
    ("9100MNCRIAP",  "Manchester Piccadilly",    53.4774, -2.2310),
    ("9100MNCRVIC",  "Manchester Victoria",      53.4876, -2.2427),
    ("9100BRMGHM",   "Birmingham New Street",    52.4778, -1.8991),
    ("9100EDINBUR",  "Edinburgh Waverley",       55.9520, -3.1890),
    ("9100GLGC",     "Glasgow Central",          55.8585, -4.2580),
    ("9100LEEDS",    "Leeds",                    53.7955, -1.5491),
    ("9100YORK",     "York",                     53.9579, -1.0930),
    ("9100LVRPL",    "Liverpool Lime Street",    53.4071, -2.9779),
    ("9100BRSTL",    "Bristol Temple Meads",     51.4490, -2.5810),
    ("9100CREWE",    "Crewe",                    53.0890, -2.4365),
    ("9100OXFD",     "Oxford",                   51.7534, -1.2697),
    ("9100CMBRDG",   "Cambridge",                52.1943, 0.1370),
    ("9100SHFD",     "Sheffield",                53.3783, -1.4619),
    ("9100NWCSTLE",  "Newcastle",                54.9686, -1.6166),
    ("9100NOTTM",    "Nottingham",               52.9480, -1.1466),
    ("9100CARDFF",   "Cardiff Central",          51.4756, -3.1789),
    ("9100EXETRC",   "Exeter St Davids",         50.7278, -3.5273),
]

if TMP.exists():
    TMP.unlink()

conn = sqlite3.connect(str(TMP))
conn.executescript(SCHEMA)

conn.execute("INSERT OR IGNORE INTO agency VALUES (?,?,?,?)",
    ("NR", "National Rail", "https://www.nationalrail.co.uk", "Europe/London"))

for route_id, name, color in [
    ("AVANTI", "Avanti West Coast", "9B4D97"),
    ("LNER",   "LNER",             "E31837"),
    ("GWR",    "Great Western Railway", "09531B"),
]:
    conn.execute("INSERT OR IGNORE INTO routes VALUES (?,?,?,?,?,?,?)",
        (route_id, "NR", route_id, name, 2, color, "GB National Rail"))

for (sid, name, lat, lon) in STOPS:
    conn.execute("INSERT OR IGNORE INTO stops VALUES (?,?,?,?,?,?,?)",
        (sid, name, lat, lon, "GB", 0, ""))

conn.commit()
conn.close()

shutil.copy2(str(TMP), str(OUT))
TMP.unlink()
mb = OUT.stat().st_size / 1_048_576
print(f"\nWoW TRENES — Placeholder GB National Rail")
print(f"✓ {OUT.name}  ({mb:.3f} MB)  —  {len(STOPS)} estaciones seed")
print(f"\nPara datos reales (~2500 estaciones):")
print(f"  1. Registrate en: https://opendata.nationalrail.co.uk/")
print(f"  2. Login → Data Feeds → GTFS → Descargá el ZIP")
print(f"  3. Descomprimí en: ~/Downloads/GB National Rail/")
print(f"  4. python3 scripts/import_gtfs_gb.py")
