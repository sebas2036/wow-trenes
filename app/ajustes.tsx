/**
 * WoW Train — Ajustes
 * Diseño iOS Settings: íconos cuadrados con color + Ionicons blanco. Sin emoji.
 */
import React, { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, StyleSheet, Pressable, Switch, ScrollView, Linking, Image,
  TextInput, Platform, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { hImpact, hSelection, hNotify, ImpactStyle, NotifyType } from '../services/haptics';
import { getHapticsEnabled, getNotificationsEnabled, setHapticsEnabled, setNotificationsEnabled } from '../services/userSettings';
import { Ionicons } from '@expo/vector-icons';

import { Radius, Gradients } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { t, useLanguage, setLanguage, SUPPORTED_LANGUAGES } from '../services/i18n';

// Idiomas con traducción real (excluye los que caerían a inglés)
const PICKER_LANGS = SUPPORTED_LANGUAGES.filter(l => l.code !== 'ru');
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
  const lang = useLanguage();
  const [langOpen, setLangOpen] = useState(false);
  const currentLangName = PICKER_LANGS.find(l => l.code === lang)?.name ?? lang;

  const [rateOpen, setRateOpen] = useState(false);
  const [rating,   setRating]   = useState(0);
  useEffect(() => {
    AsyncStorage.getItem('@app_rating').then(v => { if (v) setRating(parseInt(v, 10) || 0); }).catch(() => {});
  }, []);
  const handleRate = (n: number) => {
    hSelection();
    setRating(n);
    AsyncStorage.setItem('@app_rating', String(n)).catch(() => {});
    // ≤3 estrellas → feedback privado por email (en vez de una reseña pública mala).
    // ≥4 → gracias inline (post-lanzamiento: Linking a la tienda).
    if (n <= 3) Linking.openURL(`mailto:Glosx@outlook.com?subject=WoW Train - Feedback`).catch(() => {});
  };

  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState('');
  const sendReport = () => {
    if (!reportText.trim()) return;
    Keyboard.dismiss();
    // El texto del usuario + contexto automático (versión/dispositivo) van en el cuerpo del mail.
    const ctx = `\n\n---\nApp: WoW Train v${APP_VERSION}\n${Platform.OS} ${Platform.Version}`;
    const url = `mailto:Glosx@outlook.com?subject=${encodeURIComponent('WoW Train - Reporte')}&body=${encodeURIComponent(reportText + ctx)}`;
    Linking.openURL(url).catch(() => {});
    setReportText('');
    setReportOpen(false);
  };

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
          />
          <Row
            iconName="game-controller-outline" iconBg="#EC4899"
            label="Tren Escapista 🚂" colors={colors}
            value="Jugar"
            onPress={() => { hSelection(); router.push('/arcade'); }}
          />
          <Row
            iconName="language-outline" iconBg="#0EA5E9"
            label={t('settings_language')} colors={colors}
            value={currentLangName}
            onPress={() => { hSelection(); setLangOpen(o => !o); }}
            isLast={!langOpen}
          />
          {langOpen && PICKER_LANGS.map((l, i) => (
            <Pressable
              key={l.code}
              style={({ pressed }) => [styles.langRow, pressed && { backgroundColor: 'rgba(255,255,255,0.06)' }, i === PICKER_LANGS.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => { hSelection(); setLanguage(l.code); setLangOpen(false); }}
            >
              <Text style={styles.langFlag}>{l.flag}</Text>
              <Text style={[styles.langName, { color: colors.text.primary }]}>{l.name}</Text>
              {lang === l.code && <Ionicons name="checkmark" size={20} color="#0EA5E9" />}
            </Pressable>
          ))}
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
            value={rating > 0 ? '★'.repeat(rating) : undefined}
            onPress={() => { hImpact(ImpactStyle.Light); setRateOpen(o => !o); }}
          />
          {rateOpen && (
            <View style={styles.rateBox}>
              <Text style={styles.ratePrompt}>{rating > 0 ? t('rate_thanks') : t('rate_tap')}</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map(n => (
                  <Pressable key={n} onPress={() => handleRate(n)} hitSlop={6}>
                    <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={36} color="#FFD60A" />
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          <Row
            iconName="bug-outline" iconBg="#FF453A"
            label={t('settings_report')} colors={colors}
            onPress={() => { hImpact(ImpactStyle.Light); setReportOpen(o => !o); }}
            isLast={!reportOpen}
          />
          {reportOpen && (
            <View style={styles.reportBox}>
              <TextInput
                style={styles.reportInput}
                placeholder={t('report_ph')}
                placeholderTextColor="rgba(255,255,255,0.4)"
                multiline
                value={reportText}
                onChangeText={setReportText}
              />
              <Pressable
                style={({ pressed }) => [styles.reportBtn, !reportText.trim() && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
                onPress={sendReport}
                disabled={!reportText.trim()}
              >
                <Ionicons name="paper-plane" size={16} color="#fff" />
                <Text style={styles.reportBtnText}>{t('report_send')}</Text>
              </Pressable>
            </View>
          )}
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

  langRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 13, paddingHorizontal: 18,
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  langFlag: { fontSize: 22 },
  langName: { flex: 1, fontSize: 16, fontWeight: '500' },

  rateBox: {
    paddingVertical: 16, paddingHorizontal: 18, alignItems: 'center', gap: 12,
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  ratePrompt: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600' },
  starsRow:   { flexDirection: 'row', gap: 10 },

  reportBox: { padding: 14, gap: 10, backgroundColor: 'rgba(255,255,255,0.03)' },
  reportInput: {
    minHeight: 90, color: '#fff', fontSize: 15, textAlignVertical: 'top',
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  reportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#7C3AED', paddingVertical: 12, borderRadius: 12,
  },
  reportBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

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
