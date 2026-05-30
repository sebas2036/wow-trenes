/**
 * austriaRealTime.ts
 * Integración real-time Austria usando la API Hafas de ÖBB (no oficial)
 *
 * ÖBB usa el sistema HaCon/Hafas internamente — los mismos endpoints
 * que alimentan fahrplan.oebb.at (Scotty). Sin API key, sin registro.
 *
 * Endpoints:
 *   /bin/ajax-getstop.exe/dn  → buscar estaciones
 *   /bin/stboard.exe/dn       → tablero de salidas/llegadas en tiempo real
 */

const BASE = 'https://fahrplan.oebb.at';
const CACHE_TTL_MS = 90_000;

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface AustriaStation {
  extId: string;  // "1190100" (Wien Hauptbahnhof)
  name:  string;  // "Wien Hbf"
}

export interface AustriaDeparture {
  trainNumber:   string;
  category:      string;   // "REX", "S", "IC", "RJ", "NJ", etc.
  destination:   string;
  scheduledTime: string;   // "HH:MM"
  delayMin:      number;
  platform:      string;
  cancelled:     boolean;
  stationName:   string;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

interface BoardCache {
  entries:   AustriaDeparture[];
  fetchedAt: number;
  stationId: string;
  mode:      string;
}
let boardCache: BoardCache | null = null;
let activeStation: AustriaStation | null = null;

export function setActiveAustriaStation(s: AustriaStation): void {
  activeStation = s;
  boardCache    = null;
}
export function getActiveAustriaStationName(): string {
  return activeStation?.name ?? 'Wien Hbf';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extrae categoría del nombre del tren: "REX 1234" → "REX", "RJX 42" → "RJX" */
function categoryFromName(name: string): string {
  const match = name?.trim().match(/^([A-Z]+)/);
  return match?.[1] ?? name?.slice(0, 4) ?? '—';
}

async function oebb<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs   = new URLSearchParams(params).toString();
  const url  = `${BASE}${path}?${qs}`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'WoW-Trenes-App/1.0' },
  });
  if (!resp.ok) throw new Error(`ÖBB Hafas HTTP ${resp.status}: ${path}`);
  return resp.json() as Promise<T>;
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Busca estaciones austriacas por nombre vía Hafas ajax-getstop.
 * Devuelve JSONP — parseamos manualmente.
 */
export async function searchAustriaStations(query: string): Promise<AustriaStation[]> {
  try {
    const url  = `${BASE}/bin/ajax-getstop.exe/dn?S=${encodeURIComponent(query)}&js=true&max=10`;
    const resp = await fetch(url, { headers: { 'User-Agent': 'WoW-Trenes-App/1.0' } });
    const text = await resp.text();
    // Hafas devuelve: SLs.sls = {"suggestions":[...]}
    const match = text.match(/\{.*\}/s);
    if (!match) return [];
    const data = JSON.parse(match[0]);
    return (data.suggestions ?? [])
      .filter((s: any) => s.extId && s.value)
      .map((s: any) => ({
        extId: s.extId,
        name:  s.value,
      }));
  } catch (e) {
    console.warn('[AT RT] searchAustriaStations error:', e);
    return [];
  }
}

/**
 * Tablero de salidas o llegadas en tiempo real usando Hafas stboard.
 * Caché 90 segundos.
 */
export async function fetchAustriaBoard(
  mode:  'salidas' | 'arribos',
  limit: number = 30,
): Promise<AustriaDeparture[]> {
  const now       = Date.now();
  // Default: Wien Hauptbahnhof
  const stationId   = activeStation?.extId ?? '1190100';
  const stationName = activeStation?.name  ?? 'Wien Hbf';

  if (
    boardCache &&
    boardCache.mode      === mode &&
    boardCache.stationId === stationId &&
    (now - boardCache.fetchedAt) < CACHE_TTL_MS
  ) return boardCache.entries;

  const boardType = mode === 'salidas' ? 'dep' : 'arr';

  try {
    const data = await oebb<any>('/bin/stboard.exe/dn', {
      input:          stationId,
      boardType,
      time:           '',
      start:          'yes',
      L:              'vs_scotty',
      productsFilter: '1011111111111', // todos los trenes
      maxJourneys:    String(limit),
      outputMode:     'odv',
      format:         'json',
    });

    const journeys: any[] = data.journey ?? [];

    const entries: AustriaDeparture[] = journeys.slice(0, limit).map((j: any) => {
      const product  = j.product ?? {};
      const loc      = j.mainLocation ?? {};
      const name     = product.name ?? '';
      const delayStr = mode === 'salidas' ? (loc.depDelay ?? '0') : (loc.arrDelay ?? '0');
      const delayMin = parseInt(delayStr, 10) || 0;

      // Destino: último stop del array
      const stops: any[] = j.stops ?? [];
      const destination  = mode === 'salidas'
        ? (stops[stops.length - 1]?.name ?? j.directionFlag ?? '—')
        : (stops[0]?.name ?? '—');

      return {
        trainNumber:   name,
        category:      categoryFromName(name),
        destination,
        scheduledTime: mode === 'salidas' ? (loc.depTime ?? '--:--') : (loc.arrTime ?? '--:--'),
        delayMin,
        platform:      loc.track ?? '',
        cancelled:     j.cancelled === true || j.cancelled === 1,
        stationName,
      };
    });

    boardCache = { entries, fetchedAt: now, stationId, mode };
    console.log(`[AT RT] ${entries.length} ${mode} desde ${stationName}`);
    return entries;
  } catch (e) {
    console.warn('[AT RT] fetchAustriaBoard error:', e);
    return boardCache?.entries ?? [];
  }
}

/** Invalida el caché (pull-to-refresh) */
export function invalidateAustriaRT(): void {
  boardCache = null;
}
