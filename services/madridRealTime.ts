/**
 * Madrid Metro Real-time — API pública del CRTM (Consorcio de Transportes de Madrid)
 * Base: https://www.crtm.es/widgets/api/
 * Sin API key. Sin registro. Mismos endpoints que alimentan la web oficial.
 *
 * Endpoints usados:
 *   GetStopTimes.php?codStop=4_{id}&stopType=0&orderBy=2&stopTimesByIti=4_{id}
 *   GetStops.php?customSearch={query}&codMode=4
 *
 * codMode 4 = Metro Madrid
 * codStop formato: "4_{shortCodStop}" (ej: "4_12" = Sol L1)
 *
 * Ref: github.com/jvicentem/citram-python-api
 */

const BASE     = 'https://www.crtm.es/widgets/api';
const COD_MODE = '4'; // Metro Madrid

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface MadridArrival {
  lineNumber:  string;   // "1", "2", etc.
  destination: string;
  arrivalTime: string;   // "HH:MM"
  codStop:     string;   // "4_12"
}

// ── Mapa nuestro stop_id GTFS → codStop CRTM ─────────────────────────────────
// Formato CRTM: "4_{shortCodStop}" — un codStop por línea que pasa por la estación.
// Cuando una estación tiene varias líneas, el primero de la lista es el principal.
const STOP_TO_CRTM: Record<string, string> = {
  // L1
  'MAD_L1_22': '4_16',   // Atocha
  'MAD_L1_25': '4_12',   // Sol
  'MAD_L1_26': '4_11',   // Gran Vía
  'MAD_L1_27': '4_10',   // Tribunal
  'MAD_L1_28': '4_57',   // Alonso Martínez
  'MAD_L1_32': '4_30',   // Goya
  // L2
  'MAD_L2_04': '4_61',   // Goya
  'MAD_L2_09': '4_35',   // Sol
  // L3
  'MAD_L3_08': '4_48',   // Sol
  'MAD_L3_09': '4_49',   // Callao
  'MAD_L3_10': '4_50',   // Plaza de España
  // L4
  'MAD_L4_05': '4_85',   // Alonso Martínez
  'MAD_L4_09': '4_61',   // Goya
  // L5
  'MAD_L5_16': '4_195',  // Alonso Martínez
  'MAD_L5_18': '4_87',   // Gran Vía
  'MAD_L5_19': '4_88',   // Callao
  // L6 (circular)
  'MAD_L6_13': '4_193',  // Nuevos Ministerios
  // L7
  'MAD_L7_21': '4_155',  // Nuevos Ministerios
  // L8
  'MAD_L8_01': '4_120',  // Nuevos Ministerios
  // L10
  'MAD_L10_08': '4_196', // Tribunal
  // Intercambiadores
  'MAD_NUEVOS_MIN': '4_120', // Nuevos Ministerios (intercambiador)
};

// Mapa inverso: codStop → nombre legible para el picker
const STOP_NAMES: Record<string, string> = {
  '4_16':  'Atocha (L1)',
  '4_12':  'Sol (L1)',
  '4_35':  'Sol (L2)',
  '4_48':  'Sol (L3)',
  '4_11':  'Gran Vía (L1)',
  '4_87':  'Gran Vía (L5)',
  '4_10':  'Tribunal (L1)',
  '4_196': 'Tribunal (L10)',
  '4_57':  'Alonso Martínez (L4)',
  '4_85':  'Alonso Martínez (L4)',
  '4_195': 'Alonso Martínez (L5)',
  '4_30':  'Goya (L2)',
  '4_61':  'Goya (L4)',
  '4_49':  'Callao (L3)',
  '4_88':  'Callao (L5)',
  '4_50':  'Plaza de España (L3)',
  '4_197': 'Plaza de España (L10)',
  '4_120': 'Nuevos Ministerios (L6/L8)',
  '4_155': 'Nuevos Ministerios (L7)',
  '4_193': 'Nuevos Ministerios (L6)',
  '4_36':  'Ópera (L2)',
  '4_89':  'Ópera (L5)',
  '4_237': 'Ópera (L2/R)',
  '4_32':  'Retiro (L9)',
  '4_60':  'Velázquez (L4)',
  '4_59':  'Serrano (L4)',
  '4_52':  'Argüelles (L3)',
  '4_54':  'Argüelles (L6)',
  '4_126': 'Argüelles (R)',
  '4_125': 'Moncloa (L3)',
  '4_53':  'Moncloa (L6)',
  '4_6':   'Cuatro Caminos (L1)',
  '4_42':  'Cuatro Caminos (L2)',
  '4_121': 'Cuatro Caminos (L6)',
  '4_56':  'Bilbao (L4)',
  '4_9':   'Bilbao (L1)',
  '4_8':   'Iglesia (L1)',
  '4_7':   'Ríos Rosas (L1)',
  '4_276': 'Las Tablas (L10)',
};

