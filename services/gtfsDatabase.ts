/**
 * gtfsDatabase — Motor GTFS SQLite multi-país
 * Operación 100% offline · Costo fijo de servidor: 0$
 *
 * Un DB por país, cargado bajo demanda.
 * Assets empaquetados en la app:
 *   assets/gtfs_switzerland.db  (~62 MB) — 905 estaciones SBB
 *   assets/gtfs_france.db       (~67 MB)  — 1.864 estaciones SNCF
 *   assets/gtfs_spain.db        (~9 MB)   — 1.017 estaciones Renfe
 *   assets/gtfs_germany.db      (~4 MB)   — 620 estaciones DB Fernverkehr
 *   assets/gtfs_italy.db        (~13 MB)   — 822 estaciones Trenord+Toscana (Lombardía, Roma, Toscana…)
 *   assets/gtfs_netherlands.db  (~23.3 MB) — 1.156 estaciones NS + operadores regionales
 *   assets/gtfs_austria.db      (~30.8 MB) — 2.169 estaciones ÖBB (red completa Austria)
 *   assets/gtfs_belgium.db      (~49.8 MB) — 557 estaciones SNCB/NMBS (red completa Bélgica)
 *   assets/gtfs_portugal.db     (placeholder → CP no publica GTFS, ver Transporlis)
 *   assets/gtfs_norway.db       (~57.5 MB) — 902 estaciones Entur (red nacional Noruega)
 *   assets/gtfs_usa.db          (~2.1 MB)  — 534 estaciones Amtrak (red nacional)
 *   assets/gtfs_usa_nyc.db     (~41.1 MB) — 511 estaciones NYC (Subway + LIRR + Metro-North)
 *   assets/gtfs_gb.db          (placeholder → ejecutar import_gtfs_gb.py tras registro en opendata.nationalrail.co.uk)
 *
 * Metros urbanos (datos reales importados):
 *   assets/gtfs_es_mad.db       (~0.5 MB)  — 272 estaciones Madrid Metro CRTM (13 líneas, datos reales)
 *   assets/gtfs_us_chi.db       (~20.6 MB) — 298 estaciones Chicago CTA L (8 líneas, datos reales)
 *   [pendiente] assets/gtfs_es_bcn.db  — Barcelona TMB → run import_gtfs_es_bcn.py
 *   assets/gtfs_us_lax.db       (~17.2 MB) — 114 estaciones LA Metro Rail (6 líneas, datos reales)
 *   [pendiente] assets/gtfs_norway.db  — Entur Norway → run import_gtfs_no.py
 *   assets/gtfs_gb_tfl.db       (~0.3 MB)  — 160+ estaciones London Underground/TfL (datos NaPTAN reales) → run create_gtfs_gb_tfl.py
 *
 * Arquitectura:
 *   [Asset bundle: assets/gtfs_<country>.db]
 *     ↓ copied to FileSystem on first access per country
 *   [expo-sqlite WAL mode]
 *     ↓ queried async via loadCountryDB(countryCode)
 *
 * Schema (igual para todos los países, generado por scripts/import_gtfs_*.py):
 *   stops        stop_id, stop_name, stop_lat, stop_lon, country_code, location_type, parent_station
 *   routes       route_id, agency_id, route_short_name, route_long_name, route_type
 *   trips        trip_id, route_id, service_id, trip_headsign, direction_id
 *   stop_times   trip_id, arrival_time, departure_time, stop_id, stop_sequence
 *   calendar     service_id, monday…sunday, start_date, end_date
 *   calendar_dates service_id, date, exception_type
 */
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';
import type { Station, TrainService, Coordinates, CountryCode } from '../types';

