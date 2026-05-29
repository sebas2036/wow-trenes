#!/usr/bin/env python3
"""
WoW TRENES — Berlin U-Bahn GTFS Generator
Líneas: U1-U9 (BVG) + S-Bahn principales
Fuente: coordenadas reales BVG / OpenStreetMap
Real-time: v6.db.transport.rest (público, sin key)
Uso: python3 scripts/create_gtfs_de_ber.py
"""
import sqlite3, shutil, time
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent.parent / "assets"
OUTPUT_DB  = OUTPUT_DIR / "gtfs_de_ber.db"

STATIONS = [
    # ── U1 — Uhlandstraße ↔ Warschauer Straße ─────────────────────────────
    ("BER_U1_01", "Uhlandstraße",          52.4987, 13.3295, ["U1"]),
    ("BER_U1_02", "Kurfürstendamm",        52.5024, 13.3308, ["U1","U9"]),
    ("BER_U1_03", "Wittenbergplatz",       52.5008, 13.3436, ["U1","U2","U3"]),
    ("BER_U1_04", "Nollendorfplatz",       52.4993, 13.3537, ["U1","U2","U3","U4"]),
    ("BER_U1_05", "Gleisdreieck",          52.4989, 13.3650, ["U1","U2","U3"]),
    ("BER_U1_06", "Möckernbrücke",         52.4974, 13.3792, ["U1","U7"]),
    ("BER_U1_07", "Hallesches Tor",        52.4970, 13.3902, ["U1","U6"]),
    ("BER_U1_08", "Kottbusser Tor",        52.4991, 13.4179, ["U1","U8"]),
    ("BER_U1_09", "Görlitzer Bahnhof",     52.4985, 13.4393, ["U1"]),
    ("BER_U1_10", "Schlesisches Tor",      52.5003, 13.4476, ["U1"]),
    ("BER_U1_11", "Warschauer Straße",     52.5057, 13.4489, ["U1","U3","S3","S5","S7","S9"]),

    # ── U2 — Pankow ↔ Ruhleben ────────────────────────────────────────────
    ("BER_U2_01", "Pankow",               52.5690, 13.4024, ["U2"]),
    ("BER_U2_02", "Vinetastraße",         52.5622, 13.4014, ["U2"]),
    ("BER_U2_03", "Schönhauser Allee",    52.5486, 13.4148, ["U2"]),
    ("BER_U2_04", "Eberswalder Straße",   52.5420, 13.4147, ["U2"]),
    ("BER_U2_05", "Senefelderplatz",      52.5327, 13.4143, ["U2"]),
    ("BER_U2_06", "Rosa-Luxemburg-Platz", 52.5268, 13.4104, ["U2"]),
    ("BER_U2_07", "Alexanderplatz",       52.5213, 13.4132, ["U2","U5","U8","S3","S5","S7","S9"]),
    ("BER_U2_08", "Klosterstraße",        52.5155, 13.4167, ["U2"]),
    ("BER_U2_09", "Märkisches Museum",    52.5127, 13.4141, ["U2"]),
    ("BER_U2_10", "Spittelmarkt",         52.5107, 13.3990, ["U2"]),
    ("BER_U2_11", "Stadtmitte",           52.5128, 13.3895, ["U2","U6"]),
    ("BER_U2_12", "Hausvogteiplatz",      52.5147, 13.3932, ["U2"]),
    ("BER_U2_13", "Mohrenstraße",         52.5108, 13.3848, ["U2"]),
    ("BER_U2_14", "Potsdamer Platz",      52.5096, 13.3761, ["U2","S1","S2","S25"]),
    ("BER_U2_15", "Mendelssohn-Bartholdy-Park", 52.5041, 13.3694, ["U2"]),
    ("BER_U2_16", "Bülowstraße",          52.4991, 13.3573, ["U2"]),
    ("BER_U2_17", "Bayerischer Platz",    52.4900, 13.3460, ["U4"]),
    ("BER_U2_18", "Zoologischer Garten",  52.5068, 13.3325, ["U2","U9","S3","S5","S7","S9"]),
    ("BER_U2_19", "Ernst-Reuter-Platz",   52.5122, 13.3216, ["U2"]),
    ("BER_U2_20", "Deutsche Oper",        52.5158, 13.3139, ["U2"]),
    ("BER_U2_21", "Bismarckstraße",       52.5175, 13.3040, ["U2","U7"]),
    ("BER_U2_22", "Sophie-Charlotte-Platz", 52.5190, 13.2944, ["U2"]),
    ("BER_U2_23", "Kaiserdamm",           52.5172, 13.2844, ["U2"]),
    ("BER_U2_24", "Theodor-Heuss-Platz",  52.5154, 13.2685, ["U2"]),
    ("BER_U2_25", "Ruhleben",             52.5243, 13.2332, ["U2"]),

    # ── U5 — Hönow ↔ Hauptbahnhof ─────────────────────────────────────────
    ("BER_U5_01", "Hönow",               52.5356, 13.6358, ["U5"]),
    ("BER_U5_02", "Elsterwerdaer Platz", 52.5312, 13.5944, ["U5"]),
    ("BER_U5_03", "Hellersdorf",         52.5344, 13.5836, ["U5"]),
    ("BER_U5_04", "Louis-Lewin-Straße",  52.5319, 13.5613, ["U5"]),
    ("BER_U5_05", "Cottbusser Platz",    52.5285, 13.5443, ["U5"]),
    ("BER_U5_06", "Biesdorf-Süd",        52.5247, 13.5278, ["U5"]),
    ("BER_U5_07", "Wuhletal",            52.5209, 13.5147, ["U5"]),
    ("BER_U5_08", "Kaulsdorf-Nord",      52.5173, 13.5044, ["U5"]),
    ("BER_U5_09", "Mahlsdorf",           52.5140, 13.4998, ["U5"]),
    ("BER_U5_10", "Tierpark",            52.5074, 13.4711, ["U5"]),
    ("BER_U5_11", "Frankfurter Allee",   52.5147, 13.4617, ["U5","U7"]),
    ("BER_U5_12", "Samariterstraße",     52.5162, 13.4571, ["U5"]),
    ("BER_U5_13", "Frankfurter Tor",     52.5162, 13.4529, ["U5"]),
    ("BER_U5_14", "Weberwiese",          52.5150, 13.4480, ["U5"]),
    ("BER_U5_15", "Strausberger Platz",  52.5169, 13.4310, ["U5"]),
    ("BER_U5_16", "Schillingstraße",     52.5196, 13.4230, ["U5"]),
    ("BER_U5_17", "Jannowitzbrücke",     52.5143, 13.4204, ["U5","U8","S3","S5","S7","S9"]),
    ("BER_U5_18", "Rotes Rathaus",       52.5189, 13.4102, ["U5"]),
    ("BER_U5_19", "Museumsinsel",        52.5213, 13.4000, ["U5"]),
    ("BER_U5_20", "Unter den Linden",    52.5172, 13.3899, ["U5","U6"]),
    ("BER_U5_21", "Brandenburger Tor",   52.5162, 13.3793, ["U5","S1","S2","S25"]),
    ("BER_U5_22", "Hauptbahnhof",        52.5250, 13.3690, ["U5","S3","S5","S7","S9"]),

    # ── U6 — Alt-Tegel ↔ Alt-Mariendorf ───────────────────────────────────
    ("BER_U6_01", "Alt-Tegel",           52.5892, 13.2897, ["U6"]),
    ("BER_U6_02", "Borsigwerke",         52.5799, 13.2913, ["U6"]),
    ("BER_U6_03", "Holzhauser Straße",   52.5739, 13.2975, ["U6"]),
    ("BER_U6_04", "Otisstraße",          52.5669, 13.2987, ["U6"]),
    ("BER_U6_05", "Scharnweberstraße",   52.5614, 13.3035, ["U6"]),
    ("BER_U6_06", "Kurt-Schumacher-Platz", 52.5558, 13.3083, ["U6"]),
    ("BER_U6_07", "Afrikanische Straße", 52.5502, 13.3287, ["U6"]),
    ("BER_U6_08", "Rehberge",            52.5445, 13.3379, ["U6"]),
    ("BER_U6_09", "Seestraße",           52.5407, 13.3490, ["U6"]),
    ("BER_U6_10", "Wedding",             52.5384, 13.3616, ["U6"]),
    ("BER_U6_11", "Gesundbrunnen",       52.5487, 13.3880, ["U6","S1","S2","S25","S41","S42"]),
    ("BER_U6_12", "Voltastraße",         52.5376, 13.3789, ["U6"]),
    ("BER_U6_13", "Reinickendorfer Straße", 52.5349, 13.3730, ["U6"]),
    ("BER_U6_14", "Leopoldplatz",        52.5489, 13.3619, ["U6","U9"]),
    ("BER_U6_15", "Schwartzkopffstraße", 52.5282, 13.3787, ["U6"]),
    ("BER_U6_16", "Naturkundemuseum",    52.5266, 13.3785, ["U6"]),
    ("BER_U6_17", "Oranienburger Tor",   52.5247, 13.3882, ["U6"]),
    ("BER_U6_18", "Friedrichstraße",     52.5201, 13.3877, ["U6","S1","S2","S25","S3","S5","S7","S9"]),
    ("BER_U6_19", "Französische Straße", 52.5165, 13.3923, ["U6"]),
    ("BER_U6_20", "Kochstraße",          52.5064, 13.3907, ["U6"]),
    ("BER_U6_21", "Tempelhof",           52.4732, 13.3839, ["U6"]),
    ("BER_U6_22", "Alt-Mariendorf",      52.4381, 13.3873, ["U6"]),

    # ── U7 — Spandau ↔ Rudow ─────────────────────────────────────────────
    ("BER_U7_01", "Spandau",             52.5350, 13.1972, ["U7","S3","S9"]),
    ("BER_U7_02", "Zitadelle",           52.5353, 13.2077, ["U7"]),
    ("BER_U7_03", "Altstadt Spandau",    52.5337, 13.2053, ["U7"]),
    ("BER_U7_04", "Rathaus Spandau",     52.5359, 13.2153, ["U7"]),
    ("BER_U7_05", "Rohrdamm",            52.5367, 13.2435, ["U7"]),
    ("BER_U7_06", "Siemensdamm",         52.5328, 13.2635, ["U7"]),
    ("BER_U7_07", "Halemweg",            52.5299, 13.2806, ["U7"]),
    ("BER_U7_08", "Jakob-Kaiser-Platz",  52.5270, 13.2893, ["U7"]),
    ("BER_U7_09", "Jungfernheide",       52.5313, 13.2977, ["U7","S41","S42"]),
    ("BER_U7_10", "Mierendorffplatz",    52.5237, 13.3032, ["U7"]),
    ("BER_U7_11", "Richard-Wagner-Platz", 52.5198, 13.3089, ["U7"]),
    ("BER_U7_12", "Turmstraße",          52.5218, 13.3328, ["U7"]),
    ("BER_U7_13", "Hansaplatz",          52.5158, 13.3394, ["U7"]),
    ("BER_U7_14", "Wittenbergplatz",     52.5008, 13.3436, ["U7","U1","U2","U3"]),
    ("BER_U7_15", "Kleistpark",          52.4894, 13.3500, ["U7"]),
    ("BER_U7_16", "Rathaus Steglitz",    52.4564, 13.3200, ["U7","S1"]),
    ("BER_U7_17", "Rudow",              52.4085, 13.4701, ["U7"]),

    # ── U8 — Wittenau ↔ Hermannstraße ────────────────────────────────────
    ("BER_U8_01", "Wittenau",            52.5871, 13.3324, ["U8","S1","S25"]),
    ("BER_U8_02", "Rathaus Reinickendorf", 52.5802, 13.3321, ["U8"]),
    ("BER_U8_03", "Karl-Bonhoeffer-Nervenklinik", 52.5734, 13.3344, ["U8"]),
    ("BER_U8_04", "Lindauer Allee",      52.5670, 13.3385, ["U8"]),
    ("BER_U8_05", "Paracelsus-Bad",      52.5608, 13.3437, ["U8"]),
    ("BER_U8_06", "Osloer Straße",       52.5547, 13.3556, ["U8","U9"]),
    ("BER_U8_07", "Pankstraße",          52.5499, 13.3651, ["U8"]),
    ("BER_U8_08", "Gesundbrunnen",       52.5487, 13.3880, ["U8","U6","S1","S2","S25"]),
    ("BER_U8_09", "Voltastraße",         52.5376, 13.3789, ["U8","U6"]),
    ("BER_U8_10", "Bernauer Straße",     52.5327, 13.3903, ["U8"]),
    ("BER_U8_11", "Rosenthaler Platz",   52.5300, 13.4006, ["U8"]),
    ("BER_U8_12", "Weinmeisterstraße",   52.5233, 13.4028, ["U8"]),
    ("BER_U8_13", "Hermannplatz",        52.4871, 13.4253, ["U8","U7"]),
    ("BER_U8_14", "Hermannstraße",       52.4713, 13.4309, ["U8","S41","S42"]),

    # ── U9 — Osloer Straße ↔ Rathaus Steglitz ────────────────────────────
    ("BER_U9_01", "Osloer Straße",       52.5547, 13.3556, ["U9","U8"]),
    ("BER_U9_02", "Nauener Platz",       52.5473, 13.3476, ["U9"]),
    ("BER_U9_03", "Leopoldplatz",        52.5489, 13.3619, ["U9","U6"]),
    ("BER_U9_04", "Amrumer Straße",      52.5400, 13.3443, ["U9"]),
    ("BER_U9_05", "Westhafen",           52.5372, 13.3408, ["U9"]),
    ("BER_U9_06", "Turmstraße",          52.5218, 13.3328, ["U9","U7"]),
    ("BER_U9_07", "Hansaplatz",          52.5158, 13.3394, ["U9","U7"]),
    ("BER_U9_08", "Zoologischer Garten", 52.5068, 13.3325, ["U9","U2","S3","S5","S7","S9"]),
    ("BER_U9_09", "Kurfürstendamm",      52.5024, 13.3308, ["U9","U1"]),
    ("BER_U9_10", "Spichernstraße",      52.4964, 13.3350, ["U9"]),
    ("BER_U9_11", "Güntzelstraße",       52.4883, 13.3291, ["U9"]),
    ("BER_U9_12", "Berliner Straße",     52.4830, 13.3199, ["U9","U7"]),
    ("BER_U9_13", "Bundesplatz",         52.4779, 13.3226, ["U9"]),
    ("BER_U9_14", "Walther-Schreiber-Platz", 52.4680, 13.3232, ["U9"]),
    ("BER_U9_15", "Rathaus Steglitz",    52.4564, 13.3200, ["U9","U7","S1"]),

    # ── S-Bahn principales ────────────────────────────────────────────────
    ("BER_S_HBF",  "Berlin Hauptbahnhof",   52.5250, 13.3690, ["S3","S5","S7","S9","U5"]),
    ("BER_S_OST",  "Ostbahnhof",            52.5100, 13.4340, ["S3","S5","S7","S9"]),
    ("BER_S_SUD",  "Südkreuz",              52.4754, 13.3657, ["S41","S42","S45","S46"]),
    ("BER_S_SCH",  "Schönefeld",            52.3840, 13.5193, ["S9","S45"]),
    ("BER_S_TXL",  "BER Flughafen",         52.3660, 13.5027, ["S9","S45"]),
    ("BER_S_POT",  "Potsdam Hbf",           52.3908, 13.0672, ["S7"]),
]

