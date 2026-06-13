/**
 * WoW Train — Ajustes
 * Diseño iOS Settings: íconos cuadrados con color + Ionicons blanco. Sin emoji.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Switch, ScrollView, Linking, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { hImpact, hSelection, hNotify, ImpactStyle, NotifyType } from '../services/haptics';
import { getHapticsEnabled, getNotificationsEnabled, setHapticsEnabled, setNotificationsEnabled } from '../services/userSettings';
import { Ionicons } from '@expo/vector-icons';

import { Radius, Gradients } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { t } from '../services/i18n';
import { LinearGradient } from 'expo-linear-gradient';
import BottomTabBar from '../components/BottomTabBar';

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
        <Text style={styles.rowLabel}>{label}</Text>
        {isSwitch ? (
          <Switch
            value={switchValue}
            onValueChange={onToggle}
            trackColor={{ false: colors.border.default, true: colors.brand.primary }}
            thumbColor="#fff"
          />
        ) : value ? (
          <Text style={styles.rowValue}>{value}</Text>
        ) : onPress ? (
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.65)" />
        ) : null}
      </Pressable>
      {!isLast && <View style={styles.divider} />}
    </>
  );
}

// ── Pantalla ──────────────────────────────────────────────────────────────────
export default function AjustesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [notifications, setNotifications] = useState(getNotificationsEnabled);
  const [haptics,       setHaptics]       = useState(getHapticsEnabled);

  const goLegal = (page: string) => {
    hImpact(ImpactStyle.Light);
    router.push({ pathname: '/legal', params: { page } });
  };

  const groupStyle = [styles.group];

  return (
    <View style={styles.rootGradient}>
      <Image source={require('../assets/images/bg-hero.png')} style={[StyleSheet.absoluteFillObject, { top: -280, bottom: 280 }]} resizeMode="cover" fadeDuration={0} />
      <LinearGradient colors={['rgba(10,8,30,0.20)', 'rgba(14,14,46,0.45)', 'rgba(14,14,46,0.65)']} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
    <SafeAreaView style={styles.root} edges={['top']}>

      <View style={styles.header}>
        <Text style={styles.title}>{t('settings_title')}</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Preferencias ── */}
        <Text style={styles.section}>{t('settings_prefs')}</Text>
        <View style={groupStyle}>
          <Row
            iconName="notifications-outline" iconBg="#7C3AED"
            label={t('settings_notifs')} colors={colors}
            isSwitch switchValue={notifications}
            onToggle={(v) => { hSelection(); setNotifications(v); setNotificationsEnabled(v); }}
          />
          <Row
            iconName="pulse-outline" iconBg="#0A84FF"
            label={t('settings_haptics')} colors={colors}
            isSwitch switchValue={haptics}
            onToggle={(v) => { hSelection(); setHaptics(v); setHapticsEnabled(v); }}
            isLast
          />
        </View>

        {/* ── Datos ── */}
        <Text style={styles.section}>{t('settings_data')}</Text>
        <View style={groupStyle}>
          <Row
            iconName="globe-outline" iconBg="#30D158"
            label={t('settings_countries')} value={t('settings_countries_val')} colors={colors}
          />
          <Row
            iconName="subway-outline" iconBg="#FF9F0A"
            label={t('settings_metros')} value={t('settings_metros_val')} colors={colors}
          />
          <Row
            iconName="refresh-outline" iconBg="#0A84FF"
            label={t('settings_gtfs')} value={t('settings_today')} colors={colors}
            isLast
          />
        </View>

        {/* ── Legal ── */}
        <Text style={styles.section}>{t('settings_legal')}</Text>
        <View style={groupStyle}>
          <Row
            iconName="help-circle-outline" iconBg="#FF9F0A"
            label={t('settings_faq')} colors={colors}
            onPress={() => goLegal('faq')}
          />
          <Row
            iconName="document-text-outline" iconBg="#0A84FF"
            label={t('settings_terms')} colors={colors}
            onPress={() => goLegal('terms')}
          />
          <Row
            iconName="lock-closed-outline" iconBg="#FF453A"
            label={t('settings_privacy')} colors={colors}
            onPress={() => goLegal('privacy')}
          />
          <Row
            iconName="shield-checkmark-outline" iconBg="#30D158"
            label={t('settings_security')} colors={colors}
            onPress={() => goLegal('security')}
            isLast
          />
        </View>

        {/* ── Privacidad ── */}
        <Text style={styles.section}>{t('settings_privacy_sec')}</Text>
        <View style={groupStyle}>
          <Row
            iconName="person-remove-outline" iconBg="#30D158"
            label={t('settings_no_accounts')} value="RGPD Art. 5" colors={colors}
          />
          <Row
            iconName="card-outline" iconBg="#0A84FF"
            label={t('settings_payments')} value="PCI-DSS" colors={colors}
          />
          <Row
            iconName="phone-portrait-outline" iconBg="#7C3AED"
            label={t('settings_local_tickets')} value={t('settings_local_val')} colors={colors}
            isLast
          />
        </View>

        {/* ── Acerca de ── */}
        <Text style={styles.section}>{t('settings_about')}</Text>
        <View style={groupStyle}>
          <Row
            iconName="information-circle-outline" iconBg="#636366"
            label={t('settings_version')} value={APP_VERSION} colors={colors}
          />
          <Row
            iconName="star-outline" iconBg="#FFD60A"
            label={t('settings_rate')} colors={colors}
            onPress={() => hImpact(ImpactStyle.Light)}
          />
          <Row
            iconName="bug-outline" iconBg="#FF453A"
            label={t('settings_report')} colors={colors}
            onPress={() => Linking.openURL('mailto:Glosx@outlook.com?subject=WoW Train - Bug')}
            isLast
          />
        </View>

        {/* ── Branding ── */}
        <View style={styles.brand}>
          <Text style={styles.brandLogo}>
            <Text style={{ color: '#A78BFA' }}>WoW </Text>TRAIN
          </Text>
          <Text style={styles.brandSub}>
            {t('settings_tagline')}
          </Text>
        </View>

        <View style={{ height: 8 }} />
      </ScrollView>

      <BottomTabBar active="ajustes" />
    </SafeAreaView>
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  rootGradient: { flex: 1 },
  root:   { flex: 1, backgroundColor: 'transparent' },
  header: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 6 },
  title:  { fontSize: 34, fontWeight: '900', letterSpacing: -0.8, color: '#fff' },
  scroll: { flex: 1 },

  section: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.3,
    paddingHorizontal: 22, marginTop: 28, marginBottom: 8,
    color: '#ffffff',
  },

  group: {
    marginHorizontal: 16,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    backgroundColor: 'rgba(14,14,46,0.52)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.20,
    shadowRadius: 20,
  },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 13,
  },

  // Ícono iOS Settings — cuadrado redondeado con color + icono blanco
  iconWrap: {
    width: 34, height: 34,
    borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },

  divider:  { height: 0.5, marginLeft: 62, backgroundColor: 'rgba(255,255,255,0.18)' },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: '#ffffff' },
  rowValue: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.80)' },

  brand:     { alignItems: 'center', paddingVertical: 40, gap: 8 },
  brandLogo: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5, color: '#fff' },
  brandSub:  { fontSize: 12, fontWeight: '300', color: 'rgba(226,232,240,0.45)', letterSpacing: 0.3 },
});
