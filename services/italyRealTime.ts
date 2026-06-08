/**
 * italyRealTime.ts
 * Integración real-time Italia usando la API pública de ViaggiaTreno (Trenitalia)
 *
 * ViaggiaTreno es el portal oficial de Trenitalia — sus endpoints REST son
 * públicos y no requieren API key. Sin WebSockets, sin registro.
 *
 * Endpoints usados:
 *   /cercaStazione/{query}           → buscar estación por nombre
 *   /partenze/{stationId}/{datetime} → próximas salidas de una estación
 *   /arrivi/{stationId}/{datetime}   → próximas llegadas
 *   /andamentoTreno/{orig}/{num}/{ts}→ estado de un tren específico
 */

// Proxy HTTPS en Railway → reenvía a ViaggiaTreno (que solo habla HTTP).
// Así funciona en Expo Go y en producción iOS/Android sin excepciones cleartext.
const PROXY_BASE = (process.env.EXPO_PUBLIC_AFFILIATE_PROXY
  ?? 'https://voxa-production-dc15.up.railway.app/affiliate/redirect')
  .replace(/\/affiliate.*$/, '');
const BASE = `${PROXY_BASE}/viaggiatreno`;
const CACHE_TTL_MS = 90_000; // 90 segundos

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ItalyStation {
  id: string;       // e.g. "S01700"
  name: string;     // e.g. "MILANO CENTRALE"
}

export interface ItalyDeparture {
  trainNumber:   string;
  category:      string;   // "IC", "FR", "REG", etc.
  destination:   string;
  scheduledTime: string;   // "HH:MM"
  delayMin:      number;
  platform:      string;
  stationName:   string;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

interface BoardCache {
  entries: ItalyDeparture[];
  fetchedAt: number;
  stationId: string;
  mode: string;
}
let boardCache: BoardCache | null = null;

// Estación activa (se puede cambiar desde la UI)
let activeStation: ItalyStation | null = null;

export function setActiveItalyStation(s: ItalyStation): void {
  activeStation = s;
  boardCache = null; // invalidar cache al cambiar de estación
}
export function getActiveItalyStationName(): string {
  return activeStation?.name ?? 'Roma Termini';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateTimeIT(date: Date): string {
  // ViaggiaTreno espera: "Sat May 30 2026 08:00:00"
  return date.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: '2-digit',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
    second: '2-digit', hour12: false, timeZone: 'Europe/Rome',
  }).replace(/,/g, '');
}

function parseTime(ts: number | null): string {
  if (!ts) return '--:--';
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Rome',
  }).formatToParts(new Date(ts));
  const h = parts.find(p => p.type === 'hour')?.value   ?? '00';
  const m = parts.find(p => p.type === 'minute')?.value ?? '00';
  return `${h}:${m}`;
}

async function vt<T>(path: string, timeoutMs = 6000): Promise<T> {
  const url = `${BASE}/${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'WoW-Trenes-App/1.0' },
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`ViaggiaTreno HTTP ${resp.status}: ${path}`);
    return resp.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Busca estaciones por nombre. Devuelve lista de { id, name }.
 * Ejemplo: searchItalyStations("Milano") → [{id:"S01700", name:"MILANO CENTRALE"}, ...]
 */
export async function searchItalyStations(query: string): Promise<ItalyStation[]> {
  try {
    const results = await vt<Array<{ id: string; nomeLungo: string; nomeBreve: string }>>(
      `cercaStazione/${encodeURIComponent(query.toUpperCase())}`
    );
    return (results ?? []).map(r => ({
      id:   r.id,
      name: r.nomeLungo ?? r.nomeBreve ?? r.id,
    }));
  } catch (e) {
    console.warn('[IT RT] searchItalyStations error:', e);
    return [];
  }
}

/**
 * Tablero de salidas o llegadas de una estación italiana.
 * Usa caché de 90 segundos.
 */
export async function fetchItalyBoard(
  mode: 'salidas' | 'arribos',
  limit = 30,
): Promise<ItalyDeparture[]> {
  const now = Date.now();
  if (
    boardCache &&
    boardCache.mode === mode &&
    boardCache.stationId === (activeStation?.id ?? 'S08409') &&
    (now - boardCache.fetchedAt) < CACHE_TTL_MS
  ) {
    return boardCache.entries;
  }

  // Validar que el ID de la estación sea un ID real de ViaggiaTreno (formato: S + dígitos).
  // Los IDs sintéticos como 'it-naples' no funcionan con la API y deben resolverse por nombre.
  const isRealVtId = (id: string) => /^S\d+$/.test(id);

  let station = (activeStation && isRealVtId(activeStation.id)) ? activeStation : null;
  if (!station) {
    const query = activeStation?.name ?? 'Roma Termini';
    try {
      const results = await searchItalyStations(query);
      station = results[0] ?? { id: 'S08409', name: 'ROMA TERMINI' };
    } catch {
      station = { id: 'S08409', name: 'ROMA TERMINI' };
    }
    // Cachear el ID real para evitar repetir la búsqueda
    activeStation = station;
  }

  const dateStr = formatDateTimeIT(new Date());
  const endpoint = mode === 'salidas'
    ? `partenze/${station.id}/${encodeURIComponent(dateStr)}`
    : `arrivi/${station.id}/${encodeURIComponent(dateStr)}`;

  try {
    // ViaggiaTreno devuelve array de trenes
    const raw = await vt<any[]>(endpoint);
    const entries: ItalyDeparture[] = (raw ?? []).slice(0, limit).map((t: any) => {
      const delaySec  = t.ritardo ?? 0;
      const delayMin  = Math.round(delaySec / 60);
      const scheduled = parseTime(mode === 'salidas' ? t.orarioPartenza : t.orarioArrivo);
      return {
        trainNumber:   String(t.numeroTreno ?? ''),
        category:      t.categoriaDescrizione ?? t.categoria ?? 'REG',
        destination:   mode === 'salidas'
          ? (t.destinazione ?? '—')
          : (t.origine ?? '—'),
        scheduledTime: scheduled,
        delayMin,
        platform:      t.binarioEffettivoPartenzaDescrizione
                    ?? t.binarioProgrammatoPartenzaDescrizione
                    ?? '',
        stationName:   station.name,
      };
    });

    const seen = new Set<string>();
    const deduped = entries.filter(e => {
      const key = `${e.trainNumber}|${e.scheduledTime}|${e.destination}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    boardCache = { entries: deduped, fetchedAt: now, stationId: station.id, mode };
    return deduped;
  } catch (e) {
    console.warn('[IT RT] fetchItalyBoard error:', e);
    return boardCache?.entries ?? [];
  }
}

/** Invalida el caché (pull-to-refresh) */
export function invalidateItalyRT(): void {
  boardCache = null;
}

/** Resetea la estación activa (llamar al cambiar de país) */
export function resetItalyStation(): void {
  activeStation = null;
  boardCache = null;
}
