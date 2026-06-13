/**
 * IDFM Real-time Service — Paris Métro + RER
 * API oficial: https://prim.iledefrance-mobilites.fr/
 * Registro gratuito → token en minutos (sin límite duro)
 *
 * ESTADO: Implementado, pendiente de key IDFM y conectar a pantalla FR_PAR.
 * Para activar: registrarse en prim.iledefrance-mobilites.fr → agregar
 * EXPO_PUBLIC_IDFM_API_KEY al .env
 *
 * Endpoints usados:
 *   GET /marketplace/stop-monitoring   → próximas llegadas por parada (SIRI-SM)
 *
 * Fallback: si la API falla (offline, sin key), usa GTFS local (gtfs_fr_par.db)
 */

import { fetchWithTimeout } from './fetchWithTimeout';

const IDFM_BASE = 'https://prim.iledefrance-mobilites.fr/marketplace';
const API_KEY   = process.env.EXPO_PUBLIC_IDFM_API_KEY ?? '';

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface IdfmArrival {
  lineNumber:   string;   // "M1", "RER A", etc.
  lineColor:    string;   // hex sin #
  destination:  string;
  minutesLeft:  number;
  arrivalTime:  string;   // "14:32"
  vehicleMode:  'metro' | 'rer' | 'bus';
}

// ── Mapa: nuestro stop_id → MonitoringRef IDFM ───────────────────────────────
// Formato IDFM: "STIF:StopPoint:Q:{id}:"
// IDs obtenidos de: https://data.iledefrance-mobilites.fr/explore/dataset/arrets-lignes
const STOP_ID_TO_IDFM: Record<string, string> = {
  // M1
  "PAR_M1_07": "STIF:StopPoint:Q:22046:",   // Charles de Gaulle-Étoile
  "PAR_M1_11": "STIF:StopPoint:Q:22096:",   // Concorde
  "PAR_M1_13": "STIF:StopPoint:Q:22108:",   // Palais Royal-Musée du Louvre
  "PAR_M1_15": "STIF:StopPoint:Q:22112:",   // Châtelet
  "PAR_M1_18": "STIF:StopPoint:Q:22022:",   // Bastille
  "PAR_M1_19": "STIF:StopPoint:Q:22155:",   // Gare de Lyon
  "PAR_M1_23": "STIF:StopPoint:Q:22143:",   // Nation
  "PAR_M1_26": "STIF:StopPoint:Q:22040:",   // Château de Vincennes
  // M4
  "PAR_M4_05": "STIF:StopPoint:Q:22163:",   // Gare du Nord
  "PAR_M4_10": "STIF:StopPoint:Q:22122:",   // Les Halles
  "PAR_M4_16": "STIF:StopPoint:Q:22190:",   // Montparnasse-Bienvenüe
  "PAR_M4_21": "STIF:StopPoint:Q:22056:",   // Denfert-Rochereau
  // M14
  "PAR_M14_05": "STIF:StopPoint:Q:22155:",  // Gare de Lyon
  "PAR_M13_07": "STIF:StopPoint:Q:22250:",  // Saint-Lazare
  "PAR_M14_11": "STIF:StopPoint:Q:411290:", // Saint-Denis Pleyel
  // RER A
  "PAR_RA_03":  "STIF:StopPoint:Q:22112:",  // Châtelet-Les Halles
  "PAR_RA_04":  "STIF:StopPoint:Q:22155:",  // Gare de Lyon
  "PAR_RA_06":  "STIF:StopPoint:Q:22003:",  // La Défense
  "PAR_RA_08":  "STIF:StopPoint:Q:40099:",  // Marne-la-Vallée (Disneyland)
  // RER B
  "PAR_RB_01":  "STIF:StopPoint:Q:40051:",  // CDG Terminal 2
  "PAR_RB_05":  "STIF:StopPoint:Q:22163:",  // Gare du Nord
  "PAR_RB_10":  "STIF:StopPoint:Q:22056:",  // Denfert-Rochereau
};

// ── Colores oficiales RATP ────────────────────────────────────────────────────
const LINE_COLORS: Record<string, string> = {
  'M1':  'FFCD00', 'M2':  '003CA6', 'M3':  '837902', 'M4':  'CF009E',
  'M5':  'FF7E2E', 'M6':  '6ECA97', 'M7':  'FA9ABA', 'M8':  'E19BDF',
  'M9':  'B6BD00', 'M10': 'C9910D', 'M11': '704B1C', 'M12': '007852',
  'M13': '6EC4E8', 'M14': '62259D',
  'RER_A': 'FF2442', 'RER_B': '4B92DB', 'RER_C': 'FFBE00',
  'RER_D': '00814F', 'RER_E': 'BB4B98',
};

