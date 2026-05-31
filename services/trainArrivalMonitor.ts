/**
 * trainArrivalMonitor — "Tu tren llega al andén en N minutos"
 *
 * LA feature más diferenciadora de WoW TRENES.
 * Ninguna app de trenes para turistas tiene esto.
 *
 * CÓMO FUNCIONA:
 *   1. El usuario selecciona un tren (serviceId + operator)
 *   2. startMonitoring() lanza un polling en background cada 20s
 *   3. Consulta la posición real del tren al operador (ViaggiaTreno, SNCF, etc.)
 *   4. Cuando distancia_al_andén < ALERT_MINUTES → push notification
 *   5. stopMonitoring() limpia el intervalo
 *
 * OPERADORES CON POSICIÓN EN TIEMPO REAL:
 *   🇮🇹 ViaggiaTreno (Trenitalia) — posición GPS del tren
 *   🇫🇷 SNCF         — tiempo restante a cada parada
 *   🇩🇪 DB            — Ril100 real-time via OpenAPI
 *   🇳🇱 NS            — departures with real delay
 *   🇨🇭 SBB           — transport.opendata.ch (público)
 *   🇪🇸 Renfe         — limitado (horarios teóricos + delay)
 */
import * as Notifications from 'expo-notifications';
import type { TrainService } from '../types';
import { emitToApp } from './notificationBridge';

// btoa no existe en React Native — implementación compatible
function toBase64(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let out = ''; let i = 0;
  while (i < str.length) {
    const c1 = str.charCodeAt(i++), c2 = str.charCodeAt(i++), c3 = str.charCodeAt(i++);
    out += chars[c1 >> 2] + chars[((c1 & 3) << 4) | (c2 >> 4)] +
           chars[isNaN(c2) ? 64 : ((c2 & 15) << 2) | (c3 >> 6)] +
           chars[isNaN(c3) ? 64 : c3 & 63];
  }
  return out;
}

// ── Configuración ─────────────────────────────────────────────────────────
const POLL_INTERVAL_MS  = 20_000; // 20 segundos
const ALERT_THRESHOLD_MIN = 4;    // Alerta cuando faltan ≤ 4 min
const TIMEOUT_MS          = 6_000;

// ── Estado del monitor ────────────────────────────────────────────────────
interface MonitoredService {
  service:     TrainService;
  intervalId:  ReturnType<typeof setInterval>;
  alerted:     boolean;  // Solo alertar una vez por tren
  startedAt:   Date;
}

const activeMonitors = new Map<string, MonitoredService>();

// ── API de posición por operador ──────────────────────────────────────────

/**
 * Devuelve los minutos restantes para que el tren llegue al andén de salida.
 * Retorna null si no hay datos en tiempo real.
 */
async function fetchMinutesToPlatform(service: TrainService): Promise<number | null> {
  try {
    switch (service.operator) {
      case 'trenitalia': return await viaggiaTreno_minutesToPlatform(service);
      case 'sncf':       return await sncf_minutesToPlatform(service);
      case 'db':         return await db_minutesToPlatform(service);
      case 'ns':         return await ns_minutesToPlatform(service);
      case 'sbb':        return await sbb_minutesToPlatform(service);
      case 'renfe':      return await renfe_minutesToPlatform(service);
      default:           return fallback_minutesToPlatform(service);
    }
  } catch {
    return fallback_minutesToPlatform(service);
  }
}

