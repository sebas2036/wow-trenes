/**
 * backgroundDownloadService — Descarga nativa en segundo plano
 *
 * ANDROID: usa expo-file-system con DownloadResumable
 *   → La descarga continúa aunque el usuario minimice la app
 *   → TaskManager registra la tarea de fondo
 *
 * iOS: FileSystem.createDownloadResumable usa URLSession internamente
 *   → Apple limita background fetch a ~30s cada 15-30 min
 *   → Para descargas largas: se reanuda cuando el usuario vuelve
 *   → El snapshot guardado permite continuar exactamente donde quedó
 *
 * NOTA: Para background real en iOS se necesita un build nativo (EAS Build).
 * En Expo Go el background es limitado.
 */
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { downloadDb, isDbReady } from './dbDownloadService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKGROUND_TASK_NAME = 'GTFS_BACKGROUND_DOWNLOAD';
const PENDING_DOWNLOADS_KEY = '@gtfs_pending_downloads';

// ── Registro de la tarea de fondo ─────────────────────────────────────────────
TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  try {
    const raw = await AsyncStorage.getItem(PENDING_DOWNLOADS_KEY);
    if (!raw) return BackgroundFetch.BackgroundFetchResult.NoData;

    const pending: string[] = JSON.parse(raw);
    if (pending.length === 0) return BackgroundFetch.BackgroundFetchResult.NoData;

    let downloaded = false;

    for (const dbName of pending) {
      const ready = await isDbReady(dbName);
      if (!ready) {
        console.log(`[BGDownload] Background: descargando ${dbName}`);
        const ok = await downloadDb(dbName);
        if (ok) {
          downloaded = true;
          // Quitar de la lista de pendientes
          const updated = pending.filter(n => n !== dbName);
          await AsyncStorage.setItem(PENDING_DOWNLOADS_KEY, JSON.stringify(updated));
        }
        // Solo una descarga por ciclo background (iOS limita el tiempo)
        break;
      } else {
        // Ya está listo, quitar de pendientes
        const updated = pending.filter(n => n !== dbName);
        await AsyncStorage.setItem(PENDING_DOWNLOADS_KEY, JSON.stringify(updated));
      }
    }

    return downloaded
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (e) {
    console.warn('[BGDownload] Error en tarea de fondo:', e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ── API pública ────────────────────────────────────────────────────────────────

/**
 * registerBackgroundDownloads — registra la tarea de fondo.
 * Llamar una vez al iniciar la app.
 */
export async function registerBackgroundDownloads(): Promise<void> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      console.log('[BGDownload] Background fetch no disponible en este dispositivo');
      return;
    }

    await BackgroundFetch.registerTaskAsync(BACKGROUND_TASK_NAME, {
      minimumInterval: 15 * 60,  // mínimo 15 min entre ejecuciones
      stopOnTerminate:  false,    // continúa si el usuario cierra la app (Android)
      startOnBoot:      true,     // inicia al encender el dispositivo (Android)
    });

    console.log('[BGDownload] Tarea de fondo registrada');
  } catch (e) {
    // Si ya está registrada, no es un error
    if (!(e as Error)?.message?.includes('already')) {
      console.warn('[BGDownload] Error registrando tarea:', e);
    }
  }
}

/**
 * queueForBackground — agrega DBs a la cola de descarga en background.
 * La tarea de fondo los descargará cuando el sistema lo permita.
 */
export async function queueForBackground(dbNames: string[]): Promise<void> {
  try {
    const raw     = await AsyncStorage.getItem(PENDING_DOWNLOADS_KEY);
    const current: string[] = raw ? JSON.parse(raw) : [];

    // Agregar solo los que no están ya en la cola y no están descargados
    const toAdd: string[] = [];
    for (const name of dbNames) {
      const ready = await isDbReady(name);
      if (!ready && !current.includes(name)) {
        toAdd.push(name);
      }
    }

    if (toAdd.length > 0) {
      const updated = [...current, ...toAdd];
      await AsyncStorage.setItem(PENDING_DOWNLOADS_KEY, JSON.stringify(updated));
      console.log(`[BGDownload] En cola para background: ${toAdd.join(', ')}`);
    }
  } catch (e) {
    console.warn('[BGDownload] Error agregando a cola:', e);
  }
}

/**
 * getPendingDownloads — lista de DBs pendientes de descarga.
 */
export async function getPendingDownloads(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_DOWNLOADS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
