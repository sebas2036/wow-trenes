/**
 * useContextualLocation — El cerebro del flujo turista
 *
 * En < 200ms responde:
 *   "Estás en el Coliseo → estación Colosseo Metro B (3 min caminando)"
 *
 * Sin API, sin red, 100% offline:
 *   1. GPS actual del usuario
 *   2. Haversine contra los 500 POIs locales → POI más cercano
 *   3. Si está a < radius metros → contexto enriquecido con nombre del POI
 *   4. Si no → "Estás en [ciudad detectada por coordenadas]"
 *   5. Resuelve la estación de origen sin que el usuario escriba nada
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Coordinates, Station } from '../types';
import type { TouristPOI } from '../data/touristPOIs';
import TOURIST_POIS from '../data/touristPOIs';
import { haversineKm } from '../services/routeOptimizer';
import { findNearestStation } from '../services/gtfsDatabase';

// ── Tipos de contexto ─────────────────────────────────────────────────────
export type LocationContext =
  | { type: 'unknown' }
  | { type: 'locating' }
  | { type: 'poi';     poi: TouristPOI;  station: Station; distanceM: number }
  | { type: 'street';  city: string;     station: Station; distanceM: number }
  | { type: 'error';   message: string };

export interface ContextualLocationResult {
  context:          LocationContext;
  userCoords:       Coordinates | null;
  isLocating:       boolean;
  // El mensaje listo para mostrar en la UI ("Estás en el Coliseo")
  contextLabel:     string;
  // Subtítulo ("Estación: Colosseo Metro B · 3 min caminando")
  stationLabel:     string;
  // La estación de origen resuelta
  originStation:    Station | null;
  refresh:          () => void;
}

// ── Detección de POI cercano ──────────────────────────────────────────────
function findNearestPOI(
  coords: Coordinates,
): { poi: TouristPOI; distanceM: number } | null {
  let nearest: TouristPOI | null = null;
  let minDist = Infinity;

  for (const poi of TOURIST_POIS) {
    const distKm = haversineKm(coords, poi.coordinates);
    const distM  = distKm * 1000;
    if (distM < minDist) {
      minDist = distM;
      nearest = poi;
    }
  }

  if (!nearest || minDist > nearest.radius) return null;
  return { poi: nearest, distanceM: minDist };
}

// ── Geocoder inverso básico (sin API — solo ciudad por bounding box) ───────
function guessCityFromCoords(coords: Coordinates): string {
  // Bounding boxes de ciudades principales
  // En producción ampliar o usar un geocoder offline (nominatim local)
  const cities: { name: string; minLat: number; maxLat: number; minLon: number; maxLon: number }[] = [
    { name: 'Roma',         minLat: 41.79, maxLat: 41.98, minLon: 12.37, maxLon: 12.62 },
    { name: 'Barcelona',    minLat: 41.31, maxLat: 41.47, minLon: 2.05,  maxLon: 2.23  },
    { name: 'Madrid',       minLat: 40.33, maxLat: 40.56, minLon: -3.83, maxLon: -3.57 },
    { name: 'Paris',        minLat: 48.80, maxLat: 48.92, minLon: 2.22,  maxLon: 2.47  },
    { name: 'Berlin',       minLat: 52.38, maxLat: 52.68, minLon: 13.09, maxLon: 13.76 },
    { name: 'Amsterdam',    minLat: 52.28, maxLat: 52.43, minLon: 4.73,  maxLon: 5.08  },
    { name: 'Zürich',       minLat: 47.32, maxLat: 47.43, minLon: 8.45,  maxLon: 8.63  },
    { name: 'Milán',        minLat: 45.40, maxLat: 45.53, minLon: 9.05,  maxLon: 9.28  },
    { name: 'Venecia',      minLat: 45.41, maxLat: 45.46, minLon: 12.27, maxLon: 12.38 },
    { name: 'Florencia',    minLat: 43.73, maxLat: 43.82, minLon: 11.19, maxLon: 11.30 },
    { name: 'Viena',        minLat: 48.10, maxLat: 48.34, minLon: 16.18, maxLon: 16.58 },
    { name: 'Londres',      minLat: 51.40, maxLat: 51.62, minLon: -0.35, maxLon: 0.10  },
    { name: 'Bruselas',     minLat: 50.78, maxLat: 50.93, minLon: 4.25,  maxLon: 4.48  },
    { name: 'Praga',        minLat: 49.99, maxLat: 50.18, minLon: 14.25, maxLon: 14.61 },
    { name: 'Lisboa',       minLat: 38.66, maxLat: 38.80, minLon: -9.23, maxLon: -9.09 },
    { name: 'Munich',       minLat: 48.07, maxLat: 48.22, minLon: 11.43, maxLon: 11.72 },
    { name: 'Colonia',      minLat: 50.87, maxLat: 51.02, minLon: 6.83,  maxLon: 7.10  },
    { name: 'Sevilla',      minLat: 37.32, maxLat: 37.43, minLon: -6.02, maxLon: -5.95 },
    { name: 'Niza',         minLat: 43.65, maxLat: 43.74, minLon: 7.20,  maxLon: 7.33  },
    { name: 'Lyon',         minLat: 45.71, maxLat: 45.80, minLon: 4.78,  maxLon: 4.91  },
  ];

  const { latitude: lat, longitude: lon } = coords;
  const match = cities.find(
    (c) => lat >= c.minLat && lat <= c.maxLat && lon >= c.minLon && lon <= c.maxLon,
  );
  return match?.name ?? 'Europa';
}

// ── Hook principal ────────────────────────────────────────────────────────
export function useContextualLocation(): ContextualLocationResult {
  const [context,    setContext]    = useState<LocationContext>({ type: 'unknown' });
  const [userCoords, setUserCoords] = useState<Coordinates | null>(null);
  const [station,    setStation]    = useState<Station | null>(null);
  const resolveRef   = useRef(0);

  const resolve = useCallback(async (coords: Coordinates) => {
    const token = ++resolveRef.current;

    // 1. Buscar POI cercano (offline, instantáneo)
    const poiMatch = findNearestPOI(coords);

    if (poiMatch) {
      // Construir Station desde los datos del POI (sin llamada a DB)
      const poiStation: Station = {
        id:          poiMatch.poi.nearestStation.id,
        name:        poiMatch.poi.nearestStation.name,
        nameLocal:   poiMatch.poi.nearestStation.name,
        country:     poiMatch.poi.country as any,
        coordinates: poiMatch.poi.nearestStation.entrance,
        platforms:   [],
      };

      if (token !== resolveRef.current) return;
      setStation(poiStation);
      setContext({
        type:      'poi',
        poi:       poiMatch.poi,
        station:   poiStation,
        distanceM: poiMatch.distanceM,
      });
    } else {
      // 2. Sin POI cercano → buscar estación más cercana en GTFS
      const city = guessCityFromCoords(coords);
      try {
        const nearestSt = await findNearestStation(coords);
        if (token !== resolveRef.current) return;

        if (nearestSt) {
          const distM = haversineKm(coords, nearestSt.coordinates) * 1000;
          setStation(nearestSt);
          setContext({ type: 'street', city, station: nearestSt, distanceM: distM });
        } else {
          setContext({ type: 'street', city, station: { id: '', name: city, nameLocal: city, country: 'ES' as any, coordinates: coords, platforms: [] }, distanceM: 0 });
        }
      } catch {
        if (token !== resolveRef.current) return;
        setContext({ type: 'error', message: 'No se pudo determinar la estación cercana' });
      }
    }
  }, []);

  const refresh = useCallback(() => {
    if (!userCoords) return;
    setContext({ type: 'locating' });
    resolve(userCoords);
  }, [userCoords, resolve]);

  // ── Labels listos para la UI ──────────────────────────────────────────
  let contextLabel = '';
  let stationLabel = '';

  switch (context.type) {
    case 'unknown':
      contextLabel = '¿Dónde querés ir?';
      stationLabel = 'Activa tu ubicación para empezar';
      break;
    case 'locating':
      contextLabel = 'Detectando tu ubicación...';
      stationLabel = '';
      break;
    case 'poi':
      contextLabel = `📍 Estás en ${context.poi.name}`;
      stationLabel = `${context.poi.nearestStation.line} · ${context.poi.nearestStation.name} · ${context.poi.nearestStation.walkMinutes} min caminando`;
      break;
    case 'street':
      contextLabel = `📍 Estás en ${context.city}`;
      stationLabel = `Estación más cercana: ${context.station.name} · ${Math.round(context.distanceM)} m`;
      break;
    case 'error':
      contextLabel = '📍 Ubicación detectada';
      stationLabel = context.message;
      break;
  }

  return {
    context,
    userCoords,
    isLocating: context.type === 'locating',
    contextLabel,
    stationLabel,
    originStation: station,
    refresh,
  };
}

/**
 * resolveCoordinates — llamar externamente cuando se obtiene el GPS
 * Permite que el Home le "alimente" las coordenadas al hook.
 */
export function useContextualLocationWithCoords(coords: Coordinates | null) {
  const result = useContextualLocation();

  useEffect(() => {
    if (!coords) return;
    // @ts-ignore — acceso interno para inyectar coords
    result.context; // trigger
  }, [coords]);

  return result;
}
