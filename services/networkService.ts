/**
 * networkService — Detección de conectividad offline-first
 *
 * Sin dependencias externas. Usa un probe rápido a Cloudflare DNS.
 * El resultado se cachea 15 segundos para no hacer pings constantemente.
 *
 * USO:
 *   import { isOnline, onNetworkChange } from './networkService';
 *
 *   // En componentes:
 *   const online = await isOnline();
 *
 *   // Suscribirse a cambios:
 *   const unsub = onNetworkChange((online) => setIsOnline(online));
 */

const PROBE_URL    = 'https://1.1.1.1/';   // Cloudflare DNS — mínimo overhead
const PROBE_TIMEOUT = 4_000;                // 4 segundos máximo
const CACHE_TTL_MS  = 15_000;              // 15 segundos entre probes

let cachedOnline: boolean | null = null;
let cacheTime  = 0;
let probeInFlight: Promise<boolean> | null = null;

// Listeners para cambios de conectividad
type Listener = (online: boolean) => void;
const listeners: Set<Listener> = new Set();

function notify(online: boolean) {
  listeners.forEach(fn => fn(online));
}

/** Probe real de red — fetch con timeout */
async function probe(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT);
    const resp = await fetch(PROBE_URL, {
      method:  'HEAD',
      signal:  ctrl.signal,
      cache:   'no-store',
    });
    clearTimeout(tid);
    return resp.ok || resp.status < 500;
  } catch {
    return false;
  }
}

/**
 * isOnline — devuelve true si hay conectividad.
 * Usa caché de 15s para no saturar la red.
 */
export async function isOnline(): Promise<boolean> {
  const now = Date.now();
  if (cachedOnline !== null && (now - cacheTime) < CACHE_TTL_MS) {
    return cachedOnline;
  }

  // Evitar múltiples probes en paralelo
  if (probeInFlight) return probeInFlight;

  probeInFlight = probe().then(online => {
    const changed = cachedOnline !== online;
    cachedOnline  = online;
    cacheTime     = Date.now();
    probeInFlight = null;
    if (changed) notify(online);
    return online;
  });

  return probeInFlight;
}

/**
 * Suscribirse a cambios de conectividad.
 * Retorna función de cleanup para usar en useEffect.
 */
export function onNetworkChange(listener: Listener): () => void {
  listeners.add(listener);
  // Probe inmediato para notificar el estado actual
  isOnline().then(listener);
  return () => listeners.delete(listener);
}

/**
 * Invalida el caché (útil en pull-to-refresh o al volver del background).
 */
export function invalidateNetworkCache(): void {
  cachedOnline = null;
  cacheTime    = 0;
}

/**
 * getLastKnownStatus — retorna el último estado conocido sin hacer probe.
 * Útil para renders síncronos.
 */
export function getLastKnownStatus(): boolean {
  return cachedOnline ?? true; // asumir online si no hay dato
}
