#!/usr/bin/env python3
"""
Genera placeholder SQLite DBs para los metros urbanos.
Ejecutar cuando el sandbox tenga espacio disponible.
"""
import sqlite3, shutil
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent.parent / "assets"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

SCHEMA = """
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

METROS = [
    {
        "db":      "gtfs_es_mad.db",
        "agency":  ("mad_metro", "Metro de Madrid", "https://www.metromadrid.es", "Europe/Madrid"),
        "country": "ES",
        "stops": [
            # Líneas centrales Madrid Metro — coordenadas reales
            ("S1",  "Sol",                          40.4168, -3.7026),
            ("S2",  "Gran Vía",                     40.4194, -3.7039),
            ("S3",  "Callao",                       40.4210, -3.7063),
            ("S4",  "Plaza de España",              40.4227, -3.7120),
            ("S5",  "Vodafone Sol",                 40.4144, -3.7012),
            ("S6",  "Sevilla",                      40.4193, -3.6988),
            ("S7",  "Banco de España",              40.4195, -3.6931),
            ("S8",  "Retiro",                       40.4151, -3.6832),
            ("S9",  "Atocha Renfe",                 40.4072, -3.6889),
            ("S10", "Nuevos Ministerios",           40.4465, -3.6927),
            ("S11", "Aeropuerto T1-T2-T3",         40.4713, -3.7226),
            ("S12", "Aeropuerto T4",                40.4933, -3.5896),
            ("S13", "Chamartín",                    40.4721, -3.6842),
            ("S14", "Moncloa",                      40.4330, -3.7195),
            ("S15", "Ópera",                        40.4182, -3.7108),
        ],
    },
    {
        "db":      "gtfs_es_bcn.db",
        "agency":  ("tmb", "TMB Barcelona", "https://www.tmb.cat", "Europe/Madrid"),
        "country": "ES",
        "stops": [
            # Líneas centrales Barcelona Metro — coordenadas reales
            ("B1",  "Passeig de Gràcia",            41.3917, 2.1647),
            ("B2",  "Diagonal",                     41.3956, 2.1524),
            ("B3",  "Sagrada Família",              41.4036, 2.1744),
            ("B4",  "Catalunya",                    41.3870, 2.1700),
            ("B5",  "Universitat",                  41.3843, 2.1641),
            ("B6",  "Barceloneta",                  41.3801, 2.1901),
            ("B7",  "Arc de Triomf",               41.3913, 2.1801),
            ("B8",  "Sants Estació",               41.3798, 2.1402),
            ("B9",  "Espanya",                      41.3751, 2.1490),
            ("B10", "Plaça de Sants",              41.3760, 2.1369),
            ("B11", "Joanic",                       41.4072, 2.1764),
            ("B12", "El Clot",                      41.4089, 2.1910),
            ("B13", "Glòries",                      41.3997, 2.1909),
            ("B14", "Marina",                       41.3952, 2.1899),
            ("B15", "Barceloneta (L4)",             41.3788, 2.1880),
        ],
    },
    {
        "db":      "gtfs_us_chi.db",
        "agency":  ("CTA", "Chicago Transit Authority", "https://www.transitchicago.com", "America/Chicago"),
        "country": "US",
        "stops": [
            # CTA L — estaciones principales — coordenadas reales
            ("C1",  "O'Hare",                      41.9780, -87.9073),
            ("C2",  "Midway",                       41.7869, -87.7378),
            ("C3",  "Clark/Lake",                   41.8858, -87.6313),
            ("C4",  "Lake",                         41.8848, -87.6276),
            ("C5",  "Washington",                   41.8836, -87.6293),
            ("C6",  "Monroe",                       41.8803, -87.6285),
            ("C7",  "Jackson",                      41.8784, -87.6295),
            ("C8",  "Harold Washington Library",    41.8766, -87.6283),
            ("C9",  "LaSalle",                      41.8758, -87.6318),
            ("C10", "Union Station",               41.8791, -87.6403),
            ("C11", "Merchandise Mart",             41.8888, -87.6334),
            ("C12", "Grand",                        41.8916, -87.6348),
            ("C13", "Chicago",                      41.8966, -87.6316),
            ("C14", "State/Lake",                   41.8857, -87.6281),
            ("C15", "Adams/Wabash",                 41.8793, -87.6256),
        ],
    },
    {
        "db":      "gtfs_us_lax.db",
        "agency":  ("LACMTA", "LA Metro", "https://www.metro.net", "America/Los_Angeles"),
        "country": "US",
        "stops": [
            # LA Metro Rail — estaciones principales — coordenadas reales
            ("L1",  "Union Station",               34.0560, -118.2365),
            ("L2",  "7th Street/Metro Center",     34.0483, -118.2595),
            ("L3",  "Pershing Square",              34.0488, -118.2541),
            ("L4",  "Civic Center/Grand Park",     34.0558, -118.2434),
            ("L5",  "Hollywood/Vine",               34.1019, -118.3267),
            ("L6",  "Hollywood/Highland",          34.1019, -118.3394),
            ("L7",  "Hollywood/Cahuenga",          34.1023, -118.3280),
            ("L8",  "North Hollywood",              34.1694, -118.3768),
            ("L9",  "Culver City",                  34.0027, -118.3909),
            ("L10", "Santa Monica",                34.0107, -118.4922),
            ("L11", "LAX/Aviation",                33.9607, -118.3752),
            ("L12", "Long Beach Transit Mall",     33.7779, -118.1888),
            ("L13", "Azusa Downtown",              34.1306, -117.9103),
            ("L14", "Pasadena",                    34.1468, -118.1314),
            ("L15", "East LA Civic Center",        34.0234, -118.1528),
        ],
    },
]

for metro in METROS:
    db_path = OUTPUT_DIR / metro["db"]
    tmp     = Path(f"/tmp/ph_{metro['db']}")
    if tmp.exists(): tmp.unlink()

    conn = sqlite3.connect(str(tmp))
    conn.executescript(SCHEMA)

    # Agency
    a = metro["agency"]
    conn.execute("INSERT OR IGNORE INTO agency VALUES (?,?,?,?)", a)

    # Route placeholder
    conn.execute("INSERT OR IGNORE INTO routes VALUES (?,?,?,?,?,?,?)",
        ("R1", a[0], "Metro", "Metro Urban", 1, "7C3AED", metro["agency"][1]))

    # Stops reales
    for (sid, name, lat, lon) in metro["stops"]:
        conn.execute("INSERT OR IGNORE INTO stops VALUES (?,?,?,?,?,?,?)",
            (sid, name, lat, lon, metro["country"], 0, ""))

    conn.commit()
    conn.execute("CREATE INDEX IF NOT EXISTS idx_stops_ll2 ON stops (stop_lat, stop_lon)")
    conn.commit()
    conn.close()

    shutil.copy2(str(tmp), str(db_path))
    tmp.unlink()
    mb = db_path.stat().st_size / 1_048_576
    print(f"  ✓ {metro['db']}  ({mb:.3f} MB)  —  {len(metro['stops'])} estaciones seed")

print("\nPlaceholders listos. Importar datos reales con los scripts import_gtfs_*.py")