// ── Asset map ────────────────────────────────────────────────────────────────
// 'bundled' → require() embeds the DB in the JS bundle (use solo para el país
//             por defecto — cada MB extra = segundos más de carga en Expo Go).
// 'local'   → abre el archivo directamente desde el filesystem del dispositivo.
//             Si no existe, crea schema vacío y devuelve [] en queries.
//             En EAS Build nativo, los DBs pueden pre-copiarse en el binario.
//
// REGLA: solo ES está bundled. El resto son 'local' para mantener el bundle < 15 MB.
// Para usar otro país en dev, copiá el .db a:
//   Android: /data/data/host.exp.exponent/files/SQLite/<dbName>
//   iOS:     ~/Library/Developer/CoreSimulator/…/data/Documents/ExponentExperienceData/…/SQLite/

type CountryAsset =
  | { type: 'bundled'; dbName: string; module: number }
  | { type: 'local';   dbName: string };

const COUNTRY_ASSETS: Partial<Record<CountryCode, CountryAsset>> = {
  // ── BUNDLED (solo España — default y ya importado con datos reales) ───────
  ES: { type: 'bundled', dbName: 'gtfs_spain.db', module: require('../assets/gtfs_spain.db') },

  // ── LOCAL (abrir desde filesystem; vacío si no existe en el dispositivo) ──
  CH:     { type: 'local', dbName: 'gtfs_switzerland.db' },
  FR:     { type: 'local', dbName: 'gtfs_france.db'      },
  DE:     { type: 'local', dbName: 'gtfs_germany.db'     },
  IT:     { type: 'local', dbName: 'gtfs_italy.db'       },
  NL:     { type: 'local', dbName: 'gtfs_netherlands.db' },
  AT:     { type: 'local', dbName: 'gtfs_austria.db'     },
  BE:     { type: 'local', dbName: 'gtfs_belgium.db'     },
  DK:     { type: 'local', dbName: 'gtfs_dk.db'          },
  PT:     { type: 'local', dbName: 'gtfs_portugal.db'    },
  NO:     { type: 'local', dbName: 'gtfs_norway.db'      },
  US:     { type: 'local', dbName: 'gtfs_usa.db'         },
  US_NYC: { type: 'local', dbName: 'gtfs_usa_nyc.db'     },
  GB:     { type: 'local', dbName: 'gtfs_gb.db'          },
  GB_LON: { type: 'local', dbName: 'gtfs_gb_tfl.db'      },
  JP:     { type: 'local', dbName: 'gtfs_japan.db'       },
  ES_MAD: { type: 'local', dbName: 'gtfs_es_mad.db'      },
  ES_BCN: { type: 'local', dbName: 'gtfs_es_bcn.db'      },
  FR_PAR: { type: 'local', dbName: 'gtfs_fr_par.db'      },
  DE_BER: { type: 'local', dbName: 'gtfs_de_ber.db'      },
  DE_MUN: { type: 'local', dbName: 'gtfs_de_mun.db'      },
  US_CHI: { type: 'local', dbName: 'gtfs_us_chi.db'      },
  US_LAX: { type: 'local', dbName: 'gtfs_us_lax.db'      },
};

const SQLITE_DIR = FileSystem.documentDirectory + 'SQLite/';

// One open connection per country (lazy-opened)
const dbPool: Partial<Record<CountryCode, SQLite.SQLiteDatabase>> = {};

// Active country for the current session (default: España — único DB bundled)
let activeCountry: CountryCode = 'ES';

// ── Public: switch active country ─────────────────────────────────────────────
/**
 * setActiveCountry — call this when the user selects a country card on Home.
 * Lazily opens (and copies if needed) the corresponding country DB.
 */
export async function setActiveCountry(country: CountryCode): Promise<void> {
  activeCountry = country;
  await ensureDB(country);
}

