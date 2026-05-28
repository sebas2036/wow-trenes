/**
 * liveTrainPosition — Posición GPS en tiempo real del tren
 *
 * OPERADORES SOPORTADOS:
 *   🇮🇹 ViaggiaTreno (Trenitalia) — posición GPS real, actualiza cada ~30s
 *   🇨🇭 SBB               — transport.opendata.ch, posición por stop-times
 *   🇳🇱 NS                — departures con delay real
 *   🚇 LA Metro Rail      — Swiftly GTFS-RT JSON (agencyKey: lametro-rail)
 *                           Requiere EXPO_PUBLIC_SWIFTLY_API_KEY (registro gratis en goswift.ly)
 *                           VehiclePositions: cada 5s · TripUpdates: cada 10s
 *   🇩🇪 DB / 🇪🇸 Renfe / 🇫🇷 SNCF — fallback interpolado por horario
 *
 * UX:
 *   El hook devuelve { lat, lon, bearing } → el split-screen muestra
 *   un Marker animado que se mueve en el mapa a medida que el tren avanza.
 *   Si no hay datos reales → interpolación suave entre paradas conocidas.
 *
 * SWIFTLY — otros operadores compatibles (misma API, distinto agencyKey):
 *   lametro-rail, lametro (bus), cta (Chicago, pendiente confirmación)
 *   Ver: https://realtime-docs.goswift.ly/
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { TrainService, Coordinates } from '../types';

const POLL_INTERVAL_MS = 15_000; // 15 segundos
const TIMEOUT_MS       = 6_000;

// ── Resultado del hook ────────────────────────────────────────────────────────
export interface LiveTrainPosition {
  coordinates:  Coordinates | null;
  bearing:      number;        // grados 0-360 para rotar el icono del tren
  delayMinutes: number;
  lastUpdated:  Date | null;
  isLive:       boolean;       // true = datos reales, false = interpolado
  isLoading:    boolean;
}

// ── ViaggiaTreno — Italia ─────────────────────────────────────────────────────
async function fetchViaggiaTreno(service: TrainService): Promise<LiveTrainPosition | null> {
  try {
    // Paso 1: resolver identificador interno
    const searchRes = await fetchSafe(
      `https://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/cercaTreno/${service.trainNumber}`,
    );
    if (!searchRes) return null;

    const trains = JSON.parse(searchRes);
    if (!Array.isArray(trains) || trains.length === 0) return null;

    const [originCode, trainId] = trains[0];

    // Paso 2: posición actual
    const detailRes = await fetchSafe(
      `https://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/andamentoTreno/${originCode}/${trainId}/${Date.now()}`,
    );
    if (!detailRes) return null;

    const detail = JSON.parse(detailRes);

    // Coordenadas actuales (ViaggiaTreno las da directamente)
    const lat  = detail.latitudeE5  ? detail.latitudeE5  / 1e5 : null;
    const lon  = detail.longitudeE5 ? detail.longitudeE5 / 1e5 : null;

    if (!lat || !lon) return interpolateFromStops(detail, service);

    return {
      coordinates:  { latitude: lat, longitude: lon },
      bearing:      detail.compOrarioArrivo ?? 0,
      delayMinutes: detail.ritardo ?? 0,
      lastUpdated:  new Date(),
      isLive:       true,
      isLoading:    false,
    };
  } catch {
    return null;
  }
}

// Interpola posición entre paradas cuando no hay GPS directo
function interpolateFromStops(detail: any, service: TrainService): LiveTrainPosition | null {
  const stops: any[] = detail.fermate ?? [];
  if (stops.length < 2) return null;

  const now = Date.now();

  // Encontrar entre qué dos paradas está el tren ahora mismo
  for (let i = 0; i < stops.length - 1; i++) {
    const curr = stops[i];
    const next = stops[i + 1];

    const currTime = curr.partenzaReale
      ? new Date(curr.partenzaReale).getTime()
      : curr.partenza_teorica
        ? new Date(curr.partenza_teorica).getTime() + (detail.ritardo ?? 0) * 60_000
        : null;

    const nextTime = next.arrivoReale
      ? new Date(next.arrivoReale).getTime()
      : next.arrivo_teorico
        ? new Date(next.arrivo_teorico).getTime() + (detail.ritardo ?? 0) * 60_000
        : null;

    if (!currTime || !nextTime) continue;
    if (now < currTime || now > nextTime) continue;

    // Interpolar posición lineal entre las dos paradas
    const progress = (now - currTime) / (nextTime - currTime);
    const lat1 = curr.lat ?? 0;
    const lon1 = curr.lon ?? 0;
    const lat2 = next.lat ?? 0;
    const lon2 = next.lon ?? 0;

    const lat = lat1 + (lat2 - lat1) * progress;
    const lon = lon1 + (lon2 - lon1) * progress;

    // Calcular bearing entre paradas
    const bearing = calculateBearing(lat1, lon1, lat2, lon2);

    return {
      coordinates:  { latitude: lat, longitude: lon },
      bearing,
      delayMinutes: detail.ritardo ?? 0,
      lastUpdated:  new Date(),
      isLive:       false, // interpolado
      isLoading:    false,
    };
  }

  return null;
}

// ── SBB (Suiza) ───────────────────────────────────────────────────────────────
async function fetchSBBPosition(service: TrainService): Promise<LiveTrainPosition | null> {
  try {
    const res = await fetchSafe(
      `https://transport.opendata.ch/v1/stationboard?station=${encodeURIComponent(service.origin.name)}&limit=30`,
    );
    if (!res) return null;

    const json  = JSON.parse(res);
    const entry = (json?.stationboard ?? []).find((e: any) => e.number === service.trainNumber);
    if (!entry) return null;

    const dep   = new Date(entry.stop?.departure ?? Date.now());
    const ts    = entry.stop?.departureTimestamp ? entry.stop.departureTimestamp * 1000 : Date.now();
    const delay = Math.round((dep.getTime() - new Date(ts).getTime()) / 60_000);

    // SBB no da coordenadas GPS en esta API — interpolamos por horario
    return {
      coordinates:  null, // No disponible en API pública SBB
      bearing:      0,
      delayMinutes: Math.max(0, delay),
      lastUpdated:  new Date(),
      isLive:       false,
      isLoading:    false,
    };
  } catch {
    return null;
  }
}

// ── Swiftly GTFS-RT — LA Metro Rail (+ otros operadores compatibles) ─────────
/**
 * Swiftly provee GTFS-realtime en JSON para muchas agencias US.
 * LA Metro Rail: agencyKey = "lametro-rail"
 *
 * Endpoint VehiclePositions (JSON):
 *   GET https://api.goswift.ly/real-time/{agencyKey}/vehicle-positions.json
 *   Header: Authorization: <SWIFTLY_API_KEY>
 *
 * Endpoint TripUpdates (JSON):
 *   GET https://api.goswift.ly/real-time/{agencyKey}/trip-updates.json
 *   Header: Authorization: <SWIFTLY_API_KEY>
 *
 * Requiere API key gratuita: https://forms.gle/hXGY6kRGAChDqWwz5
 * Configurar en .env.local: EXPO_PUBLIC_SWIFTLY_API_KEY=your_key_here
 */
