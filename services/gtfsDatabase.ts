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

// ── Asset map — add a new entry for each country you bundle ──────────────────
const COUNTRY_ASSETS: Partial<Record<CountryCode, { dbName: string; module: number }>> = {
  CH: { dbName: 'gtfs_switzerland.db', module: require('../assets/gtfs_switzerland.db') },
  FR: { dbName: 'gtfs_france.db',      module: require('../assets/gtfs_france.db')      },
  ES: { dbName: 'gtfs_spain.db',       module: require('../assets/gtfs_spain.db')       },
  DE: { dbName: 'gtfs_germany.db',     module: require('../assets/gtfs_germany.db')     },
  // IT: Trenitalia/RFI no publica GTFS nacional (viola directiva UE 2017/1926).
  // Usando feeds regionales fusionados: Trenord (Lombardía) + Toscana Trenitalia.
  // Cubre: Milano, Roma, Firenze, Bologna, Genova, Pisa, Siena, Cinque Terre y más.
  IT: { dbName: 'gtfs_italy.db',       module: require('../assets/gtfs_italy.db')       },
  // NL: Feed nacional completo CC0 — NS Intercity + Sprinter + operadores regionales
  // Placeholder — ejecutar import_gtfs_netherlands.py con ~/Downloads/Wow trains Netherlands/
  NL: { dbName: 'gtfs_netherlands.db', module: require('../assets/gtfs_netherlands.db') },
  // AT: ÖBB — placeholder, ejecutar import_gtfs_at.py con datos de data.oebb.at
  AT: { dbName: 'gtfs_austria.db',     module: require('../assets/gtfs_austria.db')     },
  // BE: SNCB/NMBS via iRail — 557 estaciones, red completa Bélgica
  BE: { dbName: 'gtfs_belgium.db',     module: require('../assets/gtfs_belgium.db')     },
  // PT: CP Comboios de Portugal — placeholder (CP no publica GTFS abierto)
  PT: { dbName: 'gtfs_portugal.db',    module: require('../assets/gtfs_portugal.db')    },
  // NO: Entur feed nacional NLOD — 902 estaciones, red completa Noruega
  NO: { dbName: 'gtfs_norway.db',      module: require('../assets/gtfs_norway.db')      },
  // US: Amtrak feed nacional abierto — placeholder, ejecutar import_gtfs_us.py
  // Descarga: https://content.amtrak.com/content/gtfs/GTFS.zip
  US: { dbName: 'gtfs_usa.db',         module: require('../assets/gtfs_usa.db')         },
  // US_NYC: MTA Subway + LIRR + Metro-North + PATH — Nueva York completo
  // Descarga subway: http://web.mta.info/developers/data/nyct/subway/google_transit.zip
  // Descarga LIRR:   http://web.mta.info/developers/data/lirr/google_transit.zip
  // Descarga MNR:    http://web.mta.info/developers/data/mnr/google_transit.zip
  US_NYC: { dbName: 'gtfs_usa_nyc.db', module: require('../assets/gtfs_usa_nyc.db')     },

  // ── Metros urbanos ────────────────────────────────────────────────────────
  // SETUP: ejecutar `python3 scripts/create_metro_placeholders.py` una sola vez
  // para generar los placeholder DBs, luego usar los scripts import_gtfs_*.py
  // para importar datos reales.
  //
  // ES_MAD: Fuente: https://datos.comunidad.madrid/catalogo/dataset/gtfs_metro_madrid
  // ES_BCN: Fuente: https://developer.tmb.cat/ (registro gratuito)
  // US_CHI: Fuente: https://www.transitchicago.com/downloads/sch_data/google_transit.zip
  // US_LAX: Fuente: https://gitlab.com/LACMTA/gtfs_rail/raw/master/gtfs_rail.zip
  //
  // ES_MAD: Madrid Metro CRTM — 13 líneas · 272 estaciones (datos reales)
  ES_MAD: { dbName: 'gtfs_es_mad.db',  module: require('../assets/gtfs_es_mad.db')  },
  // US_CHI: Chicago CTA L — 8 líneas · 298 estaciones (datos reales)
  US_CHI: { dbName: 'gtfs_us_chi.db',  module: require('../assets/gtfs_us_chi.db')  },
  // ES_BCN: Barcelona TMB — placeholder · ejecutar import_gtfs_es_bcn.py cuando tengas feed
  // ES_BCN: { dbName: 'gtfs_es_bcn.db',  module: require('../assets/gtfs_es_bcn.db')  },
  US_LAX: { dbName: 'gtfs_us_lax.db',  module: require('../assets/gtfs_us_lax.db')  },

  // ── Gran Bretaña ──────────────────────────────────────────────────────────
  // GB: National Rail intercity — Avanti · LNER · GWR · ScotRail · +20 TOCs
  // Registro gratuito: https://opendata.nationalrail.co.uk/ → Data Feeds → GTFS
  // Placeholder hasta que ejecutes: python3 scripts/import_gtfs_gb.py
  GB:     { dbName: 'gtfs_gb.db',      module: require('../assets/gtfs_gb.db')      },
  // GB_LON: London Underground / TfL — TfL no publica GTFS nativo (usa TransXChange)
  // DB generada con coordenadas NaPTAN reales de 160+ estaciones (Tube + Elizabeth + DLR + Overground)
  // Ejecutar una sola vez: python3 scripts/create_gtfs_gb_tfl.py
  GB_LON: { dbName: 'gtfs_gb_tfl.db',  module: require('../assets/gtfs_gb_tfl.db')  },
};

const SQLITE_DIR = FileSystem.documentDirectory + 'SQLite/';

// One open connection per country (lazy-opened)
const dbPool: Partial<Record<CountryCode, SQLite.SQLiteDatabase>> = {};

// Active country for the current session (default: Switzerland)
let activeCountry: CountryCode = 'CH';

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
    // Country not bundled — return an empty in-memory fallback so the app
    // doesn't crash; queries will simply return empty arrays.
    console.warn(`[GTFS] No asset bundled for country ${country}, using empty DB`);
    const fallback = await SQLite.openDatabaseAsync(`gtfs_fallback_${country}.db`);
    await createEmptySchema(fallback);
    dbPool[country] = fallback;
    return fallback;
  }

  const dbPath = SQLITE_DIR + asset.dbName;
  const info   = await FileSystem.getInfoAsync(dbPath);

  if (!info.exists) {
    try {
      const expoAsset = Asset.fromModule(asset.module);
      await expoAsset.downloadAsync();
      if (expoAsset.localUri) {
        await FileSystem.copyAsync({ from: expoAsset.localUri, to: dbPath });
        console.log(`[GTFS] ${asset.dbName} copied from bundle to device`);
      }
    } catch (e) {
      // Expo Go / simulator: binary assets can't be bundled at runtime.
      // Fall back to an empty schema so queries return [] instead of crashing.
      console.warn(`[GTFS] Could not copy ${asset.dbName} (Expo Go?), using empty schema:`, e);
      const fallback = await SQLite.openDatabaseAsync(asset.dbName);
      await createEmptySchema(fallback);
      dbPool[country] = fallback;
      return fallback;
    }
  }

  const opened = await SQLite.openDatabaseAsync(asset.dbName);
  console.log(`[GTFS] Opened ${asset.dbName}`);
  dbPool[country] = opened;
  return opened;
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
export async function queryUpcomingTrains(
  stationId: string,
  limit: number = 3,
): Promise<TrainService[]> {
  const conn    = await db();
  const now     = new Date();
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
    GB_LON: 'tfl',
    PT: 'sncf', BE: 'thalys', JP: 'jr',
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
