/**
 * useLastTrainAlert — "Último tren" · Alerta nocturna inteligente
 *
 * LÓGICA:
 *   1. Cada minuto revisa si estamos en ventana nocturna (20:00 – 02:00)
 *   2. Consulta los próximos trenes desde la estación más cercana del usuario
 *   3. Calcula cuántos minutos faltan para el ÚLTIMO tren del día
 *   4. Dispara alertas progresivas:
 *        60 min → aviso suave
 *        30 min → aviso naranja
 *        15 min → alerta roja urgente
 *        5  min → CRÍTICO — vibración + notificación push
 *   5. Permite al usuario silenciar hasta mañana ("No molestar")
 *
 * RETORNA:
 *   { alert, dismiss, snooze }
 *   alert = null si no hay riesgo · AlertLevel si hay un último tren próximo
 *
 * POLÍTICA DE PRIVACIDAD:
 *   La ubicación se usa únicamente en RAM para lookup de estación.
 *   No se registra, no se envía a servidor.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { queryUpcomingTrains } from '../services/gtfsDatabase';
import { getNearestStation } from '../services/gtfsDatabase';
import type { TrainService, Station } from '../types';

// ── Tipos públicos ────────────────────────────────────────────────────────────
export type AlertLevel = 'info' | 'warn' | 'danger' | 'critical';

export interface LastTrainAlert {
  level:           AlertLevel;
  minutesLeft:     number;
  lastTrain:       TrainService;
  stationName:     string;
  message:         string;           // texto listo para UI
  isDismissed:     boolean;
}

export interface UseLastTrainAlertResult {
  alert:    LastTrainAlert | null;
  dismiss:  () => void;              // silenciar hasta mañana
  snooze:   (minutes: number) => void; // posponer N minutos
}

// ── Constantes ────────────────────────────────────────────────────────────────
const CHECK_INTERVAL_MS  = 60_000;  // revisa cada 1 minuto
const NIGHT_START_HOUR   = 20;      // 20:00 activa el modo alerta
const NIGHT_END_HOUR     = 2;       // 02:00 desactiva (madrugada)
const LAST_TRAIN_HORIZON = 90;      // minutos adelante para buscar trenes

// Umbrales de alerta (minutos al último tren)
const THRESHOLDS: { max: number; level: AlertLevel; haptic: boolean }[] = [
  { max: 10,  level: 'critical', haptic: true  },
  { max: 20,  level: 'danger',   haptic: false },
  { max: 35,  level: 'warn',     haptic: false },
  { max: 65,  level: 'info',     haptic: false },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function isNightWindow(): boolean {
  const hour = new Date().getHours();
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
}

function minutesUntil(date: Date): number {
  return Math.round((date.getTime() - Date.now()) / 60_000);
}

function levelForMinutes(mins: number): AlertLevel | null {
  for (const t of THRESHOLDS) {
    if (mins <= t.max) return t.level;
  }
  return null; // más de 65 min → sin alerta
}

function buildMessage(level: AlertLevel, mins: number, stationName: string): string {
  switch (level) {
    case 'critical':
      return `🚨 ¡Último tren en ${mins} min! Sal YA de ${stationName}`;
    case 'danger':
      return `🔴 Último tren en ${mins} min desde ${stationName}`;
    case 'warn':
      return `🟡 Quedan ~${mins} min para el último tren (${stationName})`;
    case 'info':
      return `🕐 Último tren en ~${mins} min · ${stationName}`;
  }
}

// ── Notificación push ─────────────────────────────────────────────────────────
async function sendPushAlert(mins: number, stationName: string): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title:    '🚨 Último tren casi saliendo',
        body:     `¡Solo quedan ${mins} minutos! Sale desde ${stationName}`,
        sound:    true,
        priority: Notifications.AndroidNotificationPriority.MAX,
        ...(Platform.OS === 'ios' ? { interruptionLevel: 'timeSensitive' } : {}),
      },
      trigger: null, // inmediato
    });
  } catch {
    // Silencioso — la notificación es mejora, no requisito
  }
}

// ── Hook principal ────────────────────────────────────────────────────────────
/**
 * useLastTrainAlert
 *
 * @param userLat   Latitud actual del usuario (de expo-location)
 * @param userLon   Longitud actual del usuario
 * @param enabled   Si false, el hook no corre (ahorra batería en día)
 */
