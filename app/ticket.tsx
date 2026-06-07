/**
 * WoW Train — Ticket Screen
 * Lista todos los billetes guardados offline.
 * Integra useGeofenceTrigger para mostrar QR automáticamente en Ring-2.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { Typography, Spacing, Radius, Shadows, Gradients } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { loadAllTickets }    from '../services/ticketStorage';
import QRTicketOverlay       from '../components/QRTicketOverlay';
import { useGeofenceTrigger } from '../hooks/useGeofenceTrigger';
import type { StoredTicket } from '../types';

export default function TicketScreen() {
  const router    = useRouter();
  const { colors } = useTheme();
  const [tickets, setTickets] = useState<StoredTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const { activeTicket, qrVisible, triggerRing, dismissQR, openManually } =
    useGeofenceTrigger();

  useEffect(() => {
    loadAllTickets()
      .then(setTickets)
      .finally(() => setLoading(false));
  }, []);

  const handleTicketPress = useCallback(
    (ticket: StoredTicket) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      openManually(ticket);
    },
    [openManually],
  );

  return (
    <View style={styles.rootWrap}>
      <Image source={require('../assets/images/bg-hero.png')} style={[StyleSheet.absoluteFillObject, { top: -280, bottom: 280 }]} resizeMode="cover" />
      <LinearGradient colors={['rgba(10,8,30,0.35)', 'rgba(14,14,46,0.60)', 'rgba(14,14,46,0.80)']} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border.subtle }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backTxt, { color: colors.text.brand }]}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text.primary }]}>Mis Billetes</Text>
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
          {tickets.length} guardados offline
        </Text>
      </View>

      {tickets.length === 0 && !loading ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIconWrap, { backgroundColor: colors.bg.elevated }]}>
            <Ionicons name="ticket-outline" size={48} color={colors.text.muted} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>
            Sin billetes aún
          </Text>
          <Text style={[styles.emptySub, { color: colors.text.secondary }]}>
            Compra un tren y tu QR aparecerá aquí,{'\n'}listo para usar sin internet.
          </Text>
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TicketCard ticket={item} onPress={handleTicketPress} />
          )}
        />
      )}

      {/* Auto-triggered QR Overlay (geofence Ring-2) */}
      {activeTicket && (
        <QRTicketOverlay
          ticket={activeTicket}
          visible={qrVisible}
          onClose={dismissQR}
          autoMode={triggerRing === 'inner'}
        />
      )}
    </SafeAreaView>
    </View>
  );
}

// ── Ticket card ──────────────────────────────────────────────────────────────
function TicketCard({
  ticket,
  onPress,
}: {
  ticket:  StoredTicket;
  onPress: (t: StoredTicket) => void;
}) {
  const { colors } = useTheme();
  const svc     = ticket.trainService;
  const dep     = svc.departureTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const dateStr = svc.departureTime.toLocaleDateString('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
  const isValid = ticket.status === 'valid';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        Shadows.card,
        { backgroundColor: colors.bg.surface, borderColor: colors.border.default },
        pressed && { opacity: 0.88, transform: [{ scale: 0.985 }] },
      ]}
      onPress={() => onPress(ticket)}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`Billete ${svc.operator.toUpperCase()} a ${svc.destination.name}. Sale a las ${dep}. Toca para ver QR.`}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.03)', 'transparent']}
        style={StyleSheet.absoluteFill}
      />

      {/* Franja de estado lateral */}
      <View style={[
        styles.stripe,
        { backgroundColor: isValid ? colors.status.safe : colors.status.neutral },
      ]} />

      <View style={styles.cardContent}>
        <View style={styles.cardLeft}>
          <Text style={[styles.cardOp, { color: colors.text.primary }]}>
            {svc.operator.toUpperCase()} {svc.trainNumber}
          </Text>
          <Text style={[styles.cardDest, { color: colors.text.secondary }]}>
            → {svc.destination.name}
          </Text>
          <Text style={[styles.cardDate, { color: colors.text.muted }]}>{dateStr}</Text>
        </View>

        <View style={styles.cardRight}>
          <Text style={[styles.cardTime, { color: colors.text.primary }]}>{dep}</Text>
          {svc.platform && (
            <Text style={[styles.cardPlatform, { color: colors.text.brand }]}>
              Andén {svc.platform}
            </Text>
          )}
          <View style={[styles.qrIconWrap, { backgroundColor: colors.brand.primary + '18' }]}>
            <Ionicons name="qr-code-outline" size={22} color={colors.brand.primary} />
          </View>
        </View>
      </View>

      <Text style={[styles.cardRef, { color: colors.text.muted }]}>
        Ref: {ticket.bookingRef}
      </Text>
    </Pressable>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  rootWrap: { flex: 1 },
  root: { flex: 1, backgroundColor: 'transparent' },

  header: {
    paddingHorizontal: Spacing['5'],
    paddingTop:        Spacing['4'],
    paddingBottom:     Spacing['3'],
    borderBottomWidth: 1,
  },
  backBtn: {
    marginBottom:    Spacing['2'],
    alignSelf:       'flex-start',
    paddingVertical: Spacing['1'],
  },
  backTxt: {
    fontSize:   Typography.size['2xl'],
    fontWeight: Typography.weight.bold,
  },
  title: {
    fontSize:   Typography.size.xl,
    fontWeight: Typography.weight.black,
  },
  subtitle: {
    fontSize:  Typography.size.sm,
    marginTop: 2,
  },

  list:  { padding: Spacing['4'], gap: Spacing['3'] },

  empty: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: Spacing['8'],
    gap:               Spacing['3'],
  },
  emptyIconWrap: {
    width:          88,
    height:         88,
    borderRadius:   44,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   4,
  },
  emptyTitle: {
    fontSize:   Typography.size.xl,
    fontWeight: Typography.weight.bold,
    textAlign:  'center',
  },
  emptySub: {
    fontSize:   Typography.size.sm,
    textAlign:  'center',
    lineHeight: Typography.size.sm * 1.6,
  },

  card: {
    borderRadius: Radius.lg,
    borderWidth:  1,
    overflow:     'hidden',
    padding:      Spacing['4'],
    gap:          Spacing['2'],
  },
  stripe: {
    position:               'absolute',
    left:                   0,
    top:                    0,
    bottom:                 0,
    width:                  4,
    borderTopLeftRadius:    Radius.lg,
    borderBottomLeftRadius: Radius.lg,
  },
  cardContent: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    paddingLeft:    Spacing['2'],
  },
  cardLeft:     { gap: 2 },
  cardOp:       { fontSize: Typography.size.sm, fontWeight: Typography.weight.bold, letterSpacing: 0.5 },
  cardDest:     { fontSize: Typography.size.sm },
  cardDate:     { fontSize: Typography.size.xs },
  cardRight:    { alignItems: 'flex-end', gap: Spacing['1'] },
  cardTime: {
    fontSize:      Typography.size['2xl'],
    fontWeight:    Typography.weight.black,
    letterSpacing: -0.5,
  },
  cardPlatform: {
    fontSize:   Typography.size.xs,
    fontWeight: Typography.weight.semibold,
  },
  qrIconWrap: {
    marginTop:      Spacing['1'],
    width:          36,
    height:         36,
    borderRadius:   Radius.md,
    alignItems:     'center',
    justifyContent: 'center',
  },
  cardRef: {
    fontSize:    Typography.size.xs,
    paddingLeft: Spacing['2'],
  },
});
