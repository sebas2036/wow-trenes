/**
 * dayPlanner — Itinerario ferroviario de un día
 *
 * LÓGICA:
 *   1. Usuario da ciudad + fecha
 *   2. Tomamos los top POIs de esa ciudad (desde touristPOIs.ts)
 *   3. Para cada par POI→POI calculamos el tren más conveniente (GTFS)
 *   4. Armamos un timeline completo: llegada POI → tiempo visita → tren → siguiente POI
 *   5. Devolvemos el plan listo para mostrar y para checkout en secuencia
 *
 * DURACIÓN DE VISITA (estimada por categoría de POI):
 *   museum / gallery   → 90 min
 *   monument           → 45 min
 *   religious          → 30 min
 *   nature / viewpoint → 60 min
 *   market / district  → 60 min
 */
import { queryUpcomingTrains } from './gtfsDatabase';
import TOURIST_POIS, { POIS_BY_CITY } from '../data/touristPOIs';
import type { TrainService, Station } from '../types';
import type { TouristPOI } from '../data/touristPOIs';

// ── Tipos del planner ─────────────────────────────────────────────────────────
export type POICategory = 'museum' | 'gallery' | 'monument' | 'religious' | 'nature' | 'viewpoint' | 'market' | 'district' | 'other';

export interface DayStop {
  type:          'poi' | 'train' | 'walk';
  // POI stop
  poi?:          TouristPOI;
  arriveAt?:     Date;
  departAt?:     Date;
  visitMinutes?: number;
  // Train leg
  train?:        TrainService;
  // Walk leg
  walkMinutes?:  number;
  fromName?:     string;
  toName?:       string;
}

export interface DayPlan {
  city:        string;
  date:        Date;
  stops:       DayStop[];
  totalTrains: number;
  estCostEur:  number;
  firstTrain:  Date | null;
  lastTrain:   Date | null;
}

// Tiempo de visita en minutos por categoría
const VISIT_DURATION: Record<string, number> = {
  museum:    90,
  gallery:   90,
  monument:  45,
  religious: 30,
  nature:    60,
  viewpoint: 45,
  market:    60,
  district:  60,
  other:     45,
};

// ── Ciudades disponibles ──────────────────────────────────────────────────────
export function getAvailableCities(): string[] {
  return Object.keys(POIS_BY_CITY).sort();
}

// ── Constructor de plan ───────────────────────────────────────────────────────
export async function buildDayPlan(
  city:      string,
  date:      Date,
  maxStops:  number = 4,
  startHour: number = 9,
): Promise<DayPlan> {
  const cityPOIs = (POIS_BY_CITY[city] ?? []).slice(0, maxStops + 1);

  if (cityPOIs.length === 0) {
    return { city, date, stops: [], totalTrains: 0, estCostEur: 0, firstTrain: null, lastTrain: null };
  }

  const stops: DayStop[]    = [];
  let   cursor               = new Date(date);
  cursor.setHours(startHour, 0, 0, 0);

  let totalTrains = 0;
  let estCost     = 0;
  let firstTrain: Date | null = null;
  let lastTrain:  Date | null = null;

  for (let i = 0; i < cityPOIs.length; i++) {
    const poi         = cityPOIs[i];
    const visitMins   = VISIT_DURATION[poi.category] ?? 45;
    const arriveAt    = new Date(cursor);
    const departAt    = new Date(cursor.getTime() + visitMins * 60_000);

    // Agregar POI stop
    stops.push({
      type:         'poi',
      poi,
      arriveAt,
      departAt,
      visitMinutes: visitMins,
    });

    cursor = departAt;

    // Si hay un POI siguiente → agregar tren + caminata
    if (i < cityPOIs.length - 1) {
      const nextPOI = cityPOIs[i + 1];

      // Caminata hasta la estación de salida
      const walkToStation = poi.nearestStation.walkMinutes;
      stops.push({
        type:        'walk',
        walkMinutes: walkToStation,
        fromName:    poi.name,
        toName:      poi.nearestStation.name,
      });
      cursor = new Date(cursor.getTime() + walkToStation * 60_000);

      // Buscar tren disponible desde la estación del POI actual a la del siguiente
      const trains = await queryUpcomingTrains(
        poi.nearestStation.id,
        6,
        cursor,
      ).catch(() => [] as TrainService[]);

      const viableTrain = trains.find(t =>
        t.destination.id === nextPOI.nearestStation.id ||
        t.destination.name.toLowerCase().includes(nextPOI.nearestStation.name.toLowerCase()),
      ) ?? trains[0]; // fallback: primer tren disponible

      if (viableTrain) {
        stops.push({ type: 'train', train: viableTrain });
        cursor     = new Date(viableTrain.arrivalTime.getTime());
        estCost   += viableTrain.priceEur ?? 8; // estimado si no hay precio
        totalTrains++;
        if (!firstTrain) firstTrain = viableTrain.departureTime;
        lastTrain = viableTrain.departureTime;
      } else {
        // Sin tren → solo caminata estimada entre POIs
        const walkBetween = 20;
        stops.push({ type: 'walk', walkMinutes: walkBetween, fromName: poi.name, toName: nextPOI.name });
        cursor = new Date(cursor.getTime() + walkBetween * 60_000);
      }

      // Caminata desde estación al siguiente POI
      const walkFromStation = nextPOI.nearestStation.walkMinutes;
      stops.push({
        type:        'walk',
        walkMinutes: walkFromStation,
        fromName:    nextPOI.nearestStation.name,
        toName:      nextPOI.name,
      });
      cursor = new Date(cursor.getTime() + walkFromStation * 60_000);
    }
  }

  return { city, date, stops, totalTrains, estCostEur: Math.round(estCost), firstTrain, lastTrain };
}

// ── Formato de hora ───────────────────────────────────────────────────────────
export function formatTime(date: Date | undefined): string {
  if (!date) return '--:--';
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}
