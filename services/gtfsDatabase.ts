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
import {
  fetchSwissStationboard,
  fetchSwissConnections,
  searchSwissStations,
  nearestSwissStation,
  type SwissDeparture,
  type SwissConnection,
} from './swissRealTime';
import {
  overlayGermanyDelays,
  getGermanyAlerts,
  invalidateGermanyRT,
} from './germanyRealTime';
import {
  fetchItalyBoard,
  searchItalyStations,
  setActiveItalyStation,
  getActiveItalyStationName,
  invalidateItalyRT,
  type ItalyDeparture,
} from './italyRealTime';
import {
  fetchBelgiumBoard,
  searchBelgiumStations,
  setActiveBelgiumStation,
  getActiveBelgiumStationName,
  getBelgiumDisturbances,
  invalidateBelgiumRT,
  type BelgiumDeparture,
} from './belgiumRealTime';
import {
  fetchFranceBoard,
  searchFranceStations,
  setActiveFranceStation,
  getActiveFranceStationName,
  invalidateFranceRT,
  type FranceDeparture,
} from './franceRealTime';
import {
  fetchAustriaBoard,
  searchAustriaStations,
  setActiveAustriaStation,
  getActiveAustriaStationName,
  invalidateAustriaRT,
  type AustriaDeparture,
} from './austriaRealTime';
import {
  fetchPortugalBoard,
  searchPortugalStations,
  setActivePortugalStation,
  getActivePortugalStationName,
  invalidatePortugalRT,
  type PortugalDeparture,
} from './portugalRealTime';
import { isOnline } from './networkService';
import { isDbReady, downloadDb, getDownloadStatus } from './dbDownloadService';
import { fetchTmbBoard, setActiveTmbStop, getActiveTmbStopName, searchTmbStops } from './tmbRealtime';
import { fetchMadridBoard, setActiveMadridStop, getActiveMadridStopName, searchMadridStops } from './madridRealTime';
import { fetchGermanyBoard, setActiveGermanyStation, getActiveGermanyStationName, searchGermanyStations, type GermanyStation } from './germanyBoard';

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
  // ── BUNDLED — datos reales o placeholders pequeños (< 1 MB cada uno) ─────
  ES:     { type: 'bundled', dbName: 'gtfs_spain.db',       module: require('../assets/gtfs_spain.db')       },
  IT:     { type: 'bundled', dbName: 'gtfs_italy.db',       module: require('../assets/gtfs_italy.db')       },
  FR:     { type: 'bundled', dbName: 'gtfs_france.db',      module: require('../assets/gtfs_france.db')      },
  DE:     { type: 'bundled', dbName: 'gtfs_germany.db',     module: require('../assets/gtfs_germany.db')     },
  CH:     { type: 'bundled', dbName: 'gtfs_switzerland.db', module: require('../assets/gtfs_switzerland.db') },
  NL:     { type: 'bundled', dbName: 'gtfs_netherlands.db', module: require('../assets/gtfs_netherlands.db') },
  AT:     { type: 'bundled', dbName: 'gtfs_austria.db',     module: require('../assets/gtfs_austria.db')     },
  BE:     { type: 'bundled', dbName: 'gtfs_belgium.db',     module: require('../assets/gtfs_belgium.db')     },
  PT:     { type: 'bundled', dbName: 'gtfs_portugal.db',    module: require('../assets/gtfs_portugal.db')    },
  NO:     { type: 'bundled', dbName: 'gtfs_norway.db',      module: require('../assets/gtfs_norway.db')      },
  DK:     { type: 'bundled', dbName: 'gtfs_dk.db',          module: require('../assets/gtfs_dk.db')          },
  US:     { type: 'bundled', dbName: 'gtfs_usa.db',         module: require('../assets/gtfs_usa.db')         },
  US_NYC: { type: 'bundled', dbName: 'gtfs_usa_nyc.db',     module: require('../assets/gtfs_usa_nyc.db')     },
  JP:     { type: 'bundled', dbName: 'gtfs_japan.db',       module: require('../assets/gtfs_japan.db')       },
  ES_MAD: { type: 'bundled', dbName: 'gtfs_es_mad.db',      module: require('../assets/gtfs_es_mad.db')      },
  ES_BCN: { type: 'bundled', dbName: 'gtfs_es_bcn.db',      module: require('../assets/gtfs_es_bcn.db')      },
  FR_PAR: { type: 'bundled', dbName: 'gtfs_fr_par.db',      module: require('../assets/gtfs_fr_par.db')      },
  DE_BER: { type: 'bundled', dbName: 'gtfs_de_ber.db',      module: require('../assets/gtfs_de_ber.db')      },
  DE_MUN: { type: 'bundled', dbName: 'gtfs_de_mun.db',      module: require('../assets/gtfs_de_mun.db')      },
  US_CHI: { type: 'bundled', dbName: 'gtfs_us_chi.db',      module: require('../assets/gtfs_us_chi.db')      },
  US_LAX: { type: 'bundled', dbName: 'gtfs_us_lax.db',      module: require('../assets/gtfs_us_lax.db')      },
  IT_ROM: { type: 'bundled', dbName: 'gtfs_it_rom.db',      module: require('../assets/gtfs_it_rom.db')      },
  IT_MIL: { type: 'bundled', dbName: 'gtfs_it_mil.db',      module: require('../assets/gtfs_it_mil.db')      },
  AT_VIE: { type: 'bundled', dbName: 'gtfs_at_vie.db',      module: require('../assets/gtfs_at_vie.db')      },
  NL_AMS: { type: 'bundled', dbName: 'gtfs_nl_ams.db',      module: require('../assets/gtfs_nl_ams.db')      },
  PT_LIS: { type: 'bundled', dbName: 'gtfs_pt_lis.db',      module: require('../assets/gtfs_pt_lis.db')      },
  DK_CPH: { type: 'bundled', dbName: 'gtfs_dk_cph.db',      module: require('../assets/gtfs_dk_cph.db')      },
  NO_OSL: { type: 'bundled', dbName: 'gtfs_no_osl.db',      module: require('../assets/gtfs_no_osl.db')      },
  BE_BRU: { type: 'bundled', dbName: 'gtfs_be_bru.db',      module: require('../assets/gtfs_be_bru.db')      },
  // ── LOCAL — solo en EAS Build nativo (GB requiere credenciales NRDP) ──────
  GB:     { type: 'local',   dbName: 'gtfs_gb.db'                                                            },
  GB_LON: { type: 'local',   dbName: 'gtfs_gb_tfl.db'                                                        },
};

