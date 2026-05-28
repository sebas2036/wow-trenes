/**
 * NotificationContext — Store global de alertas en tiempo real.
 *
 * TIPOS DE ALERTA:
 *   delay      → Retraso detectado en tren favorito
 *   lastTrain  → Último tren en los próximos N minutos
 *   geofence   → Entraste al radio de una estación
 *   arrival    → Tu tren llega al andén
 *   info       → Información general
 *
 * USO:
 *   const { notifications, addNotification, markAllRead, unreadCount } = useNotifications();
 *
 * Cualquier parte de la app (geofence, trainMonitor, etc.) puede llamar
 * addNotification() y la campanita actualiza su badge automáticamente.
 */
import React, {
  createContext, useContext, useState, useCallback, useRef, useEffect,
} from 'react';
import { subscribeToNotifications } from '../services/notificationBridge';

// ── Tipos ─────────────────────────────────────────────────────────────────────
export type NotifType = 'delay' | 'lastTrain' | 'geofence' | 'arrival' | 'info';

export interface AppNotification {
  id:          string;
  type:        NotifType;
  title:       string;
  body:        string;
  timestamp:   Date;
  read:        boolean;
  countryCode?: string;   // para mostrar bandera
  icon?:       string;    // Ionicons name override
}

interface NotificationContextValue {
  notifications:    AppNotification[];
  unreadCount:      number;
  addNotification:  (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;
  markAllRead:      () => void;
  clearAll:         () => void;
}

// ── Iconos por tipo ───────────────────────────────────────────────────────────
export const NOTIF_ICONS: Record<NotifType, string> = {
  delay:     'warning-outline',
  lastTrain: 'time-outline',
  geofence:  'location-outline',
  arrival:   'train-outline',
  info:      'information-circle-outline',
};

// ── Colores por tipo (brand colors del tema) ─────────────────────────────────
export const NOTIF_COLORS: Record<NotifType, string> = {
  delay:     '#FF453A',   // status.danger
  lastTrain: '#FF9F0A',   // status.warn
  geofence:  '#30D158',   // status.safe
  arrival:   '#8B5CF6',   // brand.primary
  info:      '#636366',   // text.muted
};

// ── Notificaciones de demo — aparecen al primer lanzamiento ──────────────────
const DEMO_NOTIFICATIONS: AppNotification[] = [
  {
    id:          'demo_1',
    type:        'info',
    title:       'Bienvenido a WoW TRENES',
    body:        'Activá las alertas para recibir avisos de retrasos y último tren.',
    timestamp:   new Date(Date.now() - 1000 * 60 * 2),
    read:        false,
  },
  {
    id:          'demo_2',
    type:        'arrival',
    title:       'AVE Madrid → Barcelona',
    body:        'Tu tren sale en 45 minutos desde Atocha. ¡Es hora de ir a la estación!',
    timestamp:   new Date(Date.now() - 1000 * 60 * 8),
    read:        false,
    countryCode: 'es',
    icon:        'train-outline',
  },
  {
    id:          'demo_3',
    type:        'delay',
    title:       'Retraso — ICE Frankfurt',
    body:        'El ICE 514 lleva 18 minutos de retraso. Nueva salida: 14:33.',
    timestamp:   new Date(Date.now() - 1000 * 60 * 22),
    read:        false,
    countryCode: 'de',
  },
];

// ── Context ───────────────────────────────────────────────────────────────────
const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>(DEMO_NOTIFICATIONS);
  const counter = useRef(100);

  const addNotification = useCallback(
    (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
      const notif: AppNotification = {
        ...n,
        id:        `notif_${++counter.current}`,
        timestamp: new Date(),
        read:      false,
      };
      setNotifications((prev) => [notif, ...prev].slice(0, 50)); // máximo 50
    },
    [],
  );

  // ── Bridge: escuchar eventos de geofenceTask y trainArrivalMonitor ────────
  useEffect(() => {
    const unsub = subscribeToNotifications((n) => addNotification(n));
    return unsub;
  }, [addNotification]);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, addNotification, markAllRead, clearAll }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be inside NotificationProvider');
  return ctx;
}
