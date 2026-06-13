/**
 * app/mis-viajes.tsx — "Mis viajes"
 *
 * Lista los trenes que el usuario marcó para comprar (registro optimista creado
 * al tocar "Comprar"). NO es un historial de pagos: la compra es externa en
 * Trainline y la app nunca ve la confirmación. Por eso se muestra como "viajes"
 * y permite reabrir la reserva en Trainline (con la transición de seguridad).
 *
 * Sin datos personales (RGPD): solo ruta, fecha y operador.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { Radius } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { t, getLanguage } from '../services/i18n';
import { hSelection, hImpact, ImpactStyle } from '../services/haptics';
import { loadAllTickets } from '../services/ticketStorage';
import { buildBestBookingUrl } from '../services/affiliateEngine';
import BottomTabBar from '../components/BottomTabBar';
import SecureRedirect from '../components/SecureRedirect';
import type { StoredTicket } from '../types';

function fmtDate(d: Date): string {
  try {
    return d.toLocaleDateString(getLanguage(), { day: '2-digit', month: 'short' });
  } catch {
    return d.toLocaleDateString();
  }
}
function fmtTime(d: Date): string {
  try {
    return d.toLocaleTimeString(getLanguage(), { hour: '2-digit', minute: '2-digit' });
  } catch {
    return d.toLocaleTimeString();
  }
}

export default function MisViajesScreen() {
  const { colors } = useTheme();
  const [trips,     setTrips]     = useState<StoredTicket[]>([]);
  const [secureUrl, setSecureUrl] = useState<string | null>(null);

  // Carga los viajes guardados; con cleanup para no setear estado tras desmontar.
  useEffect(() => {
    let mounted = true;
    loadAllTickets()
      .then((list) => { if (mounted) setTrips(list); })
      .catch(() => { if (mounted) setTrips([]); });
    return () => { mounted = false; };
  }, []);

  const handleReopen = useCallback((trip: StoredTicket) => {
    hImpact(ImpactStyle.Medium);
    const svc = trip.trainService;
    const url = buildBestBookingUrl(
      svc.origin.name,
      svc.destination.name,
      svc.departureTime,
      svc.origin.country,
    );
    setSecureUrl(url);
  }, []);

  return (
    <View style={styles.rootWrap}>
      <Image
        source={require('../assets/images/bg-hero.png')}
        style={[StyleSheet.absoluteFillObject, { top: -280, bottom: 280 }]}
        resizeMode="cover"
        fadeDuration={0}
      />
      <LinearGradient
        colors={['rgba(10,8,30,0.35)', 'rgba(14,14,46,0.60)', 'rgba(14,14,46,0.80)']}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <SafeAreaView style={styles.root} edges={['top']}>

        <View style={styles.header}>
          <Text style={[styles.title,    { color: colors.text.primary   }]}>{t('trips_title')}</Text>
          <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
            {trips.length > 0 ? `${trips.length}` : ''} {trips.length > 0 ? t('tab_trips') : ''}
          </Text>
        </View>

        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        >
          {trips.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.bg.elevated }]}>
                <Ionicons name="ticket-outline" size={40} color={colors.text.muted} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>
                {t('trips_empty')}
              </Text>
              <Text style={[styles.emptySub, { color: colors.text.secondary }]}>
                {t('trips_empty_sub')}
              </Text>
            </View>
          ) : (
            trips.map((trip) => {
              const svc = trip.trainService;
              return (
                <View
                  key={trip.id}
                  style={[styles.card, { backgroundColor: colors.bg.card, borderColor: colors.border.card }]}
                >
                  <View style={styles.cardTop}>
                    <Text style={[styles.op, { color: colors.brand.accent }]}>
                      {String(trip.operator).toUpperCase()}
                    </Text>
                    <Text style={[styles.when, { color: colors.text.secondary }]}>
                      {fmtDate(svc.departureTime)} · {fmtTime(svc.departureTime)}
                    </Text>
                  </View>

                  <View style={styles.route}>
                    <Text style={[styles.station, { color: colors.text.primary }]} numberOfLines={1}>
                      {svc.origin.name}
                    </Text>
                    <Ionicons name="arrow-forward" size={15} color={colors.text.muted} style={{ marginHorizontal: 8 }} />
                    <Text style={[styles.station, { color: colors.text.primary }]} numberOfLines={1}>
                      {svc.destination.name}
                    </Text>
                  </View>

                  <Pressable
                    style={({ pressed }) => [
                      styles.reopenBtn, { backgroundColor: colors.brand.primary },
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={() => { hSelection(); handleReopen(trip); }}
                  >
                    <Ionicons name="open-outline" size={15} color="#fff" />
                    <Text style={styles.reopenText}>{t('trips_reopen')}</Text>
                  </Pressable>
                </View>
              );
            })
          )}
          <View style={{ height: 8 }} />
        </ScrollView>

        {/* Transición "Conexión segura" antes de saltar a Trainline */}
        <SecureRedirect visible={!!secureUrl} url={secureUrl ?? ''} onDone={() => setSecureUrl(null)} />

        <BottomTabBar active="viajes" />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  rootWrap: { flex: 1 },
  root:     { flex: 1, backgroundColor: 'transparent' },
  header:   { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 14 },
  title:    { fontSize: 30, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { fontSize: 13, marginTop: 4 },
  scroll:   { flex: 1 },
  list:     { paddingHorizontal: 16, gap: 10 },

  card: {
    borderRadius: Radius.lg, borderWidth: 0.5,
    paddingHorizontal: 16, paddingVertical: 14, gap: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  op:      { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  when:    { fontSize: 12, fontWeight: '600' },
  route:   { flexDirection: 'row', alignItems: 'center' },
  station: { fontSize: 16, fontWeight: '700', flexShrink: 1 },

  reopenBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 10, borderRadius: Radius.md, marginTop: 2,
  },
  reopenText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  empty:         { alignItems: 'center', paddingTop: 80, paddingHorizontal: 30 },
  emptyIconWrap: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle:    { fontSize: 18, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  emptySub:      { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