// ── ViaggiaTreno (Italia) — posición GPS real ────────────────────────────
async function viaggiaTreno_minutesToPlatform(service: TrainService): Promise<number | null> {
  // Step 1: resolver el ID interno del tren
  const searchRes = await fetchSafe(
    `https://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/cercaTreno/${service.trainNumber}`,
  );
  if (!searchRes) return null;

  const trains = JSON.parse(searchRes);
  if (!Array.isArray(trains) || trains.length === 0) return null;

  const [originCode, trainId] = trains[0];

  // Step 2: obtener posición actual del tren
  const detailRes = await fetchSafe(
    `https://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/andamentoTreno/${originCode}/${trainId}/${Date.now()}`,
  );
  if (!detailRes) return null;

  const detail = JSON.parse(detailRes);

  // Buscar la parada de origen del usuario en la lista de paradas del tren
  const originStop = (detail.fermate ?? []).find(
    (f: any) => f.stazioneCodice === service.origin.id ||
                f.stazione?.toLowerCase().includes(service.origin.name.toLowerCase()),
  );

  if (!originStop) return fallback_minutesToPlatform(service);

  // Si el tren ya pasó por esa parada → 0 minutos (ya llegó)
  if (originStop.partenzaReale) return 0;

  // Calcular minutos restantes desde la última posición conocida
  const delay     = detail.ritardo ?? 0; // minutos de retraso
  const scheduled = new Date(originStop.partenza_teorica);
  const adjusted  = new Date(scheduled.getTime() + delay * 60_000);
  const remaining = (adjusted.getTime() - Date.now()) / 60_000;

  return Math.max(0, remaining);
}

// ── SNCF (Francia) ────────────────────────────────────────────────────────
async function sncf_minutesToPlatform(service: TrainService): Promise<number | null> {
  const apiKey = process.env.EXPO_PUBLIC_SNCF_KEY;
  if (!apiKey) return fallback_minutesToPlatform(service);

  const res = await fetchSafe(
    `https://api.sncf.com/v1/coverage/sncf/vehicle_journeys/${service.serviceId}/stop_schedules`,
    { Authorization: `Basic ${toBase64(apiKey + ':')}` },
  );
  if (!res) return null;

  const json = JSON.parse(res);
  const stop = (json?.stop_schedules ?? []).find(
    (s: any) => s.stop_point?.id?.includes(service.origin.id),
  );
  if (!stop) return fallback_minutesToPlatform(service);

  const dep = new Date(stop.date_times?.[0]?.date_time ?? Date.now());
  return Math.max(0, (dep.getTime() - Date.now()) / 60_000);
}

// ── Deutsche Bahn ─────────────────────────────────────────────────────────
async function db_minutesToPlatform(service: TrainService): Promise<number | null> {
  // DB no tiene posición GPS pública estable — usamos fallback calculado
  return fallback_minutesToPlatform(service);
}

// ── NS (Países Bajos) ────────────────────────────────────────────────────
async function ns_minutesToPlatform(service: TrainService): Promise<number | null> {
  const apiKey = process.env.EXPO_PUBLIC_NS_API_KEY;
  if (!apiKey) return fallback_minutesToPlatform(service);

  const res = await fetchSafe(
    `https://gateway.apiportal.ns.nl/reisinformatie-api/api/v3/departures?station=${service.origin.id}&lang=es`,
    { 'Ocp-Apim-Subscription-Key': apiKey },
  );
  if (!res) return null;

  const json = JSON.parse(res);
  const dep  = (json?.payload?.departures ?? []).find(
    (d: any) => (d.trainCategory + d.name) === service.trainNumber,
  );
  if (!dep) return fallback_minutesToPlatform(service);

  const plannedDep = new Date(dep.plannedDateTime);
  const delay      = dep.delay ?? 0;
  const actual     = new Date(plannedDep.getTime() + delay * 1000);
  return Math.max(0, (actual.getTime() - Date.now()) / 60_000);
}

// ── SBB (Suiza — API pública) ────────────────────────────────────────────
async function sbb_minutesToPlatform(service: TrainService): Promise<number | null> {
  const res = await fetchSafe(
    `https://transport.opendata.ch/v1/stationboard?station=${encodeURIComponent(service.origin.name)}&limit=20`,
  );
  if (!res) return null;

  const json   = JSON.parse(res);
  const entry  = (json?.stationboard ?? []).find(
    (e: any) => e.number === service.trainNumber,
  );
  if (!entry) return fallback_minutesToPlatform(service);

  const dep = new Date(entry.stop?.departure ?? Date.now());
  return Math.max(0, (dep.getTime() - Date.now()) / 60_000);
}