const SQLITE_DIR = FileSystem.documentDirectory + 'SQLite/';

// Países cuyas DBs son demasiado grandes para el bundle (>30 MB).
// Se descargan lazy desde GitHub LFS en lugar de copiarse desde el asset bundle.
const LAZY_DOWNLOAD_COUNTRIES = new Set<CountryCode>(['FR', 'BE', 'AT']);

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

    // ── LAZY DOWNLOAD: países grandes — no están en el bundle, se descargan ──
    if (LAZY_DOWNLOAD_COUNTRIES.has(country)) {
      const dbReady = await isDbReady(asset.dbName);
      if (!dbReady) {
        const status = getDownloadStatus(asset.dbName);
        if (status === 'downloading') {
          // Está descargando — devolver DB vacío silenciosamente
          console.log(`[GTFS] ${asset.dbName} descargándose — usando DB vacío temporalmente`);
          const empty = await SQLite.openDatabaseAsync(`gtfs_empty_${country}.db`);
          await createEmptySchema(empty);
          // No guardar en pool para que el próximo intento vuelva a verificar
          return empty;
        }
        // Intentar descarga (blocking para esta llamada)
        console.log(`[GTFS] ${asset.dbName} no descargado — iniciando descarga...`);
        const ok = await downloadDb(asset.dbName);
        if (!ok) {
          console.warn(`[GTFS] Descarga fallida para ${asset.dbName} — usando DB vacío`);
          const empty = await SQLite.openDatabaseAsync(`gtfs_empty_${country}.db`);
          await createEmptySchema(empty);
          return empty;
        }
      }
      // DB listo (ya existía o acaba de descargarse)
      const conn = await SQLite.openDatabaseAsync(asset.dbName);
      await ensureMissingTables(conn);
      console.log(`[GTFS] Abierto (lazy-download): ${asset.dbName}`);
      dbPool[country] = conn;
      return conn;
    }

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
    // Verificar que el DB copiado tiene datos reales
    const hasStops = await conn.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='stops'`,
    );
    if (!hasStops || hasStops.n === 0) {
      // DB vacío — la copia falló silenciosamente, reintentar
      console.warn(`[GTFS] ${asset.dbName} vacío tras copia, reintentando...`);
      try {
        const expoAsset = Asset.fromModule(asset.module);
        await expoAsset.downloadAsync();
        if (expoAsset.localUri) {
          await FileSystem.copyAsync({ from: expoAsset.localUri, to: SQLITE_DIR + asset.dbName });
        }
      } catch (retryErr) {
        console.warn(`[GTFS] Reintento fallido para ${asset.dbName}:`, retryErr);
      }
    }
    await ensureMissingTables(conn);
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
      await ensureMissingTables(conn);
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

/** Adds tables that may be missing from pre-built placeholder DBs (e.g. agency, calendar) */
async function ensureMissingTables(conn: SQLite.SQLiteDatabase): Promise<void> {
  await conn.execAsync(`
    CREATE TABLE IF NOT EXISTS agency (
      agency_id TEXT PRIMARY KEY, agency_name TEXT,
      agency_url TEXT, agency_timezone TEXT
    );
    CREATE TABLE IF NOT EXISTS calendar (
      service_id TEXT PRIMARY KEY,
      monday INTEGER, tuesday INTEGER, wednesday INTEGER, thursday INTEGER,
      friday INTEGER, saturday INTEGER, sunday INTEGER,
      start_date TEXT, end_date TEXT
    );
    CREATE TABLE IF NOT EXISTS calendar_dates (
      service_id TEXT, date TEXT, exception_type INTEGER,
      PRIMARY KEY (service_id, date)
    );
  `);
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
    CREATE TABLE IF NOT EXISTS agency (
      agency_id TEXT PRIMARY KEY, agency_name TEXT,
      agency_url TEXT, agency_timezone TEXT
    );
    CREATE TABLE IF NOT EXISTS calendar (
      service_id TEXT PRIMARY KEY,
      monday INTEGER, tuesday INTEGER, wednesday INTEGER, thursday INTEGER,
      friday INTEGER, saturday INTEGER, sunday INTEGER,
      start_date TEXT, end_date TEXT
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
// ── Bounding boxes para detección de país por GPS ────────────────────────────
const COUNTRY_BOUNDS: { code: CountryCode; latMin: number; latMax: number; lonMin: number; lonMax: number }[] = [
  { code: 'ES',  latMin: 35.9, latMax: 43.8, lonMin: -9.3,  lonMax:  4.4  },
  { code: 'FR',  latMin: 41.3, latMax: 51.1, lonMin: -5.2,  lonMax:  9.6  },
  { code: 'DE',  latMin: 47.3, latMax: 55.1, lonMin:  5.9,  lonMax: 15.1  },
  { code: 'IT',  latMin: 36.6, latMax: 47.1, lonMin:  6.6,  lonMax: 18.6  },
  { code: 'CH',  latMin: 45.8, latMax: 47.9, lonMin:  5.9,  lonMax: 10.5  },
  { code: 'AT',  latMin: 46.4, latMax: 49.0, lonMin:  9.5,  lonMax: 17.2  },
  { code: 'BE',  latMin: 49.5, latMax: 51.5, lonMin:  2.5,  lonMax:  6.4  },
  { code: 'PT',  latMin: 36.9, latMax: 42.2, lonMin: -9.5,  lonMax: -6.2  },
  { code: 'NL',  latMin: 50.7, latMax: 53.6, lonMin:  3.3,  lonMax:  7.2  },
  { code: 'NO',  latMin: 57.9, latMax: 71.2, lonMin:  4.6,  lonMax: 31.1  },
  { code: 'DK',  latMin: 54.5, latMax: 57.8, lonMin:  8.0,  lonMax: 15.2  },
  { code: 'GB',  latMin: 49.9, latMax: 58.7, lonMin: -8.2,  lonMax:  1.8  },
  { code: 'JP',  latMin: 30.9, latMax: 45.6, lonMin: 129.5, lonMax: 145.8 },
  { code: 'US',  latMin: 24.4, latMax: 49.4, lonMin:-124.8, lonMax: -66.9 },
];

/**
 * Detecta el país basándose en coordenadas GPS.
 * Retorna el CountryCode si las coords caen dentro del bounding box.
 */
export function detectCountryFromCoords(coords: Coordinates): CountryCode | null {
  const { latitude: lat, longitude: lon } = coords;
  for (const b of COUNTRY_BOUNDS) {
    if (lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax) {
      return b.code;
    }
  }
  return null; // Fuera de zona de cobertura (ej: Argentina)
}

export async function findNearestStation(coords: Coordinates): Promise<Station | null> {
  const { latitude: lat, longitude: lon } = coords;
  const DELTA = 1.0; // ~111 km por grado

  // Detectar país por GPS y cambiar el DB activo automáticamente
  const detectedCountry = detectCountryFromCoords(coords);
  if (detectedCountry) {
    await setActiveCountry(detectedCountry);
    console.log(`[GPS] País detectado: ${detectedCountry}`);
  } else {
    console.warn('[GPS] Coordenadas fuera de cobertura — sin cambio de país');
  }

  const conn = await db();

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
  CH: 2, FR: 2, DE: 2, IT: 2, NL: 2, AT: 2, BE: 2, PT: 1,
  NO: 2, DK: 2, ES: 2, GB: 1, GB_LON: 1,
  US: -5, US_NYC: -5, US_CHI: -6, US_LAX: -8,
  ES_MAD: 2, ES_BCN: 2, FR_PAR: 2, DE_BER: 2, DE_MUN: 2,
  IT_ROM: 2, IT_MIL: 2, AT_VIE: 2, NL_AMS: 2, BE_BRU: 2,
  PT_LIS: 1, DK_CPH: 2, NO_OSL: 2,
  JP: 9,
};

export async function queryUpcomingTrains(
  stationId: string,
  limit: number = 3,
): Promise<TrainService[]> {
  const conn    = await db();
  // Adjust device time to the country's local time for correct GTFS comparison
  const utcOffset   = COUNTRY_UTC_OFFSET[activeCountry] ?? 0;
  const deviceOffset = -new Date().getTimezoneOffset() / 60;
  const diffMs      = (utcOffset - deviceOffset) * 3_600_000;
  const now         = new Date(Date.now() + diffMs);
  const depFrom     = timeToGTFS(now);
  // GTFS date format: YYYYMMDD
  const todayGTFS = now.getFullYear().toString()
    + (now.getMonth() + 1).toString().padStart(2, '0')
    + now.getDate().toString().padStart(2, '0');
  const dow = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][now.getDay()];

  const rows = await conn.getAllAsync<{
    trip_id:           string;
    departure_time:    string;
    arrival_time:      string;
    platform_code:     string | null;
    route_id:          string;
    route_short_name:  string | null;
    operator_code:     string | null;
    trip_headsign:     string | null;
    dest_stop_id:      string;
    dest_arrival_time: string | null;
    dest_name:         string;
    dest_lat:          number;
    dest_lon:          number;
    origin_name:       string;
    origin_lat:        number;
    origin_lon:        number;
  }>(`
    SELECT
      st.trip_id,
      st.departure_time,
      st.arrival_time,
      NULL            AS platform_code,
      t.route_id,
      COALESCE(r.route_short_name, r.route_long_name) AS route_short_name,
      NULL            AS operator_code,
      t.trip_headsign,
      dest_st.stop_id       AS dest_stop_id,
      dest_st.arrival_time  AS dest_arrival_time,
      dest_s.stop_name AS dest_name,
      dest_s.stop_lat  AS dest_lat,
      dest_s.stop_lon  AS dest_lon,
      orig_s.stop_name AS origin_name,
      orig_s.stop_lat  AS origin_lat,
      orig_s.stop_lon  AS origin_lon
    FROM stop_times st
    JOIN trips t   ON t.trip_id  = st.trip_id
    JOIN routes r  ON r.route_id = t.route_id
    JOIN stop_times dest_st ON dest_st.trip_id = st.trip_id
      AND dest_st.stop_sequence = (
        SELECT MAX(s2.stop_sequence) FROM stop_times s2 WHERE s2.trip_id = st.trip_id
      )
    JOIN stops dest_s ON dest_s.stop_id = dest_st.stop_id
    JOIN stops orig_s ON orig_s.stop_id = st.stop_id
    LEFT JOIN (
      SELECT service_id FROM calendar
      WHERE start_date <= ?
        AND (end_date >= ? OR end_date = '' OR end_date IS NULL)
        AND (
          (? = 'monday'    AND monday    = 1) OR
          (? = 'tuesday'   AND tuesday   = 1) OR
          (? = 'wednesday' AND wednesday = 1) OR
          (? = 'thursday'  AND thursday  = 1) OR
          (? = 'friday'    AND friday    = 1) OR
          (? = 'saturday'  AND saturday  = 1) OR
          (? = 'sunday'    AND sunday    = 1)
        )
    ) AS cal ON cal.service_id = t.service_id
    LEFT JOIN calendar_dates cd
      ON cd.service_id = t.service_id AND cd.date = ?
    WHERE st.stop_id IN (
      SELECT s2.stop_id FROM stops s2
      WHERE s2.parent_station = (SELECT parent_station FROM stops WHERE stop_id = ?)
        AND s2.parent_station IS NOT NULL
        AND s2.parent_station != ''
      UNION
      SELECT ?
    )
      AND st.departure_time >= ?
      -- Solo salidas: excluir si la estación es la última parada del trip
      AND st.stop_sequence < (
        SELECT MAX(s3.stop_sequence) FROM stop_times s3 WHERE s3.trip_id = st.trip_id
      )
      AND (
        -- Servicio activo hoy según calendar o calendar_dates (exception_type=1)
        cal.service_id IS NOT NULL
        OR cd.exception_type = 1
        -- Si no hay tabla calendar (placeholders), mostrar de todas formas
        OR NOT EXISTS (SELECT 1 FROM calendar LIMIT 1)
      )
      AND (cd.exception_type IS NULL OR cd.exception_type != 2)
    GROUP BY st.trip_id
    ORDER BY st.departure_time ASC
    LIMIT ?
  `, [
    todayGTFS, todayGTFS,
    dow, dow, dow, dow, dow, dow, dow,
    todayGTFS,
    stationId, stationId, depFrom,
    limit,
  ]);

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
  delay?:   string;   // "+3'" — solo si hay demora real-time
  platform?: string;  // "7" — andén, si lo informa la API
  tripId?:  string;   // trip_id GTFS — usado para overlay RT (DE)
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
        const hh      = eta.toLocaleString('en-GB', { hour: '2-digit',   hour12: false, timeZone: 'Europe/London' });
        const mm      = eta.toLocaleString('en-GB', { minute: '2-digit', hour12: false, timeZone: 'Europe/London' });
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

// ── Suiza real-time via transport.opendata.ch ─────────────────────────────────

/** Estación suiza activa (se actualiza cuando el usuario la selecciona o por GPS). */
let activeSwissStation: { id: string; name: string } | null = null;

export function setActiveSwissStation(id: string, name: string) {
  activeSwissStation = { id, name };
}

export function getActiveSwissStationName(): string {
  return activeSwissStation?.name ?? 'Zürich HB';
}

/**
 * Tablero real-time Suiza: llama a /stationboard de transport.opendata.ch.
 * Si no se estableció estación activa, usa Zürich HB como default.
 * Fallback al GTFS local si no hay conexión.
 */
async function getSwissBoard(
  mode: 'salidas' | 'arribos',
  limit: number,
): Promise<BoardEntry[]> {
  const station = activeSwissStation?.name ?? 'Zürich HB';
  try {
    const departures = await fetchSwissStationboard(station, limit);
    return departures.map((d: SwissDeparture): BoardEntry => ({
      time:     formatBoardTime(
        `${d.departureTime.getHours().toString().padStart(2,'0')}:${d.departureTime.getMinutes().toString().padStart(2,'0')}:00`
      ),
      train:    d.category || d.trainNumber.split(' ')[0] || '—',
      endpoint: d.destination || '—',
      station:  d.stationName,
      status:   d.delayMin > 0 ? 'delayed' as const : 'ontime' as const,
      delay:    d.delayMin > 0 ? `+${d.delayMin}'` : undefined,
      platform: d.platform || undefined,
    }));
  } catch (e) {
    console.warn('[Swiss RT] fallback a GTFS local:', e);
    // Fallback GTFS local
    return getCountryBoardGTFS('CH', mode, limit);
  }
}

