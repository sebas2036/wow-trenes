/**
 * railApi — Real-time rail operator APIs (STEP 3 — Background Thread)
 * Only called when journey is imminent (< 60 min) and user is online.
 * Returns delay deltas to patch static GTFS data.
 * Architecture: fire-and-forget — never blocks the UI thread.
 *
 * Operator API map:
 *   France   → SNCF Connect API          (api.sncf.com/v1)         key required
 *   Germany  → DB Timetables API         (apis.deutschebahn.com)   key required
 *   Spain    → Renfe flotaLD.json          (renfe.com/content/dam)    public ✓ (ultRetraso)
 *   Italy    → ViaggiaTreno              (viaggiatreno.it)          public ✓
 *   NL       → NS Reisinformatie         (apiportal.ns.nl)          key required
 *   CH       → transport.opendata.ch     public ✓
 *   London   → TfL Unified API           (api.tfl.gov.uk)           public ✓
 *   Barcelona → TMB API                  (api.tmb.cat/v1)           key ✓ in .env
 *   Paris    → IDFM SIRI-SM              (prim.ile-de-france-mobilites.fr) key required
 */
import type { TrainService, RealTimeUpdate } from '../types';
import { RailEndpoints } from '../theme';
import { getNextArrivals as tmbArrivals }  from './tmbRealtime';
import { getNextArrivals as idfmArrivals } from './idfmRealtime';

// ── API Keys (injected via environment / Expo Constants in production) ────
// In production, proxy calls through your lightweight edge function to
// keep API keys out of the binary. The edge function itself never stores
// any passenger data (RGPD compliant).
const API_KEYS: Partial<Record<string, string>> = {
  sncf: process.env.EXPO_PUBLIC_SNCF_API_KEY ?? '',
  db:   process.env.EXPO_PUBLIC_DB_API_KEY   ?? '',
  ns:   process.env.EXPO_PUBLIC_NS_API_KEY   ?? '',
};

const TIMEOUT_MS = 5000;

// ── Resilience layer: Circuit Breaker + Stale Cache ───────────────────────
//
// Invisible al usuario. Tres niveles de degradación:
//   1. Real-time fresco   → dato live del operador
//   2. Stale cache        → último dato bueno (hasta STALE_TTL_MS)
//   3. GTFS estático      → horario teórico, sin badge de retraso
//
// El circuit breaker evita martillar APIs caídas y drena la batería.
// Después de BREAKER_RESET_MS el circuito se cierra solo y reintenta.

const STALE_TTL_MS      = 10 * 60_000;  // 10 min: tiempo máximo de cache válido
const BREAKER_THRESHOLD = 3;            // fallos consecutivos para abrir el circuito
const BREAKER_RESET_MS  = 5  * 60_000; // 5 min: tiempo hasta reintentar

type OperatorKey = string; // service.operator

interface BreakerState {
  failures:  number;
  openSince: number | null; // timestamp cuando se abrió
}

interface CachedUpdate {
  update: RealTimeUpdate;
  cachedAt: number;
}

const _breakers = new Map<OperatorKey, BreakerState>();
const _cache    = new Map<string, CachedUpdate>(); // key = serviceId

function isBreakerOpen(op: OperatorKey): boolean {
  const state = _breakers.get(op);
  if (!state || state.openSince === null) return false;
  if (Date.now() - state.openSince > BREAKER_RESET_MS) {
    // Auto-reset: half-open → intentar de nuevo
    _breakers.set(op, { failures: 0, openSince: null });
    return false;
  }
  return true;
}

function recordSuccess(op: OperatorKey): void {
  _breakers.set(op, { failures: 0, openSince: null });
}

function recordFailure(op: OperatorKey): void {
  const prev = _breakers.get(op) ?? { failures: 0, openSince: null };
  const failures = prev.failures + 1;
  _breakers.set(op, {
    failures,
    openSince: failures >= BREAKER_THRESHOLD ? Date.now() : null,
  });
}

function getCached(serviceId: string): RealTimeUpdate | null {
  const entry = _cache.get(serviceId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > STALE_TTL_MS) {
    _cache.delete(serviceId);
    return null;
  }
  return { ...entry.update, updatedAt: entry.update.updatedAt }; // stale but valid
}

function setCached(serviceId: string, update: RealTimeUpdate): void {
  _cache.set(serviceId, { update, cachedAt: Date.now() });
}

/** Expone frescura del dato para el indicador visual opcional.
 *  'live' < 2min | 'stale' < 10min | 'static' = GTFS puro */
