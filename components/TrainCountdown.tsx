/**
 * TrainCountdown — Reloj Predictivo Premium (redesign v2)
 *
 * Diseño: minimalista dark, hora en morado bold 28px, layout limpio.
 * 3 tarjetas máximo. Accent stripe izquierda coloreada por estado.
 * Sin gradientes recargados — fondo sólido elevado.
 */
import React, { useEffect, useRef, useState, memo, useCallback } from 'react';
import { t, getLanguage } from '../services/i18n';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,

  Modal,
  Platform,
  SafeAreaView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons }  from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,

} from 'react-native-reanimated';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import type { PredictiveClock, ArrivalStatus } from '../types';

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS: Record<ArrivalStatus, {
  stripe:  string;
  label:   string;
  pulse:   boolean;
}> = {
  safe:   { stripe: Colors.status.safe,   label: 'En hora',      pulse: false },
  warn:   { stripe: Colors.status.warn,   label: 'Al límite',    pulse: true  },
  danger: { stripe: Colors.status.danger, label: 'Perdido',      pulse: true  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(date: Date) {
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'Saliendo';
  const m = Math.floor(ms / 60_000);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m} min`;
}

// ─────────────────────────────────────────────────────────────────────────────
interface TrainCountdownProps {
  clocks:         PredictiveClock[];
  isLoading:      boolean;
  isLive:         boolean;
  onSelect:       (clock: PredictiveClock) => void;
  onBuy:          (clock: PredictiveClock) => void;
  originName?:    string;
  destStationId?:   string;
  destStationName?: string; // nombre del destino para el badge
}


export default memo(function TrainCountdown({
  clocks,
  isLoading,
  isLive,
  onSelect,
  onBuy,
  originName = 'Origen',
  destStationId,
  destStationName,
}: TrainCountdownProps) {
  // Un único intervalo compartido por todas las tarjetas
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>{t('split_next_trains')}</Text>
          {isLive && (
            <View style={styles.liveChip}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>{t('board_live')}</Text>
            </View>
          )}
        </View>
        {/* Fecha sutil — muestra si los trenes son de hoy o mañana */}
        {clocks.length > 0 && (() => {
          const d = clocks[0].train.departureTime;
          const today = new Date();
          const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth();
          const isTomorrow = d.getDate() === today.getDate() + 1 && d.getMonth() === today.getMonth();
          const loc = getLanguage();
          const label = isToday
            ? `${t('search_today')} ${d.getDate()} ${d.toLocaleDateString(loc, { month: 'short' })}`
            : isTomorrow
            ? `${t('search_tomorrow')} ${d.getDate()} ${d.toLocaleDateString(loc, { month: 'short' })}`
            : d.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' });
          return (
            <Text style={styles.dateLabel}>{label}</Text>
          );
        })()}
      </View>

      {/* Cards */}
      {isLoading ? (
        <SkeletonCards />
      ) : clocks.length === 0 ? (
        <EmptyState />
      ) : (
        <View>
          {clocks.slice(0, 8).map((clock, i) => {
            const today = new Date();
            const dep   = clock.train.departureTime;
            const isToday = dep.getDate() === today.getDate() && dep.getMonth() === today.getMonth() && dep.getFullYear() === today.getFullYear();
            const prevDep = i > 0 ? clocks[i - 1].train.departureTime : null;
            const prevIsToday = prevDep
              ? prevDep.getDate() === today.getDate() && prevDep.getMonth() === today.getMonth() && prevDep.getFullYear() === today.getFullYear()
              : true;
            const showDateSep = !isToday && prevIsToday;
            const dateLabel = dep.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
            return (
              <React.Fragment key={`${clock.train.serviceId}-${i}`}>
                {showDateSep && (
                  <View style={styles.dateSep}>
                    <View style={styles.dateSepLine} />
                    <Text style={styles.dateSepLabel}>Mañana · {dateLabel}</Text>
                    <View style={styles.dateSepLine} />
                  </View>
                )}
                <TrainCard
                  clock={clock}
                  index={i}
                  now={now}
                  onPress={() => onSelect(clock)}
                  onBuy={() => onBuy(clock)}
                  isDestMatch={!!destStationId && !!clock.train.isFinalDest}
                  destLabel={destStationName}
                />
              </React.Fragment>
            );
          })}

          {/* Card fin de servicio — solo cuando los trenes visibles son los últimos de HOY
               (hay pocos Y ninguno es de mañana → realmente es fin de servicio nocturno) */}
          {(() => {
            if (clocks.length >= 4) return null;
            const today = new Date();
            const allToday = clocks.every(c => {
              const d = c.train.departureTime;
              return d.getDate()     === today.getDate()  &&
                     d.getMonth()    === today.getMonth() &&
                     d.getFullYear() === today.getFullYear();
            });
            if (!allToday) return null; // ya hay trenes de mañana → no mostrar fin de servicio
            return (
              <View style={styles.endOfServiceCard}>
                <Text style={styles.endOfServiceIcon}>🌙</Text>
                <View>
                  <Text style={styles.endOfServiceTitle}>Fin de servicio nocturno</Text>
                  <Text style={styles.endOfServiceSub}>Próximas salidas · mañana desde las 05:00</Text>
                </View>
              </View>
            );
          })()}
        </View>
      )}
    </View>
  );
});

// ── TrainCard ─────────────────────────────────────────────────────────────────
function TrainCard({
  clock,
  index,
  now,
  onPress,
  onBuy,
  isDestMatch = false,
  destLabel,
}: {
  clock:        PredictiveClock;
  index:        number;
  now:          number;
  onPress:      () => void;
  onBuy:        () => void;
  isDestMatch?: boolean;
  destLabel?:   string;
}) {
  const cfg = STATUS[clock.status];
  const { train } = clock;
  const [expanded, setExpanded] = useState(index === 0); // primera tarjeta expandida por defecto

  // Pulso verde para destino coincidente
  const glowOpacity = useSharedValue(0.3);
  useEffect(() => {
    if (isDestMatch) {
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(1,   { duration: 900 }),
          withTiming(0.3, { duration: 900 }),
        ),
        -1, true,
      );
    }
  }, [isDestMatch, glowOpacity]);
  const glowStyle = useAnimatedStyle(() => ({
    borderColor:  `rgba(48,209,88,${glowOpacity.value})`,
    shadowOpacity: glowOpacity.value * 0.4,
  }));

  // Press scale
  const pressScale    = useSharedValue(1);
  const pressAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressScale.value }] }));

  // Pulso para warn/danger
  const opacity = useSharedValue(1);
  const prevStatus = useRef(clock.status);

  useEffect(() => {
    if (cfg.pulse) {
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.55, { duration: 700 }),
          withTiming(1,    { duration: 700 }),
        ),
        -1, true,
      );
    } else {
      opacity.value = withSpring(1);
    }
    if (prevStatus.current !== clock.status) {
      prevStatus.current = clock.status;
    }
  }, [cfg.pulse, opacity, clock.status]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: cfg.pulse ? opacity.value : 1,
  }));

  const msLeft = train.departureTime.getTime() - now;

  return (
    <Animated.View
      style={[animStyle, pressAnimStyle]}
    >
      <Animated.View style={isDestMatch ? [styles.cardDestMatch, glowStyle] : undefined}>
      <Pressable
        style={[
          styles.card,
          index === 0 && styles.cardFirst,
        ]}
        onPress={() => { if (index === 0) setExpanded(e => !e); onPress(); }}
        onPressIn={() => { pressScale.value = withSpring(0.965, { damping: 18, stiffness: 350 }); }}
        onPressOut={() => { pressScale.value = withSpring(1,     { damping: 10, stiffness: 180 }); }}
        accessibilityRole="button"
        accessibilityLabel={`${train.operator} ${train.trainNumber} a ${train.destination.name} — ${fmt(train.departureTime)}`}
      >
        {/* Stripe de estado (izquierda) — verde si es el destino buscado */}
        <View style={[styles.stripe, { backgroundColor: isDestMatch ? '#30D158' : cfg.stripe }]} />

        {/* Cuerpo */}
        <View style={styles.cardInner}>

          {/* Fila superior: operador + destino | hora */}
          <View style={styles.topRow}>
            <View style={styles.trainMeta}>
              {/* Operador + número */}
              <View style={styles.operatorRow}>
                <Text style={styles.operatorLabel}>
                  {train.operator.toUpperCase()}
                </Text>
                <Text style={styles.trainNum}>{train.trainNumber}</Text>
                {index === 0 && !isDestMatch && (
                  <View style={styles.nextBadge}>
                    <Text style={styles.nextBadgeText}>{t('board_next')}</Text>
                  </View>
                )}
                {isDestMatch && (
                  <View style={styles.destMatchBadge}>
                    <Text style={styles.destMatchText} numberOfLines={1}>
                      ✓ {destLabel ? destLabel.split('-')[0].split(' ')[0].toUpperCase() : 'OK'}
                    </Text>
                  </View>
                )}
              </View>
              {/* Destino — muestra el destino buscado si existe, sino el terminus */}
              <Text style={styles.destination} numberOfLines={1}>
                → {destLabel ?? train.destination.name}
              </Text>
            </View>

            {/* Hora de salida — grande y morado */}
            <View style={styles.timeBlock}>
              <Text style={[styles.depTime, msLeft < 0 && { color: Colors.status.danger }]}>
                {fmt(train.departureTime)}
              </Text>
              {train.delayMinutes > 0 && (
                <Text style={styles.delayBadge}>+{train.delayMinutes}'</Text>
              )}
            </View>
          </View>

          {/* Separador */}
          <View style={styles.divider} />

          {/* Fila inferior: andén + buffer + walk */}
          <View style={styles.bottomRow}>
            {/* Andén — solo si hay dato real */}
            {train.platform ? (
              <View style={styles.platformChip}>
                <Text style={styles.platformLabel}>ANDÉN</Text>
                <Text style={styles.platformNum}>{train.platform}</Text>
              </View>
            ) : null}

            {/* Spacer */}
            <View style={{ flex: 1 }} />

            {/* Walk time */}
            <View style={styles.walkChip}>
              <Text style={styles.walkIcon}>🚶</Text>
              <Text style={styles.walkText}>{Math.round(clock.walkMinutes)} min</Text>
            </View>

            {/* Buffer countdown */}
            <View style={[styles.bufferChip, { borderColor: 'rgba(167,139,250,0.4)' }]}>
              <Text style={[styles.bufferText, { color: '#A78BFA' }]}>
                {fmtCountdown(msLeft)}
              </Text>
            </View>

            {/* Comprar billete — siempre visible */}
            <Pressable
              style={({ pressed }) => [styles.buyChip, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
              onPress={onBuy}
              accessibilityRole="button"
              accessibilityLabel="Comprar billete"
            >
              <Ionicons name="arrow-forward" size={12} color="#fff" />
              <Text style={styles.buyChipText}>{t('split_buy')}</Text>
            </Pressable>
          </View>

        </View>

      </Pressable>
      </Animated.View>

      {/* Panel expandido — fuera del row stripe+card para quedar debajo */}
      {expanded && (
        <View style={styles.expandPanel}>
          <View style={styles.expandRow}>
            {/* Salida */}
            <View style={styles.expandStat}>
              <Text style={styles.expandStatLabel}>{t('split_departs')}</Text>
              <Text style={styles.expandStatValue}>{fmt(train.departureTime)}</Text>
            </View>
            {/* Línea de viaje */}
            <View style={styles.expandArrow}>
              <View style={styles.expandLine}>
                <View style={styles.expandLineDot} />
                <View style={styles.expandLineBar} />
                <View style={[styles.expandLineDot, { backgroundColor: Colors.brand.primary }]} />
              </View>
              <Text style={styles.expandDuration}>
                {Math.round((train.arrivalTime.getTime() - train.departureTime.getTime()) / 60_000) > 59
                  ? `${Math.floor((train.arrivalTime.getTime() - train.departureTime.getTime()) / 3_600_000)}h ${Math.round(((train.arrivalTime.getTime() - train.departureTime.getTime()) % 3_600_000) / 60_000)}m`
                  : `${Math.round((train.arrivalTime.getTime() - train.departureTime.getTime()) / 60_000)} min`}
              </Text>
            </View>
            {/* Llegada */}
            <View style={[styles.expandStat, { alignItems: 'flex-end' }]}>
              <Text style={styles.expandStatLabel}>{t('split_arrives')}</Text>
              <Text style={[styles.expandStatValue, { color: '#C4B5FD' }]}>{fmt(train.arrivalTime)}</Text>
            </View>
          </View>
        </View>
      )}

    </Animated.View>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonCards() {
  return (
    <View style={styles.skeletonWrap}>
      <ActivityIndicator size="small" color={Colors.brand.glow} />
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.skeletonCard, { opacity: 1 - i * 0.25 }]} />
      ))}
    </View>
  );
}

// ── Empty ─────────────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyIcon}>🚉</Text>
      <Text style={styles.emptyTitle}>{t('split_no_service')}</Text>
      <Text style={styles.emptySub}>{t('split_no_service_sub')}</Text>
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex:    1,
    paddingHorizontal: Spacing['3'],
    paddingBottom:     Spacing['2'],
    gap:     Spacing['2'],
  },

  // Header
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingTop:     Spacing['1'],
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing['2'],
  },
  headerTitle: {
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color:      Colors.text.primary,
    letterSpacing: 0.3,
  },
  headerSub: {
    fontSize: 10,
    color:    Colors.text.muted,
  },
  liveChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingVertical:   2,
    paddingHorizontal: Spacing['2'],
    backgroundColor:   'rgba(239,68,68,0.12)',
    borderRadius:      Radius.full,
    borderWidth:       1,
    borderColor:       'rgba(239,68,68,0.35)',
  },
  liveDot: {
    width:           5,
    height:          5,
    borderRadius:    3,
    backgroundColor: Colors.status.danger,
  },
  liveText: {
    fontSize:      9,
    fontWeight:    Typography.weight.bold,
    color:         Colors.status.danger,
    letterSpacing: 1,
  },
  dateLabel: {
    fontSize:        12,
    fontWeight:      '700',
    color:           Colors.text.secondary,
    letterSpacing:   0.3,
    paddingRight:    Spacing['3'],
    backgroundColor: 'rgba(167,139,250,0.12)',
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:    6,
  },
  dateSep: {
    flexDirection:  'row',
    alignItems:     'center',
    marginHorizontal: Spacing['3'],
    marginTop:      Spacing['3'],
    marginBottom:   Spacing['1'],
    gap:            8,
  },
  dateSepLine:  { flex: 1, height: 1, backgroundColor: 'rgba(167,139,250,0.25)' },
  dateSepLabel: {
    fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 0.5,
    paddingHorizontal: 10, paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20,
    overflow: 'hidden',
  },
  endOfServiceCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: Spacing['3'], marginTop: Spacing['2'],
    padding: Spacing['3'], borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  endOfServiceIcon:  { fontSize: 24 },
  endOfServiceTitle: { fontSize: 13, fontWeight: '600', color: Colors.text.secondary },
  endOfServiceSub:   { fontSize: 11, color: Colors.text.muted, marginTop: 2 },

  // Card
  card: {
    flexDirection:   'row',
    backgroundColor: 'rgba(14,14,46,0.45)',
    borderRadius:    Radius.xl,
    overflow:        'hidden',
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.15)',
  },
  cardFirst: {
    borderColor:  Colors.border.default,
    shadowColor:  Colors.brand.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity:0.25,
    shadowRadius: 10,
    elevation:    6,
  },
  cardPressed: {
    opacity:   0.82,
    transform: [{ scale: 0.985 }],
  },
  cardDestMatch: {
    borderWidth:  1.5,
    borderRadius: 14,
    shadowColor:  '#30D158',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 10,
    elevation:    4,
    overflow:     'hidden',
  },
  destMatchBadge: {
    position:        'absolute',
    top:             8,
    right:           8,
    backgroundColor: '#30D158',
    borderRadius:    6,
    paddingHorizontal: 7,
    paddingVertical:   2,
    zIndex:          10,
  },
  destMatchText: {
    fontSize:   9,
    fontWeight: '800',
    color:      '#fff',
    letterSpacing: 0.5,
  },

  // Accent stripe
  stripe: {
    width:                   4,
    borderTopLeftRadius:     Radius.md,
    borderBottomLeftRadius:  Radius.md,
  },

  cardInner: {
    flex:    1,
    padding: Spacing['3'],
    gap:     Spacing['2'],
  },

  // Top row
  topRow: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
    gap:            Spacing['2'],
  },
  trainMeta: { flex: 1, gap: 2 },
  operatorRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing['1'],
    flexWrap:      'wrap',
  },
  operatorLabel: {
    fontSize:      9,
    fontWeight:    Typography.weight.bold,
    color:         'rgba(255,255,255,0.75)',
    letterSpacing: 1.5,
  },
  trainNum: {
    fontSize:   Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color:      'rgba(255,255,255,0.85)',
  },
  nextBadge: {
    paddingVertical:   1,
    paddingHorizontal: 5,
    backgroundColor:   Colors.brand.primary,
    borderRadius:      Radius.full,
  },
  nextBadgeText: {
    fontSize:      8,
    fontWeight:    Typography.weight.bold,
    color:         '#fff',
    letterSpacing: 0.8,
  },
  destination: {
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color:      Colors.text.primary,
  },

  // Hora grande
  timeBlock: { alignItems: 'flex-end', gap: 1 },
  depTime: {
    fontSize:      28,
    fontWeight:    '800',
    color:         '#FFFFFF',
    letterSpacing: -1,
    lineHeight:    30,
    fontVariant:   ['tabular-nums'],
  },
  delayBadge: {
    fontSize:   9,
    fontWeight: Typography.weight.bold,
    color:      Colors.status.warn,
    textAlign:  'right',
  },

  divider: {
    height:          1,
    backgroundColor: Colors.border.subtle,
  },

  // Bottom row
  bottomRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing['2'],
  },
  platformChip: {
    alignItems: 'center',
  },
  platformLabel: {
    fontSize:      7,
    fontWeight:    Typography.weight.bold,
    color:         Colors.text.brand,
    letterSpacing: 1,
  },
  platformNum: {
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.black,
    color:      Colors.text.brand,
    lineHeight: 16,
  },
  walkChip: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           2,
  },
  walkIcon: { fontSize: 10 },
  walkText: {
    fontSize:   10,
    fontWeight: '600',
    color:      'rgba(255,255,255,0.90)',
  },
  bufferChip: {
    paddingVertical:   2,
    paddingHorizontal: Spacing['2'],
    borderRadius:      Radius.full,
    borderWidth:       1,
    borderColor:       Colors.border.default,
    backgroundColor:   Colors.bg.surface,
  },
  bufferText: {
    fontSize:   10,
    fontWeight: Typography.weight.bold,
    fontVariant:['tabular-nums'],
  },

  // Skeleton
  skeletonWrap: { gap: Spacing['2'], alignItems: 'center', paddingTop: Spacing['2'] },
  skeletonCard: {
    width:           '100%',
    height:          88,
    backgroundColor: Colors.bg.elevated,
    borderRadius:    Radius.md,
  },

  // Empty
  emptyWrap: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            Spacing['2'],
    paddingVertical:Spacing['8'],
  },
  emptyIcon:  { fontSize: 36 },
  emptyTitle: {
    fontSize:   Typography.size.base,
    fontWeight: Typography.weight.bold,
    color:      Colors.text.secondary,
  },
  emptySub: {
    fontSize:  Typography.size.xs,
    color:     Colors.text.muted,
    textAlign: 'center',
    lineHeight:18,
  },

  // Expand panel
  expandPanel: {
    backgroundColor:      'rgba(13,12,38,0.62)',
    marginTop:            -Spacing['1'],
    paddingHorizontal:    Spacing['4'],
    paddingTop:           Spacing['3'],
    paddingBottom:        Spacing['3'],
    borderBottomLeftRadius:  10,
    borderBottomRightRadius: 10,
    borderTopWidth:       1,
    borderTopColor:       'rgba(139,92,246,0.20)',
    borderLeftWidth:      1,
    borderRightWidth:     1,
    borderBottomWidth:    1,
    borderLeftColor:      'rgba(139,92,246,0.15)',
    borderRightColor:     'rgba(139,92,246,0.15)',
    borderBottomColor:    'rgba(139,92,246,0.15)',
  },
  expandRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  expandStat: { alignItems: 'flex-start', gap: 2 },
  expandStatLabel: {
    fontSize:      11,
    fontWeight:    '700' as const,
    color:         '#C4B5FD',
    letterSpacing: 1.8,
    textTransform: 'uppercase' as const,
  },
  expandStatValue: {
    fontSize:    26,
    fontWeight:  '800' as const,
    color:       '#FFFFFF',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  expandArrow: { flex: 1, alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  expandLine: {
    flexDirection: 'row', alignItems: 'center', gap: 0, width: '100%',
  },
  expandLineDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#C4B5FD',
    borderWidth: 2, borderColor: 'rgba(139,92,246,0.40)',
  },
  expandLineBar: {
    flex: 1, height: 3,
    backgroundColor: '#7C3AED',
  },
  expandDuration: {
    fontSize:        13,
    color:           '#E9D5FF',
    fontWeight:      '800' as const,
    letterSpacing:   0.3,
  },
  buyBtn: {
    borderRadius:  Radius.full,
    paddingVertical: 11,
    alignItems:   'center',
  },
  buyBtnText: {
    fontSize:   14,
    fontWeight: Typography.weight.bold,
    color:      '#fff',
  },
  buyChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingVertical:   7,
    paddingHorizontal: 14,
    borderRadius:      Radius.full,
    backgroundColor:   '#7C3AED',
    ...Shadows.glow,
  },
  buyChipText: {
    fontSize:   12,
    fontWeight: Typography.weight.bold,
    color:      '#fff',
    letterSpacing: 0.3,
  },

  // "Otro horario" header button
  searchOtherBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingVertical:   4,
    paddingHorizontal: 10,
    borderRadius:      Radius.full,
    borderWidth:       1,
    borderColor:       Colors.brand.primary + '55',
    backgroundColor:   Colors.brand.primary + '12',
  },
  searchOtherText: {
    fontSize:   10,
    fontWeight: Typography.weight.semibold,
    color:      Colors.brand.glow,
  },

  // WebView interno
  wvRoot: {
    flex:            1,
    backgroundColor: Colors.bg.base,
  },
  wvBar: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    paddingHorizontal:Spacing['3'],
    paddingVertical:  Spacing['2'],
    borderBottomWidth:1,
    borderBottomColor:Colors.border.subtle,
    backgroundColor:  Colors.bg.elevated,
  },
  wvTitle: {
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color:      Colors.text.primary,
  },
  wvBackBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.full,
  },
  wvLoading: {
    position:       'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems:     'center',
    justifyContent: 'center',
    backgroundColor:Colors.bg.base,
    gap:            Spacing['3'],
  },
  wvLoadingText: {
    fontSize: Typography.size.sm,
    color:    Colors.text.muted,
  },
});
