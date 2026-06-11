#!/usr/bin/env python3
"""
verify_gps_central.py — Prueba de PRECISIÓN del GPS (offline, contra las DBs locales).

Valida dos cosas, que es lo que un turista necesita:
  1) ESTACIÓN CENTRAL DE TU CIUDAD: parado en cualquier punto de una ciudad
     (centro o suburbio), debe caer en la estación central de ESA ciudad.
     Regla: dentro de ~25 km, la estación con más salidas = la central.
  2) PAÍS EN FRONTERA: el país sale de la estación REAL más cercana entre todos
     los países (no de rectángulos), así Múnich nunca cae en Austria/Berlín.

Uso:  python3 scripts/verify_gps_central.py
No toca la app — solo lee assets/gtfs_*.db
"""
import sqlite3, math, sys, unicodedata
from pathlib import Path

ASSETS = Path(__file__).resolve().parent.parent / "assets"
RADIUS_DEG = 0.25          # ~25 km — "tu ciudad"
RADIUS_COUNTRY_DEG = 1.0   # ~111 km — para buscar la estación país en frontera

DBS = {
    "CH": "gtfs_switzerland.db", "DE": "gtfs_germany.db", "FR": "gtfs_france.db",
    "BE": "gtfs_belgium.db", "IT": "gtfs_italy.db", "ES": "gtfs_spain.db",
    "NL": "gtfs_netherlands.db", "AT": "gtfs_austria.db", "PT": "gtfs_portugal.db",
}

def norm(s):
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()
    s = s.replace("hauptbahnhof", "hbf")   # DE/AT nombran la central "Hauptbahnhof"
    return " ".join(s.split())

def central_of_city(country, lat, lon):
    """Estación con más salidas dentro de ~25 km (la central de la ciudad)."""
    f = ASSETS / DBS[country]
    if not f.exists(): return None
    con = sqlite3.connect(str(f))
    try:
        row = con.execute(f"""
            SELECT s.stop_name, COUNT(st.trip_id) AS salidas,
                   AVG(s.stop_lat) la, AVG(s.stop_lon) lo
            FROM stops s JOIN stop_times st ON st.stop_id = s.stop_id
            WHERE s.stop_lat BETWEEN ?-{RADIUS_DEG} AND ?+{RADIUS_DEG}
              AND s.stop_lon BETWEEN ?-{RADIUS_DEG} AND ?+{RADIUS_DEG}
            GROUP BY COALESCE(NULLIF(s.parent_station,''), s.stop_id)
            ORDER BY salidas DESC LIMIT 1
        """, (lat, lat, lon, lon)).fetchone()
    except sqlite3.OperationalError:
        row = None
    con.close()
    if not row: return None
    name, sal, la, lo = row
    km = math.dist((lat, lon), (la, lo)) * 111
    return {"name": name, "salidas": sal, "km": round(km, 1)}

def nearest_in_country(country, lat, lon):
    """Estación más cercana (por distancia) dentro de ~111 km en un país."""
    f = ASSETS / DBS[country]
    if not f.exists(): return None
    con = sqlite3.connect(str(f))
    try:
        row = con.execute(f"""
            SELECT s.stop_name, AVG(s.stop_lat) la, AVG(s.stop_lon) lo
            FROM stops s
            WHERE s.stop_lat BETWEEN ?-{RADIUS_COUNTRY_DEG} AND ?+{RADIUS_COUNTRY_DEG}
              AND s.stop_lon BETWEEN ?-{RADIUS_COUNTRY_DEG} AND ?+{RADIUS_COUNTRY_DEG}
            GROUP BY COALESCE(NULLIF(s.parent_station,''), s.stop_id)
            ORDER BY (AVG(s.stop_lat)-?)*(AVG(s.stop_lat)-?)+(AVG(s.stop_lon)-?)*(AVG(s.stop_lon)-?) ASC
            LIMIT 1
        """, (lat, lat, lon, lon, lat, lat, lon, lon)).fetchone()
    except sqlite3.OperationalError:
        row = None
    con.close()
    if not row: return None
    name, la, lo = row
    return {"country": country, "name": name, "km": round(math.dist((lat, lon), (la, lo))*111, 1)}

def country_from_nearest(lat, lon):
    """País = el de la estación real más cercana entre TODOS los países."""
    best = None
    for c in DBS:
        r = nearest_in_country(c, lat, lon)
        if r and (best is None or r["km"] < best["km"]):
            best = r
    return best

