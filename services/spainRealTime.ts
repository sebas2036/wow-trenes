/**
 * spainRealTime.ts
 * Integración GTFS-RT para España (Renfe Data)
 *
 * Feed: https://gtfsrt.renfe.com/trip_updates_LD.json
 * Dataset: data.renfe.com — "Horarios de viaje AV, LD y MD" (CC BY 4.0)
 * Actualización: cada ~30 segundos · Sin API key requerida.
 *
 * A diferencia de Alemania (.pb binario), Renfe publica el feed en JSON puro
 * → consumo directo con fetch, sin parser protobuf.
 *
 * Los tripId del feed coinciden EXACTAMENTE con los trip_id de gtfs_spain.db
 * (formato "0425712026-06-10") → overlay por join directo.
 */

const RT_FEED_URL  = 'https://gtfsrt.renfe.com/trip_updates_LD.json';
const CACHE_TTL_MS = 60 * 1000; // 1 minuto
const FETCH_TIMEOUT_MS = 8_000;

// ── Tipos del feed (solo los campos que usamos) ───────────────────────────────
interface RenfeStopTimeEvent {
  delay?: number;     // segundos (negativo = adelantado)
  time?:  string;
}

interface RenfeStopTimeUpdate {
  stopId?:    string;
  arrival?:   RenfeStopTimeEvent;
  departure?: RenfeStopTimeEvent;
}

interface RenfeTripUpdate {
  trip: {
    tripId?: string;
    scheduleRelationship?: string; // "SCHEDULED" | "CANCELED" | ...
  };
  stopTimeUpdate?: RenfeStopTimeUpdate[];
  delay?: number; // retraso global del viaje en segundos
}

interface RenfeEntity {
  id?: string;
  tripUpdate?: RenfeTripUpdate;
}

interface RenfeFeed {
  header?: { timestamp?: string };
  entity?: RenfeEntity[];
}

// ── Cache ─────────────────────────────────────────────────────────────────────
interface RTCache {
  delays:    Map<string, number>; // trip_id → delay en segundos
  cancelled: Set<string>;         // trip_id cancelados hoy
  fetchedAt: number;
}

let rtCache: RTCache | null = null;

// ── Fetch + parse ─────────────────────────────────────────────────────────────
async function fetchSpainRT(): Promise<RTCache> {
  const now = Date.now();
  if (rtCache && (now - rtCache.fetchedAt) < CACHE_TTL_MS) return rtCache;

  const empty: RTCache = { delays: new Map(), cancelled: new Set(), fetchedAt: now };

  try {
    const resp = await fetch(RT_FEED_URL, {
      headers: { Accept: 'application/json' },
      signal:  AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) throw new Error(`Renfe RT HTTP ${resp.status}`);

    const feed = (await resp.json()) as RenfeFeed;
    const delays    = new Map<string, number>();
    const cancelled = new Set<string>();

    for (const entity of feed.entity ?? []) {
      const tu = entity.tripUpdate;
      const tripId = tu?.trip?.tripId;
      if (!tu || !tripId) continue;

      if ((tu.trip.scheduleRelationship ?? '').toUpperCase().startsWith('CANCEL')) {
        cancelled.add(tripId);
        continue;
      }

      // Retraso: campo global del viaje, o el de la última parada informada
      let delaySec = tu.delay ?? 0;
      if (!delaySec && tu.stopTimeUpdate?.length) {
        const last = tu.stopTimeUpdate[tu.stopTimeUpdate.length - 1];
        delaySec = last.departure?.delay ?? last.arrival?.delay ?? 0;
      }
      if (delaySec !== 0) delays.set(tripId, delaySec);
    }

    rtCache = { delays, cancelled, fetchedAt: now };
    console.log(`[ES RT] ${delays.size} trenes con retraso, ${cancelled.size} cancelados`);
    return rtCache;
  } catch (e) {
    console.warn('[ES RT] Error al leer feed Renfe:', e);
    // No cachear el fallo más de 30s para reintentar pronto
    rtCache = { ...empty, fetchedAt: now - CACHE_TTL_MS + 30_000 };
    return rtCache;
  }
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Overlay de retrasos/cancelaciones Renfe sobre entradas del tablero GTFS.
 * Mismo contrato que overlayGermanyDelays: si el feed falla o no hay datos,
 * devuelve las entradas intactas (cero regresión).
 */
export async function overlaySpainDelays<
  T extends { tripId?: string; delay?: string; status?: 'ontime' | 'delayed' | 'cancelled' }
>(entries: T[]): Promise<T[]> {
  const cache = await fetchSpainRT();
  if (cache.delays.size === 0 && cache.cancelled.size === 0) return entries;

  return entries.map((e) => {
    if (!e.tripId) return e;
    if (cache.cancelled.has(e.tripId)) {
      return { ...e, status: 'cancelled' as const, delay: undefined };
    }
    const delaySec = cache.delays.get(e.tripId) ?? 0;
    if (delaySec <= 30) return e; // < 30s → sin cambio visible
    const delayMin = Math.round(delaySec / 60);
    return {
      ...e,
      delay:  `+${delayMin}'`,
      status: 'delayed' as const,
    };
  });
}

/** Invalida el caché (útil para pull-to-refresh) */
export function invalidateSpainRT(): void {
  rtCache = null;
}