export function getActiveCountry(): CountryCode {
  return activeCountry;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
/**
 * initDatabase — called once from _layout.tsx on app boot.
 * Loads the default country (Switzerland) so first-launch is fast.
 */
export async function initDatabase(): Promise<void> {
  await ensureDB(activeCountry);
}

// ── Internal: open a country DB (copy from bundle if first launch) ────────────
async function ensureDB(country: CountryCode): Promise<SQLite.SQLiteDatabase> {
  if (dbPool[country]) return dbPool[country]!;

  await FileSystem.makeDirectoryAsync(SQLITE_DIR, { intermediates: true }).catch(() => {});

  const asset = COUNTRY_ASSETS[country];

  if (!asset) {
    console.warn(`[GTFS] No asset configured for ${country}, using empty DB`);
    const fallback = await SQLite.openDatabaseAsync(`gtfs_fallback_${country}.db`);
    await createEmptySchema(fallback);
    dbPool[country] = fallback;
    return fallback;
  }

  // ── BUNDLED: copiar desde el bundle de la app al filesystem ──────────────
  if (asset.type === 'bundled') {
    const dbPath = SQLITE_DIR + asset.dbName;
    const info   = await FileSystem.getInfoAsync(dbPath);
    if (!info.exists) {
      try {
        const expoAsset = Asset.fromModule(asset.module);
        await expoAsset.downloadAsync();
        if (expoAsset.localUri) {
          await FileSystem.copyAsync({ from: expoAsset.localUri, to: dbPath });
          console.log(`[GTFS] ${asset.dbName} copiado al dispositivo`);
        }
      } catch (e) {
        console.warn(`[GTFS] Error copiando ${asset.dbName}:`, e);
        const fallback = await SQLite.openDatabaseAsync(asset.dbName);
        await createEmptySchema(fallback);
        dbPool[country] = fallback;
        return fallback;
      }
    }
    const conn = await SQLite.openDatabaseAsync(asset.dbName);
    console.log(`[GTFS] Abierto (bundled): ${asset.dbName}`);
    dbPool[country] = conn;
    return conn;
  }

  // ── LOCAL: abrir directamente desde filesystem (sin require) ─────────────
  // Si el archivo no existe, expo-sqlite crea un DB vacío → schema vacío → queries devuelven [].
  // En producción EAS Build, los DBs se pre-instalan en el binario y están disponibles.
  try {
    const conn = await SQLite.openDatabaseAsync(asset.dbName);
    // Verificar si tiene datos reales o es un DB vacío recién creado
    const hasData = await conn.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='stops'`,
    );
    if (!hasData || hasData.n === 0) {
      console.log(`[GTFS] ${asset.dbName} vacío — creando schema`);
      await createEmptySchema(conn);
    } else {
      console.log(`[GTFS] Abierto (local): ${asset.dbName}`);
    }
    dbPool[country] = conn;
    return conn;
  } catch (e) {
    console.warn(`[GTFS] Error abriendo ${asset.dbName}:`, e);
    const fallback = await SQLite.openDatabaseAsync(`gtfs_fallback_${country}.db`);
    await createEmptySchema(fallback);
    dbPool[country] = fallback;
    return fallback;
  }
}

async function createEmptySchema(conn: SQLite.SQLiteDatabase): Promise<void> {
  await conn.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS stops (
      stop_id TEXT PRIMARY KEY, stop_name TEXT NOT NULL,
      stop_lat REAL NOT NULL, stop_lon REAL NOT NULL,
      country_code TEXT DEFAULT 'XX', location_type INTEGER DEFAULT 0,
      parent_station TEXT
    );
    CREATE TABLE IF NOT EXISTS routes (
      route_id TEXT PRIMARY KEY, agency_id TEXT,
      route_short_name TEXT, route_long_name TEXT, route_type INTEGER
    );
    CREATE TABLE IF NOT EXISTS trips (
      trip_id TEXT PRIMARY KEY, route_id TEXT, service_id TEXT,
      trip_headsign TEXT, direction_id INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS stop_times (
      trip_id TEXT NOT NULL, arrival_time TEXT, departure_time TEXT,
      stop_id TEXT NOT NULL, stop_sequence INTEGER,
      PRIMARY KEY (trip_id, stop_sequence)
    );
    CREATE TABLE IF NOT EXISTS calendar_dates (
      service_id TEXT, date TEXT, exception_type INTEGER,
      PRIMARY KEY (service_id, date)
    );
  `);
}

// ── Query helpers (always operate on activeCountry) ───────────────────────────

async function db(): Promise<SQLite.SQLiteDatabase> {
  return ensureDB(activeCountry);
}

// ── Query: nearest station ────────────────────────────────────────────────────
/**
 * Returns the closest station to `coords` in the active country's DB.
 *
 * Works for both Swiss (SBB) and French (SNCF) GTFS schemas:
 *   SBB:  stop_ids like "8503000" or "8503000:0:10"
 *   SNCF: stop_ids like "StopPoint:OCETGV INOUI-87391003" (ALL have ':')
 *
 * Strategy: group by parent_station so we return ONE physical station even
 * when multiple stop_ids share the same location (different service types).
 * Falls back to stop_id grouping when parent_station is empty.
 */
export async function findNearestStation(coords: Coordinates): Promise<Station | null> {
  const conn = await db();
  const { latitude: lat, longitude: lon } = coords;
  const DELTA = 1.0; // ~111 km per degree

  const row = await conn.getFirstAsync<{
    stop_id:      string;
    stop_name:    string;
    stop_lat:     number;
    stop_lon:     number;
    country_code: string;
  }>(`
    SELECT
      stop_id, stop_name,
      AVG(stop_lat) AS stop_lat,
      AVG(stop_lon) AS stop_lon,
      country_code,
      (AVG(stop_lat) - ?) * (AVG(stop_lat) - ?) +
      (AVG(stop_lon) - ?) * (AVG(stop_lon) - ?) AS dist_sq
    FROM stops
    WHERE stop_lat BETWEEN ? AND ?
      AND stop_lon BETWEEN ? AND ?
    GROUP BY COALESCE(NULLIF(parent_station,''), stop_id)
    ORDER BY dist_sq ASC
    LIMIT 1
  `, [lat, lat, lon, lon, lat - DELTA, lat + DELTA, lon - DELTA, lon + DELTA]);

  if (!row) return null;
  return rowToStation(row);
}

// ── Query: upcoming trains ────────────────────────────────────────────────────
/**
 * Returns next `limit` departures from `stationId` within the next 4 hours.
 * Matches both the parent stop AND all its platform children
 * (e.g. "8503000" and "8503000:0:10").
 */
// UTC offsets per country — GTFS times are in local time of the country
const COUNTRY_UTC_OFFSET: Partial<Record<CountryCode, number>> = {
  CH: 1, FR: 1, DE: 1, IT: 1, NL: 1, AT: 1, BE: 1, PT: 0,
  NO: 1, DK: 1, ES: 1, GB: 0, GB_LON: 0,
  US: -5, US_NYC: -5, US_CHI: -6, US_LAX: -8,
  ES_MAD: 1, ES_BCN: 1, FR_PAR: 1, DE_BER: 1, DE_MUN: 1,
  JP: 9,
};

export async function queryUpcomingTrains(
  stationId: string,
  limit: number = 3,
): Promise<TrainService[]> {
  const conn    = await db();
  // Adjust device time to the country's local time for correct GTFS comparison
  const utcOffset   = COUNTRY_UTC_OFFSET[activeCountry] ?? 0;
  const deviceOffset = -new Date().getTimezoneOffset() / 60; // device UTC offset in hours
  const diffMs      = (utcOffset - deviceOffset) * 3_600_000;
  const now         = new Date(Date.now() + diffMs);
  const depFrom = timeToGTFS(now);
  const depTo   = timeToGTFS(new Date(now.getTime() + 4 * 3600_000));

  const rows = await conn.getAllAsync<{
    trip_id:        string;
    departure_time: string;
    arrival_time:   string;
    platform_code:  string | null;
    route_id:       string;
    operator_code:  string | null;
    trip_headsign:  string | null;
    dest_stop_id:   string;
    dest_name:      string;
    dest_lat:       number;
    dest_lon:       number;
    origin_name:    string;
    origin_lat:     number;
    origin_lon:     number;
  }>(`
    SELECT
      st.trip_id,
      st.departure_time,
      st.arrival_time,
      NULL            AS platform_code,
      t.route_id,
      NULL            AS operator_code,
      t.trip_headsign,
      dest_st.stop_id  AS dest_stop_id,
      dest_s.stop_name AS dest_name,
      dest_s.stop_lat  AS dest_lat,
      dest_s.stop_lon  AS dest_lon,
      orig_s.stop_name AS origin_name,
      orig_s.stop_lat  AS origin_lat,
      orig_s.stop_lon  AS origin_lon
    FROM stop_times st
    JOIN trips t   ON t.trip_id  = st.trip_id
    JOIN stop_times dest_st ON dest_st.trip_id = st.trip_id
      AND dest_st.stop_sequence = (
        SELECT MAX(s2.stop_sequence) FROM stop_times s2 WHERE s2.trip_id = st.trip_id
      )
    JOIN stops dest_s ON dest_s.stop_id = dest_st.stop_id
    JOIN stops orig_s ON orig_s.stop_id = st.stop_id
    WHERE st.stop_id IN (
      -- All stops sharing the same physical station (same parent_station).
      -- SBB:  parent = 'Parent8503000'  → matches '8503000', '8503000:0:10', etc.
      -- SNCF: parent = 'StopArea:OCE87391003' → matches all service-type variants.
      -- Falls back to exact stop_id match when parent_station is null/empty.
      SELECT s2.stop_id FROM stops s2
      WHERE s2.parent_station = (SELECT parent_station FROM stops WHERE stop_id = ?)
        AND s2.parent_station IS NOT NULL
        AND s2.parent_station != ''
      UNION
      SELECT ?
    )
      AND st.departure_time >= ?
      AND st.departure_time <= ?
    ORDER BY st.departure_time ASC
    LIMIT ?
  `, [stationId, stationId, depFrom, depTo, limit]);

  return rows.map((row) => gtfsRowToTrainService(row, now));
}

// ── Query: all stations for geofencing ───────────────────────────────────────
/**
 * Returns parent stops only (no platform children) for the active country.
 * Used by the geofence engine to register station proximity rings.
 */
export async function getAllGeofenceStations(): Promise<{
  stop_id:   string;
  lat:       number;
  lon:       number;
  stop_name: string;
}[]> {
  const conn = await db();
  // One entry per physical station grouped by parent_station.
  // SBB parent = 'Parent8503000', SNCF parent = 'StopArea:OCE87391003'.
  // Falls back to stop_id when parent_station is empty (no duplicates).
  return conn.getAllAsync(`
    SELECT
      stop_id,
      stop_name,
      AVG(stop_lat) AS lat,
      AVG(stop_lon) AS lon
    FROM stops
    GROUP BY COALESCE(NULLIF(parent_station, ''), stop_id)
  `);
}

// ── Board: salidas / arribos ──────────────────────────────────────────────────
export interface BoardEntry {
  time:     string;   // "14:32"
  train:    string;   // route_short_name o route_long_name
  endpoint: string;   // destino (salidas) u origen (arribos)
  station:  string;   // nombre de la parada
  status:   'ontime' | 'delayed' | 'cancelled';
}

// ── TfL board: live arrivals via api.tfl.gov.uk (no GTFS stop_times) ────────
// TfL no publica GTFS stop_times estático. El board se construye consultando
// las líneas principales en tiempo real. Sin API key — 50 req/min anónimo.
const TFL_MAIN_LINES = ['central', 'victoria', 'jubilee', 'northern', 'piccadilly'];

async function getTfLBoard(
  mode: 'salidas' | 'arribos',
  limit: number,
): Promise<BoardEntry[]> {
  try {
    const lineIds = TFL_MAIN_LINES.join(',');
    const url     = `https://api.tfl.gov.uk/Line/${lineIds}/Arrivals`;
    const ctrl    = new AbortController();
    const timer   = setTimeout(() => ctrl.abort(), 6000);
    const res     = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) return [];

    const arrivals: any[] = await res.json();
    const now = Date.now();

    return arrivals
      .filter((a) => typeof a.timeToStation === 'number' && a.timeToStation >= 0)
      .sort((a, b) => a.timeToStation - b.timeToStation)
      .slice(0, limit)
      .map((a) => {
        const eta     = new Date(now + a.timeToStation * 1000);
        const hh      = eta.getUTCHours().toString().padStart(2, '0');
        const mm      = eta.getUTCMinutes().toString().padStart(2, '0');
        const lineName = (a.lineName ?? a.lineId ?? 'Tube').replace(/ line$/i, '');
        return {
          time:     `${hh}:${mm}`,
          train:    lineName,
          endpoint: a.towards ?? a.destinationName ?? '—',
          station:  a.stationName?.replace(/ Underground Station$/i, '') ?? '—',
          status:   'ontime' as const,
        };
      });
  } catch {
    return [];
  }
}