export function getDataFreshness(serviceId: string): 'live' | 'stale' | 'static' {
  const entry = _cache.get(serviceId);
  if (!entry) return 'static';
  const age = Date.now() - entry.cachedAt;
  if (age < 2 * 60_000) return 'live';
  if (age < STALE_TTL_MS) return 'stale';
  return 'static';
}

// ── Main entry point ──────────────────────────────────────────────────────
/**
 * Fetches real-time delay for a single service.
 * Applies circuit breaker + stale cache before calling the operator API.
 * Returns null only when all layers fail → UI falls back to GTFS static silently.
 */
export async function fetchRealTimeUpdate(
  service: TrainService,
): Promise<RealTimeUpdate | null> {
  const op = service.operator;

  // Circuit breaker open → skip live call, return stale or null
  if (isBreakerOpen(op)) {
    return getCached(service.serviceId);
  }

  try {
    let result: RealTimeUpdate | null = null;

    switch (op) {
      case 'sncf':       result = await fetchSNCF(service);        break;
      case 'db':         result = await fetchDB(service);          break;
      case 'renfe':      result = await fetchRenfe(service);       break;
      case 'trenitalia': result = await fetchViaggiaTreno(service);break;
      case 'ns':         result = await fetchNS(service);          break;
      case 'sbb':        result = await fetchSBB(service);         break;
      case 'tfl':        result = await fetchTfL(service);         break;
      case 'tmb':        result = await fetchTMB(service);         break;
      case 'ratp':       result = await fetchRATP(service);        break;
      case 'dsb':        result = await fetchDSB(service);         break;
      default:           return null;
    }

    if (result) {
      recordSuccess(op);
      setCached(service.serviceId, result);
      return result;
    }

    // Null result (API respondió pero sin datos) — no cuenta como fallo
    return getCached(service.serviceId);

  } catch {
    recordFailure(op);
    // API tiró excepción → devolver stale si existe, o null (→ GTFS estático)
    return getCached(service.serviceId);
  }
}

