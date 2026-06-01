/**
 * dbDownloadService — Descarga lazy de bases de datos GTFS grandes
 *
 * Las DBs grandes (FR, BE, AT) no van en el bundle APK.
 * Se descargan desde GitHub LFS al directorio SQLite del dispositivo.
 *
 * URL base: https://media.githubusercontent.com/media/sebas2036/wow-trenes/main/assets/
 * Destino:  FileSystem.documentDirectory + 'SQLite/' + dbName
 */
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Constantes ────────────────────────────────────────────────────────────────
const SQLITE_DIR = FileSystem.documentDirectory + 'SQLite/';
const BASE_URL   = 'https://media.githubusercontent.com/media/sebas2036/wow-trenes/main/assets/';
const STORAGE_KEY = '@gtfs_downloaded_dbs';

// ── Estado en memoria ─────────────────────────────────────────────────────────
type DownloadStatus = 'ready' | 'downloading' | 'pending';
const downloadingSet = new Set<string>();

// ── Helpers de persistencia ────────────────────────────────────────────────────
async function getDownloadedSet(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

async function markAsDownloaded(dbName: string): Promise<void> {
  try {
    const set = await getDownloadedSet();
    set.add(dbName);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch (e) {
    console.warn('[dbDownload] Error guardando estado:', e);
  }
}

// ── API pública ────────────────────────────────────────────────────────────────

/**
 * isDbReady — true si el archivo existe en el filesystem del dispositivo.
 * Verifica tanto el estado en AsyncStorage como la existencia real del archivo.
 */
export async function isDbReady(dbName: string): Promise<boolean> {
  try {
    await FileSystem.makeDirectoryAsync(SQLITE_DIR, { intermediates: true }).catch(() => {});
    const path = SQLITE_DIR + dbName;
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists && (info as any).size > 1024) {
      // Archivo existe y tiene contenido real — sincronizar con AsyncStorage
      await markAsDownloaded(dbName);
      return true;
    }
    // Archivo no existe o está corrupto
    const downloaded = await getDownloadedSet();
    if (downloaded.has(dbName)) {
      // Estado desincronizado — limpiar registro
      downloaded.delete(dbName);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...downloaded]));
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * getDownloadStatus — estado actual de la descarga.
 */
export function getDownloadStatus(dbName: string): DownloadStatus {
  if (downloadingSet.has(dbName)) return 'downloading';
  return 'pending';
  // Nota: 'ready' se obtiene via isDbReady (async). Este método es síncrono.
}

/**
 * downloadDb — descarga el archivo DB desde GitHub LFS.
 * Retorna true si la descarga fue exitosa.
 * onProgress recibe un valor de 0 a 100.
 */
export async function downloadDb(
  dbName: string,
  onProgress?: (pct: number) => void,
): Promise<boolean> {
  if (downloadingSet.has(dbName)) {
    console.log(`[dbDownload] Ya descargando: ${dbName}`);
    return false;
  }

  // Verificar si ya existe
  const ready = await isDbReady(dbName);
  if (ready) return true;

  await FileSystem.makeDirectoryAsync(SQLITE_DIR, { intermediates: true }).catch(() => {});

  const url  = BASE_URL + dbName;
  const dest = SQLITE_DIR + dbName;
  const tmp  = dest + '.tmp';

  downloadingSet.add(dbName);
  console.log(`[dbDownload] Iniciando descarga: ${dbName}`);

  try {
    const downloadResumable = FileSystem.createDownloadResumable(
      url,
      tmp,
      {},
      (progress) => {
        const { totalBytesWritten, totalBytesExpectedToWrite } = progress;
        if (totalBytesExpectedToWrite > 0 && onProgress) {
          const pct = Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100);
          onProgress(pct);
        }
      },
    );

    const result = await downloadResumable.downloadAsync();

    if (!result || result.status !== 200) {
      console.warn(`[dbDownload] Descarga fallida (status ${result?.status}): ${dbName}`);
      // Limpiar archivo temporal si existe
      await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
      return false;
    }

    // Mover de .tmp al destino final
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
    await FileSystem.moveAsync({ from: tmp, to: dest });

    await markAsDownloaded(dbName);
    console.log(`[dbDownload] Descarga completada: ${dbName}`);
    if (onProgress) onProgress(100);
    return true;
  } catch (e) {
    console.warn(`[dbDownload] Error descargando ${dbName}:`, e);
    await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
    return false;
  } finally {
    downloadingSet.delete(dbName);
  }
}

/**
 * prefetchInBackground — lanza descargas en background sin bloquear.
 * Descarga cada DB en secuencia para no saturar la red.
 */
export function prefetchInBackground(dbNames: string[]): void {
  (async () => {
    for (const dbName of dbNames) {
      const ready = await isDbReady(dbName);
      if (!ready && !downloadingSet.has(dbName)) {
        console.log(`[dbDownload] Prefetch background: ${dbName}`);
        await downloadDb(dbName);
        // Pequeña pausa entre descargas para no saturar
        await new Promise(r => setTimeout(r, 500));
      }
    }
  })().catch(e => console.warn('[dbDownload] Error en prefetch background:', e));
}
