#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# WoW TRENES — Setup GTFS: Norway · GB · Portugal
# Ejecutar desde la raíz del proyecto:
#   bash scripts/setup_gtfs.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DL="$HOME/Downloads"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1"; }

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║     WoW TRENES — GTFS Data Setup                    ║"
echo "║     Norway · GB National Rail · Portugal CP         ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ─── 1. London Underground (TfL) — sin descarga, hardcoded ───────────────────
echo "▸ London Underground / TfL (hardcoded — no descarga necesaria)"
python3 "$ROOT/scripts/create_gtfs_gb_tfl.py" && ok "gtfs_gb_tfl.db generado" || err "Error TfL"
echo ""

# ─── 2. Norway — Entur (descarga directa, licencia NLOD) ─────────────────────
echo "▸ Norway — Entur (descarga directa, ~57 MB)"
NO_DIR="$DL/Wow trains Norway"
NO_ZIP="$DL/rb_norway-aggregated-gtfs.zip"
NO_URL="https://storage.googleapis.com/marduk-production/outbound/gtfs/rb_norway-aggregated-gtfs.zip"

if [ -d "$NO_DIR" ] && [ -f "$NO_DIR/stops.txt" ]; then
  ok "Datos Norway ya descomprimidos en: $NO_DIR"
else
  echo "  Descargando de Entur..."
  if curl -L --progress-bar -o "$NO_ZIP" "$NO_URL"; then
    mkdir -p "$NO_DIR"
    unzip -q -o "$NO_ZIP" -d "$NO_DIR"
    rm -f "$NO_ZIP"
    ok "Norway descomprimido en: $NO_DIR"
  else
    err "Descarga fallida. Descarga manualmente:"
    echo "    $NO_URL"
    echo "  y descomprime en: $NO_DIR"
  fi
fi

if [ -d "$NO_DIR" ] && [ -f "$NO_DIR/stops.txt" ]; then
  echo "  Importando Norway..."
  python3 "$ROOT/scripts/import_gtfs_no.py" && ok "gtfs_norway.db generado" || err "Error importando Norway"
fi
echo ""

# ─── 3. GB National Rail — requiere registro ──────────────────────────────────
echo "▸ GB National Rail — requiere registro (gratuito)"
GB_DIR="$DL/Wow trains GB"

if [ -d "$GB_DIR" ] && [ -f "$GB_DIR/stops.txt" ]; then
  ok "Datos GB ya descomprimidos en: $GB_DIR"
  echo "  Importando GB..."
  python3 "$ROOT/scripts/import_gtfs_gb.py" && ok "gtfs_gb.db generado" || err "Error importando GB"
else
  warn "GB National Rail requiere registro gratuito:"
  echo "  1. Ve a: https://opendata.nationalrail.co.uk/"
  echo "  2. Regístrate → Login → Data Feeds → GTFS"
  echo "  3. Descarga el ZIP y descomprímelo en:"
  echo "     $GB_DIR"
  echo "  4. Vuelve a ejecutar: bash scripts/setup_gtfs.sh"
fi
echo ""

# ─── 4. Portugal CP — requiere registro ──────────────────────────────────────
echo "▸ Portugal — Comboios de Portugal (requiere registro)"
PT_DIR="$DL/Wow trains Portugal"

if [ -d "$PT_DIR" ] && [ -f "$PT_DIR/stops.txt" ]; then
  ok "Datos Portugal ya descomprimidos en: $PT_DIR"
  echo "  Importando Portugal..."
  python3 "$ROOT/scripts/import_gtfs_pt.py" && ok "gtfs_portugal.db generado" || err "Error importando Portugal"
else
  warn "Portugal CP requiere registro (gratuito):"
  echo "  Opción A (recomendada — datos oficiales CP):"
  echo "    https://www.infraestruturasdeportugal.pt/pt-pt/rede/gtfs"
  echo "  Opción B (alternativa pública):"
  echo "    https://transitfeeds.com/p/comboios-de-portugal"
  echo "  Descomprime el ZIP en: $PT_DIR"
  echo "  Luego vuelve a ejecutar: bash scripts/setup_gtfs.sh"
fi
echo ""

# ─── Resumen ──────────────────────────────────────────────────────────────────
echo "══════════════════════════════════════════════════════"
echo "Estado de DBs en assets/:"
for db in gtfs_gb_tfl.db gtfs_norway.db gtfs_gb.db gtfs_portugal.db; do
  PATH_DB="$ROOT/assets/$db"
  if [ -f "$PATH_DB" ]; then
    SIZE=$(du -sh "$PATH_DB" | cut -f1)
    STOPS=$(python3 -c "
import sqlite3
conn = sqlite3.connect('$PATH_DB')
try:
    n = conn.execute('SELECT COUNT(*) FROM stops').fetchone()[0]
    st = conn.execute('SELECT COUNT(*) FROM stop_times').fetchone()[0]
    print(f'stops={n}, stop_times={st}')
except: print('error')
conn.close()
" 2>/dev/null)
    echo -e "  ${GREEN}✓${NC} $db ($SIZE) — $STOPS"
  else
    echo -e "  ${RED}✗${NC} $db — no encontrado"
  fi
done
echo ""