// ── SNCF (France) ─────────────────────────────────────────────────────────
async function fetchSNCF(service: TrainService): Promise<RealTimeUpdate | null> {
  const key = API_KEYS['sncf'];
  if (!key) return null;

  const url = `${RailEndpoints.sncf}/coverage/sncf/vehicle_journeys/${service.serviceId}/departures`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Basic ${btoa(key + ':')}` },
  });
  if (!res.ok) return null;

  const json = await res.json();
  const dep  = json?.departures?.[0];
  if (!dep) return null;

  const scheduled = new Date(dep.stop_date_time?.base_departure_date_time ?? Date.now());
  const actual    = new Date(dep.stop_date_time?.departure_date_time       ?? Date.now());
  const delayMinutes = Math.max(0, Math.round((actual.getTime() - scheduled.getTime()) / 60_000));

  return {
    serviceId:    service.serviceId,
    delayMinutes,
    platform:     dep.stop_point?.platform_code,
    status:       delayMinutes === 0 ? 'on-time' : 'delayed',
    updatedAt:    new Date(),
  };
}

// ── Deutsche Bahn (Germany) — v6.db.transport.rest ───────────────────────
// API pública, sin key, cubre DB intercity + U-Bahn Berlin/Munich/Hamburg.
// Schema HAFAS-REST: /locations?query= → id HAFAS, /stops/{id}/departures → JSON
const DB_REST = 'https://v6.db.transport.rest';

async function fetchDB(service: TrainService): Promise<RealTimeUpdate | null> {
  try {
    // 1. Resolver id HAFAS de la estación de origen por nombre
    const nameEnc = encodeURIComponent(service.origin.name);
    const locRes  = await fetchWithTimeout(
      `${DB_REST}/locations?query=${nameEnc}&results=1&fuzzy=true&stops=true`,
    );
    if (!locRes.ok) return null;
    const locs: any[] = await locRes.json();
    if (!locs.length) return null;
    const stopId = locs[0].id;

    // 2. Pedir salidas desde esa parada en la ventana de ±10 min
    const when    = service.departureTime.toISOString();
    const depRes  = await fetchWithTimeout(
      `${DB_REST}/stops/${stopId}/departures?when=${encodeURIComponent(when)}&duration=20&results=15&language=es`,
    );
    if (!depRes.ok) return null;
    const body: any  = await depRes.json();
    const deps: any[] = body.departures ?? body ?? [];

    // 3. Buscar el viaje que coincide con nuestro tren (por número o línea)
    const trainNum = service.trainNumber.replace(/\D/g, '');
    const match = deps.find((d: any) => {
      const line = (d.line?.name ?? '').replace(/\s/g, '');
      const trip = (d.tripId ?? '');
      return line.endsWith(trainNum) || trip.includes(trainNum);
    }) ?? deps[0];

    if (!match) return null;

    // prognosedWhen = tiempo real; when = horario teórico
    const scheduled = new Date(match.when ?? service.departureTime).getTime();
    const actual     = new Date(match.prognosedWhen ?? match.when ?? service.departureTime).getTime();
    const delayMinutes = Math.max(0, Math.round((actual - scheduled) / 60_000));

    return {
      serviceId:    service.serviceId,
      delayMinutes,
      platform:     match.plannedPlatform ?? match.platform ?? undefined,
      status:       delayMinutes === 0 ? 'on-time' : 'delayed',
      updatedAt:    new Date(),
    };
  } catch {
    return null;
  }
}

// ── Renfe (Spain) — Flota LD real-time ───────────────────────────────────
//
// Endpoints públicos no documentados que alimentan el mapa interactivo oficial
// de Renfe (circulacion.renfe.es). Sin autenticación, pero requieren:
//   1. ?v=TIMESTAMP_UNIX  — en SEGUNDOS (10 dígitos). Sin él el servidor rechaza.
//   2. Referer: https://circulacion.renfe.es/  — sin este header hay bloqueo.
// En app nativa no hay restricciones CORS — se llama directamente.
//
// Fuente: https://medium.com/@VictorViloria/renfe-tiene-una-api-publica...
//
// ⚠️  Si el path 404, verificar la ruta exacta en Network tab de renfe.es/mapa-red
//     y actualizar RENFE_FLOTA_BASE.
//
const RENFE_FLOTA_BASE       = 'https://renfe.es';
const RENFE_ENDPOINT_FLOTA   = `${RENFE_FLOTA_BASE}/flotaLD.json`;
const RENFE_ENDPOINT_RUTAS   = `${RENFE_FLOTA_BASE}/trenesConEstacionesLD.json`;
// trenesConEstacionesLD.json schema (verificado en producción):
// [{ idTren: number, estaciones: [{
//    idEstacion:             string,   — código estación ej. "60000"
//    nombre:                 string,   — "MADRID PUERTA DE ATOCHA"
//    horaLlegadaPlanificada: "HH:MM:SS",
//    horaSalidaPlanificada:  "HH:MM:SS",
//    horaLlegadaReal:        "HH:MM:SS",  — null si aún no pasó
//    horaSalidaReal:         "HH:MM:SS",  — null si aún no pasó
//    orden:                  number,   — secuencia en la ruta
//    estado:                 "REALIZADO" | "PENDIENTE" }] }]
const RENFE_ENDPOINT_GPS     = `${RENFE_FLOTA_BASE}/posicionesLD.json`;

// flotaLD.json schema (campos reales verificados en producción):
// { idTren:      number,  — id único de circulación → join key con posicionesLD
//   numeroTren:  string,  — código comercial ej. "03122"
//   tipoTren:    string,  — "AVE" | "ALVIA" | "AVANT" | "MD" …
//   corredor:    string,  — "Nordeste" | "Sur" | "Levante" …
//   ultRetraso:  number,  — ← minutos reales de retraso (campo correcto confirmado)
//   origen:      string,  — nombre estación origen ej. "MADRID PUERTA DE ATOCHA"
//   destino:     string,  — nombre estación destino ej. "BARCELONA SANTS"
//   composicion: string } — material rodante ej. "S-103"
//
// posicionesLD.json schema (campos reales verificados en producción):
// { idTren:    number,    — join key con flotaLD
//   latitud:   number,   — coordenada GPS
//   longitud:  number,   — coordenada GPS
//   velocidad: number  } — km/h
// Headers obligatorios — el servidor rechaza sin Referer de circulacion.renfe.es
const RENFE_HEADERS = {
  'Referer': 'https://circulacion.renfe.es/',
  'Accept':  'application/json',
};

let _flotaCache:     { data: any[]; ts: number } | null = null;
let _posicionesCache:{ data: any[]; ts: number } | null = null;
let _rutasCache:     { data: any[]; ts: number } | null = null;
const FLOTA_TTL_MS = 30_000; // 30 s — Renfe actualiza cada ~20 s

async function getFlotaLD(): Promise<any[]> {
  const nowMs  = Date.now();
  if (_flotaCache && nowMs - _flotaCache.ts < FLOTA_TTL_MS) return _flotaCache.data;

  // ⚠️ El parámetro ?v= debe ser Unix timestamp en SEGUNDOS (10 dígitos)
  const vParam = Math.floor(nowMs / 1000);
  const url    = `${RENFE_ENDPOINT_FLOTA}?v=${vParam}`;

  const res = await fetchWithTimeout(url, { headers: RENFE_HEADERS });
  if (!res.ok) return [];

  const data: any[] = await res.json();
  _flotaCache = { data, ts: nowMs };
  return data;
}

async function getRutasLD(): Promise<any[]> {
  const nowMs = Date.now();
  if (_rutasCache && nowMs - _rutasCache.ts < FLOTA_TTL_MS) return _rutasCache.data;
  const vParam = Math.floor(nowMs / 1000);
  const res = await fetchWithTimeout(`${RENFE_ENDPOINT_RUTAS}?v=${vParam}`, { headers: RENFE_HEADERS });
  if (!res.ok) return [];
  const data: any[] = await res.json();
  _rutasCache = { data, ts: nowMs };
  return data;
}

async function getPosicionesLD(): Promise<any[]> {
  const nowMs = Date.now();
  if (_posicionesCache && nowMs - _posicionesCache.ts < FLOTA_TTL_MS) return _posicionesCache.data;
  const vParam = Math.floor(nowMs / 1000);
  const res = await fetchWithTimeout(`${RENFE_ENDPOINT_GPS}?v=${vParam}`, { headers: RENFE_HEADERS });
  if (!res.ok) return [];
  const data: any[] = await res.json();
  _posicionesCache = { data, ts: nowMs };
  return data;
}

/** Devuelve posición GPS + velocidad de un tren Renfe por su numeroTren (ej. "03122").
 *  Úsalo en liveTrainPosition.ts para el dot animado en el mapa. */
export async function getRenfeTrainGPS(
  numeroTren: string,
): Promise<{ latitud: number; longitud: number; velocidad: number } | null> {
  try {
    const [flota, posiciones] = await Promise.all([getFlotaLD(), getPosicionesLD()]);
    const num   = numeroTren.replace(/[^0-9]/g, '').padStart(5, '0');
    const entry = flota.find((t: any) => String(t.numeroTren ?? '').padStart(5, '0') === num);
    if (!entry) return null;
    const pos = posiciones.find((p: any) => p.idTren === entry.idTren);
    if (!pos) return null;
    return { latitud: pos.latitud, longitud: pos.longitud, velocidad: pos.velocidad };
  } catch {
    return null;
  }
}

async function fetchRenfe(service: TrainService): Promise<RealTimeUpdate | null> {
  try {
    const [flota, rutas] = await Promise.all([getFlotaLD(), getRutasLD()]);
    if (!flota.length) return null;

    const rawNum = service.trainNumber.replace(/[^0-9]/g, '').padStart(5, '0');
    const train  = flota.find((t: any) =>
      String(t.numeroTren ?? '').padStart(5, '0') === rawNum,
    );
    if (!train) return null;

    // Fallback global — ultRetraso del tren completo
    let delayMinutes = Math.max(0, Number(train.ultRetraso ?? 0));

    // Precisión por estación — buscar la parada exacta del usuario en trenesConEstacionesLD
    const rutaTren = rutas.find((r: any) => r.idTren === train.idTren);
    if (rutaTren?.estaciones?.length) {
      const stopId = service.origin.id; // GTFS stop_id == idEstacion Renfe
      const parada = rutaTren.estaciones.find(
        (e: any) => String(e.idEstacion) === String(stopId),
      );

      if (parada?.horaSalidaReal && parada?.horaSalidaPlanificada) {
        // Calcular retraso real en esa parada concreta
        const toMin = (hms: string): number => {
          const [h, m, s] = hms.split(':').map(Number);
          return h * 60 + m + (s ?? 0) / 60;
        };
        const diff = toMin(parada.horaSalidaReal) - toMin(parada.horaSalidaPlanificada);
        delayMinutes = Math.max(0, Math.round(diff));
      }
    }

    return {
      serviceId:    service.serviceId,
      delayMinutes,
      platform:     undefined, // ningún endpoint Renfe expone andén — se mantiene GTFS
      status:       delayMinutes === 0 ? 'on-time' : 'delayed',
      updatedAt:    new Date(),
    };
  } catch {
    return null;
  }
}

// ── Trenitalia / ViaggiaTreno (Italy) ────────────────────────────────────
async function fetchViaggiaTreno(service: TrainService): Promise<RealTimeUpdate | null> {
  // ViaggiaTreno public API — no key required
  const trainNum = service.trainNumber;
  const url = `${RailEndpoints.trenitalia}/cercaTreno/${trainNum}`;

  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;

  const json = await res.json();
  if (!Array.isArray(json) || json.length === 0) return null;

  const [stationId, id] = json[0];
  const detailUrl = `${RailEndpoints.trenitalia}/andamentoTreno/${stationId}/${id}/${Date.now()}`;
  const detailRes = await fetchWithTimeout(detailUrl);
  if (!detailRes.ok) return null;

  const detail      = await detailRes.json();
  const delayMinutes = Math.max(0, Math.round((detail.ritardo ?? 0)));

  return {
    serviceId:    service.serviceId,
    delayMinutes,
    platform:     detail.binarioEffettivoPartenzaDescrizione,
    status:       delayMinutes === 0 ? 'on-time' : 'delayed',
    updatedAt:    new Date(),
  };
}

// ── NS (Netherlands) ─────────────────────────────────────────────────────
async function fetchNS(service: TrainService): Promise<RealTimeUpdate | null> {
  const key = API_KEYS['ns'];
  if (!key) return null;

  const url = `${RailEndpoints.ns}/departures?station=${service.origin.id}&lang=es`;
  const res = await fetchWithTimeout(url, {
    headers: { 'Ocp-Apim-Subscription-Key': key },
  });
  if (!res.ok) return null;

  const json = await res.json();
  const dep  = (json?.payload?.departures ?? []).find(
    (d: any) => d.trainCategory + d.name === service.trainNumber,
  );
  if (!dep) return null;

  const delayMinutes = Math.round((dep.departureStatus === 'ON_STATION' ? 0 : dep.delay ?? 0) / 60);

  return {
    serviceId:    service.serviceId,
    delayMinutes,
    platform:     dep.actualTrack ?? dep.plannedTrack,
    status:       delayMinutes === 0 ? 'on-time' : 'delayed',
    updatedAt:    new Date(),
  };
}

// ── SBB / Swiss Federal Railways ─────────────────────────────────────────
async function fetchSBB(service: TrainService): Promise<RealTimeUpdate | null> {
  // transport.opendata.ch — no API key required
  const url = `${RailEndpoints.sbb}/connections?from=${encodeURIComponent(service.origin.name)}&to=${encodeURIComponent(service.destination.name)}&datetime=${service.departureTime.toISOString()}&limit=1&fields[]=connections/from/platform&fields[]=connections/from/departureDelay`;

  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;

  const json         = await res.json();
  const conn         = json?.connections?.[0];
  const delayMinutes = Math.max(0, Math.round((conn?.from?.departureDelay ?? 0) / 60));

  return {
    serviceId:    service.serviceId,
    delayMinutes,
    platform:     conn?.from?.platform,
    status:       delayMinutes === 0 ? 'on-time' : 'delayed',
    updatedAt:    new Date(),
  };
}

// ── TfL — London Underground / Elizabeth / DLR / Overground ─────────────
// api.tfl.gov.uk — public endpoint, no key required for basic queries.
// stop_id in our DB is already NaPTAN format (940GZZLU...) — used directly.
async function fetchTfL(service: TrainService): Promise<RealTimeUpdate | null> {
  const naptanId = service.origin.id;
  if (!naptanId.startsWith('940G')) return null;   // safety check

  const url = `https://api.tfl.gov.uk/StopPoint/${naptanId}/Arrivals`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;

  const arrivals: any[] = await res.json();
  if (!Array.isArray(arrivals) || arrivals.length === 0) return null;

  // Find arrival whose scheduled time is closest to our service's departure
  const scheduledMs = service.departureTime.getTime();
  const best = arrivals
    .filter((a) => typeof a.timeToStation === 'number')
    .sort((a, b) => {
      const aTs = Date.now() + a.timeToStation * 1000;
      const bTs = Date.now() + b.timeToStation * 1000;
      return Math.abs(aTs - scheduledMs) - Math.abs(bTs - scheduledMs);
    })[0];

  if (!best) return null;

  const actualArrivalMs  = Date.now() + best.timeToStation * 1000;
  const delayMinutes     = Math.max(0, Math.round((actualArrivalMs - scheduledMs) / 60_000));

  return {
    serviceId:    service.serviceId,
    delayMinutes,
    platform:     best.platformName ?? undefined,
    status:       delayMinutes <= 1 ? 'on-time' : 'delayed',
    updatedAt:    new Date(),
  };
}

