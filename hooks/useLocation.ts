/**
 * useLocation — Expo Location hook
 * RGPD: coordinates stay on-device, never uploaded to cloud.
 * Requests foreground permission first; background permission lazily
 * when geofencing activates.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import type { Coordinates } from '../types';

export type LocationState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'granted'; coords: Coordinates; accuracy: number | null }
  | { status: 'denied'; reason: string }
  | { status: 'error'; message: string };

interface UseLocationReturn {
  locationState: LocationState;
  requestLocation: () => Promise<Coordinates | null>;
  requestBackgroundPermission: () => Promise<boolean>;
  startWatching: (onUpdate: (coords: Coordinates) => void) => Promise<() => void>;
}

// ── Dev override — simula estar en Zurich para testear desde Argentina ─────────
// Cambiar a false para usar GPS real, o cambiar las coordenadas a otra ciudad:
//   Madrid:  { latitude: 40.4168, longitude: -3.7038 }
//   Paris:   { latitude: 48.8566, longitude:  2.3522 }
//   London:  { latitude: 51.5074, longitude: -0.1278 }
//   NYC:     { latitude: 40.7128, longitude: -74.0060 }
const DEV_LOCATION: Coordinates | null = null;

export function useLocation(): UseLocationReturn {
  const [locationState, setLocationState] = useState<LocationState>({ status: 'idle' });
  const watcherRef = useRef<Location.LocationSubscription | null>(null);

  // Cleanup watcher on unmount
  useEffect(() => {
    return () => {
      watcherRef.current?.remove();
    };
  }, []);

  const requestLocation = useCallback(async (): Promise<Coordinates | null> => {
    setLocationState({ status: 'requesting' });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // 1. Check / request foreground permission
    const { status: existingStatus } = await Location.getForegroundPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Location.requestForegroundPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      setLocationState({
        status: 'denied',
        reason: 'WoW TRENES necesita tu ubicación para mostrarte estaciones cercanas.',
      });
      return null;
    }

    // 2. Get current position (dev override if active)
    try {
      let coords: Coordinates;

      if (DEV_LOCATION) {
        // Simulated location for testing outside Europe/USA
        await new Promise(r => setTimeout(r, 300)); // simula latencia GPS
        coords = DEV_LOCATION;
      } else {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        coords = {
          latitude:  location.coords.latitude,
          longitude: location.coords.longitude,
        };
      }

      setLocationState({
        status:   'granted',
        coords,
        accuracy: DEV_LOCATION ? null : null,
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return coords;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al obtener la ubicación';
      setLocationState({ status: 'error', message });
      return null;
    }
  }, []);

  const requestBackgroundPermission = useCallback(async (): Promise<boolean> => {
    const { status: fg } = await Location.getForegroundPermissionsAsync();
    if (fg !== 'granted') return false;

    const { status: bg } = await Location.getBackgroundPermissionsAsync();
    if (bg === 'granted') return true;

    const { status: requested } = await Location.requestBackgroundPermissionsAsync();
    return requested === 'granted';
  }, []);

  const startWatching = useCallback(
    async (onUpdate: (coords: Coordinates) => void): Promise<() => void> => {
      watcherRef.current?.remove();

      // Dev override — emit simulated location once and keep static
      if (DEV_LOCATION) {
        onUpdate(DEV_LOCATION);
        return () => {};
      }

      const subscription = await Location.watchPositionAsync(
        {
          accuracy:           Location.Accuracy.Balanced,
          timeInterval:       5000,  // 5 s
          distanceInterval:   10,    // 10 m
        },
        (location) => {
          onUpdate({
            latitude:  location.coords.latitude,
            longitude: location.coords.longitude,
          });
        },
      );

      watcherRef.current = subscription;
      return () => subscription.remove();
    },
    [],
  );

  return { locationState, requestLocation, requestBackgroundPermission, startWatching };
}