async function fetchSwiftlyPosition(
  service:    TrainService,
  agencyKey:  string,
): Promise<LiveTrainPosition | null> {
  const apiKey = process.env.EXPO_PUBLIC_SWIFTLY_API_KEY;
  if (!apiKey) return null;   // Fallback silencioso si no hay key configurada

  const headers = { Authorization: apiKey };
  const BASE    = `https://api.goswift.ly/real-time/${agencyKey}`;

  try {
    // ── 1. VehiclePositions — coordenadas GPS en vivo ────────────────────────
    const vpRes = await fetchSafe(`${BASE}/vehicle-positions.json`, headers);
    if (vpRes) {
      const vp = JSON.parse(vpRes);
      const entities: any[] = vp?.entity ?? vp?.response?.entity ?? [];

      // Buscar el vehículo que corresponde al trip del servicio
      const match = entities.find((e: any) => {
        const vehicle = e.vehicle ?? e;
        const tripId  = vehicle?.trip?.tripId ?? '';
        return (
          tripId === service.serviceId ||
          tripId.includes(service.trainNumber)
        );
      });

      if (match) {
        const pos     = match.vehicle?.position ?? match.position;
        const lat     = pos?.latitude  ?? null;
        const lon     = pos?.longitude ?? null;
        const bearing = pos?.bearing   ?? 0;

        if (lat && lon) {
          // ── 2. TripUpdates — delay en tiempo real ────────────────────────
          let delayMinutes = service.delayMinutes;
          const tuRes = await fetchSafe(`${BASE}/trip-updates.json`, headers);
          if (tuRes) {
            const tu = JSON.parse(tuRes);
            const tuEntities: any[] = tu?.entity ?? tu?.response?.entity ?? [];
            const tuMatch = tuEntities.find((e: any) => {
              const trip = e.tripUpdate?.trip ?? e.trip ?? {};
              return trip.tripId === service.serviceId || trip.tripId?.includes(service.trainNumber);
            });
            if (tuMatch) {
              const updates: any[] = tuMatch.tripUpdate?.stopTimeUpdate ?? [];
              // Usar el delay del próximo stop
              const nextStop = updates[0];
              if (nextStop) {
                const rawDelay = nextStop.departure?.delay ?? nextStop.arrival?.delay ?? 0;
                delayMinutes = Math.round(rawDelay / 60);
              }
            }
          }

          return {
            coordinates:  { latitude: lat, longitude: lon },
            bearing,
            delayMinutes,
            lastUpdated:  new Date(),
            isLive:       true,
            isLoading:    false,
          };
        }
      }
    }
  } catch {
    // Swiftly no disponible — fallback a interpolación
  }

  return null;
}