/**
 * getCountryBoard — devuelve las próximas salidas o arribos de un país.
 * GB_LON usa TfL live API directamente (no tiene GTFS stop_times).
 * El resto consulta la DB SQLite local.
 */
export async function getCountryBoard(
  country: CountryCode,
  mode: 'salidas' | 'arribos',
  limit = 30,
): Promise<BoardEntry[]> {
  // TfL: bypasear GTFS y llamar API live
  if (country === 'GB_LON' || country === 'GB') {
    return getTfLBoard(mode, limit);
  }

  const conn = await ensureDB(country);
  const utcOffset    = COUNTRY_UTC_OFFSET[country] ?? 0;
  const deviceOffset = -new Date().getTimezoneOffset() / 60;
  const diffMs       = (utcOffset - deviceOffset) * 3_600_000;
  const now          = new Date(Date.now() + diffMs);
  const fromTime     = timeToGTFS(now);
  const toTime       = timeToGTFS(new Date(now.getTime() + 6 * 3_600_000));
  const timeCol      = mode === 'salidas' ? 'st.departure_time' : 'st.arrival_time';

  try {
    const rows = await conn.getAllAsync<{
      t:     string;
      train: string | null;
      head:  string | null;
      stop:  string;
    }>(`
      SELECT
        ${timeCol}                                              AS t,
        COALESCE(r.route_short_name, r.route_long_name, '')   AS train,
        COALESCE(t.trip_headsign, '')                         AS head,
        s.stop_name                                           AS stop
      FROM stop_times st
      JOIN trips  t ON st.trip_id = t.trip_id
      JOIN routes r ON t.route_id = r.route_id
      JOIN stops  s ON st.stop_id = s.stop_id
      WHERE ${timeCol} >= ? AND ${timeCol} <= ?
        AND s.location_type IN (0, 1)
      ORDER BY t ASC
      LIMIT ?
    `, [fromTime, toTime, limit]);

    return rows.map((r) => ({
      time:     formatBoardTime(r.t),
      train:    r.train ?? '—',
      endpoint: r.head  || '—',
      station:  r.stop,
      status:   'ontime' as const,
    }));
  } catch {
    return [];
  }
}

