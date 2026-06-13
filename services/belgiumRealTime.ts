/**
 * belgiumRealTime.ts
 * Integración real-time Bélgica usando la API pública de iRail (api.irail.be)
 *
 * iRail es un proyecto open-source que expone los datos de NMBS/SNCB en tiempo real.
 * Sin API key. Sin registro. Rate limit: 3 req/seg (suficiente con caché de 90s).
 *
 * Docs: https://docs.irail.be
 */

import { fetchWithTimeout } from './fetchWithTimeout';

const BASE = 'https://api.irail.be';
const CACHE_TTL_MS = 90_000; // 90 segundos (respeta cache-control de iRail)
const USER_AGENT   = 'WoW-Trenes-App/1.0 (jasinskysebastian@gmail.com)';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface BelgiumStation {
  id:   string;   // "BE.NMBS.008814001"
  name: string;   // "Bruxelles-Midi"
  standardname: string;
}

export interface BelgiumDeparture {
  trainNumber:   string;   // "IC3033"
  category:      string;   // "IC", "S", "L", "P", etc.
  destination:   string;
  scheduledTime: string;   // "HH:MM"
  delayMin:      number;
  platform:      string;
  platformNormal: boolean; // false = andén cambiado
  cancelled:     boolean;
  stationName:   string;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

interface BoardCache {
  entries:   BelgiumDeparture[];
  fetchedAt: number;
  stationId: string;
  mode:      string;
}
let boardCache: BoardCache | null = null;
let activeStation: BelgiumStation | null = null;

export function setActiveBelgiumStation(s: BelgiumStation): void {
  activeStation = s;
  boardCache    = null;
}
export function getActiveBelgiumStationName(): string {
  return activeStation?.name ?? 'Bruxelles-Midi';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function unixToHHMM(ts: number): string {
  const d = new Date(ts * 1000);
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Brussels',
  }).formatToParts(d);
  const h = parts.find(p => p.type === 'hour')?.value   ?? '00';
  const m = parts.find(p => p.type === 'minute')?.value ?? '00';
  return `${h}:${m}`;
}

/** Extrae categoría del shortname: "IC3033" → "IC", "S52583" → "S" */
function categoryFromShortname(shortname: string): string {
  const match = shortname.match(/^([A-Z]+)/);
  return match?.[1] ?? shortname.slice(0, 3);
}

async function irail<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams({ format: 'json', lang: 'en', ...params }).toString();
  const url = `${BASE}/${path}?${qs}`;
  const resp = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
  if (!resp.ok) throw new Error(`iRail HTTP ${resp.status}: ${path}`);
  return resp.json() as Promise<T>;
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Busca estaciones belgas por nombre.
 * iRail devuelve todas las estaciones — filtramos por nombre.
 */
export async function searchBelgiumStations(query: string): Promise<BelgiumStation[]> {
  try {
    const data = await irail<{ station: any[] }>('stations');
    const q = query.toLowerCase();
    return (data.station ?? [])
      .filter((s: any) =>
        s.name?.toLowerCase().includes(q) ||
        s.standardname?.toLowerCase().includes(q)
      )
      .slice(0, 10)
      .map((s: any) => ({
        id:           s.id,
        name:         s.name,
        standardname: s.standardname,
      }));
  } catch (e) {
    console.warn('[BE RT] searchBelgiumStations error:', e);
    return [];
  }
}

/**
 * Tablero de salidas o llegadas en tiempo real — liveboard de iRail.
 * Caché 90 segundos.
 */
export async function fetchBelgiumBoard(
  mode:  'salidas' | 'arribos',
  limit: number = 30,
): Promise<BelgiumDeparture[]> {
  const now       = Date.now();
  const stationId = activeStation?.id ?? 'BE.NMBS.008814001'; // Bruxelles-Midi

  if (
    boardCache &&
    boardCache.mode      === mode &&
    boardCache.stationId === stationId &&
    (now - boardCache.fetchedAt) < CACHE_TTL_MS
  ) return boardCache.entries;

  const stationName = activeStation?.name ?? 'Bruxelles-Midi';
  const arrdep = mode === 'salidas' ? 'departure' : 'arrival';

  try {
    const data = await irail<any>('liveboard', {
      id:     stationId,
      arrdep,
      alerts: 'false',
    });

    const key  = mode === 'salidas' ? 'departures' : 'arrivals';
    const list = data[key]?.departure ?? data[key]?.arrival ?? [];

    const entries: BelgiumDeparture[] = list.slice(0, limit).map((d: any) => {
      const shortname = d.vehicleinfo?.shortname ?? d.vehicle ?? '';
      const delaySec  = parseInt(d.delay ?? '0', 10);
      const delayMin  = Math.round(delaySec / 60);
      return {
        trainNumber:    shortname,
        category:       categoryFromShortname(shortname),
        destination:    mode === 'salidas' ? (d.station ?? '—') : (d.station ?? '—'),
        scheduledTime:  unixToHHMM(parseInt(d.time, 10)),
        delayMin,
        platform:       d.platforminfo?.name ?? d.platform ?? '',
        platformNormal: d.platforminfo?.normal === '1',
        cancelled:      d.canceled === '1' || d.canceled === 1,
        stationName,
      };
    });

    const seen = new Set<string>();
    const deduped = entries.filter(e => {
      const key = `${e.trainNumber}|${e.scheduledTime}|${e.destination}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    boardCache = { entries: deduped, fetchedAt: now, stationId, mode };
    return deduped;
  } catch (e) {
    console.warn('[BE RT] fetchBelgiumBoard error:', e);
    return boardCache?.entries ?? [];
  }
}

/** Perturbaciones activas en la red belga */
export async function getBelgiumDisturbances(): Promise<string[]> {
  try {
    const data = await irail<{ disturbance: any[] }>('disturbances');
    return (data.disturbance ?? []).slice(0, 5).map((d: any) => d.title ?? '');
  } catch {
    return [];
  }
}

/** Invalida el caché (pull-to-refresh) */
export function invalidateBelgiumRT(): void {
  boardCache = null;
}