// ── TMB — Barcelona Metro ────────────────────────────────────────────────
// Credenciales en .env: TMB_APP_ID + TMB_APP_KEY
// service.origin.id format: "BCN_L1_12", "BCN_L3_08", etc.
async function fetchTMB(service: TrainService): Promise<RealTimeUpdate | null> {
  const arrivals = await tmbArrivals(service.origin.id, 3);
  if (arrivals.length === 0) return null;

  // Find arrival on the same line as service
  const lineHint = service.trainNumber.split('_')[0];  // e.g. "L1" from "L1_d0_0300"
  const match = arrivals.find((a) => a.lineNumber === lineHint) ?? arrivals[0];

  const scheduledMs  = service.departureTime.getTime();
  const actualMs     = Date.now() + match.minutesLeft * 60_000;
  const delayMinutes = Math.max(0, Math.round((actualMs - scheduledMs) / 60_000));

  return {
    serviceId:    service.serviceId,
    delayMinutes,
    platform:     undefined,
    status:       delayMinutes <= 1 ? 'on-time' : 'delayed',
    updatedAt:    new Date(),
  };
}

// ── RATP — Paris Métro + RER (via IDFM) ─────────────────────────────────
// Requiere EXPO_PUBLIC_IDFM_API_KEY en .env (gratuito: prim.ile-de-france-mobilites.fr)
// service.origin.id format: "PAR_M1_15", "PAR_RA_03", etc.
async function fetchRATP(service: TrainService): Promise<RealTimeUpdate | null> {
  const arrivals = await idfmArrivals(service.origin.id, 3);
  if (arrivals.length === 0) return null;

  const lineHint = service.trainNumber.split('_')[0];  // e.g. "M1" from "M1_d0_0300"
  const match = arrivals.find((a) => a.lineNumber === lineHint) ?? arrivals[0];

  const scheduledMs  = service.departureTime.getTime();
  const actualMs     = Date.now() + match.minutesLeft * 60_000;
  const delayMinutes = Math.max(0, Math.round((actualMs - scheduledMs) / 60_000));

  return {
    serviceId:    service.serviceId,
    delayMinutes,
    platform:     undefined,
    status:       delayMinutes <= 1 ? 'on-time' : 'delayed',
    updatedAt:    new Date(),
  };
}