function lineColor(lineId: string): string {
  return LINE_COLORS[lineId] ?? '888888';
}

// ── Próximas llegadas ─────────────────────────────────────────────────────────
export async function getNextArrivals(
  ourStopId: string,
  limit = 5,
): Promise<IdfmArrival[]> {
  const monitoringRef = STOP_ID_TO_IDFM[ourStopId];
  if (!monitoringRef || !API_KEY) return [];

  const url = `${IDFM_BASE}/stop-monitoring`
    + `?MonitoringRef=${encodeURIComponent(monitoringRef)}`
    + `&MaximumStopVisits=${limit * 2}`;

  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        'apiKey': API_KEY,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(6_000),
    });

    if (!res.ok) throw new Error(`IDFM API ${res.status}`);

    const json = await res.json();

    // SIRI-SM: Siri.ServiceDelivery.StopMonitoringDelivery[0].MonitoredStopVisit
    const visits: any[] =
      json?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit ?? [];

    const arrivals: IdfmArrival[] = visits
      .slice(0, limit * 2)
      .map((v) => {
        const journey  = v?.MonitoredVehicleJourney ?? {};
        const call     = journey?.MonitoredCall ?? {};
        const lineRef  = journey?.LineRef?.value ?? '';
        const lineId   = normalizeLineId(lineRef);
        const dest     = journey?.DestinationName?.[0]?.value ?? '';
        const expected = call?.ExpectedArrivalTime ?? call?.ExpectedDepartureTime ?? '';
        const aimed    = call?.AimedArrivalTime    ?? call?.AimedDepartureTime    ?? '';
        const minutes  = expected
          ? Math.max(0, Math.round((new Date(expected).getTime() - Date.now()) / 60_000))
          : 0;
        const mode: IdfmArrival['vehicleMode'] = lineId.startsWith('RER') ? 'rer' : 'metro';
        return {
          lineNumber:  lineId,
          lineColor:   lineColor(lineId),
          destination: dest,
          minutesLeft: minutes,
          arrivalTime: formatTime(expected || aimed),
          vehicleMode: mode,
        } as IdfmArrival;
      })
      .filter((a) => a.destination !== '')
      .slice(0, limit);

    return arrivals;
  } catch (err) {
    console.warn('[IDFM] getNextArrivals error:', err);
    return [];
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 * IDFM LineRef format: "STIF:Line::C01742:" → "M1"
 * Mapping parcial de los códigos internos más comunes.
 */
const LINE_REF_MAP: Record<string, string> = {
  'C01742': 'M1',  'C01743': 'M2',  'C01744': 'M3',  'C01774': 'M3bis',
  'C01745': 'M4',  'C01746': 'M5',  'C01747': 'M6',  'C01748': 'M7',
  'C01775': 'M7bis','C01749': 'M8', 'C01750': 'M9',  'C01751': 'M10',
  'C01752': 'M11', 'C01753': 'M12', 'C01754': 'M13', 'C01755': 'M14',
  'C01728': 'RER_A','C01729': 'RER_B','C01730': 'RER_C',
  'C01731': 'RER_D','C01732': 'RER_E',
};

function normalizeLineId(lineRef: string): string {
  // "STIF:Line::C01742:" → extrae C01742
  const match = lineRef.match(/::([^:]+):/);
  if (match && LINE_REF_MAP[match[1]]) return LINE_REF_MAP[match[1]];
  // Fallback: si viene como nombre legible
  if (lineRef.includes('RER')) {
    const rer = lineRef.match(/RER\s?([A-E])/i);
    if (rer) return `RER_${rer[1].toUpperCase()}`;
  }
  const metro = lineRef.match(/\bM(\d{1,2})\b/i);
  if (metro) return `M${metro[1]}`;
  return lineRef;
}

function formatTime(raw: string): string {
  if (!raw) return '';
  // ISO 8601: "2026-05-29T14:32:00+02:00" → "14:32"
  try {
    return new Date(raw).toLocaleTimeString('es-ES', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch {
    return raw.substring(11, 16);
  }
}

// ── Cobertura ─────────────────────────────────────────────────────────────────
export function hasIdfmRealtime(ourStopId: string): boolean {
  return ourStopId in STOP_ID_TO_IDFM && Boolean(API_KEY);
}

// ── Health check ──────────────────────────────────────────────────────────────
export async function checkIdfmApiHealth(): Promise<boolean> {
  if (!API_KEY) return false;
  try {
    const url = `${IDFM_BASE}/stop-monitoring`
      + `?MonitoringRef=${encodeURIComponent('STIF:StopPoint:Q:22046:')}&MaximumStopVisits=1`;
    const res = await fetchWithTimeout(url, {
      headers: { 'apiKey': API_KEY },
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
