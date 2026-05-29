#!/usr/bin/env python3
"""
WoW TRENES — Munich U-Bahn GTFS Generator
Líneas: U1-U8 (MVV/MVG) + S-Bahn principales
Real-time: v6.db.transport.rest (público, sin key)
Uso: python3 scripts/create_gtfs_de_mun.py
"""
import sqlite3, shutil, time, os
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent.parent / "assets"
OUTPUT_DB  = OUTPUT_DIR / "gtfs_de_mun.db"

STATIONS = [
    # ── U1/U2 — Olympia-Einkaufszentrum ↔ Feldmoching / Messestadt Ost ───
    ("MUN_U1_01", "Olympia-Einkaufszentrum", 48.1770, 11.5352, ["U1","U3"]),
    ("MUN_U1_02", "Moosacher St-Martins-Pl", 48.1810, 11.5299, ["U1","U3"]),
    ("MUN_U1_03", "Hasenbergl",              48.1936, 11.5260, ["U1"]),
    ("MUN_U1_04", "Dülferstraße",            48.1974, 11.5264, ["U1"]),
    ("MUN_U1_05", "Feldmoching",             48.2042, 11.5265, ["U1"]),
    ("MUN_U2_01", "Messestadt Ost",          48.1372, 11.6913, ["U2"]),
    ("MUN_U2_02", "Messestadt West",         48.1384, 11.6747, ["U2"]),
    ("MUN_U2_03", "Trudering",               48.1260, 11.6479, ["U2"]),
    ("MUN_U2_04", "Karl-Preis-Platz",        48.1226, 11.6283, ["U2"]),
    ("MUN_U2_05", "Innsbrucker Ring",        48.1201, 11.6126, ["U2"]),
    ("MUN_U2_06", "Kreillerstraße",          48.1183, 11.5998, ["U2"]),
    ("MUN_U2_07", "Josephsburg",             48.1190, 11.5884, ["U2"]),
    ("MUN_U2_08", "Berg am Laim",            48.1224, 11.5785, ["U2"]),
    ("MUN_U2_09", "Michaelibad",             48.1267, 11.5687, ["U2"]),
    ("MUN_U2_10", "Quiddestraße",            48.1297, 11.5561, ["U2"]),
    ("MUN_U2_11", "Giesing",                 48.1173, 11.5684, ["U2"]),
    ("MUN_U2_12", "Kolumbusplatz",           48.1218, 11.5632, ["U2"]),
    # ── U3/U6 — Moosach ↔ Fröttmaning / Klinikum Großhadern ────────────
    ("MUN_U3_01", "Moosach",                 48.1778, 11.5024, ["U1","U3"]),
    ("MUN_U3_02", "Oberwiesenfeld",          48.1806, 11.5316, ["U3"]),
    ("MUN_U6_01", "Fröttmaning",             48.2150, 11.6234, ["U6"]),
    ("MUN_U6_02", "Garching-Forschungszentrum",48.2617,11.6700,["U6"]),
    ("MUN_U6_03", "Fröttmaning",             48.2150, 11.6234, ["U6"]),
    ("MUN_U6_04", "Kieferngarten",           48.1979, 11.6073, ["U6"]),
    ("MUN_U6_05", "Freimann",                48.1897, 11.5984, ["U6"]),
    ("MUN_U6_06", "Studentenstadt",          48.1812, 11.5918, ["U6"]),
    ("MUN_U6_07", "Alte Heide",              48.1751, 11.5895, ["U6"]),
    ("MUN_U6_08", "Nordfriedhof",            48.1694, 11.5816, ["U6"]),
    ("MUN_U6_09", "Scheidplatz",             48.1697, 11.5701, ["U3","U6"]),
    ("MUN_U6_10", "Klinikum Großhadern",     48.1128, 11.4737, ["U6"]),
    # ── Tronco común U1-U8 (centro) ──────────────────────────────────────
    ("MUN_C_01",  "Olympiazentrum",          48.1732, 11.5506, ["U3","U8"]),
    ("MUN_C_02",  "Petuelring",              48.1672, 11.5574, ["U3","U8"]),
    ("MUN_C_03",  "Milbertshofen",           48.1627, 11.5617, ["U3","U8"]),
    ("MUN_C_04",  "Am Hart",                 48.1584, 11.5641, ["U3","U8"]),
    ("MUN_C_05",  "Frankfurter Ring",        48.1541, 11.5655, ["U3","U8"]),
    ("MUN_C_06",  "Münchner Freiheit",       48.1623, 11.5851, ["U3","U6"]),
    ("MUN_C_07",  "Giselastraße",            48.1568, 11.5826, ["U3","U6"]),
    ("MUN_C_08",  "Universität",             48.1513, 11.5798, ["U3","U6"]),
    ("MUN_C_09",  "Odeonsplatz",             48.1427, 11.5773, ["U3","U4","U5","U6"]),
    ("MUN_C_10",  "Marienplatz",             48.1374, 11.5755, ["U3","U6"]),
    ("MUN_C_11",  "Sendlinger Tor",          48.1337, 11.5673, ["U1","U2","U3","U6","U7","U8"]),
    ("MUN_C_12",  "Goetheplatz",             48.1291, 11.5614, ["U3","U6"]),
    ("MUN_C_13",  "Poccistraße",             48.1257, 11.5574, ["U3","U6"]),
    ("MUN_C_14",  "Implerstraße",            48.1202, 11.5551, ["U3","U6"]),
    ("MUN_C_15",  "Harras",                  48.1174, 11.5391, ["U6"]),
    ("MUN_C_16",  "Partnachplatz",           48.1132, 11.5411, ["U6"]),
    ("MUN_C_17",  "Westpark",                48.1092, 11.5237, ["U6"]),
    ("MUN_C_18",  "Holzapfelkreuth",         48.1063, 11.5122, ["U6"]),
    ("MUN_C_19",  "Machtlfinger Straße",     48.1104, 11.4980, ["U6"]),
    ("MUN_C_20",  "Aidenbachstraße",         48.1063, 11.4992, ["U6"]),
    # ── U4/U5 — Arabellapark ↔ Laimer Platz / Heimeranplatz ─────────────
    ("MUN_U4_01", "Arabellapark",            48.1605, 11.6198, ["U4"]),
    ("MUN_U4_02", "Englschalking",           48.1540, 11.6301, ["U4"]),
    ("MUN_U4_03", "Bogenhausen",             48.1520, 11.6109, ["U4"]),
    ("MUN_U4_04", "Richard-Strauss-Straße", 48.1487, 11.6043, ["U4"]),
    ("MUN_U4_05", "Prinzregentenplatz",      48.1453, 11.5944, ["U4"]),
    ("MUN_U4_06", "Max-Weber-Platz",         48.1350, 11.5901, ["U4","U5"]),
    ("MUN_U4_07", "Rosenheimer Platz",       48.1302, 11.5913, ["U4","U5"]),
    ("MUN_U4_08", "Isartor",                 48.1336, 11.5826, ["U4","U5"]),
    ("MUN_U4_09", "Karlsplatz (Stachus)",    48.1395, 11.5665, ["U4","U5"]),
    ("MUN_U4_10", "Hauptbahnhof",            48.1402, 11.5597, ["U4","U5","S1","S2","S3","S4","S6","S7","S8"]),
    ("MUN_U4_11", "Theresienwiese",          48.1336, 11.5474, ["U4","U5"]),
    ("MUN_U4_12", "Schwanthalerhöhe",        48.1342, 11.5382, ["U4","U5"]),
    ("MUN_U4_13", "Laimer Platz",            48.1374, 11.5137, ["U4","U5"]),
    ("MUN_U5_01", "Heimeranplatz",           48.1283, 11.5320, ["U4","U5"]),
    ("MUN_U5_02", "Westendstraße",           48.1278, 11.5219, ["U5"]),
    ("MUN_U5_03", "Haderner Stern",          48.1191, 11.4938, ["U5"]),
    # ── S-Bahn (Stammstrecke + aeropuerto) ───────────────────────────────
    ("MUN_S_HBF",  "München Hbf",            48.1402, 11.5597, ["S1","S2","S3","S4","S6","S7","S8"]),
    ("MUN_S_OST",  "Ostbahnhof",             48.1274, 11.6027, ["S1","S2","S3","S4","S6","S7","S8"]),
    ("MUN_S_PAL",  "Pasing",                 48.1506, 11.4611, ["S3","S4","S6","S7","S8"]),
    ("MUN_S_FLU",  "Flughafen München",      48.3538, 11.7750, ["S1","S8"]),
    ("MUN_S_STR",  "Marienplatz",            48.1374, 11.5755, ["S1","S2","S3","S4","S6","S7","S8"]),
]