function formatBoardTime(gtfsTime: string): string {
  const parts = gtfsTime.split(':');
  const h = parseInt(parts[0] ?? '0', 10) % 24;
  const m = parts[1] ?? '00';
  return `${h.toString().padStart(2, '0')}:${m}`;
}

/**
 * getStationById — fetches a single station by GTFS stop_id.
 * Accepts an optional country override; defaults to activeCountry.
 */
export async function getStationById(
  stopId:   string,
  country?: CountryCode,
): Promise<Station | null> {
  const conn = await ensureDB(country ?? activeCountry);
  const row  = await conn.getFirstAsync<{
    stop_id:      string;
    stop_name:    string;
    stop_lat:     number;
    stop_lon:     number;
    country_code: string;
  }>(
    'SELECT stop_id, stop_name, stop_lat, stop_lon, country_code FROM stops WHERE stop_id = ?',
    [stopId],
  );
  if (!row) return null;
  return rowToStation(row);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeToGTFS(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  const s = date.getSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function gtfsTimeToDate(gtfsTime: string, baseDate: Date): Date {
  // GTFS allows hours > 23 for post-midnight trips (e.g. "25:30:00")
  const [hStr, mStr, sStr] = gtfsTime.split(':');
  const h = parseInt(hStr ?? '0', 10);
  const m = parseInt(mStr ?? '0', 10);
  const s = parseInt(sStr ?? '0', 10);
  const d = new Date(baseDate);
  d.setHours(h % 24, m, s, 0);
  if (h >= 24) d.setDate(d.getDate() + Math.floor(h / 24));
  return d;
}

function rowToStation(row: {
  stop_id:      string;
  stop_name:    string;
  stop_lat:     number;
  stop_lon:     number;
  country_code: string;
}): Station {
  return {
    id:          row.stop_id,
    name:        row.stop_name,
    nameLocal:   row.stop_name,
    country:     (row.country_code ?? activeCountry) as CountryCode,
    coordinates: { latitude: row.stop_lat, longitude: row.stop_lon },
    platforms:   [],
  };
}

function gtfsRowToTrainService(row: any, baseDate: Date): TrainService {
  const departureTime = gtfsTimeToDate(row.departure_time ?? '00:00:00', baseDate);
  const arrivalTime   = gtfsTimeToDate(
    row.arrival_time ?? row.departure_time ?? '00:00:00',
    baseDate,
  );

  // Derive operator from active country + headsign keywords
  const headsign: string = row.trip_headsign ?? '';
  const defaultByCountry: Partial<Record<CountryCode, TrainService['operator']>> = {
    CH: 'sbb', FR: 'sncf', ES: 'renfe', DE: 'db',
    IT: 'trenitalia', NL: 'ns', AT: 'oebb', GB: 'lner',
    GB_LON: 'tfl', FR_PAR: 'ratp', ES_BCN: 'tmb', ES_MAD: 'emt',
    DE_BER: 'db',  DE_MUN: 'db',
    US_NYC: 'mta_nyc', US_CHI: 'cta', US_LAX: 'la_metro',
    PT: 'sncf', BE: 'thalys', DK: 'dsb', JP: 'jr',
  };
  let operator: TrainService['operator'] = defaultByCountry[activeCountry] ?? 'other';
  // Override from headsign keywords
  const h = headsign.toUpperCase();
  if (h.includes('TGV') || h.includes('INOUI') || h.includes('OUIGO')) operator = 'sncf';
  else if (h.includes('ICE') || h.startsWith('DB '))                    operator = 'db';
  else if (h.includes('AVE') || h.includes('ALVIA'))                    operator = 'renfe';
  else if (h.includes('FRECCIAROSSA') || h.includes('FRECCIARGENTO'))   operator = 'trenitalia';

  return {
    serviceId:    row.trip_id,
    operator,
    trainType:    deriveTrainType(headsign),
    trainNumber:  row.trip_id.split('_').pop() ?? row.trip_id,
    origin: {
      id:          row.trip_id + '_orig',
      name:        row.origin_name ?? '',
      nameLocal:   row.origin_name ?? '',
      country:     activeCountry,
      coordinates: { latitude: row.origin_lat ?? 0, longitude: row.origin_lon ?? 0 },
      platforms:   [],
    },
    destination: {
      id:          row.dest_stop_id,
      name:        row.dest_name ?? '',
      nameLocal:   row.dest_name ?? '',
      country:     activeCountry,
      coordinates: { latitude: row.dest_lat ?? 0, longitude: row.dest_lon ?? 0 },
      platforms:   [],
    },
    departureTime,
    arrivalTime,
    platform:     row.platform_code ?? undefined,
    delayMinutes: 0,
    status:       'on-time',
    classes:      ['first', 'second'],
  };
}

function deriveTrainType(headsign: string): TrainService['trainType'] {
  const h = headsign.toUpperCase();
  if (h.includes('TGV') || h.includes('AVE') || h.includes('FRECCIAROSSA')) return 'high-speed';
  if (h.includes('ICE') || h.includes('IC') || h.includes('EC'))            return 'intercity';
  if (h.includes('NIGHT') || h.includes('EN ') || h.includes('NJ'))         return 'night';
  return 'regional';
}
