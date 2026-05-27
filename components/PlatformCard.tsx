/**
 * PlatformCard — Individual train service card (STEP 2)
 * Tappable → opens CheckoutSheet
 * Shows operator logo, train type, class options, real-time status
 */
import React, { memo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Colors, Gradients, Typography, Spacing, Radius, Shadows, Motion } from '../theme';
import type { TrainService, ArrivalStatus } from '../types';

// ── Operator display config ───────────────────────────────────────────────
const OPERATOR_META: Record<string, { emoji: string; name: string; accent: string }> = {
  sncf:       { emoji: '🇫🇷', name: 'SNCF · TGV',         accent: '#2563EB' },
  db:         { emoji: '🇩🇪', name: 'DB · ICE',            accent: '#EC4899' },
  renfe:      { emoji: '🇪🇸', name: 'Renfe · AVE',         accent: '#DC2626' },
  trenitalia: { emoji: '🇮🇹', name: 'Trenitalia · Frecce', accent: '#DC2626' },
  ns:         { emoji: '🇳🇱', name: 'NS · Intercity',      accent: '#EA580C' },
  sbb:        { emoji: '🇨🇭', name: 'SBB · IC',            accent: '#DC2626' },
  eurostar:   { emoji: '🌐', name: 'Eurostar',             accent: '#7C3AED' },
  thalys:     { emoji: '🌐', name: 'Thalys',               accent: '#DC2626' },
  other:      { emoji: '🚄', name: 'Tren',                  accent: '#71717A' },
};

const STATUS_COLORS: Record<TrainService['status'], string> = {
  'on-time':  Colors.status.safe,
  'delayed':  Colors.status.warn,
  'cancelled':Colors.status.danger,
  'unknown':  Colors.status.neutral,
};

const STATUS_LABELS: Record<TrainService['status'], string> = {
  'on-time':  'En hora',
  'delayed':  'Retrasado',
  'cancelled':'Cancelado',
  'unknown':  'Sin datos',
};

