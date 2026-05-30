/**
 * germanyRealTime.ts
 * Integración GTFS-RT para Alemania (Deutsche Bahn / gtfs.de)
 *
 * Feed: https://realtime.gtfs.de/realtime-free.pb
 * Licencia: CC BY-SA 4.0 | Actualización: cada ~10 segundos
 * Sin API key requerida.
 *
 * Parsea protobuf binario manualmente (sin librería externa)
 * extrayendo únicamente los campos necesarios para overlays de delay.
 */

const RT_FEED_URL = 'https://realtime.gtfs.de/realtime-free.pb';
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutos

// ── Cache ─────────────────────────────────────────────────────────────────────
interface RTCache {
  delays: Map<string, number>; // trip_id → delay en segundos
  alerts: string[];            // mensajes de alerta activos
  fetchedAt: number;
}

let rtCache: RTCache | null = null;

// ── Minimal Protobuf reader ───────────────────────────────────────────────────
// Solo implementa lo necesario para GTFS-RT FeedMessage.

class ProtoReader {
  private buf: Uint8Array;
  private pos: number;
  private end: number;

  constructor(buf: Uint8Array, start = 0, end?: number) {
    this.buf = buf;
    this.pos = start;
    this.end = end ?? buf.length;
  }

  /** Lee un varint de hasta 32 bits (suficiente para delays y field tags) */
  readVarint32(): number {
    let result = 0, shift = 0;
    while (this.pos < this.end) {
      const b = this.buf[this.pos++];
      result |= (b & 0x7F) << shift;
      if (!(b & 0x80)) return result >>> 0;
      shift += 7;
      if (shift >= 35) { this.skipVarintRemainder(); break; }
    }
    return result >>> 0;
  }

  /** Lee un varint con signo (int32 — para delays negativos) */
  readInt32(): number {
    const v = this.readVarint32();
    return v | 0; // bitwise convierte a int32 con signo
  }

  private skipVarintRemainder(): void {
    while (this.pos < this.end && (this.buf[this.pos++] & 0x80)) {}
  }

  /** Lee un string UTF-8 (length-delimited) */
  readString(): string {
    const len = this.readVarint32();
    if (this.pos + len > this.end) return '';
    const slice = this.buf.slice(this.pos, this.pos + len);
    this.pos += len;
    return new TextDecoder().decode(slice);
  }

  /** Retorna un sub-reader para un mensaje anidado */
  readMessage(): ProtoReader {
    const len = this.readVarint32();
    const start = this.pos;
    this.pos = Math.min(this.pos + len, this.end);
    return new ProtoReader(this.buf, start, start + len);
  }

  /** Lee el próximo tag: { fieldNumber, wireType }. Retorna null si EOF. */
  readTag(): { field: number; wire: number } | null {
    if (this.pos >= this.end) return null;
    const tag = this.readVarint32();
    return { field: tag >>> 3, wire: tag & 0x7 };
  }

  /** Salta un campo desconocido según wireType */
  skipField(wire: number): void {
    switch (wire) {
      case 0: this.readVarint32(); break;
      case 1: this.pos += 8; break;
      case 2: { const len = this.readVarint32(); this.pos += len; break; }
      case 5: this.pos += 4; break;
      default: this.pos = this.end; // corrompe — salir
    }
  }

  get done(): boolean { return this.pos >= this.end; }
}

// ── Parsers GTFS-RT ───────────────────────────────────────────────────────────

/** Parsea StopTimeEvent y retorna delay en segundos (0 si no hay) */
function parseStopTimeEvent(r: ProtoReader): number {
  let delay = 0;
  while (!r.done) {
    const tag = r.readTag(); if (!tag) break;
    if (tag.field === 1 && tag.wire === 0) r.readVarint32();    // time (skip)
    else if (tag.field === 2 && tag.wire === 0) delay = r.readInt32(); // delay
    else r.skipField(tag.wire);
  }
  return delay;
}

/** Parsea TripDescriptor y retorna trip_id */
function parseTripDescriptor(r: ProtoReader): string {
  let tripId = '';
  while (!r.done) {
    const tag = r.readTag(); if (!tag) break;
    if (tag.field === 1 && tag.wire === 2) tripId = r.readString();
    else r.skipField(tag.wire);
  }
  return tripId;
}

/** Parsea TripUpdate y escribe en el mapa de delays */
function parseTripUpdate(r: ProtoReader, delays: Map<string, number>): void {
  let tripId = '';
  let maxDelay = 0;
  while (!r.done) {
    const tag = r.readTag(); if (!tag) break;
    if (tag.field === 1 && tag.wire === 2) {
      // trip descriptor
      tripId = parseTripDescriptor(r.readMessage());
    } else if (tag.field === 2 && tag.wire === 2) {
      // stop_time_update
      const su = r.readMessage();
      while (!su.done) {
        const t = su.readTag(); if (!t) break;
        if (t.field === 2 && t.wire === 2) {
          const d = parseStopTimeEvent(su.readMessage());
          if (Math.abs(d) > Math.abs(maxDelay)) maxDelay = d;
        } else if (t.field === 3 && t.wire === 2) {
          const d = parseStopTimeEvent(su.readMessage());
          if (Math.abs(d) > Math.abs(maxDelay)) maxDelay = d;
        } else su.skipField(t.wire);
      }
    } else {
      r.skipField(tag.wire);
    }
  }
  if (tripId && maxDelay !== 0) delays.set(tripId, maxDelay);
}

