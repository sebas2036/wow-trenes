/**
 * NotificationSheet — Centro de alertas en tiempo real.
 *
 * Se abre al tocar la campanita.
 * Muestra alertas acumuladas: retrasos, último tren, geofence, llegadas.
 * Al abrir → marca todas como leídas → el badge de la campanita desaparece.
 */
import React, { useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Modal,
  ScrollView, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Radius, Spacing, Typography } from '../theme';
import { useTheme } from '../context/ThemeContext';
import {
  useNotifications,
  NOTIF_ICONS, NOTIF_COLORS,
  type AppNotification,
} from '../context/NotificationContext';
import FlagCircle from './FlagCircle';

interface Props {
  visible: boolean;
  onClose: () => void;
}

// ── Formatea timestamp relativo ───────────────────────────────────────────────
function timeAgo(date: Date): string {
  const diffMs  = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)  return 'Ahora';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Hace ${diffH} h`;
  return `Hace ${Math.floor(diffH / 24)} d`;
}

// ── Fila de notificación ──────────────────────────────────────────────────────
function NotifRow({ notif }: { notif: AppNotification }) {
  const { colors } = useTheme();
  const iconName  = (notif.icon ?? NOTIF_ICONS[notif.type]) as any;
  const accentColor = NOTIF_COLORS[notif.type];

  return (
    <View style={[
      styles.row,
      { backgroundColor: colors.bg.surface, borderColor: colors.border.subtle },
      !notif.read && { borderLeftColor: accentColor, borderLeftWidth: 3 },
    ]}>
      {/* Ícono o bandera */}
      <View style={[styles.rowIcon, { backgroundColor: accentColor + '18' }]}>
        {notif.countryCode ? (
          <FlagCircle countryCode={notif.countryCode} size="sm" />
        ) : (
          <Ionicons name={iconName} size={20} color={accentColor} />
        )}
      </View>

      {/* Contenido */}
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={[styles.rowTitle, { color: colors.text.primary }]} numberOfLines={1}>
            {notif.title}
          </Text>
          <Text style={[styles.rowTime, { color: colors.text.muted }]}>
            {timeAgo(notif.timestamp)}
          </Text>
        </View>
        <Text style={[styles.rowDesc, { color: colors.text.secondary }]} numberOfLines={2}>
          {notif.body}
        </Text>
      </View>

      {/* Punto unread */}
      {!notif.read && (
        <View style={[styles.unreadDot, { backgroundColor: accentColor }]} />
      )}
    </View>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function NotificationSheet({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const { notifications, markAllRead, clearAll } = useNotifications();

  // Al abrir → marcar todas como leídas
  useEffect(() => {
    if (visible) markAllRead();
  }, [visible]);

  const handleClear = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    clearAll();
  }, [clearAll]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg.base }]}>

        {/* ── Header ── */}
        <View style={[styles.header, {
          backgroundColor:   colors.bg.elevated,
          borderBottomColor: colors.border.subtle,
        }]}>
          <Pressable
            style={[styles.closeBtn, { backgroundColor: colors.bg.overlay }]}
            onPress={onClose}
            hitSlop={8}
          >
            <Ionicons name="close" size={16} color={colors.text.secondary} />
          </Pressable>

          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
            Notificaciones
          </Text>

          {notifications.length > 0 ? (
            <Pressable
              style={styles.clearBtn}
              onPress={handleClear}
              hitSlop={8}
            >
              <Text style={[styles.clearText, { color: colors.brand.primary }]}>
                Limpiar
              </Text>
            </Pressable>
          ) : (
            <View style={{ width: 56 }} />
          )}
        </View>

        {/* ── Lista de notificaciones ── */}
        {notifications.length === 0 ? (
          /* Empty state */
          <View style={styles.empty}>
            <View style={[styles.emptyIconWrap, { backgroundColor: colors.bg.elevated }]}>
              <Ionicons name="notifications-off-outline" size={36} color={colors.text.muted} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>
              Sin notificaciones
            </Text>
            <Text style={[styles.emptySub, { color: colors.text.secondary }]}>
              Las alertas de trenes, retrasos y tu{'\n'}ubicación aparecerán aquí.
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Agrupados — Nuevas */}
            {notifications.some((n) => !n.read) && (
              <Text style={[styles.groupLabel, { color: colors.text.muted }]}>NUEVAS</Text>
            )}
            {notifications.map((n) => (
              <NotifRow key={n.id} notif={n} />
            ))}
          </ScrollView>
        )}

      </SafeAreaView>
    </Modal>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: Spacing['3'],
    paddingVertical:   Spacing['3'],
    borderBottomWidth: 0.5,
  },
  closeBtn: {
    width: 36, height: 36,
    borderRadius: Radius.full,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontSize:   Typography.size.sm,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  clearBtn: { paddingHorizontal: 4, paddingVertical: 8 },
  clearText: { fontSize: Typography.size.xs, fontWeight: '600' },

  scroll:        { flex: 1 },
  scrollContent: { padding: Spacing['3'], gap: Spacing['2'], paddingBottom: 40 },

  groupLabel: {
    fontSize:      Typography.size.xs,
    fontWeight:    '700',
    letterSpacing: 0.8,
    marginBottom:  4,
    marginLeft:    4,
  },

  // Fila de notificación
  row: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    borderRadius:  Radius.lg,
    borderWidth:   0.5,
    padding:       Spacing['3'],
    gap:           Spacing['3'],
    overflow:      'hidden',
  },
  rowIcon: {
    width: 40, height: 40,
    borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  rowBody:  { flex: 1, gap: 3 },
  rowTop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowTitle: { fontSize: Typography.size.sm, fontWeight: '600', flex: 1 },
  rowTime:  { fontSize: 10, fontWeight: '500', flexShrink: 0 },
  rowDesc:  { fontSize: Typography.size.xs, lineHeight: 17 },
  unreadDot: {
    width: 7, height: 7, borderRadius: 3.5,
    position: 'absolute', top: 12, right: 12,
  },

  // Empty state
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, gap: 14,
  },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: Typography.size.md, fontWeight: '700', textAlign: 'center' },
  emptySub:   { fontSize: Typography.size.sm, textAlign: 'center', lineHeight: 22 },
});
