/**
 * routeOptimizer — Route ETA engine
 * Walk/Transit → Google Directions API (real streets/transit)
 * Rideshare    → Haversine estimate + Uber deeplink
 */
import type { Coordinates, TransportMode, RouteSegment } from '../types';

const GMAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ?? '';

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

// ── Google Directions API ─────────────────────────────────────────────────
async function fetchGoogleDirections(
  from: Coordinates,
  to:   Coordinates,
  travelMode: 'walking' | 'transit',
): Promise<{ polyline: Coordinates[]; durationMinutes: number; distanceMeters: number } | null> {
  if (!GMAPS_KEY) return null;
  try {
    const url =
      `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${from.latitude},${from.longitude}` +
      `&destination=${to.latitude},${to.longitude}` +
      `&mode=${travelMode}` +
      `&key=${GMAPS_KEY}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;

    const json = await res.json();
    if (json.status !== 'OK') return null;

    const leg = json.routes?.[0]?.legs?.[0];
    if (!leg) return null;

    // Decodificar polyline encoded de Google
    const encoded: string = json.routes[0].overview_polyline.points;
    const coords = decodePolyline(encoded);

    return {
      polyline:        coords,
      durationMinutes: Math.round(leg.duration.value / 60),
      distanceMeters:  leg.distance.value,
    };
  } catch {
    return null;
  }
}

// Decoder del formato polyline encoded de Google
function decodePolyline(encoded: string): Coordinates[] {
  const coords: Coordinates[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b: number, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return coords;
}

// ── optimizeRoute (used by split-screen map) ──────────────────────────────
export async function optimizeRoute(
  from: Coordinates,
  to:   Coordinates,
  mode: TransportMode,
): Promise<RouteSegment> {
  const eta = await calculateETA(from, to, mode);

  if (mode === 'rideshare') {
    return {
      mode,
      durationMinutes: Math.round(eta.durationMinutes),
      distanceMeters:  Math.round(eta.distanceKm * 1000),
      polyline:        [from, to],
      deepLink:        buildRideshareLink(to),
    };
  }

  // Walk → Google Directions walking
  if (mode === 'walk') {
    const google = await fetchGoogleDirections(from, to, 'walking');
    if (google) return { mode, ...google };
    // Fallback línea recta
    return { mode, durationMinutes: Math.round(eta.durationMinutes), distanceMeters: Math.round(eta.distanceKm * 1000), polyline: [from, to] };
  }

  // Bus → Google Directions transit
  const google = await fetchGoogleDirections(from, to, 'transit');
  if (google) return { mode, ...google };
  // Fallback línea recta
  return { mode, durationMinutes: Math.round(eta.durationMinutes), distanceMeters: Math.round(eta.distanceKm * 1000), polyline: [from, to] };
}

// ── Deep link builders ────────────────────────────────────────────────────
function buildRideshareLink(dest: Coordinates): string {
  return (
    `uber://?action=setPickup` +
    `&dropoff[latitude]=${dest.latitude}` +
    `&dropoff[longitude]=${dest.longitude}`
  );
}