/** Versión GTFS pura de getCountryBoard (usado como fallback para CH). */
async function getCountryBoardGTFS(
  country: CountryCode,
  mode: 'salidas' | 'arribos',
  limit: number,
): Promise<BoardEntry[]> {
  const conn = await ensureDB(country);
  const utcOffset    = COUNTRY_UTC_OFFSET[country] ?? 0;
  const deviceOffset = -new Date().getTimezoneOffset() / 60;
  const diffMs       = (utcOffset - deviceOffset) * 3_600_000;
  const now          = new Date(Date.now() + diffMs);
  const fromTime     = timeToGTFS(now);
  const timeCol      = mode === 'salidas' ? 'st.departure_time' : 'st.arrival_time';
  try {
    const rows = await conn.getAllAsync<{
      t: string; train: string | null; head: string | null; stop: string; trip_id: string;
    }>(`
      SELECT MIN(${timeCol}) AS t,
        COALESCE(r.route_short_name, r.route_long_name, '') AS train,
        COALESCE(t.trip_headsign, '') AS head,
        s.stop_name AS stop,
        st.trip_id
      FROM stop_times st
      JOIN trips  t ON st.trip_id = t.trip_id
      JOIN routes r ON t.route_id = r.route_id
      JOIN stops  s ON st.stop_id = s.stop_id
      WHERE ${timeCol} >= ? AND s.location_type IN (0, 1)
      GROUP BY st.trip_id ORDER BY t ASC LIMIT ?
    `, [fromTime, limit]);
    return rows.map((r) => ({
      time:     formatBoardTime(r.t),
      train:    r.train ?? '—',
      endpoint: r.head  || '—',
      station:  r.stop,
      status:   'ontime' as const,
      tripId:   r.trip_id,
    }));
  } catch { return []; }
}

