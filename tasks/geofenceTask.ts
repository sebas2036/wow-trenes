/**
 * geofenceTask — Background Geofence Engine (STEPS 6 + Tourist v2)
 *
 * ANILLO 1 — 1000m origen:  "Te acercás a la estación · tu tren sale a las HH:MM"
 * ANILLO 2 —   50m origen:  Wake-to-front + QR automático + brillo 100%
 * ANILLO 3 —  500m destino: "Preparate para bajar en la próxima parada"
 *
 * Todos los anillos funcionan con la app killed (iOS background location,
 * Android FOREGROUND_SERVICE_LOCATION).
 */
import * as TaskManager   from 'expo-task-manager';
import * as Location      from 'expo-location';
import * as Notifications from 'expo-notifications';
import { GeofenceRadius } from '../theme';
import { loadTicketForStation }   from '../services/ticketStorage';
import { getAllGeofenceStations }  from '../services/gtfsDatabase';
import { emitToApp }              from '../services/notificationBridge';

// ── Task name (único — no cambiar entre builds) ───────────────────────────
const GEOFENCE_TASK_NAME = 'WOW_GEOFENCE_MONITOR';

// ── Ring-3 destination registry (in-memory, set when ticket is purchased) ─
// stationId → { ticketId, trainNumber, operator, destinationName }
const destinationRegistry = new Map<string, {
  ticketId:       string;
  trainNumber:    string;
  operator:       string;
  destinationName:string;
  platform?:      string;
}>();

export function registerDestinationGeofence(params: {
  destinationStationId: string;
  ticketId:             string;
  trainNumber:          string;
  operator:             string;
  destinationName:      string;
  platform?:            string;
}): void {
  destinationRegistry.set(params.destinationStationId, {
    ticketId:        params.ticketId,
    trainNumber:     params.trainNumber,
    operator:        params.operator,
    destinationName: params.destinationName,
    platform:        params.platform,
  });
}

export function clearDestinationGeofence(stationId: string): void {
  destinationRegistry.delete(stationId);
}

// ── Task definition (top-level — iOS/Android requirement) ─────────────────
TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.warn('[Geofence] Task error:', error.message);
    return;
  }

  const { eventType, region } = (data as any) ?? {};
  const regionId: string      = region?.identifier ?? '';

  // Format: `{ring}:{stationId}`   e.g. "outer:IT_ROM_COLOSSEO"
  const colonIdx = regionId.indexOf(':');
  if (colonIdx === -1) return;

  const ring      = regionId.slice(0, colonIdx) as 'outer' | 'inner' | 'dest';
  const stationId = regionId.slice(colonIdx + 1);

  if (eventType === Location.GeofencingEventType.Enter) {
    await handleEnter(ring, stationId);
  }
  if (eventType === Location.GeofencingEventType.Exit) {
    await handleExit(ring, stationId);
  }
});

// ── Enter handlers ────────────────────────────────────────────────────────
async function handleEnter(ring: 'outer' | 'inner' | 'dest', stationId: string) {
  if (ring === 'outer') {
    // ── ANILLO 1 (1000m) — Alerta preventiva ──────────────────────────
    const ticket = await loadTicketForStation(stationId);
    if (!ticket) return;

    const svc = ticket.trainService;
    const dep = svc.departureTime.toLocaleTimeString('es-ES', {
      hour: '2-digit', minute: '2-digit',
    });
    const title = `Te acercás a ${svc.origin.name}`;
    const body  = `Tu tren ${svc.operator.toUpperCase()} ${svc.trainNumber} sale a las ${dep}${svc.platform ? ` · Andén ${svc.platform}` : ''}. ¡Empezá a caminar!`;

    await notify({
      title: `🚄 ${title}`,
      body,
      data:  { type: 'outer_ring', stationId, ticketId: ticket.id },
      priority: 'high',
    });

    // ── In-app bell ────────────────────────────────────────────────────
    emitToApp({ type: 'geofence', title, body, icon: 'walk-outline' });

  } else if (ring === 'inner') {
    // ── ANILLO 2 (50m) — QR automático, brillo 100% ───────────────────
    const ticket = await loadTicketForStation(stationId);
    if (!ticket) return;

    const svc = ticket.trainService;
    const dep = svc.departureTime.toLocaleTimeString('es-ES', {
      hour: '2-digit', minute: '2-digit',
    });
    const title = `Mostrá tu QR — ${svc.operator.toUpperCase()} ${svc.trainNumber}`;
    const body  = `${dep} · ${svc.destination.name}${svc.platform ? ` · Andén ${svc.platform}` : ''}`;

    await notify({
      title: `🛂 ${title}`,
      body,
      data:  {
        type:    'inner_ring',
        stationId,
        ticketId:ticket.id,
        openQR:  true,
      },
      priority: 'max',
      timeSensitive: true,
    });

    // ── In-app bell ────────────────────────────────────────────────────
    emitToApp({ type: 'arrival', title, body, icon: 'qr-code-outline' });

  } else if (ring === 'dest') {
    // ── ANILLO 3 (500m) — "Preparate para bajar" ─────────────────────
    const destInfo = destinationRegistry.get(stationId);
    if (!destInfo) return;

    const title = `Próxima parada: ${destInfo.destinationName}`;
    const body  = `${destInfo.operator.toUpperCase()} ${destInfo.trainNumber} · Preparate para bajar${destInfo.platform ? ` en Andén ${destInfo.platform}` : ''}`;

    await notify({
      title: `${title}`,
      body,
      data:  {
        type:    'dest_ring',
        stationId,
        ticketId:destInfo.ticketId,
      },
      priority: 'max',
      timeSensitive: true,
    });

    // ── In-app bell ────────────────────────────────────────────────────
    emitToApp({ type: 'geofence', title, body, icon: 'exit-outline' });

    // Auto-clear after arrival
    clearDestinationGeofence(stationId);
  }
}