// ── DSB — Denmark (Rejseplanen open API, no key required) ─────────────────
async function fetchDSB(service: TrainService): Promise<RealTimeUpdate | null> {
  // Rejseplanen REST API v1 — https://www.rejseplanen.dk/api
  // Departure board by station name, no API key needed for basic lookups
  const stationName = encodeURIComponent(service.origin.name.replace(/\s*\(.*\)/, ''));
  const now  = new Date();
  const date = `${now.getDate().toString().padStart(2,'0')}.${(now.getMonth()+1).toString().padStart(2,'0')}.${now.getFullYear()}`;
  const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
  const url  = `https://www.rejseplanen.dk/bin/rest.exe/departureBoard?name=${stationName}&date=${date}&time=${time}&format=json`;

  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;

  const json       = await res.json();
  const departures = json?.DepartureBoard?.Departure;
  if (!Array.isArray(departures) || departures.length === 0) return null;

  // Find the departure closest to our scheduled time
  const scheduledMs = service.departureTime.getTime();
  const best = departures
    .map((d: any) => {
      const [h, m] = (d.rtTime ?? d.time ?? '00:00').split(':').map(Number);
      const [day, month, year] = (d.rtDate ?? d.date ?? '01.01.2026').split('.').map(Number);
      const actual = new Date(year, month - 1, day, h, m).getTime();
      return { d, actual, diff: Math.abs(actual - scheduledMs) };
    })
    .sort((a, b) => a.diff - b.diff)[0];

  if (!best) return null;

  const delayMinutes = Math.max(0, Math.round((best.actual - scheduledMs) / 60_000));

  return {
    serviceId:    service.serviceId,
    delayMinutes,
    platform:     best.d.track,
    status:       delayMinutes <= 1 ? 'on-time' : 'delayed',
    updatedAt:    new Date(),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────
function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timeout));
}

// (formatRenfeDate eliminada — ya no se usa horarios.renfe.com)
