/**
 * dbDownloadService — Descarga lazy de bases de datos GTFS grandes
 *
 * Las DBs grandes (FR, BE, AT) no van en el bundle APK.
 * Se descargan desde GitHub LFS al directorio SQLite del dispositivo.
 *
 * ARQUITECTURA ANTI-OOM + RESUMABLE:
 * ┌─────────────────────────────────────────────────────────┐
 * │  FileSystem.createDownloadResumable                     │
 * │  → Streaming directo a disco (NUNCA carga en RAM)       │
 * │  → Escribe en bloques de 4-64KB internamente            │
 * │  → Guarda snapshot del estado en AsyncStorage           │
 * │  → Si se corta → reanuda desde el byte exacto           │
 * │    via HTTP Range: bytes=X- (Range Requests)            │
 * └─────────────────────────────────────────────────────────┘
 *
 * URL base: https://media.githubusercontent.com/media/sebas2036/wow-trenes/main/assets/
 * Destino:  FileSystem.documentDirectory + 'SQLite/' + dbName
 */
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Constantes ────────────────────────────────────────────────────────────────
const SQLITE_DIR   = FileSystem.documentDirectory + 'SQLite/';
const BASE_URL     = 'https://media.githubusercontent.com/media/sebas2036/wow-trenes/main/assets/';
const STORAGE_KEY  = '@gtfs_downloaded_dbs';
const RESUME_KEY   = '@gtfs_download_snapshots'; // snapshots para reanudar

// ── Estado en memoria ─────────────────────────────────────────────────────────
type DownloadStatus = 'ready' | 'downloading' | 'pending';
const downloadingSet = new Set<string>();
// Mapa de objetos DownloadResumable activos (para poder reanudar)
const activeResumables = new Map<string, FileSystem.DownloadResumable>();

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
    // Limpiar snapshot de reanudación ya no necesario
    await clearResumeSnapshot(dbName);
  } catch (e) {
    console.warn('[dbDownload] Error guardando estado:', e);
  }
}

async function saveResumeSnapshot(dbName: string, snapshot: FileSystem.DownloadPauseState): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(RESUME_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[dbName] = snapshot;
    await AsyncStorage.setItem(RESUME_KEY, JSON.stringify(all));
  } catch { /* non-fatal */ }
}

async function getResumeSnapshot(dbName: string): Promise<FileSystem.DownloadPauseState | null> {
  try {
    const raw = await AsyncStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw);
    return all[dbName] ?? null;
  } catch { return null; }
}

async function clearResumeSnapshot(dbName: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(RESUME_KEY);
    if (!raw) return;
    const all = JSON.parse(raw);
    delete all[dbName];
    await AsyncStorage.setItem(RESUME_KEY, JSON.stringify(all));
  } catch { /* non-fatal */ }
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
 * downloadDb — descarga el archivo DB con streaming y reanudación automática.
 *
 * CÓMO FUNCIONA:
 * 1. FileSystem.createDownloadResumable escribe en chunks de 4-64KB al disco
 *    → NUNCA carga el archivo completo en RAM → sin OOM
 * 2. Si se corta la conexión, guarda el snapshot (bytesWritten + URL)
 *    en AsyncStorage → próxima llamada reanuda desde ese byte exacto
 *    via HTTP Range: bytes=X- (Range Request al servidor)
 * 3. Descarga a .tmp → mueve al destino final solo si completa OK
 *    → archivo destino nunca queda corrupto a medias
 *
 * Retorna true si exitoso, false si falla.
 * onProgress recibe 0-100.
 */
export async function downloadDb(
  dbName: string,
  onProgress?: (pct: number) => void,
): Promise<boolean> {
  if (downloadingSet.has(dbName)) {
    console.log(`[dbDownload] Ya descargando: ${dbName}`);
    return false;
  }
  const ready = await isDbReady(dbName);
  if (ready) return true;

  await FileSystem.makeDirectoryAsync(SQLITE_DIR, { intermediates: true }).catch(() => {});

  const url  = BASE_URL + dbName;
  const dest = SQLITE_DIR + dbName;
  const tmp  = dest + '.tmp';

  downloadingSet.add(dbName);
  console.log(`[dbDownload] Iniciando/reanudando: ${dbName}`);

  const progressCallback = (p: FileSystem.DownloadProgressData) => {
    const { totalBytesWritten, totalBytesExpectedToWrite } = p;
    if (totalBytesExpectedToWrite > 0 && onProgress) {
      onProgress(Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100));
    }
  };

  try {
    let downloadResumable: FileSystem.DownloadResumable;

    // ¿Hay un snapshot guardado de una descarga interrumpida?
    const snapshot = await getResumeSnapshot(dbName);
    if (snapshot) {
      console.log(`[dbDownload] Reanudando desde snapshot: ${dbName}`);
      downloadResumable = FileSystem.createDownloadResumable(
        snapshot.url,
        snapshot.fileUri,
        snapshot.options,
        progressCallback,
        snapshot.resumeData,
      );
    } else {
      downloadResumable = FileSystem.createDownloadResumable(
        url, tmp, {}, progressCallback,
      );
    }

    // Guardar referencia activa
    activeResumables.set(dbName, downloadResumable);

    const result = await downloadResumable.downloadAsync();
    activeResumables.delete(dbName);

    if (!result || result.status !== 200) {
      console.warn(`[dbDownload] Status inesperado ${result?.status}: ${dbName}`);
      // Pausar y guardar snapshot para reanudar luego
      try {
        const pauseState = await downloadResumable.pauseAsync();
        if (pauseState) await saveResumeSnapshot(dbName, pauseState);
      } catch { /* non-fatal */ }
      return false;
    }

    // Mover .tmp → destino final
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
    await FileSystem.moveAsync({ from: tmp, to: dest });
    await markAsDownloaded(dbName);
    if (onProgress) onProgress(100);
    console.log(`[dbDownload] ✓ Completado: ${dbName}`);
    return true;

  } catch (e: any) {
    activeResumables.delete(dbName);
    // Si se cortó la red → pausar y guardar snapshot
    if (e?.message?.includes('network') || e?.message?.includes('Network')) {
      try {
        const resumable = activeResumables.get(dbName);
        if (resumable) {
          const pauseState = await resumable.pauseAsync();
          if (pauseState) await saveResumeSnapshot(dbName, pauseState);
          console.log(`[dbDownload] Pausado por red, snapshot guardado: ${dbName}`);
        }
      } catch { /* non-fatal */ }
    } else {
      // Error no recuperable → limpiar
      await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
      await clearResumeSnapshot(dbName);
    }
    console.warn(`[dbDownload] Error: ${dbName}`, e?.message);
    return false;
  } finally {
    downloadingSet.delete(dbName);
    activeResumables.delete(dbName);
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
