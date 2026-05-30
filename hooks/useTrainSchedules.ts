/**
 * useTrainSchedules — Predictive Clock Engine (STEP 2)
 * 1. Reads static GTFS from SQLite (instant, offline, 0$ cost)
 * 2. In background thread, fetches real-time deltas from operator APIs
 * 3. Merges result and emits PredictiveClock array with ArrivalStatus coloring
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { TrainService, PredictiveClock, ArrivalStatus, Coordinates, TransportMode } from '../types';
import { queryUpcomingTrains } from '../services/gtfsDatabase';
import { fetchRealTimeUpdate } from '../services/railApi';
import { calculateETA }        from '../services/routeOptimizer';

// ── Safe-margin thresholds (minutes) ──────────────────────────────────────
// < 5 min buffer  → DANGER  (red)
// 5–15 min buffer → WARN    (yellow)
// > 15 min buffer → SAFE    (green)
const DANGER_THRESHOLD = 5;
const WARN_THRESHOLD   = 15;

function computeStatus(bufferMinutes: number): ArrivalStatus {
  if (bufferMinutes < DANGER_THRESHOLD) return 'danger';
  if (bufferMinutes < WARN_THRESHOLD)   return 'warn';
  return 'safe';
}

interface UseTrainSchedulesOptions {
  stationId:     string;
  userLocation:  Coordinates | null;
  transportMode: TransportMode;
  maxResults?:   number;
}

interface UseTrainSchedulesReturn {
  clocks:    PredictiveClock[];
  isLoading: boolean;
  isLive:    boolean; // true once real-time has at least one update
  error:     string | null;
  refresh:   () => void;
}

export function useTrainSchedules({
  stationId,
  userLocation,
  transportMode,
  maxResults = 3,
}: UseTrainSchedulesOptions): UseTrainSchedulesReturn {
  const [clocks,    setClocks]    = useState<PredictiveClock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLive,    setIsLive]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const refreshToken = useRef(0);
  const bgIntervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const gtfsIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Build clocks from static + optional live delta ──────────────────────
  const buildClocks = useCallback(
    async (services: TrainService[], liveMap: Map<string, number>): Promise<PredictiveClock[]> => {
      const now = Date.now();
      return Promise.all(
        services.slice(0, maxResults).map(async (svc) => {
          // Apply live delay if available
          const delayMs = (liveMap.get(svc.serviceId) ?? svc.delayMinutes) * 60_000;
          const adjustedDeparture = new Date(svc.departureTime.getTime() + delayMs);

          // Get ETA from location to platform (routeOptimizer: offline-first)
          let walkMinutes = 0;
          if (userLocation) {
            try {
              const eta = await calculateETA(
                userLocation,
                svc.destination.coordinates,
                transportMode,
              );
              walkMinutes = eta.durationMinutes;
            } catch {
              walkMinutes = 15; // fallback estimate
            }
          }

          const minutesToDepart = (adjustedDeparture.getTime() - now) / 60_000;
          const bufferMinutes   = minutesToDepart - walkMinutes;

          return {
            train:         { ...svc, departureTime: adjustedDeparture },
            walkMinutes,
            bufferMinutes,
            status:        computeStatus(bufferMinutes),
            transportMode,
          } satisfies PredictiveClock;
        }),
      );
    },
    [maxResults, userLocation, transportMode],
  );

  // ── Main loader: static GTFS first, then background live patch ──────────
  const load = useCallback(async () => {
    const token = ++refreshToken.current;
    setIsLoading(true);
    setError(null);

    try {
      // PHASE 1 — instant offline data from SQLite
      const rawServices = await queryUpcomingTrains(stationId, maxResults * 3);
      // Descartar trenes que ya partieron (margen de 2 min para "en curso")
      const services = rawServices.filter(s => s.departureTime.getTime() > Date.now() - 2 * 60_000);
      if (token !== refreshToken.current) return;

      const initialClocks = await buildClocks(services, new Map());
      if (token !== refreshToken.current) return;
      setClocks(initialClocks);
      setIsLoading(false);

      // PHASE 2 — background real-time patch (doesn't block UI)
      const bgFetch = async () => {
        try {
          const liveMap = new Map<string, number>();
          await Promise.allSettled(
            services.map(async (svc) => {
              const update = await fetchRealTimeUpdate(svc);
              if (update) liveMap.set(svc.serviceId, update.delayMinutes);
            }),
          );
          if (token !== refreshToken.current) return;
          const liveClocks = await buildClocks(services, liveMap);
          if (token !== refreshToken.current) return;
          setClocks(liveClocks);
          setIsLive(true);
        } catch {
          // Real-time failure is silent — static data remains shown
        }
      };

      // Run immediately once, then every 60s
      bgFetch();
      bgIntervalRef.current = setInterval(bgFetch, 60_000);
    } catch (err) {
      if (token !== refreshToken.current) return;
      setError('No se pudieron cargar los trenes. Verifica tu conexión.');
      setIsLoading(false);
    }
  }, [stationId, maxResults, buildClocks]);

  useEffect(() => {
    load();
    // Re-query GTFS every 60 s so departed trains fall off the board
    gtfsIntervalRef.current = setInterval(() => {
      if (bgIntervalRef.current) { clearInterval(bgIntervalRef.current); bgIntervalRef.current = null; }
      load();
    }, 60_000);
    return () => {
      if (bgIntervalRef.current)   clearInterval(bgIntervalRef.current);
      if (gtfsIntervalRef.current) clearInterval(gtfsIntervalRef.current);
    };
  }, [load]);

  return { clocks, isLoading, isLive, error, refresh: load };
}
