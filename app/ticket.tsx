/**
 * WoW TRENES — Ticket Screen
 * Lists all stored offline tickets.
 * Integrates useGeofenceTrigger to auto-show QR overlay on Ring-2 events.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Colors, Typography, Spacing, Radius, Shadows, Gradients } from '../theme';
import { loadAllTickets } from '../services/ticketStorage';
import QRTicketOverlay    from '../components/QRTicketOverlay';
import { useGeofenceTrigger } from '../hooks/useGeofenceTrigger';
import type { StoredTicket } from '../types';

export default function TicketScreen() {
  const router    = useRouter();
  const [tickets, setTickets] = useState<StoredTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const { activeTicket, qrVisible, triggerRing, dismissQR, openManually } =
    useGeofenceTrigger();

  // Load stored tickets
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
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Mis Billetes</Text>
        <Text style={styles.subtitle}>{tickets.length} guardados offline</Text>
      </View>

      {tickets.length === 0 && !loading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🎫</Text>
          <Text style={styles.emptyTitle}>Sin billetes aún</Text>
          <Text style={styles.emptySub}>
            Compra un tren y tu QR aparecerá aquí, listo para usar sin internet.
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
  );
}

// ── Ticket card ─────────────────────────────────────────────────────────
function TicketCard({
  ticket,
  onPress,
}: {
  ticket:  StoredTicket;
  onPress: (t: StoredTicket) => void;
}) {
  const svc     = ticket.trainService;
  const dep     = svc.departureTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const dateStr = svc.departureTime.toLocaleDateString('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
  const isValid = ticket.status === 'valid';

  return (
    <Pressable
      style={[styles.card, Shadows.card]}
      onPress={() => onPress(ticket)}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`Billete ${svc.operator.toUpperCase()} a ${svc.destination.name}. Sale a las ${dep}. Toca para ver QR.`}
    >
      <LinearGradient colors={['rgba(255,255,255,0.03)', 'transparent']} style={StyleSheet.absoluteFill} />

      {/* Status stripe */}
      <View style={[styles.stripe, { backgroundColor: isValid ? Colors.status.safe : Colors.status.neutral }]} />

      <View style={styles.cardContent}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardOp}>{svc.operator.toUpperCase()} {svc.trainNumber}</Text>
          <Text style={styles.cardDest}>→ {svc.destination.name}</Text>
          <Text style={styles.cardDate}>{dateStr}</Text>
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.cardTime}>{dep}</Text>
          {svc.platform && (
            <Text style={styles.cardPlatform}>Andén {svc.platform}</Text>
          )}
          <View style={styles.qrIcon}>
            <Text style={{ fontSize: 24 }}>📱</Text>
          </View>
        </View>
      </View>

      <Text style={styles.cardRef}>Ref: {ticket.bookingRef}</Text>
    </Pressable>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg.base,
  },
  header: {
    paddingHorizontal: Spacing['5'],
    paddingTop:        Spacing['4'],
    paddingBottom:     Spacing['3'],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  backBtn: {
    marginBottom:  Spacing['2'],
    alignSelf:     'flex-start',
    paddingVertical: Spacing['1'],
  },
  backTxt: {
    fontSize:   Typography.size['2xl'],
    color:      Colors.text.brand,
    fontWeight: Typography.weight.bold,
  },
  title: {
    fontSize:   Typography.size.xl,
    fontWeight: Typography.weight.black,
    color:      Colors.text.primary,
  },
  subtitle: {
    fontSize:  Typography.size.sm,
    color:     Colors.text.secondary,
    marginTop: 2,
  },
  list: { padding: Spacing['4'], gap: Spacing['3'] },
  empty: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['8'],
    gap:            Spacing['3'],
  },
  emptyIcon:  { fontSize: 64 },
  emptyTitle: {
    fontSize:   Typography.size.xl,
    fontWeight: Typography.weight.bold,
    color:      Colors.text.primary,
    textAlign:  'center',
  },
  emptySub: {
    fontSize:  Typography.size.sm,
    color:     Colors.text.secondary,
    textAlign: 'center',
    lineHeight:Typography.size.sm * 1.6,
  },
  card: {
    backgroundColor: Colors.bg.surface,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border.default,
    overflow:        'hidden',
    padding:         Spacing['4'],
    gap:             Spacing['2'],
  },
  stripe: {
    position:     'absolute',
    left:         0,
    top:          0,
    bottom:       0,
    width:        4,
    borderTopLeftRadius:    Radius.lg,
    borderBottomLeftRadius: Radius.lg,
  },
  cardContent: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    paddingLeft:    Spacing['2'],
  },
  cardLeft:     { gap: 2 },
  cardOp: {
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color:      Colors.text.primary,
    letterSpacing: 0.5,
  },
  cardDest: { fontSize: Typography.size.sm, color: Colors.text.secondary },
  cardDate: { fontSize: Typography.size.xs, color: Colors.text.muted },
  cardRight:    { alignItems: 'flex-end', gap: Spacing['1'] },
  cardTime: {
    fontSize:   Typography.size['2xl'],
    fontWeight: Typography.weight.black,
    color:      Colors.text.primary,
    letterSpacing: -0.5,
  },
  cardPlatform: {
    fontSize:   Typography.size.xs,
    color:      Colors.text.brand,
    fontWeight: Typography.weight.semibold,
  },
  qrIcon: {
    marginTop: Spacing['1'],
    alignItems:'center',
  },
  cardRef: {
    fontSize:  Typography.size.xs,
    color:     Colors.text.muted,
    paddingLeft: Spacing['2'],
  },
});
