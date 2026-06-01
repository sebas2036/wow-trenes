/**
 * germanyBoard.ts — Tablero real-time Deutsche Bahn
 *
 * API: DB Navigator app (app.services-bahn.de/mob)
 * Sin API key. Mismos endpoints que usa la app oficial DB Navigator.
 * Descubierto via ingeniería inversa en db-vendo-client
 * (github.com/public-transport/db-vendo-client)
 *
 * Endpoints:
 *   POST /mob/location/search       → buscar estaciones por nombre
 *   POST /mob/bahnhofstafel/abfahrt → tablero de salidas
 *   POST /mob/bahnhofstafel/ankunft → tablero de llegadas
 *
 * El `locationId` es el formato interno DB:
 *   "A=1@O=Frankfurt(Main)Hbf@X=8662833@Y=50106682@U=80@L=8000105@..."
 */

const BASE = 'https://app.services-bahn.de/mob';

// ── Headers requeridos por la API ─────────────────────────────────────────────
function boardHeaders(): Record<string, string> {
  return {
    'Accept':           'application/x.db.vendo.mob.bahnhofstafeln.v2+json',
    'Content-Type':     'application/x.db.vendo.mob.bahnhofstafeln.v2+json',
    'X-Correlation-ID': `wow-trenes-${Date.now()}_wow-trenes-${Math.random().toString(36).slice(2)}`,
  };
}

