/**
 * TMB Real-time Service — Barcelona Metro
 * API oficial: https://api.tmb.cat/v1/
 * Credenciales: developer.tmb.cat (app_id + app_key)
 *
 * ESTADO: Implementado, pendiente de conectar a la pantalla ES_BCN.
 * Credenciales ya en .env: TMB_APP_ID, TMB_APP_KEY
 *
 * Endpoints usados:
 *   GET /transit/parades/{codi}/properes-arribades  — próximas llegadas a una parada
 *   GET /transit/linies/metro                       — listado de líneas
 *   GET /transit/parades/{codi}                     — info de una parada
 *
 * Fallback: si la API falla (offline, rate-limit), se usa el GTFS local (gtfs_es_bcn.db)
 */

const TMB_BASE  = 'https://api.tmb.cat/v1';
const APP_ID    = process.env.TMB_APP_ID  ?? 'e69d854f';
const APP_KEY   = process.env.TMB_APP_KEY ?? 'b3dcfc04e044118a01bb73c920da537a';

// ── Tipos de respuesta TMB ────────────────────────────────────────────────────
export interface TmbArrival {
  lineNumber:   string;   // "L1", "L3", etc.
  lineColor:    string;   // hex sin #
  destination:  string;   // nombre terminus
  minutesLeft:  number;   // minutos hasta llegada (0 = en estación)
  arrivalTime:  string;   // "14:32" hora real
  tripId:       string;
}

export interface TmbStopInfo {
  codiParada:   number;
  nomParada:    string;
  lat:          number;
  lon:          number;
  linies:       string[];
}

// ── Mapa: nuestro stop_id interno → codi_parada TMB ──────────────────────────
// Fuente: https://api.tmb.cat/v1/transit/parades (campo CODI_PARADA)
// Cubre las estaciones más importantes; el resto usa GTFS local como fallback.
const STOP_ID_TO_TMB: Record<string, number> = {
  // L1
  "BCN_L1_08": 1072,   // Espanya
  "BCN_L1_11": 1016,   // Universitat
  "BCN_L1_12": 2197,   // Catalunya
  "BCN_L1_13": 1017,   // Urquinaona
  "BCN_L1_14": 2189,   // Arc de Triomf
  "BCN_L1_17": 2193,   // Clot
  "BCN_L1_18": 2194,   // Sagrera
  "BCN_L1_20": 2195,   // Maragall
  "BCN_L1_27": 2041,   // Fondo
  // L2
  "BCN_L2_01": 2028,   // Paral·lel
  "BCN_L2_04": 2107,   // Passeig de Gràcia
  "BCN_L2_07": 1050,   // Sagrada Família
  "BCN_L2_10": 2084,   // La Pau
  // L3
  "BCN_L3_06": 2015,   // Sants Estació
  "BCN_L3_08": 2001,   // Drassanes
  "BCN_L3_09": 2002,   // Barceloneta
  "BCN_L3_10": 2003,   // Ciutadella|Vila Olímpica
  "BCN_L3_21": 2048,   // Diagonal
  "BCN_L3_22": 2049,   // Fontana
  "BCN_L3_23": 2050,   // Lesseps
  "BCN_L3_26": 2054,   // Vall d'Hebron
  "BCN_L3_31": 2058,   // Trinitat Nova
  // L4
  "BCN_L4_09": 2071,   // Verdaguer
  "BCN_L4_11": 2080,   // Jaume I
  // L5
  "BCN_L5_08": 2120,   // Collblanc
  "BCN_L5_11": 2124,   // Hospital Clínic
  "BCN_L5_13": 2126,   // Gràcia
  "BCN_L5_27": 2137,   // Vall d'Hebron
  // L9N
  "BCN_L9N_07": 3007,  // La Sagrera-Meridiana
  // FGC
  "BCN_FGC_01": 4001,  // Plaça Catalunya FGC
  "BCN_FGC_08": 4008,  // Sarrià
};

// ── Auth query params ─────────────────────────────────────────────────────────
function authParams(): string {
  return `app_id=${APP_ID}&app_key=${APP_KEY}`;
}

// ── Próximas llegadas a una parada ────────────────────────────────────────────
/**
 * getNextArrivals — devuelve las próximas llegadas en tiempo real.
 *
 * @param ourStopId   — stop_id interno (BCN_L1_12, etc.)
 * @param limit       — máximo de resultados (default 5)
 * @returns           — array de TmbArrival ordenado por minutesLeft
 */