// ── Component ─────────────────────────────────────────────────────────────
interface PlatformCardProps {
  service:       TrainService;
  arrivalStatus: ArrivalStatus;
  onPress:       (service: TrainService) => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default memo(function PlatformCard({
  service,
  arrivalStatus,
  onPress,
}: PlatformCardProps) {
  const scale = useSharedValue(1);
  const meta  = OPERATOR_META[service.operator] ?? OPERATOR_META.other;

  const handlePressIn = useCallback(() => {
    'worklet';
    scale.value = withSpring(0.97, { damping: 20, stiffness: 300 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    'worklet';
    scale.value = withSpring(1, Motion.spring);
  }, [scale]);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress(service);
  }, [service, onPress]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const dep  = service.departureTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const arr  = service.arrivalTime.toLocaleTimeString('es-ES',   { hour: '2-digit', minute: '2-digit' });
  const dur  = Math.round((service.arrivalTime.getTime() - service.departureTime.getTime()) / 60_000);
  const durH = Math.floor(dur / 60);
  const durM = dur % 60;

  const statusColor = STATUS_COLORS[service.status];
  const ringColor   =
    arrivalStatus === 'safe'   ? Colors.status.safe   :
    arrivalStatus === 'warn'   ? Colors.status.warn   :
    Colors.status.danger;

  return (
    <AnimatedPressable
      style={[styles.card, animStyle, Shadows.card]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`Tren ${service.operator.toUpperCase()} ${service.trainNumber} a ${service.destination.name}. Sale a las ${dep}. Toca para comprar.`}
    >
      {/* Arrival-status glow border */}
      <View style={[styles.ringBorder, { borderColor: ringColor + '55' }]} />

      <LinearGradient
        colors={['rgba(255,255,255,0.03)', 'transparent']}
        style={StyleSheet.absoluteFill}
      />

      {/* Header: operator + status */}
      <View style={styles.header}>
        <View style={styles.operatorRow}>
          <Text style={styles.flag}>{meta.emoji}</Text>
          <Text style={[styles.operatorName, { color: meta.accent }]}>
            {meta.name} · {service.trainNumber}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '22', borderColor: statusColor + '55' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {STATUS_LABELS[service.status]}
            {service.status === 'delayed' && service.delayMinutes > 0
              ? ` +${service.delayMinutes}min`
              : ''}
          </Text>
        </View>
      </View>

      {/* Route row */}
      <View style={styles.routeRow}>
        {/* Origin */}
        <View style={styles.stationBlock}>
          <Text style={styles.time}>{dep}</Text>
          <Text style={styles.stationName} numberOfLines={1}>
            {service.origin.name}
          </Text>
        </View>

        {/* Train line */}
        <View style={styles.trainLine}>
          <View style={[styles.dot, { backgroundColor: meta.accent }]} />
          <View style={[styles.line, { backgroundColor: meta.accent + '55' }]} />
          <Text style={styles.durationText}>
            {durH > 0 ? `${durH}h ` : ''}{durM}m
          </Text>
          <View style={[styles.line, { backgroundColor: meta.accent + '55' }]} />
          <Text style={styles.trainIcon}>🚄</Text>
        </View>

        {/* Destination */}
        <View style={[styles.stationBlock, styles.stationBlockRight]}>
          <Text style={styles.time}>{arr}</Text>
          <Text style={[styles.stationName, { textAlign: 'right' }]} numberOfLines={1}>
            {service.destination.name}
          </Text>
        </View>
      </View>

      {/* Footer: platform + price + buy CTA */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          {service.platform && (
            <View style={styles.platformBadge}>
              <Text style={styles.platformText}>Andén {service.platform}</Text>
            </View>
          )}
          {service.availableSeats !== undefined && service.availableSeats < 10 && (
            <Text style={styles.seatsWarn}>
              ⚡ Solo {service.availableSeats} plazas
            </Text>
          )}
        </View>
        <View style={styles.priceRow}>
          {service.priceEur && (
            <Text style={styles.price}>
              desde {service.priceEur.toFixed(2)} €
            </Text>
          )}
          <LinearGradient
            colors={Gradients.brand}
            style={styles.buyBtn}
          >
            <Text style={styles.buyText}>Comprar →</Text>
          </LinearGradient>
        </View>
      </View>
    </AnimatedPressable>
  );
});

// ─── STYLES ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bg.surface,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border.default,
    padding:         Spacing['4'],
    overflow:        'hidden',
    gap:             Spacing['3'],
  },
  ringBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.lg,
    borderWidth:  2,
  },
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  operatorRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing['2'],
    flex:          1,
  },
  flag:          { fontSize: Typography.size.md },
  operatorName:  {
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.bold,
    letterSpacing: 0.3,
  },
  statusBadge: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              Spacing['1'],
    paddingVertical:  Spacing['1'],
    paddingHorizontal:Spacing['2'],
    borderRadius:     Radius.full,
    borderWidth:      1,
  },
  statusDot: {
    width:        6,
    height:       6,
    borderRadius: 3,
  },
  statusText: {
    fontSize:   Typography.size.xs,
    fontWeight: Typography.weight.semibold,
  },

  routeRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            Spacing['2'],
  },
  stationBlock:      { flex: 1 },
  stationBlockRight: { alignItems: 'flex-end' },
  time: {
    fontSize:   Typography.size.xl,
    fontWeight: Typography.weight.black,
    color:      Colors.text.primary,
    letterSpacing: -0.5,
  },
  stationName: {
    fontSize: Typography.size.xs,
    color:    Colors.text.secondary,
    marginTop:2,
  },

  trainLine: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing['1'],
  },
  dot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },
  line: {
    flex:    1,
    height:  2,
    borderRadius: 1,
  },
  durationText: {
    fontSize:   Typography.size.xs,
    color:      Colors.text.muted,
    position:   'absolute',
    top:        -16,
    alignSelf:  'center',
    width:      '100%',
    textAlign:  'center',
  },
  trainIcon: { fontSize: Typography.size.md },

  footer: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  footerLeft: {
    flex: 1,
    gap:  Spacing['1'],
  },
  platformBadge: {
    alignSelf:        'flex-start',
    paddingVertical:  Spacing['1'],
    paddingHorizontal:Spacing['2'],
    backgroundColor:  'rgba(124,58,237,0.15)',
    borderRadius:     Radius.sm,
    borderWidth:      1,
    borderColor:      'rgba(124,58,237,0.35)',
  },
  platformText: {
    fontSize:   Typography.size.xs,
    color:      Colors.text.brand,
    fontWeight: Typography.weight.semibold,
  },
  seatsWarn: {
    fontSize:   Typography.size.xs,
    color:      Colors.status.warn,
    fontWeight: Typography.weight.semibold,
  },
  priceRow: {
    alignItems: 'flex-end',
    gap:        Spacing['2'],
  },
  price: {
    fontSize:   Typography.size.sm,
    color:      Colors.text.secondary,
    fontWeight: Typography.weight.medium,
  },
  buyBtn: {
    paddingVertical:   Spacing['2'],
    paddingHorizontal: Spacing['4'],
    borderRadius:      Radius.full,
    minHeight:         44, // touch target
  },
  buyText: {
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color:      Colors.white,
  },
});
