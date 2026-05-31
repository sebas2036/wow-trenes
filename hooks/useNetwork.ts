/**
 * useNetwork — hook de conectividad para componentes React.
 * Se actualiza automáticamente cuando cambia la conexión.
 */
import { useState, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { isOnline, invalidateNetworkCache, getLastKnownStatus } from '../services/networkService';

export function useNetwork() {
  const [online, setOnline] = useState<boolean>(getLastKnownStatus());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    // Probe inicial — una sola vez al montar
    isOnline().then(status => {
      if (mounted.current) setOnline(status);
    });

    // Re-probar al volver de background
    const handleAppState = (next: AppStateStatus) => {
      if (next === 'active') {
        invalidateNetworkCache();
        isOnline().then(status => {
          if (mounted.current) setOnline(status);
        });
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);

    return () => {
      mounted.current = false;
      sub.remove();
    };
  }, []); // sin dependencias — solo se ejecuta al montar/desmontar

  return { online, isOffline: !online };
}
