/**
 * haptics — wrapper sobre expo-haptics que respeta el toggle "Vibración" de Ajustes.
 *
 * Usar estos helpers en vez de llamar a Haptics.* directamente, así el toggle del
 * usuario tiene efecto en TODA la app.
 */
import * as Haptics from 'expo-haptics';
import { getHapticsEnabled } from './userSettings';

export function hImpact(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light): void {
  if (getHapticsEnabled()) Haptics.impactAsync(style).catch(() => {});
}

export function hSelection(): void {
  if (getHapticsEnabled()) Haptics.selectionAsync().catch(() => {});
}

export function hNotify(type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success): void {
  if (getHapticsEnabled()) Haptics.notificationAsync(type).catch(() => {});
}

// Re-export de los enums para que los call-sites no necesiten importar expo-haptics
export const ImpactStyle = Haptics.ImpactFeedbackStyle;
export const NotifyType  = Haptics.NotificationFeedbackType;
