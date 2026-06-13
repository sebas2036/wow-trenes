/**
 * swissRealTime.ts
 * Integración con transport.opendata.ch — API pública suiza, sin key.
 *
 * Docs: https://transport.opendata.ch/
 *
 * Provee:
 *   fetchSwissStationboard()  → salidas en tiempo real desde una estación
 *   fetchSwissConnections()   → próximas conexiones entre dos estaciones
 *   searchSwissStations()     → búsqueda de estaciones por nombre
 */

import { fetchWithTimeout } from './fetchWithTimeout';

const BASE = 'https://transport.opendata.ch/v1';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface SwissDeparture {
  trainNumber:   string;   // "IC 1" | "IR 36" | "EC 152"
  category:      string;   // "IC" | "IR" | "EC" | "RE" | "S"
  operator:      string;
  destination:   string;
  departureISO:  string;   // ISO 8601
  departureTime: Date;
  delayMin:      number;   // 0 si puntual
  platform:      string;
  stationId:     string;
  stationName:   string;
}

export interface SwissConnection {
  from:          SwissStop;
  to:            SwissStop;
  durationMin:   number;
  products:      string[];  // ["IC", "RE"]
  sections:      SwissSection[];
}

export interface SwissStop {
  stationId:    string;
  stationName:  string;
  departure:    Date | null;
  arrival:      Date | null;
  delayMin:     number;
  platform:     string;
}

export interface SwissSection {
  departure:  SwissStop;
  arrival:    SwissStop;
  trainName:  string;
  category:   string;
  destination: string;
}

export interface SwissStation {
  id:   string;
  name: string;
  lat:  number;
  lon:  number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  return new Date(iso);
}

function delayMinutes(prognosis: any, scheduledISO: string | null): number {
  if (!prognosis || !scheduledISO) return 0;
  const prog = prognosis.departure || prognosis.arrival;
  if (!prog) return 0;
  const diff = (new Date(prog).getTime() - new Date(scheduledISO).getTime()) / 60_000;
  return Math.max(0, Math.round(diff));
}

// ─── API: Stationboard (tablero de salidas en tiempo real) ────────────────────

/**
 * Devuelve las próximas N salidas de trenes desde una estación suiza.
 * Filtrado a categorías de larga distancia (IC, EC, IR, TGV, RJX, RE).
 *
 * @param stationName  Nombre o ID de la estación (e.g. "Zürich HB" | "8503000")
 * @param limit        Número de salidas (máx ~40 en la práctica)
 * @param datetime     Fecha/hora de inicio (default: ahora)
 */
