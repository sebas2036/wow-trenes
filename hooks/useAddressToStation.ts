/**
 * useAddressToStation — Geocoding de dirección → estación más cercana
 *
 * Flujo:
 *   1. Usuario escribe dirección ("Gran Vía 28, Madrid")
 *   2. expo-location.geocodeAsync()  → lat/lon  (usa geocoder nativo del SO)
 *   3. findNearestStation(coords)    → estación más próxima en el DB activo
 *   4. Retorna la estación + distancia en metros + walking minutes
 *
 * Sin API key externa. Sin datos en cloud. 100% local.
 *
 * Limitaciones del geocoder nativo:
 *   - iOS: usa Apple Maps (offline parcial)
 *   - Android: usa Google Maps Geocoding (requiere conexión)
 *   - Precisión barrial — suficiente para encontrar la estación más cercana
 */
import { useState, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { findNearestStation } from '../services/gtfsDatabase';
import type { Station, Coordinates } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────
export type AddressSearchStatus =
  | 'idle'
  | 'geocoding'    // convirtiendo texto → coords
  | 'searching'    // buscando estación más cercana en GTFS
  | 'found'
  | 'not_found'    // geocoding no devolvió coords
  | 'error';

export interface AddressSearchResult {
  station:           Station;
  resolvedAddress:   string;   // dirección normalizada por el geocoder
  resolvedCoords:    Coordinates;
  distanceMeters:    number;
  walkMinutes:       number;   // estimado: 80m/min caminata promedio
}

export interface UseAddressToStationReturn {
  status:    AddressSearchStatus;
  result:    AddressSearchResult | null;
  error:     string | null;
  search:    (address: string, countryHint?: string) => Promise<void>;
  clear:     () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const WALK_SPEED_MPM = 80; // metros por minuto (≈ 4.8 km/h)

// ── Distance helper ───────────────────────────────────────────────────────────
function haversineMeters(a: Coordinates, b: Coordinates): number {
  const R  = 6_371_000; // Radio Tierra en metros
  const φ1 = (a.latitude  * Math.PI) / 180;
  const φ2 = (b.latitude  * Math.PI) / 180;
  const Δφ = ((b.latitude  - a.latitude)  * Math.PI) / 180;
  const Δλ = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x  = Math.sin(Δφ / 2) ** 2
            + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useAddressToStation(): UseAddressToStationReturn {
  const [status, setStatus] = useState<AddressSearchStatus>('idle');
  const [result, setResult] = useState<AddressSearchResult | null>(null);
  const [error,  setError]  = useState<string | null>(null);
  const abortRef = useRef(false);

  const clear = useCallback(() => {
    abortRef.current = true;
    setStatus('idle');
    setResult(null);
    setError(null);
  }, []);

  const search = useCallback(async (
    address: string,
    countryHint?: string,   // ISO-2 country code para mejorar precisión del geocoder
  ) => {
    const trimmed = address.trim();
    if (!trimmed) return;

    abortRef.current = false;
    setStatus('geocoding');
    setResult(null);
    setError(null);

    // ── 1. Solicitar permiso de ubicación (necesario para geocodeAsync en iOS) ──
    const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
    if (permStatus !== 'granted') {
      setStatus('error');
      setError('Permisos de ubicación requeridos para el geocoding.');
      return;
    }

    // ── 2. Geocodificar la dirección ─────────────────────────────────────────
    let geoResults: Location.LocationGeocodedLocation[];
    try {
      geoResults = await Location.geocodeAsync(trimmed);
    } catch (e) {
      if (abortRef.current) return;
      setStatus('error');
      setError('No se pudo geocodificar la dirección. Comprueba tu conexión.');
      return;
    }

    if (abortRef.current) return;

    if (!geoResults || geoResults.length === 0) {
      setStatus('not_found');
      setError('Dirección no encontrada. Intenta con más detalle.');
      return;
    }

    const geo = geoResults[0];
    const resolvedCoords: Coordinates = {
      latitude:  geo.latitude,
      longitude: geo.longitude,
    };

    // Construir dirección normalizada a partir del geocoder result
    const parts = [
      geo.name,
      geo.street,
      geo.city,
      geo.region,
      countryHint,
    ].filter(Boolean);
    const resolvedAddress = parts.join(', ') || trimmed;

    // ── 3. Buscar estación más cercana en el DB activo ───────────────────────
    setStatus('searching');

    let station: Station | null = null;
    try {
      station = await findNearestStation(resolvedCoords);
    } catch (e) {
      if (abortRef.current) return;
      setStatus('error');
      setError('Error al consultar la base de datos de estaciones.');
      return;
    }

    if (abortRef.current) return;

    if (!station) {
      setStatus('not_found');
      setError('No se encontraron estaciones cercanas a esa dirección.');
      return;
    }

    // ── 4. Calcular distancia y tiempo de caminata ───────────────────────────
    const distanceMeters = haversineMeters(resolvedCoords, station.coordinates);
    const walkMinutes    = Math.ceil(distanceMeters / WALK_SPEED_MPM);

    setResult({ station, resolvedAddress, resolvedCoords, distanceMeters, walkMinutes });
    setStatus('found');
  }, []);

  return { status, result, error, search, clear };
}
