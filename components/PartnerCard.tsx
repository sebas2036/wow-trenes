/**
 * PartnerCard — Tarjeta de upsell para productos afiliados.
 *
 * Se muestra en las pantallas de país/metro para ofrecer:
 *   - Klook City Pass (metro + atracciones)
 *   - Kiwitaxi (transfer aeropuerto)
 *   - Yesim (eSIM internacional)
 *
 * Diseño minimalista con gradiente, badge de comisión y CTA claro.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';

export interface PartnerCardProps {
  icon:       keyof typeof Ionicons.glyphMap;
  title:      string;
  subtitle:   string;
  cta:        string;
  url:        string;
  colors:     [string, string];     // gradiente del ícono
  highlight?: boolean;              // si es un destacado
}

export default function PartnerCard({
  icon, title, subtitle, cta, url, colors: gradColors, highlight = false,
}: PartnerCardProps) {
  const { colors } = useTheme();

  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(url).catch(() => {});
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.bg.elevated,
          borderColor:     highlight ? gradColors[0] + '66' : colors.border.subtle,
          opacity:         pressed ? 0.85 : 1,
        },
      ]}
    >
      <LinearGradient
        colors={gradColors}
        style={styles.iconBadge}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      >
        <Ionicons name={icon} size={18} color="#fff" />
      </LinearGradient>

      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.subtitle, { color: colors.text.muted }]} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>

      <View style={[styles.ctaPill, { backgroundColor: gradColors[0] }]}>
        <Text style={styles.ctaText}>{cta}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, marginHorizontal: 12, marginBottom: 8,
    borderRadius: 14, borderWidth: 1,
  },
  iconBadge: {
    width: 42, height: 42, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  title:    { fontSize: 13, fontWeight: '700' },
  subtitle: { fontSize: 11, marginTop: 2, lineHeight: 14 },
  ctaPill:  {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
  },
  ctaText:  { color: '#fff', fontSize: 11, fontWeight: '700' },
});
