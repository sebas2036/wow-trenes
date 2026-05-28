/**
 * notificationBridge — Puente entre servicios de background y React.
 *
 * PROBLEMA:
 *   geofenceTask y trainArrivalMonitor son módulos JS puros — no tienen
 *   acceso al NotificationContext de React (no pueden llamar hooks).
 *
 * SOLUCIÓN — pub/sub a nivel de módulo (singleton):
 *   1. Los servicios llaman  emitToApp(notification)
 *   2. NotificationProvider  suscribe en useEffect con subscribeToNotifications()
 *   3. Cuando llega un evento → addNotification() actualiza la campanita
 *
 * El módulo se instancia una sola vez (Node.js singleton), por lo que
 * emitter y suscriptores comparten el mismo Set<Listener>.
 */
import type { NotifType } from '../context/NotificationContext';

export interface BridgeNotification {
  type:         NotifType;
  title:        string;
  body:         string;
  countryCode?: string;
  icon?:        string;
}

type Listener = (n: BridgeNotification) => void;

const listeners = new Set<Listener>();

/**
 * Emite una notificación in-app desde cualquier servicio.
 * Si no hay listeners activos (app en background killed) no hace nada —
 * el push de expo-notifications ya se encargó de avisar al usuario.
 */
export function emitToApp(notification: BridgeNotification): void {
  listeners.forEach((cb) => {
    try { cb(notification); } catch { /* no romper el servicio si el listener falla */ }
  });
}

/**
 * Suscribe un listener. Devuelve una función de unsub.
 * Llamar en useEffect de NotificationProvider.
 */
export function subscribeToNotifications(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