# ── Casos: estación central por ciudad (centro + algún descentrado) ───────────
CENTRAL = [
    ("CH", "Zúrich",        47.3779,  8.5403, "zurich"),
    ("CH", "Ginebra",       46.2102,  6.1424, "geneve"),
    ("CH", "Berna",         46.9489,  7.4391, "bern"),
    ("DE", "Múnich centro", 48.1402, 11.5583, "munchen hbf"),
    ("DE", "Múnich suburbio",48.1500,11.4600, "munchen hbf"),   # Pasing → debe dar Hbf
    ("DE", "Berlín",        52.5251, 13.3694, "berlin hbf"),
    ("DE", "Hamburgo",      53.5528, 10.0067, "hamburg hbf"),
    ("DE", "Fráncfort",     50.1070,  8.6638, "frankfurt"),
    ("FR", "París",         48.8530,  2.3490, "paris"),
    ("FR", "Lyon",          45.7602,  4.8595, "lyon"),
    ("FR", "Burdeos",       44.8260, -0.5560, "bordeaux"),
    ("BE", "Bruselas",      50.8455,  4.3572, "brux"),
    ("BE", "Amberes",       51.2172,  4.4210, "anvers"),
    ("IT", "Roma",          41.9010, 12.5015, "roma termini"),
    ("IT", "Milán",         45.4860,  9.2050, "milano centrale"),
    ("IT", "Florencia",     43.7765, 11.2480, "firenze"),
    ("ES", "Madrid",        40.4065, -3.6906, "madrid"),
    ("ES", "Sevilla",       37.3924, -5.9749, "sevilla"),
    ("ES", "Valencia",      39.4660, -0.3776, "valencia"),
    ("NL", "Ámsterdam",     52.3791,  4.9003, "amsterdam centraal"),
    ("NL", "Róterdam",      51.9244,  4.4699, "rotterdam centraal"),
    ("NL", "Utrecht",       52.0894,  5.1100, "utrecht centraal"),
    ("AT", "Viena",         48.1850, 16.3776, "wien hbf"),
    ("AT", "Salzburgo",     47.8132, 13.0456, "salzburg hbf"),
    ("AT", "Graz",          47.0725, 15.4150, "graz hbf"),
    ("PT", "Lisboa",        38.7223, -9.1290, "lisboa"),
    ("PT", "Oporto",        41.1496, -8.6109, "porto"),
]

# ── Casos de FRONTERA: país por estación real más cercana ─────────────────────
BORDER = [
    ("Múnich (DE, cerca AT)",   48.1402, 11.5583, "DE"),
    ("Basilea (tri-frontera)",  47.5476,  7.5896, "CH"),
    ("Ginebra (CH, cerca FR)",  46.2102,  6.1424, "CH"),
    ("Salzburgo (AT, cerca DE)",47.8132, 13.0456, "AT"),
    ("Aquisgrán (DE,cerca BE/NL)",50.7766,6.0834, "DE"),
    ("Estrasburgo (FR,cerca DE)",48.5850, 7.7350, "FR"),
]

def main():
    print("=" * 60)
    print("1) ESTACIÓN CENTRAL DE TU CIUDAD")
    print("=" * 60)
    ok = tot = 0
    for country, city, lat, lon, exp in CENTRAL:
        tot += 1
        r = central_of_city(country, lat, lon)
        got = r["name"] if r else "—"
        passed = r is not None and exp in norm(got)
        ok += passed
        extra = f"({r['salidas']} salidas, {r['km']}km)" if r else ""
        print(f"  {'✅' if passed else '❌'} {city:18s} → {got}  {extra}")
        if r and not passed:
            print(f"       esperaba que contenga: '{exp}'")
    print(f"\n   CENTRALES: {ok}/{tot}\n")

    print("=" * 60)
    print("2) PAÍS EN FRONTERA (estación real más cercana)")
    print("=" * 60)
    ok2 = tot2 = 0
    for label, lat, lon, exp_country in BORDER:
        tot2 += 1
        r = country_from_nearest(lat, lon)
        got = r["country"] if r else "—"
        passed = got == exp_country
        ok2 += passed
        st = f"→ {r['name']} ({r['km']}km)" if r else ""
        print(f"  {'✅' if passed else '❌'} {label:26s} país={got} (esp {exp_country})  {st}")
    print(f"\n   FRONTERAS: {ok2}/{tot2}\n")
    print("=" * 60)
    print(f"TOTAL: centrales {ok}/{tot} · fronteras {ok2}/{tot2}")

if __name__ == "__main__":
    main()