// ── NS (Países Bajos) ────────────────────────────────────────────────────────
async function fetchNSPosition(service: TrainService): Promise<LiveTrainPosition | null> {
  const apiKey = process.env.EXPO_PUBLIC_NS_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetchSafe(
      `https://gateway.apiportal.ns.nl/reisinformatie-api/api/v3/departures?station=${service.origin.id}&lang=es`,
      { 'Ocp-Apim-Subscription-Key': apiKey },
    );
    if (!res) return null;

    const json = JSON.parse(res);
    const dep  = (json?.payload?.departures ?? []).find(
      (d: any) => (d.trainCategory + d.name) === service.trainNumber,
    );
    if (!dep) return null;

    return {
      coordinates:  null,
      bearing:      0,
      delayMinutes: Math.round((dep.delay ?? 0) / 60),
      lastUpdated:  new Date(),
      isLive:       false,
      isLoading:    false,
    };
  } catch {
    return null;
  }
}

// ── Fallback — interpolación pura por horario teórico ─────────────────────────
function buildFallbackPosition(service: TrainService): LiveTrainPosition {
  const now        = Date.now();
  const departure  = service.departureTime.getTime() + service.delayMinutes * 60_000;
  const arrival    = service.arrivalTime.getTime()   + service.delayMinutes * 60_000;
  const totalTime  = arrival - departure;
  const elapsed    = now - departure;
  const progress   = Math.max(0, Math.min(1, elapsed / totalTime));

  // Interpolar entre origen y destino en línea recta
  const lat1 = service.origin.coordinates.latitude;
  const lon1 = service.origin.coordinates.longitude;
  const lat2 = service.destination.coordinates.latitude;
  const lon2 = service.destination.coordinates.longitude;

  const lat     = lat1 + (lat2 - lat1) * progress;
  const lon     = lon1 + (lon2 - lon1) * progress;
  const bearing = calculateBearing(lat1, lon1, lat2, lon2);

  return {
    coordinates:  { latitude: lat, longitude: lon },
    bearing,
    delayMinutes: service.delayMinutes,
    lastUpdated:  new Date(),
    isLive:       false,
    isLoading:    false,
  };
}

