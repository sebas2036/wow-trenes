/**
 * SecureRedirect — transición de "conexión segura" antes de saltar al partner.
 *
 * Overlay EN EL ÁRBOL (no <Modal> → evita el bug de toques muertos en Android).
 * Cuando se hace visible: anima el candado, y tras ~1.6s abre la URL del partner
 * (Omio) en el navegador y se cierra. Da confianza antes del redirect.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Linking, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Shadows } from '../theme';

interface Props {
  visible:   boolean;
  url:       string;
  partner?:  string;
  onDone:    () => void;
}

export default function SecureRedirect({ visible, url, partner = 'Omio', onDone }: Props) {
  const scale = useRef(new Animated.Value(0.5)).current;
  const ring  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    scale.setValue(0.5);
    ring.setValue(0);
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
    const loop = Animated.loop(
      Animated.timing(ring, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    const id = setTimeout(() => {
      Linking.openURL(url).catch(() => {});
      onDone();
    }, 1600);
    return () => { clearTimeout(id); loop.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, url]);

  if (!visible) return null;

  const ringRotate = ring.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
        <View style={styles.lockArea}>
          {/* Anillo metálico (blanco → dorado → púrpura) que gira */}
          <Animated.View style={[styles.ring, { transform: [{ rotate: ringRotate }] }]} />
          <LinearGradient colors={['#9E74D6', '#7C3AED', '#56398B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.lockCircle}>
            <Ionicons name="lock-closed" size={46} color="#F1E9FB" />
          </LinearGradient>
          {/* Check verde de "verificado" */}
          <View style={styles.checkBadge}>
            <Ionicons name="checkmark" size={16} color="#fff" />
          </View>
        </View>

        <Text style={styles.title}>Conexión segura</Text>
        <Text style={styles.sub}>Te llevamos a {partner} para completar tu compra de forma segura</Text>

        <ActivityIndicator color="#A78BFA" style={{ marginTop: 22 }} />

        <View style={styles.badge}>
          <Ionicons name="shield-checkmark" size={13} color="#A78BFA" />
          <Text style={styles.badgeText}>Pago seguro · {partner} · PCI-DSS</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject, zIndex: 1000,
    backgroundColor: 'rgba(8,6,24,0.92)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28,
  },
  // Card centrada (como el mockup)
  card: {
    width: '100%', maxWidth: 360, backgroundColor: '#1A1F2C',
    borderRadius: 26, paddingVertical: 38, paddingHorizontal: 28, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.18)',
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 30, shadowOffset: { width: 0, height: 12 }, elevation: 16,
  },
  lockArea: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center', marginBottom: 26 },
  // Anillo con 4 colores de borde → al rotar simula el arco metálico brillante
  ring: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70, borderWidth: 4,
    borderTopColor: '#FFF5E6', borderRightColor: '#D4AF37',
    borderBottomColor: '#7A52AA', borderLeftColor: '#4A3B68',
  },
  lockCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', ...Shadows.glow },
  checkBadge: {
    position: 'absolute', right: 8, bottom: 8, width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#1A1F2C',
  },

  title: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 10, letterSpacing: -0.4 },
  sub:   { fontSize: 15, color: '#A0A5B5', textAlign: 'center', lineHeight: 22 },

  badge: {
    marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(139,92,246,0.12)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.30)',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  badgeText: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
});
