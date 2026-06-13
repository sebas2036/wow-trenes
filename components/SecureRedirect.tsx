/**
 * SecureRedirect — transición de "conexión segura" antes de saltar al partner.
 *
 * Overlay EN EL ÁRBOL (no <Modal> → evita el bug de toques muertos en Android).
 * Cuando se hace visible: anima el candado, y tras ~1.6s abre la URL del partner
 * (Trainline) en el navegador y se cierra. Da confianza antes del redirect.
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

export default function SecureRedirect({ visible, url, partner = 'Trainline', onDone }: Props) {
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
      <View style={styles.lockArea}>
        <Animated.View style={[styles.ring, { transform: [{ rotate: ringRotate }] }]} />
        <Animated.View style={{ transform: [{ scale }] }}>
          <LinearGradient colors={['#8B5CF6', '#7C3AED', '#6D28D9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.lockCircle}>
            <Ionicons name="lock-closed" size={40} color="#fff" />
          </LinearGradient>
        </Animated.View>
      </View>

      <Text style={styles.title}>Conexión segura</Text>
      <Text style={styles.sub}>Te llevamos a {partner} para completar tu compra de forma segura</Text>

      <ActivityIndicator color="#A78BFA" style={{ marginTop: 20 }} />

      <View style={styles.badge}>
        <Ionicons name="shield-checkmark" size={14} color="#A78BFA" />
        <Text style={styles.badgeText}>Pago seguro · {partner} (Merchant of Record) · PCI-DSS</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject, zIndex: 1000,
    backgroundColor: 'rgba(8,6,24,0.96)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36,
  },
  lockArea: { width: 130, height: 130, alignItems: 'center', justifyContent: 'center', marginBottom: 26 },
  ring: {
    position: 'absolute', width: 124, height: 124, borderRadius: 62,
    borderWidth: 2, borderColor: 'rgba(167,139,250,0.25)', borderTopColor: '#A78BFA',
  },
  lockCircle: { width: 86, height: 86, borderRadius: 43, alignItems: 'center', justifyContent: 'center', ...Shadows.glow },

  title: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 8 },
  sub:   { fontSize: 15, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 21 },

  badge: {
    position: 'absolute', bottom: 50, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(139,92,246,0.12)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.35)',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  badgeText: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
});