export function useLastTrainAlert(
  userLat:  number | null,
  userLon:  number | null,
  enabled:  boolean = true,
): UseLastTrainAlertResult {
  const [alert,       setAlert]       = useState<LastTrainAlert | null>(null);
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(null);

  const intervalRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const pushSentForLevel = useRef<AlertLevel | null>(null);
  const lastCheckRef     = useRef<number>(0);

  // ── Silenciar hasta mañana ──
  const dismiss = useCallback(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);
    setSnoozedUntil(tomorrow.getTime());
    setAlert(null);
  }, []);

  // ── Posponer N minutos ──
  const snooze = useCallback((minutes: number) => {
    setSnoozedUntil(Date.now() + minutes * 60_000);
    setAlert(null);
  }, []);

  // ── Lógica de chequeo ──
  const check = useCallback(async () => {
    // No correr si está desactivado
    if (!enabled) return;

    // No correr si no hay coordenadas
    if (userLat === null || userLon === null) return;

    // No correr si está silenciado
    if (snoozedUntil && Date.now() < snoozedUntil) return;

    // Solo correr en ventana nocturna
    if (!isNightWindow()) {
      if (alert) setAlert(null); // limpiar si salimos de la ventana
      return;
    }

    // Evitar chequeos demasiado frecuentes (debounce manual)
    const now = Date.now();
    if (now - lastCheckRef.current < 55_000) return;
    lastCheckRef.current = now;

    try {
      // 1. Encontrar estación más cercana
      const station: Station | null = await getNearestStation(userLat, userLon)
        .catch(() => null);
      if (!station) return;

      // 2. Obtener trenes próximos (ventana de LAST_TRAIN_HORIZON minutos)
      const trains = await queryUpcomingTrains(station.id, 20, new Date())
        .catch(() => [] as TrainService[]);
      if (trains.length === 0) {
        setAlert(null);
        return;
      }

      // 3. Filtrar trenes dentro del horizonte nocturno
      const horizon = new Date(Date.now() + LAST_TRAIN_HORIZON * 60_000);
      const viable  = trains.filter(t => t.departureTime <= horizon);
      if (viable.length === 0) {
        setAlert(null);
        return;
      }

      // 4. El "último tren" es el de salida más tardía en el horizonte
      const lastTrain = viable.reduce((latest, t) =>
        t.departureTime > latest.departureTime ? t : latest
      );

      const minsLeft = minutesUntil(lastTrain.departureTime);

      // Si ya pasó → limpiar
      if (minsLeft < 0) {
        setAlert(null);
        pushSentForLevel.current = null;
        return;
      }

      const level = levelForMinutes(minsLeft);

      // Si fuera del rango → limpiar
      if (!level) {
        setAlert(null);
        return;
      }

      const message = buildMessage(level, minsLeft, station.name);

      const newAlert: LastTrainAlert = {
        level,
        minutesLeft:  minsLeft,
        lastTrain,
        stationName:  station.name,
        message,
        isDismissed:  false,
      };

      setAlert(newAlert);

      // ── Haptics + Push para niveles críticos (solo una vez por nivel) ──
      const threshold = THRESHOLDS.find(t => t.level === level);
      if (threshold?.haptic && pushSentForLevel.current !== level) {
        pushSentForLevel.current = level;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        sendPushAlert(minsLeft, station.name);
      }

    } catch {
      // Silencioso — el alerta es mejora, no bloquea la UX
    }
  }, [enabled, userLat, userLon, snoozedUntil, alert]);

  // ── Polling ──
  useEffect(() => {
    if (!enabled) return;

    // Chequeo inmediato al montar
    check();

    intervalRef.current = setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, check]);

  // ── Reset push tracker cuando las coords cambian mucho (ciudad nueva) ──
  useEffect(() => {
    pushSentForLevel.current = null;
  }, [userLat, userLon]);

  return { alert, dismiss, snooze };
}

// ── Componente de banner (helper para UI) ─────────────────────────────────────
/**
 * Datos para renderizar el banner de alerta en cualquier pantalla.
 * Retorna null si no hay alerta activa.
 */
export function useLastTrainBannerProps(result: UseLastTrainAlertResult) {
  const { alert, dismiss, snooze } = result;
  if (!alert) return null;

  const bgColor: Record<AlertLevel, string> = {
    info:     'rgba(99,102,241,0.15)',
    warn:     'rgba(234,179,8,0.18)',
    danger:   'rgba(239,68,68,0.18)',
    critical: 'rgba(239,68,68,0.30)',
  };

  const borderColor: Record<AlertLevel, string> = {
    info:     'rgba(99,102,241,0.4)',
    warn:     'rgba(234,179,8,0.4)',
    danger:   'rgba(239,68,68,0.4)',
    critical: 'rgba(239,68,68,0.8)',
  };

  const textColor: Record<AlertLevel, string> = {
    info:     '#C4B5FD',
    warn:     '#FDE047',
    danger:   '#FCA5A5',
    critical: '#FFFFFF',
  };

  return {
    message:    alert.message,
    level:      alert.level,
    bgColor:    bgColor[alert.level],
    borderColor:borderColor[alert.level],
    textColor:  textColor[alert.level],
    isCritical: alert.level === 'critical',
    onDismiss:  dismiss,
    onSnooze15: () => snooze(15),
  };
}