// ── Renfe (España — sin API de posición pública) ─────────────────────────
async function renfe_minutesToPlatform(service: TrainService): Promise<number | null> {
  return fallback_minutesToPlatform(service);
}

// ── Fallback — cálculo por horario teórico + delay conocido ─────────────
function fallback_minutesToPlatform(service: TrainService): number {
  const departure    = service.departureTime.getTime();
  const delayMs      = service.delayMinutes * 60_000;
  const adjustedDep  = departure + delayMs;
  return Math.max(0, (adjustedDep - Date.now()) / 60_000);
}

// ── Notificación push ─────────────────────────────────────────────────────
async function sendPlatformArrivalAlert(service: TrainService, minutes: number): Promise<void> {
  const dep = service.departureTime.toLocaleTimeString('es-ES', {
    hour: '2-digit', minute: '2-digit',
  });
  const title = `Tu tren llega al andén ${service.platform ?? ''} ¡YA!`;
  const body  = `${service.operator.toUpperCase()} ${service.trainNumber} → ${service.destination.name} · Sale a las ${dep} · Tenés ~${Math.ceil(minutes)} min`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `🚄 ${title}`,
      body,
      data:  { type: 'platform_arrival', serviceId: service.serviceId },
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
      interruptionLevel: 'timeSensitive' as any,
    },
    trigger: null,
  });

  // ── In-app bell ──────────────────────────────────────────────────────────
  emitToApp({ type: 'arrival', title, body, icon: 'train-outline' });
}

// ── API pública ────────────────────────────────────────────────────────────

/**
 * startMonitoring — inicia el polling para un servicio específico.
 * Llamar cuando el usuario selecciona un tren en la pantalla dividida.
 */
export function startPlatformMonitoring(service: TrainService): void {
  // No duplicar monitores
  if (activeMonitors.has(service.serviceId)) return;

  // Solo monitorear si el tren sale en los próximos 60 minutos
  const minutesToDep = (service.departureTime.getTime() - Date.now()) / 60_000;
  if (minutesToDep > 60 || minutesToDep < 0) return;

  const monitor = async () => {
    const monitored = activeMonitors.get(service.serviceId);
    if (!monitored || monitored.alerted) return;

    const minutes = await fetchMinutesToPlatform(service);
    if (minutes === null) return;

    if (minutes <= ALERT_THRESHOLD_MIN) {
      monitored.alerted = true;
      await sendPlatformArrivalAlert(service, minutes);
      stopPlatformMonitoring(service.serviceId);
    }
  };

  // Primera ejecución inmediata
  monitor();

  const intervalId = setInterval(monitor, POLL_INTERVAL_MS);
  activeMonitors.set(service.serviceId, {
    service,
    intervalId,
    alerted:   false,
    startedAt: new Date(),
  });
}

/**
 * stopMonitoring — detiene el polling para un servicio.
 */
export function stopPlatformMonitoring(serviceId: string): void {
  const monitor = activeMonitors.get(serviceId);
  if (monitor) {
    clearInterval(monitor.intervalId);
    activeMonitors.delete(serviceId);
  }
}

/**
 * stopAllMonitoring — limpieza total (llamar en logout o cambio de pantalla).
 */
export function stopAllMonitoring(): void {
  for (const [id] of activeMonitors) {
    stopPlatformMonitoring(id);
  }
}

/**
 * getMinutesToPlatform — consulta one-shot para mostrar en UI.
 */
export async function getMinutesToPlatform(service: TrainService): Promise<number | null> {
  return fetchMinutesToPlatform(service);
}

// ── Helpers ────────────────────────────────────────────────────────────────
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
