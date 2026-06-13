/**
 * portugalRealTime.ts
 * Integración real-time Portugal usando la API interna de CP (Comboios de Portugal)
 *
 * API no oficial — extraída de la app móvil de CP.
 * Sin API key. Frágil: puede cambiar si CP actualiza su app.
 * Ref: https://github.com/juliuste/comboios
 *
 * La API de CP es A→B (no tiene endpoint de tablero general).
 * Estrategia: consultamos desde la estación activa hacia N destinos principales,
 * deduplicamos por número de tren y ordenamos por hora de salida.
 */

import { fetchWithTimeout } from './fetchWithTimeout';

const BASE          = 'https://api.cp.pt/cp-api/siv';
const CACHE_TTL_MS  = 120_000; // 2 minutos (CP es más lenta que otras APIs)

// ── Estaciones principales Portugal ───────────────────────────────────────────
// Códigos internos de CP extraídos del repo juliuste/comboios
const MAJOR_STATIONS: Record<string, string> = {
  'Lisboa-Sta.Apolónia': '94-2',
  'Lisboa-Oriente':      '94-3',
  'Lisboa-Entrecampos':  '94-4',
  'Porto-Campanhã':      '94-1',
  'Coimbra-B':           '94-6',
  'Aveiro':              '94-8',
  'Braga':               '94-17',
  'Faro':                '94-60',
  'Évora':               '94-47',
  'Setúbal':             '94-34',
};

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface PortugalStation {
  code: string;  // "94-2"
  name: string;  // "Lisboa-Sta.Apolónia"
}

export interface PortugalDeparture {
  trainNumber:   string;
  category:      string;   // "IC", "AP", "R", "U", "EC"
  destination:   string;
  scheduledTime: string;   // "HH:MM"
  delayMin:      number;
  platform:      string;
  cancelled:     boolean;
  stationName:   string;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

interface BoardCache {
  entries:   PortugalDeparture[];
  fetchedAt: number;
  stationCode: string;
  mode:      string;
}
let boardCache: BoardCache | null = null;
let activeStation: PortugalStation | null = null;
let allStations:   PortugalStation[] = [];

export function setActivePortugalStation(s: PortugalStation): void {
  activeStation = s;
  boardCache    = null;
}
export function getActivePortugalStationName(): string {
  return activeStation?.name ?? 'Lisboa-Oriente';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoDateCP(): string {
  // CP espera: "2026-05-30T12:00:00"
  return new Date().toISOString().slice(0, 19);
}

function parseTime(dt: string): string {
  // CP devuelve: "2026-05-30T14:32:00" o "14:32"
  if (!dt) return '--:--';
  if (dt.includes('T')) return dt.slice(11, 16);
  return dt.slice(0, 5);
}

function categoryFromName(name: string): string {
  // "Alfa Pendular" → "AP", "Intercidades" → "IC", "Regional" → "R"
  const n = name?.toUpperCase() ?? '';
  if (n.includes('ALFA'))   return 'AP';
  if (n.includes('INTER'))  return 'IC';
  if (n.includes('URBAN'))  return 'U';
  if (n.includes('EURO'))   return 'EC';
  if (n.includes('RÁPIDO')) return 'R+';
  return n.slice(0, 3);
}

async function cpFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const qs   = new URLSearchParams(params).toString();
  const url  = `${BASE}/${path}${qs ? '?' + qs : ''}`;
  const resp = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': 'WoW-Trenes-App/1.0',
      'Accept':     'application/json',
    },
  });
  if (!resp.ok) throw new Error(`CP API HTTP ${resp.status}: ${path}`);
  return resp.json() as Promise<T>;
}

// ── API pública ───────────────────────────────────────────────────────────────

/** Carga todas las estaciones de CP (se cachean en memoria) */
async function loadAllStations(): Promise<PortugalStation[]> {
  if (allStations.length > 0) return allStations;
  try {
    const data = await cpFetch<any[]>('stations', { lang: 'pt' });
    allStations = (data ?? []).map((s: any) => ({
      code: s.code ?? s.stationCode ?? '',
      name: s.name ?? s.stationName ?? '',
    })).filter(s => s.code && s.name);
    return allStations;
  } catch (e) {
    console.warn('[PT RT] loadAllStations error:', e);
    // Fallback a estaciones conocidas
    return Object.entries(MAJOR_STATIONS).map(([name, code]) => ({ code, name }));
  }
}

/** Busca estaciones por nombre */
export async function searchPortugalStations(query: string): Promise<PortugalStation[]> {
  const stations = await loadAllStations();
  const q = query.toLowerCase();
  return stations
    .filter(s => s.name.toLowerCase().includes(q))
    .slice(0, 10);
}

/**
 * Tablero de salidas consultando A→B hacia destinos principales.
 * Deduplicamos por trainNumber para evitar duplicados.
 */
export async function fetchPortugalBoard(
  mode:  'salidas' | 'arribos',
  limit: number = 30,
): Promise<PortugalDeparture[]> {
  const now = Date.now();

  // Default: Lisboa-Oriente
  const station     = activeStation ?? { code: '94-3', name: 'Lisboa-Oriente' };
  const stationCode = station.code;
  const stationName = station.name;

  if (
    boardCache &&
    boardCache.mode        === mode &&
    boardCache.stationCode === stationCode &&
    (now - boardCache.fetchedAt) < CACHE_TTL_MS
  ) return boardCache.entries;

  const date = isoDateCP();

  // Destinos a consultar (excluyendo la estación activa)
  const destinations = Object.entries(MAJOR_STATIONS)
    .filter(([, code]) => code !== stationCode)
    .slice(0, 6); // máximo 6 queries paralelas

  try {
    // Queries paralelas A→B para todos los destinos principales
    const results = await Promise.allSettled(
      destinations.map(([destName, destCode]) =>
        cpFetch<any>('trains', {
          departureStationCode: mode === 'salidas' ? stationCode : destCode,
          arrivalStationCode:   mode === 'salidas' ? destCode : stationCode,
          date,
        })
      )
    );

    const seen    = new Set<string>();
    const entries: PortugalDeparture[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status !== 'fulfilled') continue;
      const trains: any[] = result.value?.trains ?? result.value ?? [];
      const destName = destinations[i][0];

      for (const t of trains) {
        const num = String(t.trainNumber ?? t.number ?? '');
        if (seen.has(num)) continue;
        seen.add(num);

        const depTime = parseTime(
          mode === 'salidas'
            ? (t.departureTime ?? t.departure?.scheduledTime ?? '')
            : (t.arrivalTime   ?? t.arrival?.scheduledTime   ?? '')
        );
        const delayMin = Math.round((t.delay ?? t.departureDelay ?? 0) / 60);

        entries.push({
          trainNumber:   num,
          category:      categoryFromName(t.trainType ?? t.type ?? t.category ?? ''),
          destination:   mode === 'salidas' ? destName : stationName,
          scheduledTime: depTime,
          delayMin,
          platform:      t.platform ?? t.track ?? '',
          cancelled:     t.cancelled === true || t.isCancelled === true,
          stationName,
        });
      }
    }

    // Ordenar por hora de salida
    entries.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
    const limited = entries.slice(0, limit);

    boardCache = { entries: limited, fetchedAt: now, stationCode, mode };
    console.log(`[PT RT] ${limited.length} ${mode} desde ${stationName}`);
    return limited;
  } catch (e) {
    console.warn('[PT RT] fetchPortugalBoard error:', e);
    return boardCache?.entries ?? [];
  }
}

/** Invalida el caché */
export function invalidatePortugalRT(): void {
  boardCache = null;
}