function locationHeaders(): Record<string, string> {
  return {
    'Accept':           'application/x.db.vendo.mob.location.v3+json',
    'Content-Type':     'application/x.db.vendo.mob.location.v3+json',
    'X-Correlation-ID': `wow-trenes-${Date.now()}_wow-trenes-${Math.random().toString(36).slice(2)}`,
  };
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface GermanyStation {
  locationId: string;   // formato interno DB completo
  name:       string;
  evaNr:      string;   // número EVA (ej: "8000105")
}

// ── Mapa de estaciones principales → locationId completo ──────────────────────
// Cubre las 24 estaciones más importantes de Alemania.
// El resto se busca dinámicamente via /location/search.
const STATION_MAP: Record<string, GermanyStation> = {
  'Frankfurt Hbf':         { evaNr: '8000105', name: 'Frankfurt(Main)Hbf',     locationId: 'A=1@O=Frankfurt(Main)Hbf@X=8662833@Y=50106682@U=80@L=8000105@p=1779908603@i=U×008011068@' },
  'Berlin Hbf':            { evaNr: '8011160', name: 'Berlin Hbf',             locationId: 'A=1@O=Berlin Hbf@X=13369549@Y=52525589@U=80@L=8011160@p=1779908603@i=U×008065969@' },
  'München Hbf':           { evaNr: '8000261', name: 'München Hbf',            locationId: 'A=1@O=München Hbf@X=11558339@Y=48140229@U=80@L=8000261@p=1779908603@i=U×008020347@' },
  'Hamburg Hbf':           { evaNr: '8002549', name: 'Hamburg Hbf',            locationId: 'A=1@O=Hamburg Hbf@X=10006909@Y=53552733@U=80@L=8002549@p=1779908603@i=U×008001071@' },
  'Köln Hbf':              { evaNr: '8000207', name: 'Köln Hbf',               locationId: 'A=1@O=Köln Hbf@X=6958730@Y=50943029@U=80@L=8000207@p=1779908603@i=U×008015458@' },
  'Stuttgart Hbf':         { evaNr: '8000096', name: 'Stuttgart Hbf',          locationId: 'A=1@O=Stuttgart Hbf@X=9182760@Y=48784782@U=80@L=8000096@p=1779908603@i=U×008029034@' },
  'Düsseldorf Hbf':        { evaNr: '8000085', name: 'Düsseldorf Hbf',         locationId: 'A=1@O=Düsseldorf Hbf@X=6794317@Y=51219960@U=80@L=8000085@p=1779908603@i=U×008008094@' },
  'Hannover Hbf':          { evaNr: '8000152', name: 'Hannover Hbf',           locationId: 'A=1@O=Hannover Hbf@X=9741017@Y=52376764@U=80@L=8000152@p=1779908603@i=U×008013552@' },
  'Nürnberg Hbf':          { evaNr: '8000284', name: 'Nürnberg Hbf',           locationId: 'A=1@O=Nürnberg Hbf@X=11082989@Y=49445615@U=80@L=8000284@p=1779908603@i=U×008022193@' },
  'Leipzig Hbf':           { evaNr: '8010205', name: 'Leipzig Hbf',            locationId: 'A=1@O=Leipzig Hbf@X=12382066@Y=51345467@U=80@L=8010205@p=1779908603@i=U×008023179@' },
  'Dresden Hbf':           { evaNr: '8010085', name: 'Dresden Hbf',            locationId: 'A=1@O=Dresden Hbf@X=13732039@Y=51040562@U=80@L=8010085@p=1779908603@i=U×008006050@' },
  'Dortmund Hbf':          { evaNr: '8000080', name: 'Dortmund Hbf',           locationId: 'A=1@O=Dortmund Hbf@X=7459294@Y=51517899@U=80@L=8000080@p=1779908603@i=U×008010053@' },
  'Essen Hbf':             { evaNr: '8000098', name: 'Essen Hbf',              locationId: 'A=1@O=Essen Hbf@X=7014795@Y=51451351@U=80@L=8000098@p=1779908603@i=U×008010184@' },
  'Bremen Hbf':            { evaNr: '8000050', name: 'Bremen Hbf',             locationId: 'A=1@O=Bremen Hbf@X=8813833@Y=53083478@U=80@L=8000050@p=1779908603@i=U×008013751@' },
  'Mannheim Hbf':          { evaNr: '8000244', name: 'Mannheim Hbf',           locationId: 'A=1@O=Mannheim Hbf@X=8468917@Y=49479352@U=80@L=8000244@p=1779908603@i=U×008014008@' },
  'Karlsruhe Hbf':         { evaNr: '8000191', name: 'Karlsruhe Hbf',          locationId: 'A=1@O=Karlsruhe Hbf@X=8402181@Y=48993512@U=80@L=8000191@p=1779908603@i=U×008014228@' },
  'Freiburg Hbf':          { evaNr: '8000107', name: 'Freiburg(Breisgau) Hbf', locationId: 'A=1@O=Freiburg(Breisgau) Hbf@X=7841174@Y=47997696@U=80@L=8000107@p=1779908603@i=U×008014350@' },
  'Augsburg Hbf':          { evaNr: '8000013', name: 'Augsburg Hbf',           locationId: 'A=1@O=Augsburg Hbf@X=10885568@Y=48365444@U=80@L=8000013@p=1779908603@i=U×008002140@' },
  'Heidelberg Hbf':        { evaNr: '8000156', name: 'Heidelberg Hbf',         locationId: 'A=1@O=Heidelberg Hbf@X=8675444@Y=49403564@U=80@L=8000156@p=1779908603@i=U×008014021@' },
  'Bonn Hbf':              { evaNr: '8000044', name: 'Bonn Hbf',               locationId: 'A=1@O=Bonn Hbf@X=7097136@Y=50732008@U=80@L=8000044@p=1779908603@i=U×008015485@' },
  'Aachen Hbf':            { evaNr: '8000001', name: 'Aachen Hbf',             locationId: 'A=1@O=Aachen Hbf@X=6091495@Y=50767803@U=80@L=8000001@p=1779908603@i=U×008015345@' },
  'Erfurt Hbf':            { evaNr: '8010101', name: 'Erfurt Hbf',             locationId: 'A=1@O=Erfurt Hbf@X=11037989@Y=50972352@U=80@L=8010101@p=1779908603@i=U×008016043@' },
  'Kassel Hbf':            { evaNr: '8000193', name: 'Kassel Hbf',             locationId: 'A=1@O=Kassel Hbf@X=9489499@Y=51318257@U=80@L=8000193@p=1779908603@i=U×008005361@' },
  'Mainz Hbf':             { evaNr: '8000240', name: 'Mainz Hbf',              locationId: 'A=1@O=Mainz Hbf@X=8258723@Y=50001113@U=80@L=8000240@p=1779908603@i=U×008019051@' },
  'Wiesbaden Hbf':         { evaNr: '8000250', name: 'Wiesbaden Hbf',          locationId: 'A=1@O=Wiesbaden Hbf@X=8243729@Y=50070788@U=80@L=8000250@p=1779908603@i=U×008011018@' },
};

// ── Parada activa (default: Frankfurt Hbf) ────────────────────────────────────
let activeStation: GermanyStation = STATION_MAP['Frankfurt Hbf'];

export function setActiveGermanyStation(station: GermanyStation): void {
  activeStation = station;
}

export function getActiveGermanyStationName(): string {
  return activeStation.name;
}

// ── Búsqueda de estaciones ────────────────────────────────────────────────────
// 1. Busca en mapa local (instantáneo, sin red)
// 2. Si hay menos de 3 resultados locales, consulta la API de DB Navigator
export async function searchGermanyStations(query: string): Promise<GermanyStation[]> {
  const q = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const local = Object.entries(STATION_MAP)
    .filter(([key]) => key.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q))
    .map(([, s]) => s);

  if (local.length >= 3) return local;

  try {
    const res = await fetch(`${BASE}/location/search`, {
      method:  'POST',
      headers: locationHeaders(),
      body:    JSON.stringify({ locationTypes: ['ALL'], searchTerm: query, maxResults: 8 }),
      signal:  AbortSignal.timeout(6_000),
    });
    if (!res.ok) return local;

    const data: any[] = await res.json();
    const remote: GermanyStation[] = data
      .filter(s => s.locationType === 'ST' && s.evaNr)
      .map(s => ({ locationId: s.locationId, name: s.name, evaNr: s.evaNr }));

    const seen = new Set(local.map(l => l.evaNr));
    return [...local, ...remote.filter(r => !seen.has(r.evaNr))].slice(0, 10);
  } catch {
    return local;
  }
}