LINES = [
    ("U1", "U1", "U-Bahn Linie 1", "55A822", 1),
    ("U2", "U2", "U-Bahn Linie 2", "E8232A", 1),
    ("U3", "U3", "U-Bahn Linie 3", "16683C", 1),
    ("U4", "U4", "U-Bahn Linie 4", "F0D722", 1),
    ("U5", "U5", "U-Bahn Linie 5", "7E4C22", 1),
    ("U6", "U6", "U-Bahn Linie 6", "8C6DAB", 1),
    ("U7", "U7", "U-Bahn Linie 7", "009BD5", 1),
    ("U8", "U8", "U-Bahn Linie 8", "224F9F", 1),
    ("U9", "U9", "U-Bahn Linie 9", "F3791D", 1),
    ("S3", "S3", "S-Bahn Linie 3", "009D6E", 2),
    ("S5", "S5", "S-Bahn Linie 5", "FF6600", 2),
    ("S7", "S7", "S-Bahn Linie 7", "6F4F9E", 2),
    ("S9", "S9", "S-Bahn Linie 9", "EC1B2E", 2),
]

LINE_SEQUENCES = {
    "U1": ["BER_U1_01","BER_U1_02","BER_U1_03","BER_U1_04","BER_U1_05",
           "BER_U1_06","BER_U1_07","BER_U1_08","BER_U1_09","BER_U1_10","BER_U1_11"],
    "U2": ["BER_U2_25","BER_U2_24","BER_U2_23","BER_U2_22","BER_U2_21","BER_U2_20",
           "BER_U2_19","BER_U2_18","BER_U1_02","BER_U1_03","BER_U2_16","BER_U2_15",
           "BER_U2_14","BER_U2_13","BER_U2_12","BER_U2_11","BER_U2_10","BER_U2_09",
           "BER_U2_08","BER_U2_07","BER_U2_06","BER_U2_05","BER_U2_04","BER_U2_03",
           "BER_U2_02","BER_U2_01"],
    "U5": ["BER_U5_01","BER_U5_02","BER_U5_03","BER_U5_04","BER_U5_05","BER_U5_06",
           "BER_U5_07","BER_U5_08","BER_U5_09","BER_U5_10","BER_U5_11","BER_U5_12",
           "BER_U5_13","BER_U5_14","BER_U5_15","BER_U5_16","BER_U5_17","BER_U5_18",
           "BER_U5_19","BER_U5_20","BER_U5_21","BER_U5_22"],
    "U6": ["BER_U6_01","BER_U6_02","BER_U6_03","BER_U6_04","BER_U6_05","BER_U6_06",
           "BER_U6_07","BER_U6_08","BER_U6_09","BER_U6_10","BER_U6_14","BER_U6_15",
           "BER_U6_16","BER_U6_17","BER_U6_18","BER_U6_19","BER_U2_11","BER_U1_07",
           "BER_U6_20","BER_U6_21","BER_U6_22"],
    "U7": ["BER_U7_01","BER_U7_02","BER_U7_03","BER_U7_04","BER_U7_05","BER_U7_06",
           "BER_U7_07","BER_U7_08","BER_U7_09","BER_U7_10","BER_U7_11","BER_U7_12",
           "BER_U7_13","BER_U1_03","BER_U7_14","BER_U7_15","BER_U7_16","BER_U7_17"],
    "U8": ["BER_U8_01","BER_U8_02","BER_U8_03","BER_U8_04","BER_U8_05","BER_U8_06",
           "BER_U8_07","BER_U8_08","BER_U8_09","BER_U8_10","BER_U8_11","BER_U8_12",
           "BER_U2_07","BER_U1_08","BER_U8_13","BER_U8_14"],
    "U9": ["BER_U9_01","BER_U9_02","BER_U9_03","BER_U9_04","BER_U9_05","BER_U7_12",
           "BER_U7_13","BER_U9_08","BER_U9_09","BER_U9_10","BER_U9_11","BER_U9_12",
           "BER_U9_13","BER_U9_14","BER_U9_15"],
    "S3": ["BER_S_POT","BER_U2_18","BER_S_HBF","BER_U6_18","BER_U2_07","BER_U5_17","BER_S_OST","BER_U1_11"],
    "S7": ["BER_S_POT","BER_U2_18","BER_S_HBF","BER_U6_18","BER_U2_07","BER_U5_17","BER_S_OST"],
    "S9": ["BER_S_TXL","BER_S_SCH","BER_U2_07","BER_S_HBF","BER_U7_01"],
}

