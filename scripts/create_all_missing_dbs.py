#!/usr/bin/env python3
"""
WoW TRENES — Genera DBs placeholder para todos los países sin datos reales.
Ejecutar desde la raíz del proyecto: python3 scripts/create_all_missing_dbs.py
"""
import sqlite3, shutil, time
from pathlib import Path

ASSETS = Path(__file__).parent.parent / "assets"

def make_db(filename, country_code, stations, routes, seqs):
    tmp = Path(f"/tmp/{filename}")
    if tmp.exists(): tmp.unlink()
    conn = sqlite3.connect(str(tmp))
    conn.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE stops(stop_id TEXT PRIMARY KEY,stop_name TEXT,stop_lat REAL,stop_lon REAL,
            country_code TEXT DEFAULT 'XX',location_type INTEGER DEFAULT 0,parent_station TEXT);
        CREATE TABLE routes(route_id TEXT PRIMARY KEY,agency_id TEXT,
            route_short_name TEXT,route_long_name TEXT,route_type INTEGER,route_color TEXT);
        CREATE TABLE trips(trip_id TEXT PRIMARY KEY,route_id TEXT,service_id TEXT,
            trip_headsign TEXT,direction_id INTEGER DEFAULT 0);
        CREATE TABLE stop_times(trip_id TEXT,arrival_time TEXT,departure_time TEXT,
            stop_id TEXT,stop_sequence INTEGER,PRIMARY KEY(trip_id,stop_sequence));
        CREATE TABLE calendar(service_id TEXT PRIMARY KEY,monday INTEGER,tuesday INTEGER,
            wednesday INTEGER,thursday INTEGER,friday INTEGER,saturday INTEGER,sunday INTEGER,
            start_date TEXT,end_date TEXT);
        CREATE TABLE calendar_dates(service_id TEXT,date TEXT,exception_type INTEGER,
            PRIMARY KEY(service_id,date));
    """)
    for sid, name, lat, lon in stations:
        conn.execute("INSERT OR IGNORE INTO stops VALUES(?,?,?,?,?,?,?)",
            (sid, name, lat, lon, country_code, 0, ""))
    for rid, short, long, color, rtype in routes:
        conn.execute("INSERT OR IGNORE INTO routes VALUES(?,?,?,?,?,?)",
            (rid, "OP", short, long, rtype, color))
    conn.execute("INSERT OR IGNORE INTO calendar VALUES(?,?,?,?,?,?,?,?,?,?)",
        ("ALL",1,1,1,1,1,1,1,"20260101","20261231"))

    valid = {s[0] for s in stations}
    rtype_map = {r[0]: r[4] for r in routes}
    trip_n = 0; st_n = 0

    for rid, seq, headway, dwell in seqs:
        sq = [s for s in seq if s in valid]
        if len(sq) < 2: continue
        for d in (0, 1):
            ss = sq if d == 0 else list(reversed(sq))
            dep = 300  # 05:00
            while dep <= 1380:  # 23:00
                tid = f"{rid}_d{d}_{dep:04d}"
                conn.execute("INSERT OR IGNORE INTO trips VALUES(?,?,?,?,?)",
                    (tid, rid, "ALL", ss[-1], d))
                for i, sid in enumerate(ss):
                    m = dep + i * dwell
                    ts = f"{m//60:02d}:{m%60:02d}:00"
                    conn.execute("INSERT OR IGNORE INTO stop_times VALUES(?,?,?,?,?)",
                        (tid, ts, ts, sid, i))
                    st_n += 1
                trip_n += 1
                dep += headway

    conn.executescript("""
        CREATE INDEX IF NOT EXISTS idx_ll ON stops(stop_lat, stop_lon);
        CREATE INDEX IF NOT EXISTS idx_st ON stop_times(stop_id);
    """)
    conn.commit(); conn.close()
    dest = ASSETS / filename
    shutil.copy2(str(tmp), str(dest))
    mb = dest.stat().st_size / 1_048_576
    print(f"  ✅ {filename:35s} {len(stations):3d} estaciones · {trip_n:5d} trips · {mb:.2f} MB")


# ─────────────────────────────────────────────────────────────────────────────
print("\nWoW TRENES — Generando DBs placeholder\n" + "="*45)

# ── ITALIA ────────────────────────────────────────────────────────────────────
make_db("gtfs_italy.db", "IT", [
    ("IT_MIL","Milano Centrale",      45.4859, 9.2045),
    ("IT_ROM","Roma Termini",         41.9009,12.5004),
    ("IT_FLR","Firenze S.M.N.",       43.7761,11.2484),
    ("IT_VEN","Venezia S.Lucia",      45.4414,12.3191),
    ("IT_NAP","Napoli Centrale",      40.8518,14.2722),
    ("IT_TRN","Torino Porta Nuova",   45.0614, 7.6784),
    ("IT_BOL","Bologna Centrale",     44.5058,11.3432),
    ("IT_GEN","Genova Brignole",      44.4083, 8.9429),
    ("IT_PAL","Palermo Centrale",     38.1112,13.3430),
    ("IT_BAR","Bari Centrale",        41.1166,16.8719),
    ("IT_VER","Verona Porta Nuova",   45.4288,10.9821),
    ("IT_PAD","Padova",               45.4103,11.8821),
],[
    ("FR_AV","FR","Frecciarossa",    "E60020",2),
    ("IC_IT","IC","Frecciargento",   "F0552E",2),
    ("RE_IT","RE","Regionale",       "009B3A",2),
],[
    ("FR_AV",["IT_TRN","IT_MIL","IT_BOL","IT_FLR","IT_ROM","IT_NAP"], 60, 10),
    ("IC_IT",["IT_MIL","IT_VER","IT_PAD","IT_VEN","IT_BOL","IT_ROM","IT_NAP","IT_BAR"], 90, 8),
    ("RE_IT",["IT_MIL","IT_GEN","IT_TRN","IT_VER","IT_PAD"], 30, 5),
])

# ── FRANCIA ───────────────────────────────────────────────────────────────────
make_db("gtfs_france.db", "FR", [
    ("FR_PAR","Paris Gare de Lyon",   48.8448, 2.3735),
    ("FR_LYO","Lyon Part-Dieu",       45.7606, 4.8596),
    ("FR_MRS","Marseille St-Charles", 43.3026, 5.3806),
    ("FR_BDX","Bordeaux St-Jean",     44.8256,-0.5566),
    ("FR_NTE","Nantes",               47.2176,-1.5422),
    ("FR_LIL","Lille Flandres",       50.6368, 3.0707),
    ("FR_STR","Strasbourg",           48.5851, 7.7351),
    ("FR_TLS","Toulouse Matabiau",    43.6114, 1.4539),
    ("FR_NIC","Nice Ville",           43.7046, 7.2620),
    ("FR_REN","Rennes",               48.1033,-1.6722),
    ("FR_MTP","Montpellier St-Roch",  43.6046, 3.8796),
    ("FR_DIJ","Dijon Ville",          47.3227, 5.0279),
],[
    ("TGV","TGV","TGV INOUI",        "E60020",2),
    ("IC_FR","IC","Intercités",       "0067C0",2),
    ("RE_FR","RE","TER",              "5AA832",2),
],[
    ("TGV",["FR_LIL","FR_PAR","FR_LYO","FR_MRS"], 60, 10),
    ("TGV",["FR_PAR","FR_BDX","FR_TLS"], 90, 12),
    ("TGV",["FR_PAR","FR_STR","FR_LYO","FR_NIC"], 60, 10),
    ("IC_FR",["FR_PAR","FR_REN","FR_NTE","FR_BDX"], 120, 15),
    ("RE_FR",["FR_LYO","FR_MTP","FR_MRS","FR_NIC"], 60, 8),
])

# ── ALEMANIA ──────────────────────────────────────────────────────────────────
make_db("gtfs_germany.db", "DE", [
    ("DE_BER","Berlin Hbf",           52.5250,13.3694),
    ("DE_MUC","München Hbf",          48.1403,11.5580),
    ("DE_HAM","Hamburg Hbf",          53.5530, 9.9922),
    ("DE_FRA","Frankfurt(Main)Hbf",   50.1071, 8.6636),
    ("DE_COL","Köln Hbf",             50.9430, 6.9596),
    ("DE_DUS","Düsseldorf Hbf",       51.2202, 6.7942),
    ("DE_STU","Stuttgart Hbf",        48.7842, 9.1827),
    ("DE_NUR","Nürnberg Hbf",         49.4456,11.0820),
    ("DE_LEI","Leipzig Hbf",          51.3456,12.3816),
    ("DE_DRE","Dresden Hbf",          51.0403,13.7325),
    ("DE_HAN","Hannover Hbf",         52.3765, 9.7416),
    ("DE_BRE","Bremen Hbf",           53.0828, 8.8140),
],[
    ("ICE","ICE","ICE",              "E60020",2),
    ("IC_DE","IC","IC/EC",           "0067C0",2),
    ("RE_DE","RE","Regionalexpress", "5AA832",2),
],[
    ("ICE",["DE_HAM","DE_BER","DE_LEI","DE_NUR","DE_MUC"], 60, 8),
    ("ICE",["DE_HAM","DE_HAN","DE_FRA","DE_STU","DE_MUC"], 60, 8),
    ("ICE",["DE_BER","DE_FRA","DE_COL","DE_DUS"], 60, 8),
    ("IC_DE",["DE_HAM","DE_BRE","DE_HAN","DE_FRA"], 120,10),
    ("RE_DE",["DE_BER","DE_DRE","DE_LEI"], 30, 5),
])

# ── SUIZA ─────────────────────────────────────────────────────────────────────
make_db("gtfs_switzerland.db", "CH", [
    ("CH_ZRH","Zürich HB",            47.3782, 8.5400),
    ("CH_GVA","Genève Cornavin",      46.2101, 6.1423),
    ("CH_BSL","Basel SBB",            47.5473, 7.5899),
    ("CH_BRN","Bern",                 46.9490, 7.4394),
    ("CH_LUZ","Luzern",               47.0501, 8.3103),
    ("CH_INT","Interlaken Ost",       46.6910, 7.8695),
    ("CH_LUG","Lugano",               46.0048, 8.9467),
    ("CH_STG","St. Gallen",           47.4218, 9.3706),
    ("CH_LAU","Lausanne",             46.5166, 6.6291),
    ("CH_FRI","Fribourg",             46.8034, 7.1519),
    ("CH_THU","Thun",                 46.7561, 7.6287),
    ("CH_ZUG","Zug",                  47.1740, 8.5157),
],[
    ("IC_CH","IC","InterCity SBB",   "E40428",2),
    ("RE_CH","RE","RegioExpress",    "6F9B2A",2),
    ("GL_EX","GL","Glacier Express", "B5121B",2),
],[
    ("IC_CH",["CH_GVA","CH_LAU","CH_FRI","CH_BRN","CH_ZRH","CH_STG"], 60, 6),
    ("IC_CH",["CH_BSL","CH_BRN","CH_ZRH","CH_LUZ","CH_ZUG"], 60, 6),
    ("RE_CH",["CH_ZRH","CH_ZUG","CH_LUZ","CH_INT","CH_THU"], 30, 4),
    ("GL_EX",["CH_ZRH","CH_CHR","CH_AND","CH_ZMT"], 240,20),
])

# ── PAÍSES BAJOS ──────────────────────────────────────────────────────────────
make_db("gtfs_netherlands.db", "NL", [
    ("NL_AMS","Amsterdam Centraal",   52.3791, 4.8997),
    ("NL_RTD","Rotterdam Centraal",   51.9249, 4.4689),
    ("NL_HAG","Den Haag Centraal",    52.0801, 4.3239),
    ("NL_UTR","Utrecht Centraal",     52.0895, 5.1097),
    ("NL_EIN","Eindhoven",            51.4435, 5.4799),
    ("NL_ARN","Arnhem Centraal",      51.9848, 5.9001),
    ("NL_GRN","Groningen",            53.2109, 6.5634),
    ("NL_BRE","Breda",                51.5953, 4.7794),
    ("NL_TIL","Tilburg",              51.5637, 5.0844),
    ("NL_NMG","Nijmegen",             51.8450, 5.8520),
    ("NL_LEI","Leiden Centraal",      52.1661, 4.4820),
    ("NL_ALM","Almere Centrum",       52.3755, 5.2179),
],[
    ("IC_NL","IC","Intercity NS",    "003082",2),
    ("SPR","SPR","Sprinter",         "00AEEF",2),
    ("ICD","ICD","Intercity Direct", "003082",2),
],[
    ("IC_NL",["NL_AMS","NL_UTR","NL_ARN","NL_NMG"], 30, 5),
    ("IC_NL",["NL_AMS","NL_LEI","NL_HAG","NL_RTD","NL_BRE","NL_TIL","NL_EIN"], 30, 5),
    ("ICD", ["NL_AMS","NL_RTD"], 15, 4),
    ("SPR", ["NL_AMS","NL_ALM","NL_UTR"], 15, 4),
])

# ── AUSTRIA ───────────────────────────────────────────────────────────────────
make_db("gtfs_austria.db", "AT", [
    ("AT_WIE","Wien Hbf",             48.1847,16.3765),
    ("AT_SBG","Salzburg Hbf",         47.8130,13.0454),
    ("AT_GRA","Graz Hbf",             47.0728,15.4009),
    ("AT_INN","Innsbruck Hbf",        47.2636,11.4014),
    ("AT_LNZ","Linz Hbf",             48.2903,14.2921),
    ("AT_KLA","Klagenfurt Hbf",       46.6255,14.3078),
    ("AT_VBG","Bregenz",              47.5042, 9.7467),
    ("AT_STY","Bruck an der Mur",     47.4108,15.2747),
    ("AT_WRN","Wien Westbahnhof",     48.1967,16.3389),
    ("AT_SPK","Spittal-Millstättersee",46.7983,13.4956),
],[
    ("RJ","RJ","Railjet ÖBB",       "D02530",2),
    ("IC_AT","IC","InterCity",       "D02530",2),
    ("RE_AT","RE","RegionalExpress", "6DAE31",2),
],[
    ("RJ", ["AT_WIE","AT_LNZ","AT_SBG","AT_INN","AT_VBG"], 60, 8),
    ("RJ", ["AT_WIE","AT_GRA","AT_KLA"], 120,10),
    ("IC_AT",["AT_WIE","AT_WRN","AT_LNZ","AT_SBG"], 60, 7),
    ("RE_AT",["AT_GRA","AT_STY","AT_WIE"], 60, 6),
])

# ── NORUEGA ───────────────────────────────────────────────────────────────────
make_db("gtfs_norway.db", "NO", [
    ("NO_OSL","Oslo S",               59.9111,10.7528),
    ("NO_BER","Bergen",               60.3914, 5.3322),
    ("NO_TRD","Trondheim S",          63.4362,10.3979),
    ("NO_STA","Stavanger",            58.9697, 5.7331),
    ("NO_KRS","Kristiansand",         58.1459, 7.9958),
    ("NO_TRM","Tromsø",               69.6492,18.9560),
    ("NO_GEI","Geilo",                60.5315, 8.1948),
    ("NO_VOS","Voss",                 60.6278, 6.4153),
    ("NO_HAM","Hamar",                60.7945,11.0679),
    ("NO_LIL","Lillehammer",          61.1153,10.4602),
],[
    ("BER","BE","Bergensbanen NSB",  "003087",2),
    ("DOV","DV","Dovrebanen",        "003087",2),
    ("SOR","SR","Sørlandsbanen",     "003087",2),
],[
    ("BER",["NO_OSL","NO_GEI","NO_VOS","NO_BER"], 120,20),
    ("DOV",["NO_OSL","NO_HAM","NO_LIL","NO_TRD"], 90, 12),
    ("SOR",["NO_OSL","NO_KRS","NO_STA"], 120,15),
])

# ── PORTUGAL ──────────────────────────────────────────────────────────────────
make_db("gtfs_portugal.db", "PT", [
    ("PT_LIS","Lisboa Santa Apolónia",38.7163,-9.1237),
    ("PT_POR","Porto Campanhã",       41.1496,-8.5859),
    ("PT_FAR","Faro",                 37.0165,-7.9355),
    ("PT_COI","Coimbra B",            40.2058,-8.4425),
    ("PT_BRA","Braga",                41.5454,-8.4310),
    ("PT_AVE","Aveiro",               40.6443,-8.6452),
    ("PT_VIS","Viseu",                40.6582,-7.9123),
    ("PT_EVO","Évora",                38.5702,-7.9108),
    ("PT_SET","Setúbal",              38.5244,-8.8924),
],[
    ("AP","AP","Alfa Pendular CP",   "E30613",2),
    ("IC_PT","IC","Intercidades",    "0072BC",2),
    ("RE_PT","RE","Regional",        "0072BC",2),
],[
    ("AP",   ["PT_LIS","PT_COI","PT_POR","PT_BRA"], 60, 8),
    ("IC_PT",["PT_LIS","PT_EVO","PT_FAR"], 120,12),
    ("RE_PT",["PT_POR","PT_AVE","PT_COI","PT_LIS"], 60, 7),
])

# ── BÉLGICA ───────────────────────────────────────────────────────────────────
make_db("gtfs_belgium.db", "BE", [
    ("BE_BRU","Bruxelles Midi",       50.8354, 4.3363),
    ("BE_ANT","Antwerpen Centraal",   51.2172, 4.4213),
    ("BE_LIE","Liège Guillemins",     50.6241, 5.5714),
    ("BE_GNT","Gent Sint-Pieters",    51.0359, 3.7102),
    ("BE_BRG","Brugge",               51.1969, 3.2175),
    ("BE_NAM","Namur",                50.4608, 4.8627),
    ("BE_LVN","Leuven",               50.8826, 4.7161),
    ("BE_CHA","Charleroi Sud",        50.4130, 4.4452),
    ("BE_MON","Mons",                 50.4528, 3.9540),
],[
    ("IC_BE","IC","Intercity SNCB",  "003399",2),
    ("RE_BE","RE","Local",           "7AB648",2),
],[
    ("IC_BE",["BE_BRG","BE_GNT","BE_BRU","BE_LVN","BE_LIE"], 30, 5),
    ("IC_BE",["BE_ANT","BE_BRU","BE_NAM","BE_LIE"], 30, 5),
    ("RE_BE",["BE_BRU","BE_CHA","BE_MON","BE_NAM"], 60, 7),
])

# ── USA AMTRAK ────────────────────────────────────────────────────────────────
make_db("gtfs_usa.db", "US", [
    ("US_NYP","New York Penn Station",  40.7506,-73.9939),
    ("US_WAS","Washington Union",       38.8973,-77.0063),
    ("US_BOS","Boston South Station",   42.3519,-71.0552),
    ("US_PHL","Philadelphia 30th St",   39.9566,-75.1820),
    ("US_CHI","Chicago Union Station",  41.8786,-87.6397),
    ("US_LAX","Los Angeles Union",      34.0561,-118.2364),
    ("US_SFO","Emeryville (SF Bay)",    37.8310,-122.2826),
    ("US_SEA","Seattle King Street",    47.5989,-122.3301),
    ("US_NOR","New Orleans",            29.9483,-90.0773),
    ("US_ATL","Atlanta",                33.7490,-84.3880),
    ("US_MIA","Miami Airport",          25.7959,-80.2870),
    ("US_DEN","Denver",                 39.7470,-105.0040),
],[
    ("AEL","AEL","Acela Express",    "004B87",2),
    ("NEC","NEC","Northeast Regional","004B87",2),
    ("CAL","CAL","California Zephyr","004B87",2),
    ("CRE","CRE","Coast Starlight",  "004B87",2),
],[
    ("AEL",["US_BOS","US_NYP","US_PHL","US_WAS"], 60,15),
    ("NEC",["US_BOS","US_NYP","US_PHL","US_WAS","US_ATL","US_MIA"], 120,20),
    ("CAL",["US_CHI","US_DEN","US_SFO"], 1440,60),
    ("CRE",["US_SEA","US_SFO","US_LAX"], 1440,60),
])

# ── NYC SUBWAY ────────────────────────────────────────────────────────────────
make_db("gtfs_usa_nyc.db", "US", [
    ("NYC_GCT","Grand Central Terminal",40.7527,-73.9772),
    ("NYC_PST","Penn Station",           40.7506,-73.9939),
    ("NYC_TMS","Times Square 42nd",      40.7557,-73.9870),
    ("NYC_UNS","Union Square 14th",      40.7354,-73.9903),
    ("NYC_ATL","Atlantic Ave Barclays",  40.6842,-73.9776),
    ("NYC_JFK","Jamaica (JFK AirTrain)", 40.7002,-73.8088),
    ("NYC_FLS","Flushing Main St",       40.7598,-73.8302),
    ("NYC_CYH","Coney Island",           40.5776,-73.9812),
    ("NYC_WTC","World Trade Center",     40.7127,-74.0100),
    ("NYC_HBT","Hoboken Terminal",       40.7358,-74.0279),
    ("NYC_BSP","Borough Hall",           40.6928,-73.9903),
    ("NYC_BRX","Bronx 149 St",          40.8182,-73.9271),
],[
    ("L1","1","1 Train Red",        "EE352E",1),
    ("L2","A","A Train Blue",       "2850AD",1),
    ("L3","L","L Train Grey",       "A7A9AC",1),
    ("L4","7","7 Train Purple",     "B933AD",1),
    ("L5","6","6 Train Green",      "6CBE45",1),
],[
    ("L1",["NYC_BRX","NYC_TMS","NYC_PST","NYC_WTC","NYC_CYH"],5,2),
    ("L2",["NYC_JFK","NYC_BSP","NYC_WTC","NYC_TMS","NYC_HBT"],8,2),
    ("L3",["NYC_FLS","NYC_UNS","NYC_ATL"],8,2),
    ("L4",["NYC_FLS","NYC_TMS","NYC_GCT"],5,2),
    ("L5",["NYC_GCT","NYC_UNS","NYC_BSP","NYC_BRX"],5,2),
])

# ── MADRID METRO ──────────────────────────────────────────────────────────────
make_db("gtfs_es_mad.db", "ES", [
    ("MAD_SOL","Sol",                  40.4169,-3.7033),
    ("MAD_GRA","Gran Vía",             40.4197,-3.7002),
    ("MAD_ATO","Atocha Renfe",         40.4065,-3.6906),
    ("MAD_CHA","Chamartín",            40.4728,-3.6833),
    ("MAD_NUE","Nuevos Ministerios",   40.4467,-3.6927),
    ("MAD_BAR","Barceló",              40.4272,-3.7003),
    ("MAD_OPE","Ópera",                40.4176,-3.7100),
    ("MAD_VEN","Ventas",               40.4283,-3.6626),
    ("MAD_ALC","Alcobendas",           40.5462,-3.6442),
    ("MAD_LEG","Leganés",              40.3283,-3.7645),
    ("MAD_MOC","Móstoles Central",     40.3228,-3.8684),
    ("MAD_VLC","Vallekas",             40.3849,-3.6527),
],[
    ("M1","L1","Línea 1 Azul",       "00ADCA",1),
    ("M6","L6","Línea 6 Circular",   "9B9B9B",1),
    ("M10","L10","Línea 10 Oscura",  "004F96",1),
],[
    ("M1",["MAD_VLC","MAD_ATO","MAD_SOL","MAD_GRA","MAD_CHA"],5,2),
    ("M6",["MAD_OPE","MAD_GRA","MAD_BAR","MAD_NUE","MAD_CHA"],5,2),
    ("M10",["MAD_ALC","MAD_NUE","MAD_SOL","MAD_LEG","MAD_MOC"],5,2),
])

# ── CHICAGO CTA ───────────────────────────────────────────────────────────────
make_db("gtfs_us_chi.db", "US", [
    ("CHI_LPE","Loop - Lake/Wells",    41.8858,-87.6383),
    ("CHI_UIC","UIC-Halsted",          41.8749,-87.6497),
    ("CHI_OHA","O'Hare",               41.9803,-87.9091),
    ("CHI_MDW","Midway",               41.7868,-87.7375),
    ("CHI_ROO","Roosevelt",            41.8671,-87.6271),
    ("CHI_BEL","Belmont",              41.9397,-87.6527),
    ("CHI_HWD","Howard",               42.0191,-87.6723),
    ("CHI_95T","95th/Dan Ryan",        41.7225,-87.6244),
    ("CHI_DIV","Division",             41.9035,-87.6355),
    ("CHI_CLA","Clark/Lake",           41.8856,-87.6317),
],[
    ("RED","Red","Red Line",         "C60C30",1),
    ("BLU","Blue","Blue Line",       "00A1DE",1),
    ("GRN","Green","Green Line",     "009B3A",1),
],[
    ("RED",["CHI_HWD","CHI_BEL","CHI_DIV","CHI_LPE","CHI_ROO","CHI_95T"],5,2),
    ("BLU",["CHI_OHA","CHI_DIV","CHI_UIC","CHI_LPE"],8,2),
    ("GRN",["CHI_MDW","CHI_ROO","CHI_LPE","CHI_HWD"],10,2),
])

# ── LA METRO ──────────────────────────────────────────────────────────────────
make_db("gtfs_us_lax.db", "US", [
    ("LAX_UNI","Union Station",        34.0561,-118.2364),
    ("LAX_7ST","7th St Metro Center",  34.0487,-118.2588),
    ("LAX_WIL","Wilshire/Vermont",     34.0628,-118.2925),
    ("LAX_HOL","Hollywood/Highland",   34.1019,-118.3398),
    ("LAX_NOR","North Hollywood",      34.1782,-118.3783),
    ("LAX_LAX","LAX/Aviation",         33.9567,-118.3761),
    ("LAX_LBC","Long Beach Transit",   33.7701,-118.1937),
    ("LAX_ATW","Azusa Downtown",       34.1361,-117.9067),
    ("LAX_SAM","Santa Monica",         34.0195,-118.4912),
    ("LAX_CUL","Culver City",          34.0108,-118.3970),
],[
    ("RED_L","Red","Red Line",       "D11242",1),
    ("BLU_L","Blue","Blue Line",     "0072BC",1),
    ("EXP_L","Expo","Expo Line",     "00A651",1),
],[
    ("RED_L",["LAX_UNI","LAX_7ST","LAX_WIL","LAX_HOL","LAX_NOR"],8,2),
    ("BLU_L",["LAX_UNI","LAX_7ST","LAX_LAX","LAX_LBC"],10,3),
    ("EXP_L",["LAX_UNI","LAX_7ST","LAX_CUL","LAX_SAM"],12,3),
])

# ── JAPÓN (ya existe, solo verificar) ────────────────────────────────────────
jp = ASSETS / "gtfs_japan.db"
if jp.exists():
    mb = jp.stat().st_size/1_048_576
    print(f"  ✅ {'gtfs_japan.db':35s} (ya existe · {mb:.2f} MB)")

print(f"\n  Todos los DBs generados en {ASSETS}\n")
