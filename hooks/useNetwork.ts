/**
 * useNetwork — hook de conectividad para componentes React.
 * Se actualiza automáticamente cuando cambia la conexión.
 */
import { useState, useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { onNetworkChange, isOnline, invalidateNetworkCache } from '../services/networkService';

export function useNetwork() {
  const [online, setOnline] = useState<boolean>(true); // asumir online hasta probe

  useEffect(() => {
    // Suscribirse a cambios de red
    const unsub = onNetworkChange(setOnline);

    // Re-probar al volver de background (el usuario puede haber perdido WiFi)
    const handleAppState = (next: AppStateStatus) => {
      if (next === 'active') {
        invalidateNetworkCache();
        isOnline().then(setOnline);
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);

    return () => {
      unsub();
      sub.remove();
    };
  }, []);

  return { online, isOffline: !online };
}