export async function getNextArrivals(
  ourStopId: string,
  limit = 5,
): Promise<TmbArrival[]> {
  const codiParada = STOP_ID_TO_TMB[ourStopId];
  if (!codiParada) return [];          // parada no mapeada — usar GTFS fallback

  const url = `${TMB_BASE}/transit/parades/${codiParada}/properes-arribades?${authParams()}`;

  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(6_000),  // 6s timeout
    });

    if (!res.ok) throw new Error(`TMB API ${res.status}`);

    const json = await res.json();
    const raw: any[] = json?.data?.aaData ?? [];

    const arrivals: TmbArrival[] = raw
      .slice(0, limit * 2)  // pedir más para filtrar
      .map((item) => {
        const t = item.TEMPS_ESTIMAT_ESPERA ?? 0;   // segundos
        const arrTime = item.HORA_PREVISTA_ORIGEN ?? '';
        return {
          lineNumber:  formatLineNumber(item.CODI_LINIA ?? ''),
          lineColor:   lineColor(item.CODI_LINIA ?? ''),
          destination: item.DESTI_COMMERCIAL ?? item.DESTI ?? '',
          minutesLeft: Math.max(0, Math.round(t / 60)),
          arrivalTime: formatTime(arrTime),
          tripId:      String(item.TRIP_ID ?? ''),
        } as TmbArrival;
      })
      .filter((a) => a.destination !== '')
      .slice(0, limit);

    return arrivals;
  } catch (err) {
    console.warn('[TMB] getNextArrivals error:', err);
    return [];
  }
}

// ── Info de una parada ────────────────────────────────────────────────────────
export async function getStopInfo(ourStopId: string): Promise<TmbStopInfo | null> {
  const codiParada = STOP_ID_TO_TMB[ourStopId];
  if (!codiParada) return null;

  const url = `${TMB_BASE}/transit/parades/${codiParada}?${authParams()}`;
  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(6_000) });
    if (!res.ok) throw new Error(`TMB API ${res.status}`);
    const json = await res.json();
    const d    = json?.data?.features?.[0]?.properties;
    if (!d) return null;
    const geo  = json?.data?.features?.[0]?.geometry?.coordinates ?? [0, 0];
    return {
      codiParada,
      nomParada: d.NOM_PARADA ?? '',
      lat:       geo[1],
      lon:       geo[0],
      linies:    (d.LINIES ?? '').split(',').map((l: string) => l.trim()).filter(Boolean),
    };
  } catch {
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatLineNumber(codiLinia: string | number): string {
  const s = String(codiLinia);
  // TMB usa código numérico: 1→L1, 2→L2 ... 9→L9N, 10→L10N, 11→L11
  const n = parseInt(s, 10);
  if (!n) return s;
  if (n === 9)  return 'L9N';
  if (n === 10) return 'L10N';
  if (n === 91) return 'L9S';
  return `L${n}`;
}

const LINE_COLORS: Record<string, string> = {
  'L1': 'DB1F25', 'L2': 'A455A4', 'L3': '3FA63D',
  'L4': 'FFD616', 'L5': '0059A7', 'L9N': 'F06B00',
  'L9S': 'F06B00', 'L10N': '0095B7', 'L11': '7ED348',
};

function lineColor(codiLinia: string | number): string {
  return LINE_COLORS[formatLineNumber(codiLinia)] ?? '888888';
}

function formatTime(raw: string): string {
  // "2026-05-29T14:32:00" → "14:32"
  if (!raw) return '';
  const parts = raw.split('T');
  if (parts.length === 2) return parts[1].substring(0, 5);
  if (raw.includes(':')) return raw.substring(0, 5);
  return raw;
}

// ── Verificar cobertura de una parada ────────────────────────────────────────
/**
 * hasTmbRealtime — devuelve true si la parada tiene datos en tiempo real TMB.
 * Usado por la UI para mostrar el badge "En vivo" vs "Horario estimado".
 */
export function hasTmbRealtime(ourStopId: string): boolean {
  return ourStopId in STOP_ID_TO_TMB;
}

// ── Ping de salud ─────────────────────────────────────────────────────────────
export async function checkTmbApiHealth(): Promise<boolean> {
  try {
    const url = `${TMB_BASE}/transit/linies/metro?app_id=${APP_ID}&app_key=${APP_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    return res.ok;
  } catch {
    return false;
  }
}
