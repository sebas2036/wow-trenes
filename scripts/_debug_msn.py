#!/usr/bin/env python3
"""Diagnóstico MSN — muestra las primeras líneas 'A' y los valores extraídos."""
import urllib.request, zipfile, io, os, sys

AUTH_URL = "https://opendata.nationalrail.co.uk/authenticate"
CIF_URL  = "https://opendata.nationalrail.co.uk/api/staticfeeds/3.0/timetable"

import json
user = sys.argv[1] if len(sys.argv) > 1 else input("Email NRDP: ")
pw   = sys.argv[2] if len(sys.argv) > 2 else input("Password: ")

# Auth
payload = json.dumps({"username": user, "password": pw}).encode()
req = urllib.request.Request(AUTH_URL, data=payload, headers={'Content-Type':'application/json'})
with urllib.request.urlopen(req, timeout=30) as r:
    token = json.loads(r.read()).get('token','')
print(f"Token: {token[:10]}...")

# Descargar
print("Descargando...")
req2 = urllib.request.Request(CIF_URL, headers={'X-Auth-Token': token})
with urllib.request.urlopen(req2, timeout=120) as r:
    data = r.read()
print(f"ZIP: {len(data)/1e6:.1f} MB")

# Extraer MSN
with zipfile.ZipFile(io.BytesIO(data)) as zf:
    msn_name = next(n for n in zf.namelist() if n.upper().endswith('.MSN'))
    msn = zf.read(msn_name).decode('latin-1', errors='replace')

# Mostrar primeras 10 líneas 'A'
print(f"\n{'─'*80}")
print(f"Archivo MSN: {msn_name} ({len(msn):,} chars)")
print(f"{'─'*80}")
lines_A = [l for l in msn.splitlines() if l.startswith('A')][:10]
for i, line in enumerate(lines_A):
    print(f"\nLínea {i+1} (len={len(line)}): {repr(line[:80])}")
    print(f"  [0]     = {repr(line[0])}")
    print(f"  [1:8]   = {repr(line[1:8])}   ← TIPLOC opción A")
    print(f"  [5:12]  = {repr(line[5:12])}   ← TIPLOC opción B")
    print(f"  [9:35]  = {repr(line[9:35])}  ← nombre opción A")
    print(f"  [13:43] = {repr(line[13:43])} ← nombre opción B")
    print(f"  [35:39] = {repr(line[35:39])}  ← easting opción A (4c)")
    print(f"  [38:42] = {repr(line[38:42])}  ← easting opción B (4c)")
    print(f"  [43:49] = {repr(line[43:49])}  ← easting opción C (6c, código actual)")
    print(f"  [39:43] = {repr(line[39:43])}  ← northing opción A (4c)")
    print(f"  [42:46] = {repr(line[42:46])}  ← northing opción B (4c)")
    print(f"  [49:55] = {repr(line[49:55])}  ← northing opción C (6c, código actual)")