LINES = [
    ("U1","U1","U-Bahn Linie 1","428BC1",1),
    ("U2","U2","U-Bahn Linie 2","E2001A",1),
    ("U3","U3","U-Bahn Linie 3","EF7C00",1),
    ("U4","U4","U-Bahn Linie 4","00AB84",1),
    ("U5","U5","U-Bahn Linie 5","00AB84",1),
    ("U6","U6","U-Bahn Linie 6","0065BD",1),
    ("U7","U7","U-Bahn Linie 7","DD6CA7",1),
    ("U8","U8","U-Bahn Linie 8","8C1F73",1),
    ("S1","S1","S-Bahn Linie 1","5BC5F2",2),
    ("S8","S8","S-Bahn Linie 8","993399",2),
]

LINE_SEQUENCES = {
    "U1": ["MUN_U1_05","MUN_U1_04","MUN_U1_03","MUN_U1_02","MUN_U1_01",
           "MUN_C_09","MUN_C_10","MUN_C_11","MUN_U4_13","MUN_U5_01"],
    "U2": ["MUN_U2_01","MUN_U2_02","MUN_U2_03","MUN_U2_04","MUN_U2_05",
           "MUN_U2_06","MUN_U2_07","MUN_U2_08","MUN_U2_09","MUN_U2_10",
           "MUN_C_11","MUN_C_09","MUN_C_08","MUN_C_07","MUN_C_06"],
    "U3": ["MUN_U3_01","MUN_U3_02","MUN_C_01","MUN_C_02","MUN_C_03",
           "MUN_C_04","MUN_C_05","MUN_C_06","MUN_C_07","MUN_C_08",
           "MUN_C_09","MUN_C_10","MUN_C_11","MUN_C_12","MUN_C_13",
           "MUN_C_14","MUN_C_15"],
    "U4": ["MUN_U4_01","MUN_U4_02","MUN_U4_03","MUN_U4_04","MUN_U4_05",
           "MUN_U4_06","MUN_U4_07","MUN_U4_08","MUN_C_09","MUN_U4_09",
           "MUN_U4_10","MUN_U4_11","MUN_U4_12","MUN_U4_13"],
    "U5": ["MUN_U5_03","MUN_U5_02","MUN_U5_01","MUN_U4_12","MUN_U4_11",
           "MUN_U4_10","MUN_U4_09","MUN_U4_08","MUN_U4_07","MUN_U4_06",
           "MUN_U4_05","MUN_U4_04","MUN_U4_03"],
    "U6": ["MUN_U6_02","MUN_U6_01","MUN_U6_04","MUN_U6_05","MUN_U6_06",
           "MUN_U6_07","MUN_U6_08","MUN_U6_09","MUN_C_08","MUN_C_07",
           "MUN_C_06","MUN_C_09","MUN_C_10","MUN_C_11","MUN_C_12",
           "MUN_C_13","MUN_C_14","MUN_C_15","MUN_C_16","MUN_C_17",
           "MUN_C_18","MUN_C_19","MUN_C_20","MUN_U6_10"],
    "S1": ["MUN_S_FLU","MUN_S_HBF","MUN_S_STR","MUN_S_OST"],
    "S8": ["MUN_S_FLU","MUN_S_HBF","MUN_S_STR","MUN_S_OST","MUN_S_PAL"],
}