// ── Formato de fecha/hora para la API ─────────────────────────────────────────
function toDBDate(d: Date): string {
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function toDBTime(d: Date): string {
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`; // "HH:MM"
}

// ── Tablero de salidas/llegadas ───────────────────────────────────────────────
export async function fetchGermanyBoard(
  mode:  'salidas' | 'arribos',
  limit: number = 30,
): Promise<{
  time: string; train: string; endpoint: string;
  station: string; status: 'ontime' | 'delayed' | 'cancelled';
  delay?: string; platform?: string; tripId?: string;
}[]> {
  const now      = new Date();
  const endpoint = mode === 'salidas' ? 'abfahrt' : 'ankunft';
  const timeKey  = mode === 'salidas' ? 'abgangsDatum' : 'ankunftsDatum';
  const rtKey    = mode === 'salidas' ? 'ezAbgangsDatum' : 'ezAnkunftsDatum';

  try {
    const res = await fetch(`${BASE}/bahnhofstafel/${endpoint}`, {
      method:  'POST',
      headers: boardHeaders(),
      body: JSON.stringify({
        anfragezeit:         toDBTime(now),
        datum:               toDBDate(now),
        ursprungsBahnhofId:  activeStation.locationId,
        verkehrsmittel: [
          'HOCHGESCHWINDIGKEITSZUEGE',
          'INTERCITYUNDEUROCITYZUEGE',
          'INTERREGIOUNDSCHNELLZUEGE',
          'NAHVERKEHRSONSTIGEZUEGE',
          'SBAHNEN',
        ],
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) throw new Error(`DB Navigator HTTP ${res.status}`);

    const raw: any[] = await res.json();
    const entries = Array.isArray(raw) ? raw : [];

    return entries
      .slice(0, limit)
      .map((e: any) => {
        const scheduled = e[timeKey] ? new Date(e[timeKey]) : null;
        const realtime  = e[rtKey]   ? new Date(e[rtKey])   : null;
        const delayMs   = (realtime && scheduled) ? realtime.getTime() - scheduled.getTime() : 0;
        const delayMin  = Math.round(delayMs / 60_000);
        const cancelled = Array.isArray(e.echtzeitNotizen) &&
          e.echtzeitNotizen.some((n: any) => n?.key === 'AUSFALL');

        const trainName = [e.kurztext, e.mitteltext].filter(Boolean).join(' ').trim() || '?';

        return {
          time:     scheduled ? formatTime(scheduled) : '--:--',
          train:    trainName,
          endpoint: e.richtung ?? '—',
          station:  activeStation.name,
          status:   cancelled ? 'cancelled' as const
            : delayMin > 1   ? 'delayed'   as const
            :                   'ontime'    as const,
          delay:    delayMin > 1 ? `+${delayMin}'` : undefined,
          platform: e.gleis ?? e.plattform ?? undefined,
          tripId:   e.verkehrsmittelNummer ?? undefined,
        };
      })
      .filter(e => e.time !== '--:--');

  } catch (e) {
    console.warn('[DE Board] Error:', e);
    return [];
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────
function formatTime(d: Date): string {
  return d.toLocaleTimeString('de-DE', {
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'Europe/Berlin',
  });
}