// ── Retry con exponential backoff 2s → 4s → 8s ───────────────────────────────
async function retryFetch(url: string, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
      if (res.ok) return res;
      throw new Error(`CRTM ${res.status}`);
    } catch (e) {
      if (attempt === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 2 ** attempt * 2_000));
    }
  }
  throw new Error('unreachable');
}

// ── Parada activa (default: Sol L1) ──────────────────────────────────────────
let activeStop = { codStop: '4_12', name: 'Sol (L1)' };

export function setActiveMadridStop(codStop: string, name: string): void {
  activeStop = { codStop, name };
}

export function getActiveMadridStopName(): string {
  return activeStop.name;
}

// ── Búsqueda de paradas — primero en mapa local, fallback API CRTM ────────────
export async function searchMadridStops(query: string): Promise<{ id: string; name: string }[]> {
  if (!query.trim()) {
    return Object.entries(STOP_NAMES).map(([id, name]) => ({ id, name }));
  }
  const q = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // 1. Buscar en mapa local (instantáneo)
  const local = Object.entries(STOP_NAMES)
    .filter(([, name]) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q))
    .map(([id, name]) => ({ id, name }));

  if (local.length >= 3) return local;

  // 2. Fallback: API CRTM para paradas no mapeadas aún
  try {
    const url = `${BASE}/GetStops.php?customSearch=${encodeURIComponent(query)}&codMode=${COD_MODE}`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return local;
    const json  = await res.json();
    const stops = json?.stops?.Stop ?? [];
    const arr   = Array.isArray(stops) ? stops : [stops];
    const remote = arr
      .filter((s: any) => s.codMode === COD_MODE)
      .map((s: any) => ({
        id:   s.codStop as string,
        name: toTitleCase(s.name as string),
      }));
    // Combinar sin duplicados
    const seen = new Set(local.map(l => l.id));
    return [...local, ...remote.filter((r: any) => !seen.has(r.id))].slice(0, 15);
  } catch {
    return local;
  }
}

// ── Próximas salidas en la parada activa ──────────────────────────────────────
export async function fetchMadridBoard(limit = 30): Promise<{
  time: string; train: string; endpoint: string;
  station: string; status: 'ontime' | 'delayed' | 'cancelled'; tripId?: string;
}[]> {
  const { codStop, name } = activeStop;
  const url = `${BASE}/GetStopTimes.php?codStop=${codStop}&stopType=0&orderBy=2&stopTimesByIti=${codStop}`;

  try {
    const res  = await retryFetch(url);
    const json = await res.json();

    // La API devuelve stopTimes.times.Time (array o objeto único)
    const raw = json?.stopTimes?.times?.Time ?? [];
    const arr: any[] = Array.isArray(raw) ? raw : [raw];

    return arr
      .slice(0, limit)
      .map((t: any) => {
        const isoTime: string = t.time ?? '';
        const dest: string    = t.destination ?? t.destinationStop?.name ?? '—';
        const line: string    = t.line?.shortDescription ?? t.line?.codLine ?? '?';
        return {
          time:     formatTime(isoTime),
          train:    `L${line}`,
          endpoint: toTitleCase(dest),
          station:  name,
          status:   'ontime' as const,
          tripId:   t.codVehicle || undefined,
        };
      })
      .filter(e => e.time !== '');
  } catch (e) {
    console.warn('[ES_MAD] CRTM error:', e);
    return [];
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('es-ES', {
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'Europe/Madrid',
    });
  } catch {
    return iso.substring(11, 16);
  }
}

function toTitleCase(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