export async function fetchSwissStationboard(
  stationName: string,
  limit = 20,
  datetime?: Date,
  type: 'departure' | 'arrival' = 'departure',
): Promise<SwissDeparture[]> {
  const params = new URLSearchParams({
    station:        translateSwissQuery(stationName),
    limit:          String(limit),
    transportations: 'train',
    type,
  });
  if (datetime) {
    const d = datetime;
    const pad = (n: number) => String(n).padStart(2, '0');
    params.set('datetime',
      `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
  }

  const url = `${BASE}/stationboard?${params}`;
  const res  = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Swiss API error ${res.status}`);
  const json = await res.json();

  const station = json.station ?? {};
  const board: SwissDeparture[] = [];

  for (const j of json.stationboard ?? []) {
    const cat = (j.category ?? '').toUpperCase();
    // Filtrar solo trenes de larga/media distancia — excluir S/Bus/Tram
    if (['S', 'BUS', 'B', 'T', 'TRAM', 'BAT', 'SL', 'PB'].includes(cat)) continue;
    if (cat === '' && !j.name?.match(/^(IC|IR|EC|RE|TGV|RJX)/i)) continue;

    const stop       = j.stop ?? {};
    const isArrival  = type === 'arrival';
    const timeISO    = isArrival ? (stop.arrival ?? null) : (stop.departure ?? null);
    const progTime   = isArrival ? (stop.prognosis?.arrival ?? null) : (stop.prognosis?.departure ?? null);
    const delayMins  = timeISO && progTime
      ? Math.max(0, Math.round((new Date(progTime).getTime() - new Date(timeISO).getTime()) / 60_000))
      : 0;

    board.push({
      trainNumber:   j.name ?? '',
      category:      cat,
      operator:      j.operator ?? '',
      destination:   isArrival ? (j.from ?? '—') : (j.to ?? '—'),
      departureISO:  timeISO ?? '',
      departureTime: timeISO ? new Date(timeISO) : new Date(),
      delayMin:      delayMins,
      platform:      stop.platform ?? stop.prognosis?.platform ?? '',
      stationId:     station.id ?? '',
      stationName:   station.name ?? stationName,
    });
  }

  return board;
}

// ─── API: Connections (búsqueda de viaje origen→destino) ─────────────────────

/**
 * Devuelve las próximas conexiones entre dos estaciones suizas.
 *
 * @param from    Nombre o ID origen (e.g. "Zürich HB")
 * @param to      Nombre o ID destino (e.g. "Genève")
 * @param date    Fecha del viaje
 * @param limit   Número de resultados (1-16)
 */
export async function fetchSwissConnections(
  from: string,
  to:   string,
  date: Date,
  limit = 6,
): Promise<SwissConnection[]> {
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
  const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  const params = new URLSearchParams({
    from, to,
    date:  dateStr,
    time:  timeStr,
    limit: String(Math.min(limit, 16)),
    transportations: 'train',
  });

  const url = `${BASE}/connections?${params}`;
  const res  = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Swiss API error ${res.status}`);
  const json = await res.json();

  return (json.connections ?? []).map((c: any): SwissConnection => {
    const fromStop = c.from ?? {};
    const toStop   = c.to   ?? {};

    // Duración
    let durationMin = 0;
    if (c.duration) {
      // formato: "00d00:43:00"
      const m = c.duration.match(/(\d+)d(\d+):(\d+)/);
      if (m) durationMin = parseInt(m[1])*24*60 + parseInt(m[2])*60 + parseInt(m[3]);
    } else if (fromStop.departure && toStop.arrival) {
      durationMin = Math.round(
        (new Date(toStop.arrival).getTime() - new Date(fromStop.departure).getTime()) / 60_000
      );
    }

    const sections: SwissSection[] = (c.sections ?? []).map((s: any) => {
      const j   = s.journey ?? {};
      const dep = s.departure ?? {};
      const arr = s.arrival   ?? {};
      return {
        departure:   {
          stationId:   dep.station?.id  ?? '',
          stationName: dep.station?.name ?? '',
          departure:   parseDate(dep.departure),
          arrival:     null,
          delayMin:    delayMinutes(dep.prognosis, dep.departure),
          platform:    dep.platform ?? dep.prognosis?.platform ?? '',
        },
        arrival: {
          stationId:   arr.station?.id  ?? '',
          stationName: arr.station?.name ?? '',
          departure:   null,
          arrival:     parseDate(arr.arrival),
          delayMin:    delayMinutes(arr.prognosis, arr.arrival),
          platform:    arr.platform ?? arr.prognosis?.platform ?? '',
        },
        trainName:   j.name        ?? '',
        category:    j.category    ?? '',
        destination: j.to          ?? '',
      };
    });

    return {
      from: {
        stationId:   fromStop.station?.id   ?? '',
        stationName: fromStop.station?.name ?? from,
        departure:   parseDate(fromStop.departure),
        arrival:     null,
        delayMin:    delayMinutes(fromStop.prognosis, fromStop.departure),
        platform:    fromStop.platform ?? fromStop.prognosis?.platform ?? '',
      },
      to: {
        stationId:   toStop.station?.id   ?? '',
        stationName: toStop.station?.name ?? to,
        departure:   null,
        arrival:     parseDate(toStop.arrival),
        delayMin:    delayMinutes(toStop.prognosis, toStop.arrival),
        platform:    toStop.platform ?? toStop.prognosis?.platform ?? '',
      },
      durationMin,
      products: c.products ?? [],
      sections,
    };
  });
}

// ─── API: Locations (búsqueda de estaciones) ──────────────────────────────────

/**
 * Busca estaciones suizas por nombre.
 * Útil para autocompletado cuando el país activo es Suiza.
 */
// Traducciones español → nombre oficial usado por transport.opendata.ch
const ES_TO_CH: Record<string, string> = {
  'ginebra':      'Genève',
  'geneva':       'Genève',
  'zurich':       'Zürich HB',
  'zúrich':       'Zürich HB',
  'berna':        'Bern',
  'berne':        'Bern',
  'basilea':      'Basel SBB',
  'basel':        'Basel SBB',
  'lausana':      'Lausanne',
  'lucerna':      'Luzern',
  'lugano':       'Lugano',
  'st. gallen':   'St. Gallen',
  'san galo':     'St. Gallen',
  'winterthur':   'Winterthur',
  'friburgo':     'Fribourg',
  'freiburg':     'Fribourg',
  'sion':         'Sion',
  'schaffhausen': 'Schaffhausen',
  'esiafrankurto':'Schaffhausen',
  'thun':         'Thun',
  'biel':         'Biel/Bienne',
  'bienne':       'Biel/Bienne',
  'neuchatel':    'Neuchâtel',
  'neuchâtel':    'Neuchâtel',
  'coira':        'Chur',
  'chur':         'Chur',
  'bellinzona':   'Bellinzona',
  'locarno':      'Locarno',
  'mendrisio':    'Mendrisio',
  'zermatt':      'Zermatt',
  'interlaken':   'Interlaken Ost',
  'davos':        'Davos Platz',
  'montreux':     'Montreux',
  'vevey':        'Vevey',
  'olten':        'Olten',
  'solothurn':    'Solothurn',
  'soleure':      'Solothurn',
  'aarau':        'Aarau',
  'baden':        'Baden',
  'rapperswil':   'Rapperswil',
  'brugg':        'Brugg AG',
  'zugo':         'Zug',
  'zug':          'Zug',
};

function translateSwissQuery(query: string): string {
  const q = query.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return ES_TO_CH[q] ?? query;
}

export async function searchSwissStations(query: string): Promise<SwissStation[]> {
  if (query.length < 2) return [];
  const translated = translateSwissQuery(query);
  const params = new URLSearchParams({ query: translated, type: 'station' });
  const res = await fetchWithTimeout(`${BASE}/locations?${params}`);
  if (!res.ok) return [];
  const json = await res.json();
  return (json.stations ?? [])
    .filter((s: any) => s.id && s.name && s.coordinate)
    .map((s: any): SwissStation => ({
      id:   s.id,
      name: s.name,
      lat:  s.coordinate?.x ?? 0,
      lon:  s.coordinate?.y ?? 0,
    }));
}

/**
 * Busca la estación suiza más cercana a unas coordenadas.
 * @param lat  Latitud
 * @param lon  Longitud
 */
export async function nearestSwissStation(lat: number, lon: number): Promise<SwissStation | null> {
  const params = new URLSearchParams({ x: String(lat), y: String(lon), type: 'station' });
  const res = await fetchWithTimeout(`${BASE}/locations?${params}`);
  if (!res.ok) return null;
  const json = await res.json();
  const s = json.stations?.[0];
  if (!s?.id) return null;
  return { id: s.id, name: s.name, lat: s.coordinate?.x ?? lat, lon: s.coordinate?.y ?? lon };
}
