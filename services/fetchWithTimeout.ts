/**
 * fetchWithTimeout — fetch con timeout robusto (AbortController).
 *
 * Para las fuentes real-time: si una API se *cuelga* (token vencido, servidor
 * lento) en vez de fallar, el fetch nunca resolvería y trabaría el parche en
 * vivo. Con timeout, la fuente colgada aborta rápido → el reintento de 60s
 * queda limpio y el tablero sigue mostrando el horario programado.
 *
 * Usa AbortController + setTimeout (no depende de AbortSignal.timeout, que no
 * está garantizado en todos los motores).
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = 6000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
