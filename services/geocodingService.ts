/**
 * geocodingService — Reverse geocoding con Google Geocoding API
 * Convierte coordenadas GPS en nombre de lugar legible.
 * "40.4234, -3.6821" → "Puerta del Sol, Madrid"
 */

const API_KEY = 'AIzaSyDmuX0_mdkwyyzHnlPXYr9xb7erUzRsc2M';
const BASE    = 'https://maps.googleapis.com/maps/api/geocode/json';

// Caché en memoria — evita llamadas repetidas si el usuario no se movió
let cache: { lat: number; lon: number; result: string; ts: number } | null = null;
const CACHE_TTL_MS  = 60_000; // 1 minuto
const CACHE_DIST_M  = 50;     // si se movió menos de 50m, usar caché

function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/**
 * getPlaceName — devuelve el nombre del lugar donde está el usuario.
 * Prioriza: establecimiento > punto de interés > calle + ciudad
 *
 * Ejemplos:
 *   "Hotel Marriott Valencia"
 *   "Puerto de Valencia"
 *   "Calle Colón 12, Valencia"
 *   "Hauptbahnhof, Bern"
 */
export async function getPlaceName(lat: number, lon: number): Promise<string> {
  // Usar caché si el usuario no se movió significativamente
  const now = Date.now();
  if (cache && (now - cache.ts) < CACHE_TTL_MS) {
    const dist = distanceM(lat, lon, cache.lat, cache.lon);
    if (dist < CACHE_DIST_M) return cache.result;
  }

  try {
    const url = `${BASE}?latlng=${lat},${lon}&key=${API_KEY}&language=es&result_type=establishment|point_of_interest|street_address`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    if (data.status !== 'OK' || !data.results?.length) {
      return formatFallback(lat, lon);
    }

    // Buscar el nombre más descriptivo
    const name = extractBestName(data.results);

    cache = { lat, lon, result: name, ts: now };
    return name;
  } catch (e) {
    console.warn('[Geocoding] Error:', e);
    return formatFallback(lat, lon);
  }
}

function extractBestName(results: any[]): string {
  // 1. Establecimiento con nombre propio (hotel, restaurante, estación)
  for (const r of results) {
    const types: string[] = r.types ?? [];
    if (
      types.includes('establishment') ||
      types.includes('lodging') ||
      types.includes('point_of_interest') ||
      types.includes('transit_station')
    ) {
      const name = r.address_components?.[0]?.long_name;
      if (name && name.length > 3) return name;
    }
  }

  // 2. Dirección de calle + ciudad
  const street = results[0];
  if (street) {
    const components = street.address_components ?? [];
    const streetNum  = components.find((c: any) => c.types.includes('street_number'))?.long_name ?? '';
    const streetName = components.find((c: any) => c.types.includes('route'))?.long_name ?? '';
    const city       = components.find((c: any) =>
      c.types.includes('locality') || c.types.includes('administrative_area_level_2')
    )?.long_name ?? '';

    if (streetName && city) return `${streetName}${streetNum ? ' ' + streetNum : ''}, ${city}`;
    if (city) return city;
  }

  return results[0]?.formatted_address?.split(',')[0] ?? 'Tu ubicación';
}

function formatFallback(lat: number, lon: number): string {
  return `${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E`;
}
