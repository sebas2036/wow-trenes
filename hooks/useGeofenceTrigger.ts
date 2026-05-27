/**
 * useGeofenceTrigger — React hook for foreground geofence events (STEP 6)
 *
 * Listens to incoming notifications dispatched by geofenceTask.ts.
 * When Ring-2 (inner) notification arrives:
 *   1. Loads the encrypted ticket from local storage.
 *   2. Sets state → QRTicketOverlay renders with `autoMode=true`.
 *   3. Calls expo-brightness to force 100% brightness.
 *
 * When app is in foreground, the notification handler intercepts the payload
 * and opens the QR overlay WITHOUT showing the system notification banner.
 */
import { useState, useEffect, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import * as Brightness    from 'expo-brightness';
import { AppState, AppStateStatus } from 'react-native';
import { loadTicket }     from '../services/ticketStorage';
import type { StoredTicket } from '../types';

interface GeofenceTriggerState {
  activeTicket:    StoredTicket | null;
  qrVisible:       boolean;
  triggerRing:     'outer' | 'inner' | null;
  stationName:     string | null;
}

interface UseGeofenceTriggerReturn extends GeofenceTriggerState {
  dismissQR:    () => void;
  openManually: (ticket: StoredTicket) => void;
}

export function useGeofenceTrigger(): UseGeofenceTriggerReturn {
  const [state, setState] = useState<GeofenceTriggerState>({
    activeTicket: null,
    qrVisible:    false,
    triggerRing:  null,
    stationName:  null,
  });

  // ── Notification listener (foreground) ───────────────────────────────
  useEffect(() => {
    // Handle notifications while app is in foreground
    const foregroundSub = Notifications.addNotificationReceivedListener(
      async (notification) => {
        const data = notification.request.content.data as any;
        if (!data?.openQR || !data?.ticketId) return;

        const ticket = await loadTicket(data.ticketId);
        if (!ticket) return;

        setState({
          activeTicket: ticket,
          qrVisible:    true,
          triggerRing:  data.type === 'inner_ring' ? 'inner' : 'outer',
          stationName:  null, // Could load from GTFS if needed
        });
      },
    );

    // Handle tapping on notification (app was in background or killed)
    const responseSub = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        const data = response.notification.request.content.data as any;
        if (!data?.ticketId) return;

        const ticket = await loadTicket(data.ticketId);
        if (!ticket) return;

        // Small delay to let the app finish mounting
        setTimeout(() => {
          setState({
            activeTicket: ticket,
            qrVisible:    true,
            triggerRing:  data.type === 'inner_ring' ? 'inner' : 'outer',
            stationName:  null,
          });
        }, 500);
      },
    );

    return () => {
      foregroundSub.remove();
      responseSub.remove();
    };
  }, []);

  // ── App state: restore brightness on background ───────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' && state.qrVisible) {
        // App moved to background — restore brightness
        Brightness.getSystemBrightnessAsync()
          .then(() => Brightness.restoreSystemBrightnessAsync())
          .catch(() => {});
      }
    });
    return () => sub.remove();
  }, [state.qrVisible]);

  // ── Dismiss ───────────────────────────────────────────────────────────
  const dismissQR = useCallback(() => {
    setState((prev) => ({ ...prev, qrVisible: false, triggerRing: null }));
    // Restore brightness
    Brightness.restoreSystemBrightnessAsync().catch(() => {});
  }, []);

  // ── Manual open (e.g., from ticket list screen) ───────────────────────
  const openManually = useCallback((ticket: StoredTicket) => {
    setState({
      activeTicket: ticket,
      qrVisible:    true,
      triggerRing:  null,
      stationName:  ticket.associatedStation ?? null,
    });
  }, []);

  return { ...state, dismissQR, openManually };
}
