#!/usr/bin/env python3
"""
verify_realtime.py — Macheo en vivo de las fuentes real-time por país.

Para cada país: toma estaciones principales (de la DB GTFS local o lista fija),
le pega a la MISMA fuente que usa la app y cuenta cuántas devuelven datos reales.
Reproduce la tabla "Lo logrado hoy" para revalidar que las fuentes siguen vivas.

Uso:  python3 scripts/verify_realtime.py [pais ...]
      (sin args = todos)   ej: python3 scripts/verify_realtime.py suiza belgica
"""
import json, sqlite3, sys, time, urllib.parse, urllib.request, os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
TIMEOUT = 15

def http_json(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {"User-Agent": "WoW-Trenes-App/1.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.load(r)

def db_stations(dbfile, names):
    """Devuelve {nombre_pedido: stop_id} buscando por nombre exacto en la DB."""
    out = {}
    con = sqlite3.connect(str(ASSETS / dbfile))
    for n in names:
        row = con.execute("SELECT stop_id FROM stops WHERE stop_name=? LIMIT 1", (n,)).fetchone()
        out[n] = row[0] if row else None
    con.close()
    return out

def top_stations(dbfile, n=6):
    """Top-N estaciones por tráfico real (nº de stop_times) — los hubs que la app sirve."""
    con = sqlite3.connect(str(ASSETS / dbfile))
    rows = con.execute(
        "SELECT s.stop_id, s.stop_name FROM stop_times st "
        "JOIN stops s ON s.stop_id=st.stop_id "
        "GROUP BY s.stop_id ORDER BY COUNT(*) DESC LIMIT ?", (n,)
    ).fetchall()
    con.close()
    return rows  # [(stop_id, stop_name), ...]

# ─── Suiza (transport.opendata.ch, público) ──────────────────────────────────
def macheo_suiza():
    EXC = {"S","BUS","B","T","TRAM","BAT","SL","PB"}
    sts = ["Zürich HB","Genève","Bern","Basel SBB","Lausanne","Luzern",
           "Lugano","St. Gallen","Winterthur","Fribourg","Chur","Bellinzona"]
    p=0
    for s in sts:
        try:
            q = urllib.parse.urlencode({"station":s,"limit":20,"transportations":"train","type":"departure"})
            d = http_json(f"https://transport.opendata.ch/v1/stationboard?{q}")
            n = sum(1 for j in d.get("stationboard",[]) if (j.get("category","") or "").upper() not in EXC)
            ok = n>0
        except Exception: ok=False; n=0
        p += ok; print(f"  {'✅' if ok else '❌'} {s} → {n}")
    return p, len(sts)

# ─── Bélgica (iRail, público; id = BE.NMBS.0XXXXXXXX desde DB) ────────────────
def irail_id(stop_id):
    num = stop_id.lstrip("S")
    return f"BE.NMBS.{int(num):09d}" if num.isdigit() else None
def macheo_belgica():
    stations = top_stations("gtfs_belgium.db", 6)  # hubs reales por tráfico
    p=0
    for sid, name in stations:
        iid = irail_id(sid) if sid else None
        if not iid: print(f"  ⚠️  {name} → sin ID"); continue
        try:
            q = urllib.parse.urlencode({"id":iid,"format":"json","arrdep":"departure","alerts":"false"})
            d = http_json(f"https://api.irail.be/liveboard/?{q}")
            n = len(d.get("departures",{}).get("departure",[]) or [])
            ok = n>0
        except Exception: ok=False; n=0
        p += ok; print(f"  {'✅' if ok else '❌'} {name} ({iid}) → {n}")
    return p, len(stations)

# ─── España · Renfe (feed nacional GTFS-RT JSON, único endpoint) ──────────────
def macheo_renfe():
    try:
        d = http_json("https://gtfsrt.renfe.com/trip_updates_LD.json")
        ent = d.get("entity") or d.get("Entity") or []
        ok = len(ent)>0; print(f"  {'✅' if ok else '❌'} feed nacional → {len(ent)} trip updates")
        return (1 if ok else 0), 1
    except Exception as e:
        print(f"  ❌ feed error: {e}"); return 0,1

# ─── Francia · SNCF (Navitia, requiere EXPO_PUBLIC_SNCF_KEY del .env) ──────────
import base64, re
def load_env():
    env = {}
    f = ROOT / ".env"
    if f.exists():
        for line in f.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line: continue
            k, v = line.split("=", 1); env[k] = v
    return env
def sncf_id(stop_id):
    m = re.search(r"OCE(\d+)", stop_id or "")
    return f"stop_area:SNCF:{m.group(1)}" if m else None
def macheo_francia():
    key = load_env().get("EXPO_PUBLIC_SNCF_KEY", "")
    if not key: print("  ⚠️  sin EXPO_PUBLIC_SNCF_KEY en .env"); return 0, 0
    auth = "Basic " + base64.b64encode(f"{key}:".encode()).decode()
    now = time.strftime("%Y%m%dT%H%M%S")
    p=0; stations = top_stations("gtfs_france.db", 6)
    for sid, name in stations:
        said = sncf_id(sid)
        if not said: print(f"  ⚠️  {name} → sin ID SNCF"); continue
        try:
            q = urllib.parse.urlencode({"datetime":now,"count":20,"data_freshness":"realtime"})
            url = f"https://api.sncf.com/v1/coverage/sncf/stop_areas/{said}/departures?{q}"
            d = http_json(url, headers={"Authorization":auth,"User-Agent":"WoW-Trenes-App/1.0"})
            n = len(d.get("departures",[]) or []); ok = n>0
        except Exception as e: ok=False; n=0
        p += ok; print(f"  {'✅' if ok else '❌'} {name} ({said}) → {n}")
    return p, len(stations)

# ─── Alemania · DB Navigator (app.services-bahn.de, locationId del STATION_MAP) ─
def http_post_json(url, body, headers):
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.load(r)
def germany_stations(n=6):
    txt = (ROOT / "services/germanyBoard.ts").read_text()
    pairs = re.findall(r"name:\s*'([^']+)',\s*locationId:\s*'(A=1@[^']+@)'", txt)
    return pairs[:n]
def macheo_alemania():
    import datetime
    try:
        from zoneinfo import ZoneInfo
        now = datetime.datetime.now(ZoneInfo("Europe/Berlin"))
    except Exception:
        now = datetime.datetime.utcnow() + datetime.timedelta(hours=2)
    hdr = {"Accept":"application/x.db.vendo.mob.bahnhofstafeln.v2+json",
           "Content-Type":"application/x.db.vendo.mob.bahnhofstafeln.v2+json",
           "X-Correlation-ID":"wow-trenes-verify_wow-trenes-verify"}
    vk = ["HOCHGESCHWINDIGKEITSZUEGE","INTERCITYUNDEUROCITYZUEGE",
          "INTERREGIOUNDSCHNELLZUEGE","NAHVERKEHRSONSTIGEZUEGE","SBAHNEN"]
    stations = germany_stations(6); p=0
    for name, loc in stations:
        try:
            body = {"anfragezeit":now.strftime("%H:%M"),"datum":now.strftime("%Y-%m-%d"),
                    "ursprungsBahnhofId":loc,"verkehrsmittel":vk}
            d = http_post_json("https://app.services-bahn.de/mob/bahnhofstafel/abfahrt", body, hdr)
            n = len(d.get("bahnhofstafelAbfahrtPositionen",[]) or []) if isinstance(d,dict) else len(d)
            ok = n>0
        except Exception: ok=False; n=0
        p += ok; print(f"  {'✅' if ok else '❌'} {name} → {n}")
    return p, len(stations)

# ─── Países Bajos · solo DB (no hay board RT en vivo en la app) ────────────────
def macheo_paisesbajos():
    rows = top_stations("gtfs_netherlands.db", 9)
    con = sqlite3.connect(str(ASSETS / "gtfs_netherlands.db"))
    p = 0
    for sid, name in rows:
        lat, lon = con.execute("SELECT stop_lat, stop_lon FROM stops WHERE stop_id=?", (sid,)).fetchone()
        ok = abs(lat) > 0.01 and abs(lon) > 0.01  # coords reales, no sintéticas (0,0)
        p += ok; print(f"  {'✅' if ok else '❌'} {name} → {lat:.3f},{lon:.3f}")
    con.close()
    return p, len(rows)

# ─── Italia · ViaggiaTreno vía proxy Railway (raíz, no /affiliate) ─────────────
IT_STATIONS = [("S08409","Roma Termini"),("S01700","Milano Centrale"),
               ("S09218","Napoli Centrale"),("S06421","Firenze S.M.N."),
               ("S00219","Torino Porta Nuova"),("S05043","Bologna Centrale")]
def macheo_italia():
    import datetime, locale
    base = load_env().get("EXPO_PUBLIC_AFFILIATE_PROXY",
                          "https://voxa-production-dc15.up.railway.app/affiliate/redirect")
    base = re.sub(r"/affiliate.*$", "", base) + "/viaggiatreno"   # mismo replace que la app
    try:
        from zoneinfo import ZoneInfo
        now_it = datetime.datetime.now(ZoneInfo("Europe/Rome"))
    except Exception:
        now_it = datetime.datetime.utcnow() + datetime.timedelta(hours=2)
    dt = now_it.strftime("%a %b %d %Y %H:%M:%S GMT+0200")   # formato JS Date que espera ViaggiaTreno
    p = 0
    for sid, name in IT_STATIONS:
        try:
            url = f"{base}/partenze/{sid}/{urllib.parse.quote(dt)}"
            d = http_json(url); n = len(d) if isinstance(d, list) else 0; ok = n > 0
        except Exception: ok=False; n=0
        p += ok; print(f"  {'✅' if ok else '❌'} {name} → {n}")
    return p, len(IT_STATIONS)

# ─── Austria · ÖBB HAFAS (conocida caída — sirve HTML) ────────────────────────
def macheo_austria():
    ids = [("1190100","Wien Hbf"),("1290401","Salzburg Hbf"),("1170101","Graz Hbf"),
           ("1130105","Linz Hbf"),("1110105","Innsbruck Hbf")]
    p = 0
    for sid, name in ids:
        try:
            q = urllib.parse.urlencode({"input":sid,"boardType":"dep","start":"yes","L":"vs_scotty",
                "productsFilter":"1011111111111","maxJourneys":"30","outputMode":"odv","format":"json"})
            req = urllib.request.Request(f"https://fahrplan.oebb.at/bin/stboard.exe/dn?{q}",
                                         headers={"User-Agent":"WoW-Trenes-App/1.0"})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                txt = r.read().decode("latin-1")
            d = json.loads(txt[txt.find("{"):]); n = len(d.get("journey",[]) or []); ok = n>0
        except Exception: ok=False; n=0
        p += ok; print(f"  {'✅' if ok else '❌'} {name} → {n}")
    return p, len(ids)

# ─── Portugal · CP (conocida caída) ───────────────────────────────────────────
def macheo_portugal():
    try:
        d = http_json("https://api.cp.pt/cp-api/siv/stations?lang=pt",
                      headers={"User-Agent":"WoW-Trenes-App/1.0","Accept":"application/json"})
        n = len(d) if isinstance(d, list) else 0; ok = n>0
        print(f"  {'✅' if ok else '❌'} CP stations → {n}")
        return (1 if ok else 0), 1
    except Exception as e:
        print(f"  ❌ CP API caída ({e})"); return 0, 1

COUNTRIES = {
    "suiza":       macheo_suiza,
    "belgica":     macheo_belgica,
    "renfe":       macheo_renfe,
    "francia":     macheo_francia,
    "alemania":    macheo_alemania,
    "italia":      macheo_italia,
    "paisesbajos": macheo_paisesbajos,
    "austria":     macheo_austria,
    "portugal":    macheo_portugal,
}

def main():
    pick = [a.lower() for a in sys.argv[1:]] or list(COUNTRIES)
    print("=== MACHEO REAL-TIME (live) ===\n")
    results = []
    for c in pick:
        fn = COUNTRIES.get(c)
        if not fn: print(f"(país desconocido: {c})\n"); continue
        print(f"── {c.upper()} ──")
        p,t = fn(); results.append((c,p,t))
        print(f"   {p}/{t}\n")
    print("=== RESUMEN ===")
    for c,p,t in results:
        pct = round(100*p/t) if t else 0
        print(f"  {c:10s} {p}/{t}  ({pct}%)")

if __name__ == "__main__":
    main()