async function handleExit(ring: 'outer' | 'inner' | 'dest', stationId: string) {
  // Ring-2 exit → brightness restoration happens in QRTicketOverlay via AppState
  // Ring-3 exit → user has passed the destination (no action needed)
}

// ── Bootstrap ─────────────────────────────────────────────────────────────
export async function initGeofenceTask(): Promise<void> {
  try {
    const { status: fg } = await Location.getForegroundPermissionsAsync();
    if (fg !== 'granted') return;

    const { status: bg } = await Location.getBackgroundPermissionsAsync();
    if (bg !== 'granted') return;

    const { status: notif } = await Notifications.getPermissionsAsync();
    if (notif !== 'granted') {
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: false },
      });
    }

    await registerGeofences();
  } catch (err) {
    console.warn('[Geofence] Init failed (non-fatal):', err);
  }
}

async function registerGeofences(): Promise<void> {
  const stations = await getAllGeofenceStations();
  if (!stations.length) return;

  const regions: Location.LocationRegion[] = [];

  for (const st of stations) {
    // Ring 1 — 1000m (approach)
    regions.push({
      identifier:    `outer:${st.stop_id}`,
      latitude:      st.lat,
      longitude:     st.lon,
      radius:        GeofenceRadius.outer,
      notifyOnEnter: true,
      notifyOnExit:  false,
    });
    // Ring 2 — 50m (turnstile)
    regions.push({
      identifier:    `inner:${st.stop_id}`,
      latitude:      st.lat,
      longitude:     st.lon,
      radius:        GeofenceRadius.inner,
      notifyOnEnter: true,
      notifyOnExit:  true,
    });
  }

  // Ring 3 — destination stations from active tickets (dynamic)
  for (const [stationId] of destinationRegistry) {
    const st = stations.find((s) => s.stop_id === stationId);
    if (!st) continue;
    regions.push({
      identifier:    `dest:${st.stop_id}`,
      latitude:      st.lat,
      longitude:     st.lon,
      radius:        500, // 500m — anticipación suficiente en tren
      notifyOnEnter: true,
      notifyOnExit:  false,
    });
  }

  const running = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME);
  if (running) await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);

  await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, regions);
  console.log(`[Geofence] ✅ ${regions.length} regions activas (${stations.length} estaciones · ${destinationRegistry.size} destinos)`);
}

export async function refreshGeofences(): Promise<void> {
  await registerGeofences();
}

export async function stopGeofencing(): Promise<void> {
  try {
    const running = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME);
    if (running) await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
  } catch { /* non-fatal */ }
}

// ── Notify helper ─────────────────────────────────────────────────────────
async function notify(params: {
  title:         string;
  body:          string;
  data:          Record<string, unknown>;
  priority:      'high' | 'max';
  timeSensitive?:boolean;
}): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: params.title,
      body:  params.body,
      data:  params.data,
      sound: 'default',
      priority:
        params.priority === 'max'
          ? Notifications.AndroidNotificationPriority.MAX
          : Notifications.AndroidNotificationPriority.HIGH,
      ...(params.timeSensitive
        ? { interruptionLevel: 'timeSensitive' as any }
        : {}),
    },
    trigger: null,
  });
}
