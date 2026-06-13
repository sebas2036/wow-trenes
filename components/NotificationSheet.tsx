/**
 * NotificationSheet — Centro de alertas flotante puro.
 */
import React from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Dimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { hImpact, hSelection, hNotify, ImpactStyle, NotifyType } from '../services/haptics';

import { Radius, Spacing, Typography, Gradients } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useNotifications, NOTIF_ICONS, NOTIF_COLORS } from '../context/NotificationContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function NotificationSheet({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const notifCtx = useNotifications();
  const notifications = Array.isArray(notifCtx?.notifications) ? notifCtx.notifications : [];
  const clearAll = notifCtx?.clearAll ?? (() => {});

  if (!visible) return null;

  return (
    <View style={[styles.overlay, { backgroundColor: 'rgba(10, 10, 18, 0.95)' }]}>
      <LinearGradient colors={[...Gradients.screenBg]} style={styles.gradient}>
        <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
          
          {/* Header */}
          <View style={styles.header}>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color={colors.text.primary} />
            </Pressable>
            <Text style={[styles.title, { color: colors.text.primary }]}>Alertas en Vivo</Text>
            {notifications.length > 0 ? (
              <Pressable onPress={() => { hImpact(ImpactStyle.Medium); clearAll(); }}>
                <Text style={{ color: colors.brand.primary, fontSize: 12, fontWeight: '600' }}>Limpiar</Text>
              </Pressable>
            ) : <View style={{ width: 40 }} />}
          </View>

          {/* Lista */}
          {notifications.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={40} color={colors.text.muted} />
              <Text style={[styles.emptyText, { color: colors.text.secondary }]}>Sin alertas por el momento</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.scroll}>
              {notifications.map((n) => (
                <View key={n.id} style={[styles.row, { backgroundColor: 'rgba(255,255,255,0.04)' }]}>
                  <Ionicons name={(n.icon ?? NOTIF_ICONS[n.type]) as any} size={18} color={NOTIF_COLORS[n.type]} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 13 }}>{n.title}</Text>
                    <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 2 }}>{n.body}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, width: SCREEN_WIDTH, height: SCREEN_HEIGHT, zIndex: 999999 },
  gradient: { flex: 1 },
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.1)' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700' },
  scroll: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', padding: 14, borderRadius: 12, gap: 12, alignItems: 'flex-start' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 14 }
});