/** Parsea Alert y retorna texto de descripción (puede estar en varios idiomas) */
function parseAlert(r: ProtoReader): string {
  let text = '';
  while (!r.done) {
    const tag = r.readTag(); if (!tag) break;
    if (tag.field === 5 && tag.wire === 2) {
      // description_text (TranslatedString)
      const ts = r.readMessage();
      while (!ts.done) {
        const t = ts.readTag(); if (!t) break;
        if (t.field === 1 && t.wire === 2) {
          // Translation
          const tr = ts.readMessage();
          while (!tr.done) {
            const tt = tr.readTag(); if (!tt) break;
            if (tt.field === 1 && tt.wire === 2) {
              const s = tr.readString();
              if (!text) text = s; // tomar el primero
            } else if (tt.field === 2 && tt.wire === 2) {
              tr.readString(); // lang — ignorar
            } else tr.skipField(tt.wire);
          }
        } else ts.skipField(t.wire);
      }
    } else r.skipField(tag.wire);
  }
  return text;
}

/** Parsea FeedEntity y escribe en delays/alerts */
function parseFeedEntity(
  r: ProtoReader,
  delays: Map<string, number>,
  alerts: string[],
): void {
  while (!r.done) {
    const tag = r.readTag(); if (!tag) break;
    if (tag.field === 1 && tag.wire === 2) r.readString(); // id — skip
    else if (tag.field === 3 && tag.wire === 2) parseTripUpdate(r.readMessage(), delays);
    else if (tag.field === 5 && tag.wire === 2) {
      const a = parseAlert(r.readMessage());
      if (a) alerts.push(a);
    } else r.skipField(tag.wire);
  }
}

/** Parsea el FeedMessage completo */
function parseFeedMessage(buf: Uint8Array): { delays: Map<string, number>; alerts: string[] } {
  const r = new ProtoReader(buf);
  const delays = new Map<string, number>();
  const alerts: string[] = [];
  let entityCount = 0;

  while (!r.done) {
    const tag = r.readTag(); if (!tag) break;
    if (tag.field === 1 && tag.wire === 2) r.readMessage(); // header — skip
    else if (tag.field === 2 && tag.wire === 2) {
      parseFeedEntity(r.readMessage(), delays, alerts);
      entityCount++;
    } else r.skipField(tag.wire);
  }

  console.log(`[DE RT] Parseadas ${entityCount} entities, ${delays.size} delays, ${alerts.length} alertas`);
  return { delays, alerts };
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Descarga y parsea el feed RT de Alemania. Usa caché de 3 min. */
export async function fetchGermanyRT(): Promise<RTCache> {
  const now = Date.now();
  if (rtCache && (now - rtCache.fetchedAt) < CACHE_TTL_MS) return rtCache;

  try {
    const resp = await fetch(RT_FEED_URL, {
      headers: { 'User-Agent': 'WoW-Trenes-App/1.0' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const arrBuf = await resp.arrayBuffer();
    const buf = new Uint8Array(arrBuf);
    const { delays, alerts } = parseFeedMessage(buf);
    rtCache = { delays, alerts, fetchedAt: now };
    console.log(`[DE RT] Feed actualizado: ${delays.size} trips con delay`);
    return rtCache;
  } catch (e) {
    console.warn('[DE RT] Error fetching feed:', e);
    return rtCache ?? { delays: new Map(), alerts: [], fetchedAt: 0 };
  }
}

/** Retorna el delay en segundos para un trip_id, o 0 si no hay info. */
export async function getGermanyDelay(tripId: string): Promise<number> {
  const cache = await fetchGermanyRT();
  return cache.delays.get(tripId) ?? 0;
}

/** Overlays de delay sobre un array de BoardEntry.
 *  Requiere que las entradas tengan la propiedad `tripId` (opcional en el tipo).
 */
export async function overlayGermanyDelays<
  T extends { tripId?: string; delay?: string; status?: 'ontime' | 'delayed' | 'cancelled' }
>(entries: T[]): Promise<T[]> {
  const cache = await fetchGermanyRT();
  if (cache.delays.size === 0) return entries;

  return entries.map((e) => {
    if (!e.tripId) return e;
    const delaySec = cache.delays.get(e.tripId) ?? 0;
    if (delaySec <= 30) return e; // < 30s → sin cambio visible
    const delayMin = Math.round(delaySec / 60);
    return {
      ...e,
      delay: `+${delayMin}'`,
      status: 'delayed' as const,
    };
  });
}

/** Alertas activas de servicio (texto en alemán) */
export async function getGermanyAlerts(): Promise<string[]> {
  const cache = await fetchGermanyRT();
  return cache.alerts.slice(0, 5); // máximo 5 alertas
}

/** Invalida el caché (útil para pull-to-refresh) */
export function invalidateGermanyRT(): void {
  rtCache = null;
}
