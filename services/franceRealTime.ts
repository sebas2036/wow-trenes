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

// ── Búsqueda de conexiones A→B (Navitia /journeys) ───────────────────────────

export interface FranceJourney {
  tripId:        string;    // id único del journey
  trainNumber:   string;    // "6221", "OUIGO 7842", etc.
  category:      string;    // "TGV INOUI", "TER", "OUIGO", "Intercités"
  origin:        string;    // nombre estación origen
  destination:   string;    // nombre estación destino
  departureTime: string;    // "HH:MM"
  arrivalTime:   string;    // "HH:MM"
  durationMin:   number;
  direct:        boolean;
  transfers:     number;    // número de transbordos
  legs:          FranceJourneyLeg[];  // segmentos si hay transbordo
}

export interface FranceJourneyLeg {
  trainNumber:   string;
  category:      string;
  origin:        string;
  destination:   string;
  departureTime: string;
  arrivalTime:   string;
}

// Caché de journeys: clave = "originId|destId|dateStr"
const journeyCache = new Map<string, { journeys: FranceJourney[]; fetchedAt: number }>();
const JOURNEY_CACHE_TTL = 3 * 60_000; // 3 minutos

/**
 * Busca conexiones de tren entre dos estaciones en Francia usando Navitia.
 *
 * Los IDs de origen/destino deben ser stop_area IDs de Navitia:
 *   "stop_area:SNCF:87391003" (Paris-Montparnasse)
 *   "stop_area:SNCF:87722025" (Lyon-Part-Dieu)
 * Obtenidos via searchFranceStations().
 *
 * Stale-While-Revalidate: si hay caché de <3min, devuelve inmediatamente
 * y refresca en background.
 */
export async function searchFranceJourneys(
  originId:  string,
  destId:    string,
  date:      Date,
  limit = 10,
): Promise<FranceJourney[]> {
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const cacheKey = `${originId}|${destId}|${dateStr}`;
  const now = Date.now();

  const cached = journeyCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < JOURNEY_CACHE_TTL) {
    return cached.journeys;
  }

  // Formato Navitia: YYYYMMDDTHHmmss en hora local Francia
  const navDatetime = buildNavitiaDatetime(date);

  try {
    const data = await sncf<any>('journeys', {
      from:             originId,
      to:               destId,
      datetime:         navDatetime,
      count:            String(limit),
      data_freshness:   'realtime',
      // Solo trenes — excluir bus, metro, etc.
      'forbidden_uris[]': 'physical_mode:Bus',
    });

    const raw: any[] = data.journeys ?? [];

    const journeys: FranceJourney[] = raw
      .filter(j => j.sections?.some((s: any) => s.type === 'public_transport'))
      .map((j: any, idx: number) => {
        // Solo secciones de transporte público (saltar "waiting", "transfer", "crow_fly")
        const trainSections: any[] = (j.sections ?? []).filter(
          (s: any) => s.type === 'public_transport',
        );

        const first = trainSections[0] ?? {};
        const last  = trainSections[trainSections.length - 1] ?? first;
        const info  = first.display_informations ?? {};

        const legs: FranceJourneyLeg[] = trainSections.map((s: any) => {
          const si = s.display_informations ?? {};
          return {
            trainNumber:   si.headsign ?? si.trip_short_name ?? '',
            category:      normalizeFrCategory(si.commercial_mode ?? si.physical_mode ?? ''),
            origin:        s.from?.name ?? '',
            destination:   s.to?.name ?? '',
            departureTime: navitiaToHHMM(s.departure_date_time ?? ''),
            arrivalTime:   navitiaToHHMM(s.arrival_date_time ?? ''),
          };
        });

        return {
          tripId:        j.id ?? `fr-journey-${idx}`,
          trainNumber:   info.headsign ?? info.trip_short_name ?? '',
          category:      normalizeFrCategory(info.commercial_mode ?? info.physical_mode ?? ''),
          origin:        first.from?.name ?? '',
          destination:   last.to?.name ?? '',
          departureTime: navitiaToHHMM(j.departure_date_time ?? ''),
          arrivalTime:   navitiaToHHMM(j.arrival_date_time ?? ''),
          durationMin:   Math.round((j.duration ?? 0) / 60),
          direct:        (j.nb_transfers ?? 0) === 0,
          transfers:     j.nb_transfers ?? 0,
          legs,
        };
      })
      // Ordenar por hora de salida
      .sort((a, b) => a.departureTime.localeCompare(b.departureTime));

    journeyCache.set(cacheKey, { journeys, fetchedAt: now });
    console.log(`[FR RT] ${journeys.length} conexiones ${originId} → ${destId}`);
    return journeys;

  } catch (e) {
    console.warn('[FR RT] searchFranceJourneys error:', e);
    // Stale-While-Revalidate: devolver caché viejo si existe
    return cached?.journeys ?? [];
  }
}

// ── Helpers internos ──────────────────────────────────────────────────────────

/** Convierte Date a formato Navitia YYYYMMDDTHHmmss en hora de París */
function buildNavitiaDatetime(date: Date): string {
  // Navitia acepta UTC — usamos ISO sin milisegundos ni separadores
  return date.toISOString().replace(/[-:.]/g, '').replace('Z', '').slice(0, 15);
}

/** Normaliza nombres de categoría SNCF a etiquetas cortas */
function normalizeFrCategory(raw: string): string {
  const u = raw.toUpperCase();
  if (u.includes('TGV') || u.includes('INOUI'))    return 'TGV INOUI';
  if (u.includes('OUIGO'))                          return 'OUIGO';
  if (u.includes('INTERCIT'))                       return 'Intercités';
  if (u.includes('TER'))                            return 'TER';
  if (u.includes('EUROSTAR'))                       return 'Eurostar';
  if (u.includes('THALYS'))                         return 'Thalys';
  if (u.includes('LYRIA'))                          return 'TGV Lyria';
  if (u.includes('NIGHT') || u.includes('NUIT'))    return 'Night Jet';
  return raw || 'SNCF';
}
