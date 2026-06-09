/**
 * geocodingService — Reverse geocoding con Google Geocoding API
 * Convierte coordenadas GPS en un lugar legible y detecta con precisión el país/ciudad.
 */

const API_KEY = 'AIzaSyDmuX0_mdkwyyzHnlPXYr9xb7erUzRsc2M';
const BASE    = 'https://maps.googleapis.com/maps/api/geocode/json';

interface LocationContext {
  placeName: string;
  city: string;
  country: string;
}

// Caché en memoria para evitar llamadas repetidas
let cache: { lat: number; lon: number; result: LocationContext; ts: number } | null = null;
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
 * getLocationContext — Obtiene el nombre del lugar, la ciudad y el país exacto.
 */
export async function getLocationContext(lat: number, lon: number): Promise<LocationContext> {
  const now = Date.now();
  if (cache && (now - cache.ts) < CACHE_TTL_MS) {
    const dist = distanceM(lat, lon, cache.lat, cache.lon);
    if (dist < CACHE_DIST_M) return cache.result;
  }

  try {
    // Ampliamos el result_type para incluir datos políticos y geográficos más amplios en fronteras
    const url = `${BASE}?latlng=${lat},${lon}&key=${API_KEY}&language=es&result_type=establishment|point_of_interest|street_address|locality|political`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    if (data.status !== 'OK' || !data.results?.length) {
      return fallbackContext(lat, lon);
    }

    // Procesar todos los componentes para no errar de país/ciudad
    const context = extractLocationContext(data.results);
    
    cache = { lat, lon, result: context, ts: now };
    return context;
  } catch (e) {
    console.warn('[Geocoding] Error:', e);
    return fallbackContext(lat, lon);
  }
}

/**
 * Mantenemos la función vieja adaptada para no romper ninguna pantalla que dependa de ella
 */
export async function getPlaceName(lat: number, lon: number): Promise<string> {
  const context = await getLocationContext(lat, lon);
  return context.placeName;
}

function extractLocationContext(results: any[]): LocationContext {
  let country = '';
  let city = '';
  let placeName = '';

  // 1. Buscar país y ciudad recorriendo los componentes de dirección de Google
  for (const r of results) {
    const components = r.address_components ?? [];
    
    if (!country) {
      const cComp = components.find((c: any) => c.types.includes('country'));
      if (cComp) country = cComp.long_name;
    }
    
    if (!city) {
      const cityComp = components.find((c: any) => 
        c.types.includes('locality') || 
        c.types.includes('administrative_area_level_2') ||
        c.types.includes('administrative_area_level_1')
      );
      if (cityComp) city = cityComp.long_name;
    }
  }

  // 2. Buscar el nombre comercial o de interés más descriptivo para mostrar en la barra
  for (const r of results) {
    const types: string[] = r.types ?? [];
    if (
      types.includes('establishment') ||
      types.includes('point_of_interest') ||
      types.includes('transit_station')
    ) {
      const name = r.address_components?.[0]?.long_name;
      if (name && name.length > 3) {
        placeName = name;
        break;
      }
    }
  }

  // Si no hay nombre de fantasía, armar Calle + Ciudad
  if (!placeName && results[0]) {
    const components = results[0].address_components ?? [];
    const streetName = components.find((c: any) => c.types.includes('route'))?.long_name ?? '';
    const streetNum  = components.find((c: any) => c.types.includes('street_number'))?.long_name ?? '';
    if (streetName) {
      placeName = `${streetName}${streetNum ? ' ' + streetNum : ''}`;
    } else {
      placeName = city || 'Tu ubicación';
    }
  }

  return {
    placeName: placeName || 'Tu ubicación',
    city: city || 'Desconocido',
    country: country || 'Desconocido'
  };
}

function fallbackContext(lat: number, lon: number): LocationContext {
  const coordString = `${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E`;
  return {
    placeName: coordString,
    city: '',
    country: ''
  };
}