HEADWAY = {"U1":5,"U2":5,"U3":5,"U4":5,"U5":5,"U6":5,"U7":5,"U8":5,"S1":20,"S8":20}
_FIRST_MIN=300; _LAST_MIN=1440; _DWELL=2

def fmt(m):
    h,mn=divmod(m,60); return f"{h:02d}:{mn:02d}:00"

def main():
    print("\nWoW TRENES — Munich U-Bahn GTFS Generator")
    print("="*44)
    t0=time.time()
    seen=set(); unique=[]
    for s in STATIONS:
        if s[0] not in seen: seen.add(s[0]); unique.append(s)
    print(f"  Líneas:     {len(LINES)}\n  Estaciones: {len(unique)}")

    tmp="/tmp/gtfs_de_mun.db"
    os.path.exists(tmp) and os.unlink(tmp)
    conn=sqlite3.connect(tmp)
    conn.executescript("""
        PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
        CREATE TABLE IF NOT EXISTS agency(agency_id TEXT PRIMARY KEY,agency_name TEXT,agency_url TEXT,agency_timezone TEXT);
        CREATE TABLE IF NOT EXISTS stops(stop_id TEXT PRIMARY KEY,stop_name TEXT NOT NULL,stop_lat REAL NOT NULL,stop_lon REAL NOT NULL,country_code TEXT DEFAULT 'DE',location_type INTEGER DEFAULT 0,parent_station TEXT);
        CREATE TABLE IF NOT EXISTS routes(route_id TEXT PRIMARY KEY,agency_id TEXT,route_short_name TEXT,route_long_name TEXT,route_type INTEGER,route_color TEXT,source_region TEXT);
        CREATE TABLE IF NOT EXISTS trips(trip_id TEXT PRIMARY KEY,route_id TEXT,service_id TEXT,trip_headsign TEXT,direction_id INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS stop_times(trip_id TEXT NOT NULL,arrival_time TEXT,departure_time TEXT,stop_id TEXT NOT NULL,stop_sequence INTEGER,PRIMARY KEY(trip_id,stop_sequence));
        CREATE TABLE IF NOT EXISTS calendar(service_id TEXT PRIMARY KEY,monday INTEGER,tuesday INTEGER,wednesday INTEGER,thursday INTEGER,friday INTEGER,saturday INTEGER,sunday INTEGER,start_date TEXT,end_date TEXT);
    """)
    conn.execute("INSERT OR IGNORE INTO agency VALUES(?,?,?,?)",("MVG","Münchner Verkehrsgesellschaft","https://www.mvg.de","Europe/Berlin"))
    conn.commit()
    for l,sn,ln,col,rt in LINES:
        conn.execute("INSERT OR IGNORE INTO routes VALUES(?,?,?,?,?,?,?)",(l,"MVG",sn,ln,rt,col,"Munich"))
    conn.commit()
    valid=set(); rows=[]
    for sid,name,lat,lon,_ in unique:
        rows.append((sid,name,lat,lon,"DE",0,"")); valid.add(sid)
    conn.executemany("INSERT OR IGNORE INTO stops VALUES(?,?,?,?,?,?,?)",rows)
    conn.commit(); print(f"  Paradas:    {len(rows)}")
    tb=[]; st=[]; tc=0; sc=0
    for rid,seq in LINE_SEQUENCES.items():
        sv=[s for s in seq if s in valid]
        if len(sv)<2: continue
        hw=HEADWAY.get(rid,5)
        for d in(0,1):
            sq=sv if d==0 else list(reversed(sv))
            hs=sq[-1]; dep=_FIRST_MIN
            while dep<=_LAST_MIN:
                tid=f"{rid}_d{d}_{dep:04d}"
                tb.append((tid,rid,"ALL",hs,d))
                for i,s in enumerate(sq):
                    ts=fmt(dep+i*_DWELL); st.append((tid,ts,ts,s,i))
                tc+=1; sc+=len(sq); dep+=hw
    conn.executemany("INSERT OR IGNORE INTO trips VALUES(?,?,?,?,?)",tb)
    conn.executemany("INSERT OR IGNORE INTO stop_times VALUES(?,?,?,?,?)",st)
    conn.commit(); print(f"  Trips:      {tc:,}\n  Stop_times: {sc:,}")
    for sv,m,t,w,th,f,sa,su in[("WD",1,1,1,1,1,0,0),("WE",0,0,0,0,0,1,1),("ALL",1,1,1,1,1,1,1)]:
        conn.execute("INSERT OR IGNORE INTO calendar VALUES(?,?,?,?,?,?,?,?,?,?)",(sv,m,t,w,th,f,sa,su,"20260101","20261231"))
    conn.commit()
    conn.executescript("CREATE INDEX IF NOT EXISTS i1 ON stops(stop_lat,stop_lon);CREATE INDEX IF NOT EXISTS i2 ON stop_times(stop_id);CREATE INDEX IF NOT EXISTS i3 ON trips(route_id);")
    conn.close()
    OUTPUT_DIR.mkdir(parents=True,exist_ok=True)
    shutil.copy2(tmp,str(OUTPUT_DB)); os.unlink(tmp)
    e=time.time()-t0; mb=OUTPUT_DB.stat().st_size/1_048_576
    print(f"\n  ✓ Listo en {e:.1f}s  —  {mb:.2f} MB\n  Munich: U1·U2·U3·U4·U5·U6 + S1·S8 (aeropuerto)")

if __name__=="__main__":
    main()
