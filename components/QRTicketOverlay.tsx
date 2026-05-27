/**
 * QRTicketOverlay — Full-screen QR display (STEP 5 + STEP 6)
 * Renderizable 100% offline — no red requerida.
 * Activado automáticamente por geofence Ring-2 (50m de la estación).
 * Brillo: forzado al 100% al activar, restaurado al cerrar.
 */
import React, { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Platform,
  Modal,
} from 'react-native';
import QRCode      from 'react-native-qrcode-svg';
import * as Brightness from 'expo-brightness';
import * as Haptics    from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView }       from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Colors, Gradients, Typography, Spacing, Radius, Shadows } from '../theme';
import type { StoredTicket } from '../types';

const { width: W, height: H } = Dimensions.get('window');
const QR_SIZE = Math.min(W * 0.72, 280);

interface QRTicketOverlayProps {
  ticket:    StoredTicket;
  visible:   boolean;
  onClose:   () => void;
  autoMode?: boolean; // true = triggered by geofence (shows "MODO AUTOMÁTICO" badge)
}

export default function QRTicketOverlay({
  ticket,
  visible,
  onClose,
  autoMode = false,
}: QRTicketOverlayProps) {
  const [originalBrightness, setOriginalBrightness] = useState<number | null>(null);
  const scale   = useSharedValue(0.85);
  const opacity = useSharedValue(0);

  // ── Entrance animation + brightness ──────────────────────────────────
  useEffect(() => {
    if (visible) {
      // Animate in
      scale.value   = withSpring(1, { damping: 18, stiffness: 200 });
      opacity.value = withTiming(1, { duration: 280 });

      // Haptic alert
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Force 100% brightness for scanner readability
      (async () => {
        try {
          const { status } = await Brightness.requestPermissionsAsync();
          if (status === 'granted') {
            const current = await Brightness.getBrightnessAsync();
            setOriginalBrightness(current);
            await Brightness.setBrightnessAsync(1.0); // 100%
          }
        } catch {
          // Brightness control optional — QR still renders
        }
      })();
    } else {
      // Animate out
      scale.value   = withTiming(0.9, { duration: 200 });
      opacity.value = withTiming(0, { duration: 200 });

      // Restore original brightness
      if (originalBrightness !== null) {
        Brightness.setBrightnessAsync(originalBrightness).catch(() => {});
        setOriginalBrightness(null);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Restore brightness on unmount
  useEffect(() => {
    return () => {
      if (originalBrightness !== null) {
        Brightness.setBrightnessAsync(originalBrightness).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   opacity.value,
  }));

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
  }, [onClose]);

  if (!visible) return null;

  const { trainService: svc, passenger, bookingRef, qrData } = ticket;
  const dep = svc.departureTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const date = svc.departureTime.toLocaleDateString('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short',
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      {/* Dark blur backdrop */}
      <BlurView intensity={95} tint="dark" style={StyleSheet.absoluteFill} />

      <View style={styles.root}>
        <Animated.View style={[styles.card, animStyle, Shadows.card]}>

          {/* Auto-mode badge */}
          {autoMode && (
            <View style={styles.autoBadge}>
              <LinearGradient colors={Gradients.brand} style={styles.autoBadgeGrad}>
                <Text style={styles.autoBadgeText}>🛂 MODO AUTOMÁTICO · MANOS LIBRES</Text>
              </LinearGradient>
            </View>
          )}

          {/* Operator header */}
          <LinearGradient
            colors={['#1A0533', Colors.bg.base]}
            style={styles.header}
          >
            <Text style={styles.headerOperator}>
              {svc.operator.toUpperCase()} · {svc.trainNumber}
            </Text>
            <Text style={styles.headerRef}>Ref: {bookingRef}</Text>
          </LinearGradient>

          {/* Passenger */}
          <View style={styles.passengerRow}>
            <Text style={styles.passengerName}>
              {passenger.firstName} {passenger.lastName}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: Colors.status.safe + '22', borderColor: Colors.status.safe }]}>
              <Text style={[styles.statusPillTxt, { color: Colors.status.safe }]}>VÁLIDO</Text>
            </View>
          </View>

          {/* Route */}
          <View style={styles.routeRow}>
            <View style={styles.routeStation}>
              <Text style={styles.routeTime}>{dep}</Text>
              <Text style={styles.routeName} numberOfLines={1}>{svc.origin.name}</Text>
              <Text style={styles.routeDate}>{date}</Text>
            </View>
            <Text style={styles.routeArrow}>🚄</Text>
            <View style={[styles.routeStation, { alignItems: 'flex-end' }]}>
              <Text style={styles.routeTime}>
                {svc.arrivalTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Text style={[styles.routeName, { textAlign: 'right' }]} numberOfLines={1}>
                {svc.destination.name}
              </Text>
              {svc.platform && (
                <Text style={styles.platform}>Andén {svc.platform}</Text>
              )}
            </View>
          </View>

          {/* Perforation line */}
          <View style={styles.perfLine}>
            <View style={styles.perfCircleL} />
            <View style={styles.perfDashes} />
            <View style={styles.perfCircleR} />
          </View>

          {/* QR Code — white background for scanner */}
          <View style={styles.qrSection}>
            <View style={styles.qrWrapper}>
              <QRCode
                value={qrData}
                size={QR_SIZE}
                color="#000000"
                backgroundColor="#FFFFFF"
                ecl="H"
                quietZone={16}
              />
            </View>
            <Text style={styles.qrHint}>
              Acerca al lector del molinete
            </Text>
            <Text style={styles.offlineNote}>
              🔌 Funciona sin internet
            </Text>
          </View>

          {/* Close button */}
          <Pressable
            style={styles.closeBtn}
            onPress={handleClose}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Cerrar ticket"
          >
            <Text style={styles.closeTxt}>Cerrar billete</Text>
          </Pressable>

        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal:Spacing['4'],
  },
  card: {
    width:           '100%',
    maxWidth:        440,
    backgroundColor: Colors.bg.elevated,
    borderRadius:    Radius['2xl'],
    overflow:        'hidden',
    borderWidth:     1,
    borderColor:     Colors.border.strong,
  },
  autoBadge: {
    overflow: 'hidden',
  },
  autoBadgeGrad: {
    paddingVertical:  Spacing['2'],
    alignItems:       'center',
  },
  autoBadgeText: {
    fontSize:   Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color:      Colors.white,
    letterSpacing: 1.5,
  },
  header: {
    padding:      Spacing['4'],
    alignItems:   'center',
    gap:          Spacing['1'],
  },
  headerOperator: {
    fontSize:   Typography.size.lg,
    fontWeight: Typography.weight.black,
    color:      Colors.text.primary,
    letterSpacing: 2,
  },
  headerRef: {
    fontSize: Typography.size.xs,
    color:    Colors.text.secondary,
    letterSpacing: 1,
  },
  passengerRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'],
    paddingVertical:   Spacing['2'],
    borderTopWidth:    1,
    borderTopColor:    Colors.border.subtle,
  },
  passengerName: {
    fontSize:   Typography.size.md,
    fontWeight: Typography.weight.bold,
    color:      Colors.text.primary,
  },
  statusPill: {
    paddingVertical:  Spacing['1'],
    paddingHorizontal:Spacing['3'],
    borderRadius:     Radius.full,
    borderWidth:      1,
  },
  statusPillTxt: {
    fontSize:   Typography.size.xs,
    fontWeight: Typography.weight.bold,
    letterSpacing: 1,
  },
  routeRow: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: Spacing['4'],
    paddingVertical:   Spacing['3'],
    gap:            Spacing['2'],
  },
  routeStation: { flex: 1 },
  routeTime: {
    fontSize:   Typography.size['2xl'],
    fontWeight: Typography.weight.black,
    color:      Colors.text.primary,
    letterSpacing: -1,
  },
  routeName: {
    fontSize: Typography.size.xs,
    color:    Colors.text.secondary,
    marginTop: 2,
  },
  routeDate: {
    fontSize:  Typography.size.xs,
    color:     Colors.text.muted,
    marginTop: 1,
  },
  routeArrow: {
    fontSize: Typography.size.xl,
    flexShrink: 0,
  },
  platform: {
    fontSize:   Typography.size.xs,
    color:      Colors.text.brand,
    fontWeight: Typography.weight.semibold,
    marginTop:  2,
  },

  // Perforation
  perfLine: {
    flexDirection:  'row',
    alignItems:     'center',
    marginHorizontal: -1, // bleed to edge
  },
  perfCircleL: {
    width:           24,
    height:          24,
    borderRadius:    12,
    backgroundColor: Colors.bg.base,
    marginLeft:      -12,
  },
  perfCircleR: {
    width:           24,
    height:          24,
    borderRadius:    12,
    backgroundColor: Colors.bg.base,
    marginRight:     -12,
  },
  perfDashes: {
    flex:            1,
    height:          2,
    borderStyle:     'dashed',
    borderWidth:     1,
    borderColor:     Colors.border.default,
  },

  // QR section — white background is critical for scanner
  qrSection: {
    alignItems:     'center',
    paddingVertical:  Spacing['5'],
    paddingHorizontal:Spacing['4'],
    gap:            Spacing['3'],
    backgroundColor: Colors.bg.base,
  },
  qrWrapper: {
    backgroundColor: '#FFFFFF',
    padding:         Spacing['3'],
    borderRadius:    Radius.md,
  },
  qrHint: {
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color:      Colors.text.secondary,
  },
  offlineNote: {
    fontSize:        Typography.size.xs,
    color:           Colors.text.muted,
    backgroundColor: Colors.bg.elevated,
    paddingVertical: Spacing['1'],
    paddingHorizontal:Spacing['3'],
    borderRadius:    Radius.full,
  },

  closeBtn: {
    alignItems:      'center',
    paddingVertical: Spacing['4'],
    borderTopWidth:  1,
    borderTopColor:  Colors.border.subtle,
  },
  closeTxt: {
    fontSize:   Typography.size.sm,
    color:      Colors.text.secondary,
    fontWeight: Typography.weight.medium,
  },
});
