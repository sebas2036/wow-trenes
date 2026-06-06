/**
 * WoW Train — Ajustes
 * Diseño iOS Settings: íconos cuadrados con color + Ionicons blanco. Sin emoji.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Switch, ScrollView, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { Radius } from '../theme';
import { useTheme } from '../context/ThemeContext';
import BottomTabBar from '../components/BottomTabBar';
import TranslatorSheet from '../components/TranslatorSheet';

const APP_VERSION = '1.0.0';

// ── Ícono estilo iOS Settings ─────────────────────────────────────────────────
function SettingsIcon({ name, bg }: { name: keyof typeof Ionicons.glyphMap; bg: string }) {
  return (
    <View style={[styles.iconWrap, { backgroundColor: bg }]}>
      <Ionicons name={name} size={17} color="#fff" />
    </View>
  );
}

// ── Fila genérica ─────────────────────────────────────────────────────────────
function Row({
  iconName, iconBg, label, value, onPress, isSwitch, switchValue, onToggle, colors, isLast,
}: {
  iconName:     keyof typeof Ionicons.glyphMap;
  iconBg:       string;
  label:        string;
  value?:       string;
  onPress?:     () => void;
  isSwitch?:    boolean;
  switchValue?: boolean;
  onToggle?:    (v: boolean) => void;
  colors:       any;
  isLast?:      boolean;
}) {
  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.row,
          onPress && pressed && { opacity: 0.7 },
        ]}
        onPress={onPress}
        disabled={!onPress && !isSwitch}
      >
        <SettingsIcon name={iconName} bg={iconBg} />
        <Text style={[styles.rowLabel, { color: colors.text.primary }]}>{label}</Text>
        {isSwitch ? (
          <Switch
            value={switchValue}
            onValueChange={onToggle}
            trackColor={{ false: colors.border.default, true: colors.brand.primary }}
            thumbColor="#fff"
          />
        ) : value ? (
          <Text style={[styles.rowValue, { color: colors.text.muted }]}>{value}</Text>
        ) : onPress ? (
          <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
        ) : null}
      </Pressable>
      {!isLast && <View style={[styles.divider, { backgroundColor: colors.border.subtle }]} />}
    </>
  );
}

// ── Pantalla ──────────────────────────────────────────────────────────────────
export default function AjustesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [notifications, setNotifications] = useState(true);
  const [haptics,       setHaptics]       = useState(true);
  const [translator,    setTranslator]    = useState(false);

  const goLegal = (page: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/legal', params: { page } });
  };

  const groupStyle = [styles.group, {
    backgroundColor: colors.bg.card,
    borderColor:     colors.border.card,
  }];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg.base }]} edges={['top']}>

      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text.primary }]}>Ajustes</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Preferencias ── */}
        <Text style={[styles.section, { color: colors.text.muted }]}>PREFERENCIAS</Text>
        <View style={groupStyle}>
          <Row
            iconName="notifications-outline" iconBg="#7C3AED"
            label="Notificaciones de tren" colors={colors}
            isSwitch switchValue={notifications}
            onToggle={(v) => { Haptics.selectionAsync(); setNotifications(v); }}
          />
          <Row
            iconName="pulse-outline" iconBg="#0A84FF"
            label="Vibración (haptics)" colors={colors}
            isSwitch switchValue={haptics}
            onToggle={(v) => { Haptics.selectionAsync(); setHaptics(v); }}
            isLast
          />
        </View>

        {/* ── Datos ── */}
        <Text style={[styles.section, { color: colors.text.muted }]}>DATOS</Text>
        <View style={groupStyle}>
          <Row
            iconName="globe-outline" iconBg="#30D158"
            label="Países cargados" value="+13 países" colors={colors}
          />
          <Row
            iconName="subway-outline" iconBg="#FF9F0A"
            label="Metros disponibles" value="6 ciudades" colors={colors}
          />
          <Row
            iconName="refresh-outline" iconBg="#0A84FF"
            label="Última actualización GTFS" value="Hoy" colors={colors}
            isLast
          />
        </View>

        {/* ── Legal ── */}
        <Text style={[styles.section, { color: colors.text.muted }]}>LEGAL</Text>
        <View style={groupStyle}>
          <Row
            iconName="help-circle-outline" iconBg="#FF9F0A"
            label="Preguntas frecuentes (FAQ)" colors={colors}
            onPress={() => goLegal('faq')}
          />
          <Row
            iconName="document-text-outline" iconBg="#0A84FF"
            label="Términos y Condiciones" colors={colors}
            onPress={() => goLegal('terms')}
          />
          <Row
            iconName="lock-closed-outline" iconBg="#FF453A"
            label="Política de Privacidad" colors={colors}
            onPress={() => goLegal('privacy')}
          />
          <Row
            iconName="shield-checkmark-outline" iconBg="#30D158"
            label="Seguridad y Privacidad" colors={colors}
            onPress={() => goLegal('security')}
            isLast
          />
        </View>

        {/* ── Privacidad ── */}
        <Text style={[styles.section, { color: colors.text.muted }]}>PRIVACIDAD</Text>
        <View style={groupStyle}>
          <Row
            iconName="person-remove-outline" iconBg="#30D158"
            label="Sin cuentas de usuario" value="RGPD Art. 5" colors={colors}
          />
          <Row
            iconName="card-outline" iconBg="#0A84FF"
            label="Pagos vía Trainline (MoR)" value="PCI-DSS" colors={colors}
          />
          <Row
            iconName="phone-portrait-outline" iconBg="#7C3AED"
            label="Tickets guardados localmente" value="Solo en tu teléfono" colors={colors}
            isLast
          />
        </View>

        {/* ── Acerca de ── */}
        <Text style={[styles.section, { color: colors.text.muted }]}>ACERCA DE</Text>
        <View style={groupStyle}>
          <Row
            iconName="information-circle-outline" iconBg="#636366"
            label="Versión" value={APP_VERSION} colors={colors}
          />
          <Row
            iconName="star-outline" iconBg="#FFD60A"
            label="Calificar la app" colors={colors}
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          />
          <Row
            iconName="bug-outline" iconBg="#FF453A"
            label="Reportar un problema" colors={colors}
            onPress={() => Linking.openURL('mailto:Glosx@outlook.com?subject=WoW Train - Bug')}
            isLast
          />
        </View>

        {/* ── Branding ── */}
        <View style={styles.brand}>
          <Text style={[styles.brandLogo, { color: colors.text.primary }]}>
            <Text style={{ color: colors.brand.primary }}>WoW </Text>TRENES
          </Text>
          <Text style={[styles.brandSub, { color: colors.text.muted }]}>
            Hecho para viajeros del mundo
          </Text>
        </View>

        <View style={{ height: 8 }} />
      </ScrollView>

      <BottomTabBar active="ajustes" onTranslatePress={() => setTranslator(true)} />
      <TranslatorSheet visible={translator} onClose={() => setTranslator(false)} />
    </SafeAreaView>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:   { flex: 1 },
  header: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 6 },
  title:  { fontSize: 30, fontWeight: '800', letterSpacing: -0.3 },
  scroll: { flex: 1 },

  section: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.1,
    paddingHorizontal: 22, marginTop: 24, marginBottom: 8,
  },

  group: {
    marginHorizontal: 16,
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13, gap: 13,
  },

  // Ícono iOS Settings — cuadrado redondeado con color + icono blanco
  iconWrap: {
    width: 32, height: 32,
    borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },

  divider:  { height: 0.5, marginLeft: 59 },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  rowValue: { fontSize: 13 },

  brand:     { alignItems: 'center', paddingVertical: 36, gap: 6 },
  brandLogo: { fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  brandSub:  { fontSize: 12 },
});