/**
 * getCountryBoard — devuelve las próximas salidas o arribos de un país.
 * CH    usa transport.opendata.ch en tiempo real (sin API key).
 * GB_LON usa TfL live API directamente (no tiene GTFS stop_times).
 * El resto consulta la DB SQLite local.
 */
export async function getCountryBoard(
  country: CountryCode,
  mode: 'salidas' | 'arribos',
  limit = 30,
): Promise<BoardEntry[]> {
  // Modo offline — saltar APIs real-time, usar solo GTFS local
  const online = await isOnline();
  if (!online) {
    console.log(`[GTFS] Offline — usando GTFS local para ${country}`);
    return getCountryBoardGTFS(country, mode, limit);
  }

  // Suiza: API real-time transport.opendata.ch
  if (country === 'CH') {
    return getSwissBoard(mode, limit);
  }

  // TfL: bypasear GTFS y llamar API live
  if (country === 'GB_LON' || country === 'GB') {
    return getTfLBoard(mode, limit);
  }

  // Alemania: GTFS estático + overlay GTFS-RT desde gtfs.de
  // Alemania: DB Navigator real-time → fallback GTFS + overlay delays
  if (country === 'DE') {
    try {
      const entries = await fetchGermanyBoard(mode, limit);
      if (entries.length > 0) return entries as BoardEntry[];
    } catch (e) {
      console.warn('[DE] Board fallback a GTFS+RT:', e);
    }
    const gtfsEntries = await getCountryBoardGTFS('DE', mode, limit);
    return overlayGermanyDelays(gtfsEntries);
  }

  // Italia: ViaggiaTreno real-time (API pública Trenitalia), fallback GTFS
  if (country === 'IT') {
    try {
      const departures = await fetchItalyBoard(mode, limit);
      if (departures.length > 0) {
        return departures.map((d: ItalyDeparture): BoardEntry => ({
          time:     d.scheduledTime,
          train:    d.category || d.trainNumber || '—',
          endpoint: d.destination || '—',
          station:  d.stationName,
          status:   d.delayMin > 1 ? 'delayed' : 'ontime',
          delay:    d.delayMin > 1 ? `+${d.delayMin}'` : undefined,
          platform: d.platform || undefined,
        }));
      }
    } catch (e) {
      console.warn('[IT RT] fallback a GTFS:', e);
    }
    return getCountryBoardGTFS('IT', mode, limit);
  }

  // Francia: SNCF API real-time (Navitia), fallback GTFS
  if (country === 'FR') {
    try {
      const departures = await fetchFranceBoard(mode, limit);
      if (departures.length > 0) {
        return departures.map((d: FranceDeparture): BoardEntry => ({
          time:     d.scheduledTime,
          train:    d.category || d.trainNumber || '—',
          endpoint: d.destination || '—',
          station:  d.stationName,
          status:   d.cancelled ? 'cancelled' : d.delayMin > 1 ? 'delayed' : 'ontime',
          delay:    d.delayMin > 1 ? `+${d.delayMin}'` : undefined,
          platform: d.platform || undefined,
        }));
      }
    } catch (e) {
      console.warn('[FR RT] fallback a GTFS:', e);
    }
    return getCountryBoardGTFS('FR', mode, limit);
  }

  // Portugal: CP API oficialmente caída (404) — usar GTFS directamente
  if (country === 'PT') {
    return getCountryBoardGTFS('PT', mode, limit);
  }

  // Austria: ÖBB Hafas real-time (no oficial), fallback GTFS
  if (country === 'AT') {
    try {
      const departures = await fetchAustriaBoard(mode, limit);
      if (departures.length > 0) {
        return departures.map((d: AustriaDeparture): BoardEntry => ({
          time:     d.scheduledTime,
          train:    d.category || d.trainNumber || '—',
          endpoint: d.destination || '—',
          station:  d.stationName,
          status:   d.cancelled ? 'cancelled' : d.delayMin > 1 ? 'delayed' : 'ontime',
          delay:    d.delayMin > 1 ? `+${d.delayMin}'` : undefined,
          platform: d.platform || undefined,
        }));
      }
    } catch (e) {
      console.warn('[AT RT] fallback a GTFS:', e);
    }
    return getCountryBoardGTFS('AT', mode, limit);
  }

  // Bélgica: iRail API real-time (NMBS/SNCB), fallback GTFS
  if (country === 'BE') {
    try {
      const departures = await fetchBelgiumBoard(mode, limit);
      if (departures.length > 0) {
        return departures.map((d: BelgiumDeparture): BoardEntry => ({
          time:     d.scheduledTime,
          train:    d.category || d.trainNumber || '—',
          endpoint: d.destination || '—',
          station:  d.stationName,
          status:   d.cancelled ? 'cancelled' : d.delayMin > 1 ? 'delayed' : 'ontime',
          delay:    d.delayMin > 1 ? `+${d.delayMin}'` : undefined,
          platform: d.platform || undefined,
        }));
      }
    } catch (e) {
      console.warn('[BE RT] fallback a GTFS:', e);
    }
    return getCountryBoardGTFS('BE', mode, limit);
  }

  // Madrid Metro: CRTM real-time → fallback GTFS
  if (country === 'ES_MAD') {
    try {
      const entries = await fetchMadridBoard(limit);
      if (entries.length > 0) return entries as BoardEntry[];
    } catch (e) {
      console.warn('[ES_MAD] CRTM fallback a GTFS:', e);
    }
    return getCountryBoardGTFS('ES_MAD', mode, limit);
  }

  // Barcelona Metro: TMB real-time → fallback GTFS
  if (country === 'ES_BCN') {
    try {
      const entries = await fetchTmbBoard(limit);
      if (entries.length > 0) return entries as BoardEntry[];
    } catch (e) {
      console.warn('[ES_BCN] TMB fallback a GTFS:', e);
    }
    return getCountryBoardGTFS('ES_BCN', mode, limit);
  }

  // París Metro: IDFM real-time cuando haya API key → fallback GTFS (gtfs_fr_par.db)
  if (country === 'FR_PAR') {
    return getCountryBoardGTFS('FR_PAR', mode, limit);
  }

  return getCountryBoardGTFS(country, mode, limit);
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
  // dest_arrival_time = llegada al destino final del viaje (último stop del trip)
  const arrivalTime   = gtfsTimeToDate(
    row.dest_arrival_time ?? row.arrival_time ?? row.departure_time ?? '00:00:00',
    baseDate,
  );

  // Derive operator from active country + headsign keywords
  const headsign: string = row.trip_headsign ?? '';
  const defaultByCountry: Partial<Record<CountryCode, TrainService['operator']>> = {
    CH: 'sbb', FR: 'sncf', ES: 'renfe', DE: 'db',
    IT: 'trenitalia', NL: 'ns', AT: 'oebb', GB: 'lner',
    GB_LON: 'tfl', FR_PAR: 'ratp', ES_BCN: 'tmb', ES_MAD: 'metro_madrid',
    IT_ROM: 'atac', IT_MIL: 'atm', AT_VIE: 'wiener_linien',
    NL_AMS: 'gvb', PT_LIS: 'metro_lisboa', DK_CPH: 'metro_cph',
    NO_OSL: 'ruter', BE_BRU: 'stib',
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
    trainNumber:  row.route_short_name ?? row.trip_id.split('_')[0] ?? row.trip_id,
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

/**
 * getFirstStation — returns the busiest stop from the active country's DB.
 * Uses stop_times count as proxy for importance → returns the main hub station.
 * Used as a GPS fallback when the user is testing from outside the country.
 */
export async function getFirstStation(): Promise<Station | null> {
  const conn = await db();
  // Buscar la estación con más stop_times = hub principal del país
  const row = await conn.getFirstAsync<{
    stop_id:      string;
    stop_name:    string;
    stop_lat:     number;
    stop_lon:     number;
    country_code: string;
  }>(`
    SELECT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon, s.country_code,
           COUNT(st.trip_id) AS cnt
    FROM stops s
    INNER JOIN stop_times st ON st.stop_id = s.stop_id
    WHERE s.location_type IN (0, 1)
    GROUP BY s.stop_id
    ORDER BY cnt DESC
    LIMIT 1
  `);
  if (!row) return null;
  return rowToStation(row);
}

function deriveTrainType(headsign: string): TrainService['trainType'] {
  const h = headsign.toUpperCase();
  if (h.includes('TGV') || h.includes('AVE') || h.includes('FRECCIAROSSA')) return 'high-speed';
  if (h.includes('ICE') || h.includes('IC') || h.includes('EC'))            return 'intercity';
  if (h.includes('NIGHT') || h.includes('EN ') || h.includes('NJ'))         return 'night';
  return 'regional';
}

// ── searchStations — autocomplete solo con estaciones que tienen trenes reales ─
// Normaliza acentos para búsqueda: Valencia → matchea València, Málaga, etc.
function normalizeAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export async function searchStations(query: string, limit = 20, country?: CountryCode): Promise<Station[]> {
  if (!query.trim()) return [];
  if (country) await setActiveCountry(country);
  const conn = await db();
  // Normalizamos el query en JS y también la columna en SQLite con REPLACEs encadenados
  const nq = `%${normalizeAccents(query)}%`;
  const rows = await conn.getAllAsync<{
    stop_id: string; stop_name: string;
    stop_lat: number; stop_lon: number; country_code: string;
  }>(
    // Compara stop_name normalizado (sin acentos, minúsculas) con el query normalizado
    `SELECT DISTINCT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon, s.country_code
     FROM stops s
     INNER JOIN stop_times st ON st.stop_id = s.stop_id
     INNER JOIN trips      tr ON tr.trip_id  = st.trip_id
     INNER JOIN routes     ro ON ro.route_id = tr.route_id
     WHERE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
             REPLACE(REPLACE(REPLACE(REPLACE(s.stop_name,
             'á','a'),'à','a'),'â','a'),'ä','a'),
             'é','e'),'è','e'),'ê','e'),'ë','e'),
             'í','i'),'ì','i'),'ó','o'),'ò','o')) LIKE ?
       AND s.location_type IN (0, 1)
       AND ro.route_type IN (2, 100, 101, 102, 103, 104, 105, 107, 108)
       AND s.stop_name NOT LIKE '%Cercanías%'
       AND s.stop_name NOT LIKE '%Cercanias%'
     GROUP BY s.stop_id
     ORDER BY s.stop_name ASC
     LIMIT ?`,
    [nq, limit],
  );
  return rows.map(rowToStation);
}

// ── TripResult — resultado del buscador ──────────────────────────────────────
export interface TripResult {
  tripId:        string;
  operator:      string;
  trainNumber:   string;
  departureTime: Date;
  arrivalTime:   Date;
  durationMin:   number;
  origin:        Station;
  destination:   Station;
}

// ── Re-exports Suiza real-time para uso en buscar-viaje.tsx ──────────────────
export { fetchSwissConnections, searchSwissStations, nearestSwissStation };
export { getGermanyAlerts, invalidateGermanyRT } from './germanyRealTime';
export { searchItalyStations, setActiveItalyStation, getActiveItalyStationName, invalidateItalyRT } from './italyRealTime';
export { searchBelgiumStations, setActiveBelgiumStation, getActiveBelgiumStationName, getBelgiumDisturbances, invalidateBelgiumRT } from './belgiumRealTime';
export { searchFranceStations, setActiveFranceStation, getActiveFranceStationName, invalidateFranceRT, searchFranceJourneys, type FranceJourney } from './franceRealTime';
export { searchAustriaStations, setActiveAustriaStation, getActiveAustriaStationName, invalidateAustriaRT } from './austriaRealTime';
export { searchPortugalStations, setActivePortugalStation, getActivePortugalStationName, invalidatePortugalRT } from './portugalRealTime';
export { setActiveTmbStop, getActiveTmbStopName, searchTmbStops } from './tmbRealtime';
export { setActiveMadridStop, getActiveMadridStopName, searchMadridStops } from './madridRealTime';
export { setActiveGermanyStation, getActiveGermanyStationName, searchGermanyStations, type GermanyStation } from './germanyBoard';

// ── searchTrips — origen → destino en una fecha dada ─────────────────────────
export async function searchTrips(
  originId:    string,
  destId:      string,
  date:        Date,
  maxResults = 10,
): Promise<TripResult[]> {
  const conn   = await db();
  const tzOff  = COUNTRY_UTC_OFFSET[activeCountry] ?? 0;

  // Convertir la fecha al horario local del país (no del dispositivo)
  // Ej: teléfono en Argentina (UTC-3), Madrid en UTC+2 → +5h
  const deviceOffset = -new Date().getTimezoneOffset() / 60;
  const localDate    = new Date(date.getTime() + (tzOff - deviceOffset) * 3_600_000);

  // Fecha en formato GTFS (YYYYMMDD) — en hora local del país
  const gtfsDate = localDate.getFullYear().toString()
    + (localDate.getMonth() + 1).toString().padStart(2, '0')
    + localDate.getDate().toString().padStart(2, '0');
  const dow = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][localDate.getDay()];

  // Hora mínima = hora actual en timezone del país (si es hoy) o 00:00
  const nowLocal  = new Date(Date.now() + (tzOff - deviceOffset) * 3_600_000);
  const isToday   = nowLocal.toDateString() === localDate.toDateString();
  const minHH     = isToday ? nowLocal.getHours().toString().padStart(2, '0') : '00';
  const minMM     = isToday ? nowLocal.getMinutes().toString().padStart(2, '0') : '00';
  const minTime   = `${minHH}:${minMM}:00`;

  type TripRow = {
    trip_id: string; dep_time: string; arr_time: string;
    route_short: string; route_long: string; agency_id: string;
    origin_name: string; origin_lat: number; origin_lon: number;
    dest_name: string; dest_lat: number; dest_lon: number;
  };

  const BASE_SELECT = `
    SELECT
      st_o.trip_id,
      MIN(st_o.departure_time) AS dep_time,
      MIN(st_d.arrival_time)   AS arr_time,
      COALESCE(r.route_short_name, r.route_long_name, '') AS route_short,
      COALESCE(r.route_long_name, '') AS route_long,
      COALESCE(a.agency_name, r.agency_id, '') AS agency_id,
      s_o.stop_name AS origin_name, s_o.stop_lat AS origin_lat, s_o.stop_lon AS origin_lon,
      s_d.stop_name AS dest_name,   s_d.stop_lat AS dest_lat,   s_d.stop_lon AS dest_lon
    FROM stop_times st_o
    JOIN stop_times st_d ON st_d.trip_id = st_o.trip_id AND st_d.stop_sequence > st_o.stop_sequence
    JOIN trips      t    ON t.trip_id  = st_o.trip_id
    JOIN routes     r    ON r.route_id = t.route_id
                        AND r.route_type IN (2,100,101,102,103,104,105,107,108)
    LEFT JOIN agency a   ON a.agency_id = r.agency_id
    JOIN stops s_o       ON s_o.stop_id = st_o.stop_id
    JOIN stops s_d       ON s_d.stop_id = st_d.stop_id
  `;

  // Intento 1: con filtro de calendario estricto
  let rows = await conn.getAllAsync<TripRow>(BASE_SELECT + `
    LEFT JOIN (
      SELECT service_id FROM calendar
      WHERE start_date <= ?
        AND (end_date >= ? OR end_date = '' OR end_date IS NULL)
        AND (
          (? = 'monday' AND monday=1) OR (? = 'tuesday' AND tuesday=1) OR
          (? = 'wednesday' AND wednesday=1) OR (? = 'thursday' AND thursday=1) OR
          (? = 'friday' AND friday=1) OR (? = 'saturday' AND saturday=1) OR
          (? = 'sunday' AND sunday=1)
        )
    ) AS cal ON cal.service_id = t.service_id
    LEFT JOIN calendar_dates cd ON cd.service_id = t.service_id AND cd.date = ?
    WHERE st_o.stop_id = ? AND st_d.stop_id = ? AND st_o.departure_time >= ?
      AND (cal.service_id IS NOT NULL OR cd.exception_type = 1
           OR NOT EXISTS (SELECT 1 FROM calendar LIMIT 1))
      AND (cd.exception_type IS NULL OR cd.exception_type != 2)
    GROUP BY st_o.trip_id
    ORDER BY CASE WHEN r.route_short_name IN ('AVE','AVE INT','AVLO','ALVIA','AVANT','EUROMED') THEN 0 ELSE 1 END,
             dep_time ASC LIMIT ?
  `, [gtfsDate, gtfsDate, dow, dow, dow, dow, dow, dow, dow, gtfsDate, originId, destId, minTime, maxResults]);

  // Intento 2: si el GTFS tiene fechas vencidas, ignorar calendario
  if (rows.length === 0) {
    rows = await conn.getAllAsync<TripRow>(BASE_SELECT + `
      WHERE st_o.stop_id = ? AND st_d.stop_id = ? AND st_o.departure_time >= ?
      GROUP BY st_o.trip_id
      ORDER BY CASE WHEN r.route_short_name IN ('AVE','AVE INT','AVLO','ALVIA','AVANT','EUROMED') THEN 0 ELSE 1 END,
               dep_time ASC LIMIT ?
    `, [originId, destId, minTime, maxResults]);
  }

  // Intento 3: buscar desde/hacia TODAS las estaciones de la misma ciudad
  // (ej: "Madrid Chamartín" → busca también desde "Madrid Puerta de Atocha")
  // cityOf extrae solo el nombre de ciudad: "Madrid Chamartín-Clara Campoamor" → "Madrid"
  if (rows.length === 0) {
    const cityOf = (stopName: string) => {
      // Primero dividir por guión/paréntesis, luego tomar solo la primera palabra si hay 2+
      const part = stopName.split(/[-–(]/)[0].trim();
      const words = part.split(' ');
      // Ciudades de una sola palabra: "Barcelona", "Lyon", "Roma" → devolver completo
      // Ciudades compuestas: "Madrid Chamartín" → devolver solo "Madrid"
      // Excepción: "Frankfurt (Main)" → ya limpiado a "Frankfurt" por el split anterior
      return words.length > 1 ? words[0] : part;
    };
    const originStop = await conn.getFirstAsync<{ stop_name: string }>(
      'SELECT stop_name FROM stops WHERE stop_id = ?', [originId]
    );
    const destStop = await conn.getFirstAsync<{ stop_name: string }>(
      'SELECT stop_name FROM stops WHERE stop_id = ?', [destId]
    );
    if (originStop && destStop) {
      const oCity = cityOf(originStop.stop_name);
      const dCity = cityOf(destStop.stop_name);
      // No buscar si origen y destino son la misma ciudad
      if (oCity.toLowerCase() === dCity.toLowerCase()) {
        rows = [];
      } else
      rows = await conn.getAllAsync<TripRow>(BASE_SELECT + `
        WHERE s_o.stop_name LIKE ? AND s_d.stop_name LIKE ?
          AND st_o.departure_time >= ?
        GROUP BY st_o.trip_id
        ORDER BY CASE WHEN r.route_short_name IN ('AVE','AVE INT','AVLO','ALVIA','AVANT','EUROMED') THEN 0 ELSE 1 END,
                 dep_time ASC LIMIT ?
      `, [`${oCity}%`, `${dCity}%`, minTime, maxResults]);
    }
  }

  // Deduplicar por hora_salida + hora_llegada + tren — más robusto que solo trip_id
  // (el intento 3 puede traer el mismo servicio con trip_ids distintos por variantes de plataforma)
  const seen = new Set<string>();
  const unique = rows.filter(r => {
    const key = `${r.dep_time}|${r.arr_time}|${r.route_short || r.route_long}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const results = unique.map(row => {
    const dep = gtfsTimeToDateWithOffset(row.dep_time, localDate, tzOff);
    const arr = gtfsTimeToDateWithOffset(row.arr_time, localDate, tzOff);
    const durationMin = Math.max(0, Math.round((arr.getTime() - dep.getTime()) / 60_000));
    const mkSt = (id: string, name: string, lat: number, lon: number): Station =>
      ({ id, name, nameLocal: name, country: activeCountry, coordinates: { latitude: lat, longitude: lon }, platforms: [] } as unknown as Station);
    return {
      tripId:        row.trip_id,
      operator:      row.agency_id || 'Operador',
      trainNumber:   row.route_short || row.route_long || row.trip_id.split('_')[0],
      departureTime: dep,
      arrivalTime:   arr,
      durationMin,
      origin:      mkSt(originId, row.origin_name, row.origin_lat, row.origin_lon),
      destination: mkSt(destId,   row.dest_name,  row.dest_lat,   row.dest_lon),
    };
  });

  // Ordenar por hora de salida; marcar el más rápido
  results.sort((a, b) => a.departureTime.getTime() - b.departureTime.getTime());
  const fastest = results.reduce((f, r) => r.durationMin < f.durationMin ? r : f, results[0]);
  if (fastest) (fastest as TripResult & { fastest?: boolean }).fastest = true;

  return results;
}

/**
 * getPopularDestinations — Destinos más frecuentes desde una estación.
 * Busca los headsigns (destinos finales) más comunes en los próximos trips.
 * Usado para mostrar sugerencias rápidas en buscar-viaje.
 */
export async function getPopularDestinations(
  originId: string,
  limit = 8,
): Promise<{ id: string; name: string; durationMin: number }[]> {
  try {
    const conn = await db();
    const tzOff = COUNTRY_UTC_OFFSET[activeCountry] ?? 0;
    const deviceOffset = -new Date().getTimezoneOffset() / 60;
    const now = new Date(Date.now() + (tzOff - deviceOffset) * 3_600_000);
    const minTime = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:00`;

    const rows = await conn.getAllAsync<{
      dest_stop_id: string; dest_name: string;
      avg_dur: number; cnt: number;
    }>(`
      SELECT
        s_d.stop_id          AS dest_stop_id,
        s_d.stop_name        AS dest_name,
        AVG(
          (CAST(substr(st_d.departure_time,1,2) AS INTEGER) * 60 +
           CAST(substr(st_d.departure_time,4,2) AS INTEGER)) -
          (CAST(substr(st_o.departure_time,1,2) AS INTEGER) * 60 +
           CAST(substr(st_o.departure_time,4,2) AS INTEGER))
        )                    AS avg_dur,
        COUNT(*)             AS cnt
      FROM stop_times st_o
      JOIN trips      tr  ON st_o.trip_id   = tr.trip_id
      JOIN stop_times st_d ON st_d.trip_id  = st_o.trip_id
                          AND st_d.stop_sequence > st_o.stop_sequence
      JOIN stops      s_o ON s_o.stop_id    = st_o.stop_id
      JOIN stops      s_d ON s_d.stop_id    = st_d.stop_id
      WHERE st_o.stop_id = ?
        AND st_o.departure_time >= ?
        AND s_d.stop_id != ?
      GROUP BY s_d.stop_name
      HAVING avg_dur > 10
      ORDER BY cnt DESC, avg_dur ASC
      LIMIT ?
    `, [originId, minTime, originId, limit * 3]);

    // Deduplicar por nombre de ciudad (ej: "Madrid Chamartín" y "Madrid Atocha" → solo "Madrid")
    const seen = new Set<string>();
    const result: { id: string; name: string; durationMin: number }[] = [];
    for (const r of rows) {
      const city = r.dest_name.split(/[-–,/]/)[0].trim();
      if (!seen.has(city)) {
        seen.add(city);
        result.push({ id: r.dest_stop_id, name: r.dest_name, durationMin: Math.round(r.avg_dur) });
      }
      if (result.length >= limit) break;
    }
    return result;
  } catch (e) {
    console.warn('[GTFS] getPopularDestinations error:', e);
    return [];
  }
}

// helper exclusivo de searchTrips con offset
function gtfsTimeToDateWithOffset(gtfsTime: string, base: Date, tzOffsetHours: number): Date {
  const [hh, mm, ss] = gtfsTime.split(':').map(Number);
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setTime(d.getTime() + (hh * 3600 + mm * 60 + (ss || 0)) * 1000 - tzOffsetHours * 3_600_000);
  return d;
}