// ── Dispatcher ────────────────────────────────────────────────────────────────
async function fetchPosition(service: TrainService): Promise<LiveTrainPosition> {
  let result: LiveTrainPosition | null = null;

  switch (service.operator) {
    case 'trenitalia':
      result = await fetchViaggiaTreno(service);
      break;
    case 'sbb':
      result = await fetchSBBPosition(service);
      break;
    case 'ns':
      result = await fetchNSPosition(service);
      break;
    // ── Swiftly — LA Metro Rail ───────────────────────────────────────────
    // Requiere EXPO_PUBLIC_SWIFTLY_API_KEY en .env.local
    // Registro gratuito: https://forms.gle/hXGY6kRGAChDqWwz5
    case 'la_metro':
      result = await fetchSwiftlyPosition(service, 'lametro-rail');
      break;
    case 'cta':
      // Chicago CTA también usa Swiftly (agencyKey pendiente confirmar)
      result = await fetchSwiftlyPosition(service, 'cta');
      break;
    case 'mta_nyc':
      // MTA NYC publica GTFS-RT propio — integración futura
      // Por ahora usa fallback interpolado
      break;
    // ── TfL — London Underground / Elizabeth / DLR / Overground ─────────────
    // TfL Unified API: https://api.tfl.gov.uk/Line/{lineId}/Arrivals
    // API key gratuita: https://api-portal.tfl.gov.uk/signup
    // Por ahora usa fallback interpolado hasta integrar TfL Unified API
    case 'tfl':
      break;
    // ── UK National Rail ─────────────────────────────────────────────────────
    // Darwin PUSH Port / OpenLDBWS — requiere registro Network Rail
    // https://opendata.nationalrail.co.uk/ → Real-Time Darwin
    // Por ahora usa fallback interpolado
    case 'avanti':
    case 'lner':
    case 'gwr':
      break;
    default:
      break;
  }

  return result ?? buildFallbackPosition(service);
}

// ── Hook principal ────────────────────────────────────────────────────────────
/**
 * useLiveTrainPosition — devuelve la posición GPS actualizada del tren.
 *
 * @param service  El tren seleccionado por el usuario
 * @param enabled  Si false, detiene el polling (pantalla en background, etc.)
 */
export function useLiveTrainPosition(
  service: TrainService | null,
  enabled: boolean = true,
): LiveTrainPosition {
  const [position, setPosition] = useState<LiveTrainPosition>({
    coordinates:  null,
    bearing:      0,
    delayMinutes: 0,
    lastUpdated:  null,
    isLive:       false,
    isLoading:    false,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted   = useRef(true);

  const poll = useCallback(async () => {
    if (!service || !enabled) return;

    // Solo monitorear si el tren sale en las próximas 3 horas o ya salió
    const minsToDepart = (service.departureTime.getTime() - Date.now()) / 60_000;
    if (minsToDepart > 180) return;

    // No monitorear si ya llegó hace más de 30 min
    const minsAfterArrival = (Date.now() - service.arrivalTime.getTime()) / 60_000;
    if (minsAfterArrival > 30) return;

    const pos = await fetchPosition(service);
    if (isMounted.current) setPosition(pos);
  }, [service, enabled]);

  useEffect(() => {
    if (!service || !enabled) return;

    isMounted.current = true;
    setPosition(p => ({ ...p, isLoading: true }));

    // Primera consulta inmediata
    poll();

    // Polling cada 15 segundos
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      isMounted.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [service?.serviceId, enabled, poll]);

  return position;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => d * Math.PI / 180;
  const dLon  = toRad(lon2 - lon1);
  const y     = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x     = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2))
              - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

async function fetchSafe(url: string, headers?: Record<string, string>): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}
