/**
 * userSettings — preferencias del usuario (Ajustes), persistidas en AsyncStorage.
 *
 * Getters síncronos (leen un caché en memoria) para que el wrapper de haptics y
 * el gateo de notificaciones puedan consultarlas sin await. Se cargan una vez al
 * arrancar la app (loadUserSettings en _layout).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@user_settings_v1';

let hapticsEnabled       = true;
let notificationsEnabled = true;

/** Cargar al arrancar la app (antes de que el usuario interactúe). */
export async function loadUserSettings(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      hapticsEnabled       = s.haptics       ?? true;
      notificationsEnabled = s.notifications ?? true;
    }
  } catch { /* mantener defaults */ }
}

async function persist(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ haptics: hapticsEnabled, notifications: notificationsEnabled }));
  } catch { /* no-op */ }
}

export const getHapticsEnabled       = (): boolean => hapticsEnabled;
export const getNotificationsEnabled = (): boolean => notificationsEnabled;

export async function setHapticsEnabled(v: boolean): Promise<void> {
  hapticsEnabled = v;
  await persist();
}
export async function setNotificationsEnabled(v: boolean): Promise<void> {
  notificationsEnabled = v;
  await persist();
}
