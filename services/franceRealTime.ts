/**
 * franceRealTime.ts
 * Integración real-time Francia usando la API oficial de SNCF (Navitia)
 *
 * API: https://api.sncf.com/v1
 * Auth: Basic Auth — username = API key, password = vacío
 * Docs: http://doc.navitia.io
 *
 * Endpoints usados:
 *   /coverage/sncf/places?q={query}&type[]=stop_area  → buscar estaciones
 *   /coverage/sncf/stop_areas/{id}/departures         → salidas en tiempo real
 *   /coverage/sncf/stop_areas/{id}/arrivals           → llegadas en tiempo real
 */

const BASE    = 'https://api.sncf.com/v1/coverage/sncf';
const API_KEY = process.env.EXPO_PUBLIC_SNCF_KEY ?? '';

// btoa no existe en React Native — codificamos manualmente en base64
function toBase64(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '', i = 0;
  while (i < str.length) {
    const a = str.charCodeAt(i++), b = str.charCodeAt(i++), c = str.charCodeAt(i++);
    result += chars[a >> 2] + chars[((a & 3) << 4) | (b >> 4)]
            + (isNaN(b) ? '=' : chars[((b & 15) << 2) | (c >> 6)])
            + (isNaN(c) ? '=' : chars[c & 63]);
  }
  return result;
}
const AUTH = 'Basic ' + toBase64(API_KEY + ':');
const CACHE_TTL_MS = 90_000; // 90 segundos

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface FranceStation {
  id:   string;   // "stop_area:SNCF:87391003"
  name: string;   // "Paris-Montparnasse"
}

export interface FranceDeparture {
  trainNumber:   string;
  category:      string;   // "TGV", "TER", "IC", "OUIGO", etc.
  destination:   string;
  scheduledTime: string;   // "HH:MM"
  delayMin:      number;
  platform:      string;
  cancelled:     boolean;
  stationName:   string;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

interface BoardCache {
  entries:   FranceDeparture[];
  fetchedAt: number;
  stationId: string;
  mode:      string;
}
let boardCache: BoardCache | null = null;
let activeStation: FranceStation | null = null;

export function setActiveFranceStation(s: FranceStation): void {
  activeStation = s;
  boardCache    = null;
}
export function getActiveFranceStationName(): string {
  return activeStation?.name ?? 'Paris-Montparnasse';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Navitia datetime: "20260530T162518" → "HH:MM" */
function navitiaToHHMM(dt: string): string {
  // formato: "20260530T162518"
  if (!dt || dt.length < 13) return '--:--';
  return `${dt.slice(9, 11)}:${dt.slice(11, 13)}`;
}

/** Diferencia en minutos entre base_departure_date_time y departure_date_time */
function calcDelayMin(scheduled: string, realtime: string): number {
  if (!scheduled || !realtime || scheduled === realtime) return 0;
  // Ambos en formato "20260530T162518"
  const toMin = (s: string) => {
    const h = parseInt(s.slice(9, 11), 10);
    const m = parseInt(s.slice(11, 13), 10);
    return h * 60 + m;
  };
  return Math.max(0, toMin(realtime) - toMin(scheduled));
}

async function sncf<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const qs  = new URLSearchParams({ count: '30', ...params }).toString();
  const url = `${BASE}/${path}?${qs}`;
  const resp = await fetch(url, {
    headers: { Authorization: AUTH, 'User-Agent': 'WoW-Trenes-App/1.0' },
  });
  if (!resp.ok) throw new Error(`SNCF API HTTP ${resp.status}: ${path}`);
  return resp.json() as Promise<T>;
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Busca estaciones SNCF por nombre.
 * Usa el endpoint /places con type[]=stop_area.
 */
export async function searchFranceStations(query: string): Promise<FranceStation[]> {
  try {
    const data = await sncf<any>('places', {
      q:       query,
      'type[]': 'stop_area',
      count:   '10',
    });
    return (data.places ?? []).map((p: any) => ({
      id:   p.stop_area?.id ?? p.id,
      name: p.stop_area?.name ?? p.name,
    }));
  } catch (e) {
    console.warn('[FR RT] searchFranceStations error:', e);
    return [];
  }
}

/**
 * Tablero de salidas o llegadas en tiempo real.
 * Usa /stop_areas/{id}/departures o /arrivals con datos Navitia.
 * Caché 90 segundos.
 */
export async function fetchFranceBoard(
  mode:  'salidas' | 'arribos',
  limit: number = 30,
): Promise<FranceDeparture[]> {
  const now       = Date.now();
  // Default: Paris-Montparnasse
  const stationId = activeStation?.id ?? 'stop_area:SNCF:87391003';
  const stationName = activeStation?.name ?? 'Paris-Montparnasse';

  if (
    boardCache &&
    boardCache.mode      === mode &&
    boardCache.stationId === stationId &&
    (now - boardCache.fetchedAt) < CACHE_TTL_MS
  ) return boardCache.entries;

  const endpoint = mode === 'salidas'
    ? `stop_areas/${stationId}/departures`
    : `stop_areas/${stationId}/arrivals`;

  // datetime en formato Navitia: YYYYMMDDTHHmmss
  const nowStr = new Date().toISOString().replace(/[-:]/g, '').replace('T', 'T').slice(0, 15);

  try {
    const data = await sncf<any>(endpoint, {
      datetime:           nowStr,
      count:              String(limit),
      data_freshness:     'realtime',
      disable_disruption: 'false',
    });

    const list: any[] = mode === 'salidas'
      ? (data.departures ?? [])
      : (data.arrivals   ?? []);

    const entries: FranceDeparture[] = list.map((item: any) => {
      const info         = item.display_informations ?? {};
      const stopDT       = item.stop_date_time ?? {};
      const scheduled    = stopDT.base_departure_date_time ?? stopDT.departure_date_time ?? '';
      const realtime     = stopDT.departure_date_time ?? scheduled;
      const delayMin     = calcDelayMin(scheduled, realtime);
      const disruptions  = item.links?.filter((l: any) => l.type === 'disruption') ?? [];
      const cancelled    = disruptions.some((d: any) => d.rel === 'disruptions');

      return {
        trainNumber:   info.headsign   ?? '',
        category:      info.commercial_mode ?? info.physical_mode ?? 'TER',
        destination:   mode === 'salidas'
          ? (info.direction ?? '—')
          : (info.network   ?? '—'),
        scheduledTime: navitiaToHHMM(scheduled),
        delayMin,
        platform:      stopDT.stop_point?.name ?? '',
        cancelled,
        stationName,
      };
    });

    boardCache = { entries, fetchedAt: now, stationId, mode };
    console.log(`[FR RT] ${entries.length} ${mode} desde ${stationName}`);
    return entries;
  } catch (e) {
    console.warn('[FR RT] fetchFranceBoard error:', e);
    return boardCache?.entries ?? [];
  }
}

/** Invalida el caché (pull-to-refresh) */
export function invalidateFranceRT(): void {
  boardCache = null;
}