HEADWAY = {
    "U1":4,"U2":4,"U3":5,"U4":5,"U5":4,"U6":4,"U7":4,"U8":4,"U9":4,
    "S3":10,"S5":10,"S7":10,"S9":20,
}
_FIRST_MIN = 300
_LAST_MIN  = 1440
_DWELL     = 2


def fmt_time(m):
    h, mn = divmod(m, 60)
    return f"{h:02d}:{mn:02d}:00"


def main():
    print("\nWoW TRENES — Berlin U-Bahn + S-Bahn GTFS Generator")
    print("=" * 52)
    t0 = time.time()

    seen = set()
    unique = []
    for s in STATIONS:
        if s[0] not in seen:
            seen.add(s[0]); unique.append(s)

    print(f"  Líneas:     {len(LINES)}")
    print(f"  Estaciones: {len(unique)}")

    import os
    tmp = "/tmp/gtfs_de_ber.db"
    os.path.exists(tmp) and os.unlink(tmp)
    conn = sqlite3.connect(tmp)
    conn.executescript("""
        PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
        CREATE TABLE IF NOT EXISTS agency(agency_id TEXT PRIMARY KEY,agency_name TEXT,agency_url TEXT,agency_timezone TEXT);
        CREATE TABLE IF NOT EXISTS stops(stop_id TEXT PRIMARY KEY,stop_name TEXT NOT NULL,stop_lat REAL NOT NULL,stop_lon REAL NOT NULL,country_code TEXT DEFAULT 'DE',location_type INTEGER DEFAULT 0,parent_station TEXT);
        CREATE TABLE IF NOT EXISTS routes(route_id TEXT PRIMARY KEY,agency_id TEXT,route_short_name TEXT,route_long_name TEXT,route_type INTEGER,route_color TEXT,source_region TEXT);
        CREATE TABLE IF NOT EXISTS trips(trip_id TEXT PRIMARY KEY,route_id TEXT,service_id TEXT,trip_headsign TEXT,direction_id INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS stop_times(trip_id TEXT NOT NULL,arrival_time TEXT,departure_time TEXT,stop_id TEXT NOT NULL,stop_sequence INTEGER,PRIMARY KEY(trip_id,stop_sequence));
        CREATE TABLE IF NOT EXISTS calendar(service_id TEXT PRIMARY KEY,monday INTEGER,tuesday INTEGER,wednesday INTEGER,thursday INTEGER,friday INTEGER,saturday INTEGER,sunday INTEGER,start_date TEXT,end_date TEXT);
    """)
    conn.execute("INSERT OR IGNORE INTO agency VALUES(?,?,?,?)",
        ("BVG","Berliner Verkehrsbetriebe","https://www.bvg.de","Europe/Berlin"))
    conn.commit()

    for lid,sn,ln,col,rt in LINES:
        conn.execute("INSERT OR IGNORE INTO routes VALUES(?,?,?,?,?,?,?)",(lid,"BVG",sn,ln,rt,col,"Berlin"))
    conn.commit()

    valid = set()
    rows = []
    for sid,name,lat,lon,_ in unique:
        rows.append((sid,name,lat,lon,"DE",0,""))
        valid.add(sid)
    conn.executemany("INSERT OR IGNORE INTO stops VALUES(?,?,?,?,?,?,?)",rows)
    conn.commit()
    print(f"  Paradas:    {len(rows)}")

    tb=[]; st=[]; tc=0; sc=0
    for rid,seq in LINE_SEQUENCES.items():
        sv=[s for s in seq if s in valid]
        if len(sv)<2: continue
        hw=HEADWAY.get(rid,5)
        for d in (0,1):
            sq=sv if d==0 else list(reversed(sv))
            hs=sq[-1]; dep=_FIRST_MIN
            while dep<=_LAST_MIN:
                tid=f"{rid}_d{d}_{dep:04d}"
                tb.append((tid,rid,"ALL",hs,d))
                for i,s in enumerate(sq):
                    ts=fmt_time(dep+i*_DWELL)
                    st.append((tid,ts,ts,s,i))
                tc+=1; sc+=len(sq); dep+=hw

    conn.executemany("INSERT OR IGNORE INTO trips VALUES(?,?,?,?,?)",tb)
    conn.executemany("INSERT OR IGNORE INTO stop_times VALUES(?,?,?,?,?)",st)
    conn.commit()
    print(f"  Trips:      {tc:,}")
    print(f"  Stop_times: {sc:,}")

    for sv,m,t,w,th,f,sa,su in [("WD",1,1,1,1,1,0,0),("WE",0,0,0,0,0,1,1),("ALL",1,1,1,1,1,1,1)]:
        conn.execute("INSERT OR IGNORE INTO calendar VALUES(?,?,?,?,?,?,?,?,?,?)",(sv,m,t,w,th,f,sa,su,"20260101","20261231"))
    conn.commit()
    conn.executescript("""
        CREATE INDEX IF NOT EXISTS idx_stops_ll ON stops(stop_lat,stop_lon);
        CREATE INDEX IF NOT EXISTS idx_st_stop  ON stop_times(stop_id);
        CREATE INDEX IF NOT EXISTS idx_trips_r  ON trips(route_id);
    """)
    conn.close()

    OUTPUT_DIR.mkdir(parents=True,exist_ok=True)
    shutil.copy2(tmp,str(OUTPUT_DB)); os.unlink(tmp)
    elapsed=time.time()-t0
    mb=OUTPUT_DB.stat().st_size/1_048_576
    print(f"\n  ✓ Listo en {elapsed:.1f}s  —  {mb:.2f} MB")
    print(f"  Archivo: {OUTPUT_DB}")
    print(f"  Berlín: U1·U2·U5·U6·U7·U8·U9 + S3·S7·S9")


if __name__=="__main__":
    main()
