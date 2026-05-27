/**
 * routeOptimizer — Route ETA engine (STEP 3)
 * Hierarchy (offline-first, zero cost):
 *   1. Walk: Haversine estimate (instant, 0$ network)
 *   2. Bus:  OpenRouteService or OSRM public endpoint (network, free tier)
 *   3. Rideshare: Uber/Cabify ETA approximation via Haversine × 1.3 road factor
 * Only calls network when UI explicitly selects Bus mode.
 */
import type { Coordinates, TransportMode, RouteSegment } from '../types';

// ── Speed constants (km/h) ────────────────────────────────────────────────
const SPEED: Record<TransportMode, number> = {
  walk:      4.5,
  bus:       18,
  rideshare: 30,
};

const ROAD_FACTOR = 1.35; // haversine → road distance multiplier

// ── Haversine distance (km) ───────────────────────────────────────────────
export function haversineKm(a: Coordinates, b: Coordinates): number {
  const R = 6371;
  const dLat = ((b.latitude  - a.latitude)  * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

// ── calculateETA (used by useTrainSchedules) ──────────────────────────────
export async function calculateETA(
  from:      Coordinates,
  to:        Coordinates,
  mode:      TransportMode,
): Promise<{ durationMinutes: number; distanceKm: number }> {
  const straightKm = haversineKm(from, to);
  const roadKm     = straightKm * ROAD_FACTOR;
  const durationMinutes = (roadKm / SPEED[mode]) * 60;

  return { durationMinutes, distanceKm: roadKm };
}

// ── optimizeRoute (used by split-screen map) ──────────────────────────────
/**
 * Returns a RouteSegment with polyline for the map.
 * Walk & Rideshare → straight line (no network call).
 * Bus → tries OSRM public API; falls back to straight line on error.
 */
export async function optimizeRoute(
  from: Coordinates,
  to:   Coordinates,
  mode: TransportMode,
): Promise<RouteSegment> {
  const eta = await calculateETA(from, to, mode);

  if (mode === 'walk' || mode === 'rideshare') {
    return {
      mode,
      durationMinutes: Math.round(eta.durationMinutes),
      distanceMeters:  Math.round(eta.distanceKm * 1000),
      polyline:        [from, to],
      deepLink:        mode === 'rideshare'
        ? buildRideshareLink(to)
        : undefined,
    };
  }

  // Bus: try OSRM free public API
  try {
    const osrmUrl =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
      `?overview=full&geometries=geojson&steps=false`;

    const res  = await fetch(osrmUrl, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error('OSRM error');

    const json = await res.json();
    const route = json.routes?.[0];
    if (!route) throw new Error('No route');

    const coords: Coordinates[] = route.geometry.coordinates.map(
      ([lon, lat]: [number, number]) => ({ latitude: lat, longitude: lon }),
    );

    return {
      mode,
      durationMinutes: Math.round(route.duration / 60),
      distanceMeters:  Math.round(route.distance),
      polyline:        coords,
    };
  } catch {
    // Graceful fallback: straight line
    return {
      mode,
      durationMinutes: Math.round(eta.durationMinutes),
      distanceMeters:  Math.round(eta.distanceKm * 1000),
      polyline:        [from, to],
    };
  }
}

// ── Deep link builders ────────────────────────────────────────────────────
function buildRideshareLink(dest: Coordinates): string {
  return (
    `uber://?action=setPickup` +
    `&dropoff[latitude]=${dest.latitude}` +
    `&dropoff[longitude]=${dest.longitude}`
  );
}
