/**
 * WoW TRENES — Home Screen
 * Diseño minimalista Apple / Dieter Rams
 * "Less, but better."
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  ActivityIndicator, Platform, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';

import { Radius, Shadows } from '../theme';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Line } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
import FlagCircle from '../components/FlagCircle';
import { findNearestStation, setActiveCountry, detectCountryFromCoords } from '../services/gtfsDatabase';
import { prefetchInBackground, onDownloadProgress } from '../services/dbDownloadService';
import { t } from '../services/i18n';
import TranslatorSheet from '../components/TranslatorSheet';
import DownloadProgressBar from '../components/DownloadProgressBar';
import BottomTabBar from '../components/BottomTabBar';
import { toggleFavorito, getFavoritos } from './favoritos';
import NotificationSheet from '../components/NotificationSheet';
import { useNotifications } from '../context/NotificationContext';
import { useNetwork } from '../hooks/useNetwork';
import type { CountryCode, Coordinates } from '../types';

// ── Tipo de filtro ──────────────────────────────────────────────────────────
type FilterTab = 'trenes' | 'metro' | 'internacional';

// ── Datos países ─────────────────────────────────────────────────────────────
interface MetroOption { code: CountryCode; label: string }
interface CountryEntry {
  code:          CountryCode;
  flag:          string;
  name:          string;
  trainLabel:    string;
  color:         string;
  metroOptions?: MetroOption[];
  hidden?:       boolean;
}

const COUNTRIES: CountryEntry[] = [
  // ── ACTIVOS — GTFS real funcionando ──────────────────────────────────
  { code: 'ES', flag: '🇪🇸', name: 'España',       trainLabel: 'AVE · Renfe',       color: '#C0392B',
    metroOptions: [{ code: 'ES_MAD', label: 'Madrid' }, { code: 'ES_BCN', label: 'Barcelona' }] },
  { code: 'CH', flag: '🇨🇭', name: 'Suiza',         trainLabel: 'SBB · Glacier',     color: '#DC143C' },
  { code: 'FR', flag: '🇫🇷', name: 'Francia',       trainLabel: 'TGV · SNCF',        color: '#2980B9' },
  { code: 'IT', flag: '🇮🇹', name: 'Italia',        trainLabel: 'Frecciarossa',      color: '#27AE60' },
  { code: 'NL', flag: '🇳🇱', name: 'Países Bajos',  trainLabel: 'Intercity · NS',    color: '#E67E22' },
  { code: 'DE', flag: '🇩🇪', name: 'Alemania',      trainLabel: 'ICE · RE · DB',     color: '#E74C3C' },
  { code: 'AT', flag: '🇦🇹', name: 'Austria',       trainLabel: 'Railjet · ÖBB',    color: '#C0392B' },
  { code: 'BE', flag: '🇧🇪', name: 'Bélgica',       trainLabel: 'IC · Thalys',       color: '#F39C12' },
  { code: 'PT', flag: '🇵🇹', name: 'Portugal',      trainLabel: 'Alfa Pendular · CP', color: '#27AE60' },
  // ── OCULTOS — sin datos reales ───────────────────────────────────────
  { code: 'GB', flag: '🇬🇧', name: 'Reino Unido',   trainLabel: 'Avanti · LNER',     color: '#C0192B',  hidden: true },
  { code: 'NO', flag: '🇳🇴', name: 'Noruega',       trainLabel: 'Bergensbanen',      color: '#003F87',  hidden: true },
  { code: 'DK', flag: '🇩🇰', name: 'Dinamarca',     trainLabel: 'DSB · IC3',         color: '#C8102E',  hidden: true },
  { code: 'US', flag: '🇺🇸', name: 'USA',           trainLabel: 'Amtrak',            color: '#1A6BBE',  hidden: true },
  { code: 'JP', flag: '🇯🇵', name: 'Japón',         trainLabel: 'Shinkansen',        color: '#E74C3C',  hidden: true },
];

/** Extrae el código ISO de país a partir del CountryCode (e.g. 'US_NYC' → 'us') */
function isoFromCode(code: string): string {
  return code.split('_')[0].toLowerCase();
}

// ── Datos metro ───────────────────────────────────────────────────────────────
interface MetroCity {
  code:    CountryCode;
  city:    string;
  flag:    string;
  lines:   string;
  color:   string;
  hidden?: boolean;
}

const METRO_CITIES: MetroCity[] = [
  // ── EUROPA ───────────────────────────────────────────────────────────
  { code: 'ES_MAD', city: 'Madrid',       flag: '🇪🇸', lines: 'Metro Madrid · L1-L12',         color: '#C0392B' },
  { code: 'ES_BCN', city: 'Barcelona',    flag: '🇪🇸', lines: 'TMB · L1-L11 · 166 estaciones', color: '#F39C12' },
  { code: 'FR_PAR', city: 'París',        flag: '🇫🇷', lines: 'RATP · M1-M14 · RER A-E',       color: '#003CA6' },
  { code: 'IT_ROM', city: 'Roma',         flag: '🇮🇹', lines: 'ATAC · Líneas A, B, C',         color: '#E74C3C' },
  { code: 'IT_MIL', city: 'Milán',        flag: '🇮🇹', lines: 'ATM · M1-M5',                  color: '#27AE60' },
  { code: 'AT_VIE', city: 'Viena',        flag: '🇦🇹', lines: 'Wiener Linien · U1-U6',         color: '#E52020' },
  { code: 'NL_AMS', city: 'Amsterdam',    flag: '🇳🇱', lines: 'GVB · Líneas 51-54',           color: '#FF6B00' },
  { code: 'PT_LIS', city: 'Lisboa',       flag: '🇵🇹', lines: 'Metro Lisboa · 4 líneas',       color: '#27AE60' },
  { code: 'BE_BRU', city: 'Bruselas',     flag: '🇧🇪', lines: 'STIB · L1, L2, L5, L6',        color: '#F39C12' },
  { code: 'DK_CPH', city: 'Copenhague',   flag: '🇩🇰', lines: 'Metro · M1-M4',                color: '#C8102E' },
  { code: 'NO_OSL', city: 'Oslo',         flag: '🇳🇴', lines: 'T-bane · L1-L6',               color: '#003F87' },
  { code: 'DE_BER', city: 'Berlín',       flag: '🇩🇪', lines: 'BVG · U1-U9 · S-Bahn',        color: '#224F9F' },
  { code: 'DE_MUN', city: 'Múnich',       flag: '🇩🇪', lines: 'MVG · U1-U6 · S1/S8',         color: '#428BC1' },
  // ── NORTEAMÉRICA — ocultos hasta completar datos USA ────────────────
  { code: 'US_LAX', city: 'Los Ángeles',  flag: '🇺🇸', lines: 'LA Metro · A,B,C,D,E,K,L',     color: '#7C3AED', hidden: true },
  { code: 'US_CHI', city: 'Chicago',      flag: '🇺🇸', lines: 'CTA L Train · 8 líneas',        color: '#0057A8', hidden: true },
  // ── OCULTOS (sin datos aún) ───────────────────────────────────────────
  { code: 'US_NYC', city: 'New York',     flag: '🇺🇸', lines: 'MTA · 27 líneas',               color: '#1A6BBE', hidden: true },
  { code: 'GB_LON', city: 'London',       flag: '🇬🇧', lines: 'TfL · Elizabeth line',          color: '#C0192B', hidden: true },
  { code: 'JP',     city: 'Tokio',        flag: '🇯🇵', lines: 'Tokyo Metro · Shinkansen',      color: '#E60012', hidden: true },
];

// ── Tarjeta de país — Dieter Rams / Apple ────────────────────────────────────
function CountryCard({
  country, isFav, onPress, onMetroPress, onFavToggle,
}: {
  country:      CountryEntry;
  isFav:        boolean;
  onPress:      (c: CountryEntry) => void;
  onMetroPress: (code: CountryCode, label: string) => void;
  onFavToggle:  (code: CountryCode) => void;
}) {
  const { colors, isDark } = useTheme();
  // En Android, elevation recorta hijos en borderRadius — wrapper separa sombra del contenido
  const shadowStyle = Platform.OS === 'ios'
    ? (isDark ? Shadows.cardDark : Shadows.card)
    : { elevation: 2 };
  return (
    <View style={[styles.cardShadow, shadowStyle, { backgroundColor: colors.bg.card, borderRadius: Radius.lg }]}>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.bg.card, borderColor: colors.border.card },
          pressed && { opacity: 0.88, transform: [{ scale: 0.982 }] },
        ]}
        onPress={() => onPress(country)}
        accessibilityRole="button"
      >
        <View style={styles.cardFlag}>
          <FlagCircle countryCode={isoFromCode(country.code)} size="lg" />
        </View>

        <View style={styles.cardInfo}>
          <Text style={[styles.cardName, { color: colors.text.primary }]}>{country.name}</Text>
          <Text style={[styles.cardSub, { color: colors.text.secondary }]}>{country.trainLabel}</Text>
          {country.metroOptions && country.metroOptions.length > 0 && (
            <View style={styles.metroRow}>
              {country.metroOptions.slice(0, 2).map((m) => (
                <Pressable
                  key={m.code}
                  style={({ pressed }) => [
                    styles.metroPill,
                    { backgroundColor: colors.bg.elevated, borderColor: colors.border.subtle },
                    pressed && { opacity: 0.65 },
                  ]}
                  onPress={(e) => { e.stopPropagation?.(); onMetroPress(m.code, m.label); }}
                >
                  <Text style={[styles.metroPillText, { color: colors.brand.primary }]}>
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <Pressable
          style={styles.favBtn}
          onPress={(e) => { e.stopPropagation?.(); onFavToggle(country.code); }}
          hitSlop={12}
        >
          <Ionicons
            name={isFav ? 'heart' : 'heart-outline'}
            size={22}
            color={isFav ? '#FF3B30' : colors.text.muted}
          />
        </Pressable>

        <Text style={[styles.cardArrow, { color: colors.text.muted }]}>›</Text>
      </Pressable>
    </View>
  );
}

// ── Tarjeta de metro — mismo lenguaje visual ──────────────────────────────────
function MetroCard({
  metro, isFav, onPress, onFavToggle,
}: {
  metro:       MetroCity;
  isFav:       boolean;
  onPress:     (code: CountryCode) => void;
  onFavToggle: (code: CountryCode) => void;
}) {
  const { colors, isDark } = useTheme();
  const shadowStyle = Platform.OS === 'ios'
    ? (isDark ? Shadows.cardDark : Shadows.card)
    : { elevation: 2 };
  return (
    <View style={[styles.cardShadow, shadowStyle, { backgroundColor: colors.bg.card, borderRadius: Radius.lg }]}>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.bg.card, borderColor: colors.border.card },
          pressed && { opacity: 0.88, transform: [{ scale: 0.982 }] },
        ]}
        onPress={() => onPress(metro.code)}
      >
        <View style={styles.cardFlag}>
          <FlagCircle countryCode={isoFromCode(metro.code)} size="lg" />
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardName, { color: colors.text.primary }]}>{metro.city}</Text>
          <Text style={[styles.cardSub,  { color: colors.text.secondary }]}>{metro.lines}</Text>
        </View>
        <Pressable
          style={styles.favBtn}
          onPress={(e) => { e.stopPropagation?.(); onFavToggle(metro.code); }}
          hitSlop={12}
        >
          <Ionicons
            name={isFav ? 'heart' : 'heart-outline'}
            size={22}
            color={isFav ? '#FF3B30' : colors.text.muted}
          />
        </Pressable>
        <Text style={[styles.cardArrow, { color: colors.text.muted }]}>›</Text>
      </Pressable>
    </View>
  );
}

// ── Speed lines — efecto de velocidad junto al logo ──────────────────────────
function SpeedLines() {
  return (
    <Svg width={90} height={32} style={{ marginLeft: -2 }}>
      <Defs>
        <SvgGrad id="spd1" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0"   stopColor="#FFFFFF" stopOpacity="0.55" />
          <Stop offset="1"   stopColor="#FFFFFF" stopOpacity="0.00" />
        </SvgGrad>
        <SvgGrad id="spd2" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0"   stopColor="#A78BFA" stopOpacity="0.45" />
          <Stop offset="1"   stopColor="#A78BFA" stopOpacity="0.00" />
        </SvgGrad>
        <SvgGrad id="spd3" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0"   stopColor="#FFFFFF" stopOpacity="0.30" />
          <Stop offset="1"   stopColor="#FFFFFF" stopOpacity="0.00" />
        </SvgGrad>
      </Defs>
      {/* Línea superior — blanca brillante */}
      <Line x1="0"  y1="7"  x2="88" y2="7"  stroke="url(#spd1)" strokeWidth="1.6" />
      {/* Línea media — violeta */}
      <Line x1="8"  y1="16" x2="88" y2="16" stroke="url(#spd2)" strokeWidth="1.2" />
      {/* Línea inferior — blanca suave */}
      <Line x1="4"  y1="25" x2="80" y2="25" stroke="url(#spd3)" strokeWidth="1.6" />
    </Svg>
  );
}

// ── Pantalla principal ────────────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [filter,     setFilter]     = useState<FilterTab>('trenes');
  const [gpsLoading, setGpsLoading] = useState(false);
  const { isOffline } = useNetwork();
  const [translator,    setTranslator]    = useState(false);
  const [notifVisible,  setNotifVisible]  = useState(false);
  const { unreadCount, addNotification }  = useNotifications();
  const prevUnread = React.useRef(unreadCount);

  // Vibrar cuando llega una notificación nueva
  useEffect(() => {
    if (unreadCount > prevUnread.current) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    prevUnread.current = unreadCount;
  }, [unreadCount]);
  const [downloadState, setDownloadState] = useState<{ dbName: string; progress: number } | null>(null);
  const [favs,       setFavs]       = useState<CountryCode[]>([]);

  useEffect(() => { getFavoritos().then(setFavs); }, []);

  useEffect(() => {
    const unsub = onDownloadProgress((dbName, progress) => {
      setDownloadState({ dbName, progress });
      if (progress >= 100) {
        setTimeout(() => setDownloadState(null), 2500);
      }
    });
    return unsub;
  }, []);

  // ── Prefetch DBs grandes en background (3s tras mount) ─────────────────────
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        // Detectar país del usuario via GPS (sin pedir permiso extra — usa cache si existe)
        let detectedCountry: CountryCode | null = null;
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getLastKnownPositionAsync();
            if (loc) {
              detectedCountry = detectCountryFromCoords({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
              });
            }
          }
        } catch { /* GPS no disponible — usar prioridad por defecto */ }

        // Siempre descargar del más liviano al más pesado — AT(37MB) → BE(164MB) → FR(196MB)
        // El orden garantiza que si el usuario toca un país vecino, ya está listo
        const dbsToPrefetch = ['gtfs_austria.db', 'gtfs_belgium.db', 'gtfs_france.db'];

        prefetchInBackground(dbsToPrefetch);
      } catch (e) {
        console.warn('[prefetch] Error en prefetch inicial:', e);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleFavToggle = useCallback(async (code: CountryCode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = await toggleFavorito(code);
    setFavs(updated);
  }, []);

  const handleCountryPress = useCallback((country: CountryEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveCountry(country.code).catch(() => {});
    router.push({ pathname: '/split-screen', params: { country: country.code, mode: 'country' } });
  }, [router]);

  const handleMetroPress = useCallback((code: CountryCode, label?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveCountry(code).catch(() => {});
    router.push({ pathname: '/split-screen', params: { country: code, mode: 'country', metroCity: label ?? '' } });
  }, [router]);

  const handleGPS = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setGpsLoading(false); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coords: Coordinates = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };

      // Detectar si el usuario está en zona de cobertura europea/soportada
      const detectedCountry = detectCountryFromCoords(coords);
      if (!detectedCountry) {
        // Fuera de cobertura (ej: testing desde Argentina)
        // Ir igual al mapa pero sin estación — el usuario puede seleccionar país manualmente
        router.push({
          pathname: '/split-screen',
          params: { lat: String(coords.latitude), lon: String(coords.longitude), mode: 'tourist', originStationId: '', noGpsMatch: 'true' },
        });
        return;
      }

      // País detectado → buscar estación más cercana en el DB correcto
      const station = await findNearestStation(coords);
      router.push({
        pathname: '/split-screen',
        params: { lat: String(coords.latitude), lon: String(coords.longitude), mode: 'tourist', originStationId: station?.id ?? '', country: detectedCountry },
      });
    } catch (e) {
      console.warn('[GPS] Error:', e);
    }
    finally { setGpsLoading(false); }
  }, [router]);

  // Países ordenados: favoritos primero
  const sortedCountries = [...COUNTRIES]
    .filter(c => !c.hidden)
    .sort((a, b) => (favs.includes(a.code) ? 0 : 1) - (favs.includes(b.code) ? 0 : 1));

  const sortedMetros = [...METRO_CITIES]
    .filter(m => !m.hidden)
    .sort((a, b) => (favs.includes(a.code) ? 0 : 1) - (favs.includes(b.code) ? 0 : 1));

  const TABS: { key: FilterTab; label: string; icon: keyof typeof Ionicons.glyphMap; iconOut: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'trenes',        label: 'Trenes',    icon: 'train',  iconOut: 'train-outline'  },
    { key: 'metro',         label: 'Metro',     icon: 'map',    iconOut: 'map-outline'    },
    { key: 'internacional', label: 'Internat.', icon: 'globe',  iconOut: 'globe-outline'  },
  ];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg.base }]} edges={['top']}>

      {/* ── Offline Banner ── */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color="#fff" />
          <Text style={styles.offlineBannerText}>Sin conexión · Horarios programados disponibles</Text>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Logo + Bell ── */}
        <View style={styles.header}>
          <View>
            {/* Logo — WoW italic + TRENES espaciado + speed lines */}
            <View style={styles.logoRow}>
              <Text style={[styles.logoWow, { color: colors.brand.primary }]}>WoW</Text>
              <Text style={[styles.logoTrenes, { color: colors.text.primary }]}> TRENES</Text>
              <SpeedLines />
            </View>
            <Text style={[styles.logoSub, { color: colors.text.secondary }]}>
              {t('home_tagline_main')}
            </Text>
          </View>
          {/* Campana — anillo glow violeta siempre, badge rojo con número cuando llegan notifs */}
          <Pressable
            style={[
              styles.bellBtn,
              { backgroundColor: colors.bg.elevated },
              Platform.OS === 'ios'
                ? { shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.85, shadowRadius: 14, borderWidth: 1.5, borderColor: '#9F67FA' }
                : { borderWidth: 1.5, borderColor: '#9F67FA', elevation: 10 },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setNotifVisible(true);
            }}
            accessibilityLabel="Notificaciones"
          >
            <Ionicons
              name={unreadCount > 0 ? 'notifications' : 'notifications-outline'}
              size={20}
              color={unreadCount > 0 ? '#FF3B30' : '#E0D0FF'}
            />
            {/* Sin notificaciones → punto violeta. Con notificaciones → badge rojo con número */}
            {unreadCount === 0 ? (
              <View style={[styles.bellDot, { backgroundColor: colors.brand.primary }]} />
            ) : (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* ── Segmented control con íconos + borde degradé violeta ── */}
        <View style={[styles.segmentedWrap, { backgroundColor: colors.bg.elevated }]}>
          {TABS.map((t) => {
            const active = filter === t.key;
            return (
              <Pressable
                key={t.key}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => { Haptics.selectionAsync(); setFilter(t.key); }}
              >
                {/* Borde degradé violeta — solo en tab activo */}
                {active && (
                  <>
                    <LinearGradient
                      colors={['rgba(109,40,217,0.55)', 'rgba(167,139,250,1.00)', 'rgba(109,40,217,0.55)']}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={[StyleSheet.absoluteFillObject, { borderRadius: Radius.sm }]}
                      pointerEvents="none"
                    />
                    <View style={[StyleSheet.absoluteFillObject, {
                      margin: 1.2,
                      borderRadius: Radius.sm - 1,
                      backgroundColor: colors.bg.card,
                    }]} pointerEvents="none" />
                  </>
                )}
                <Ionicons
                  name={active ? t.icon : t.iconOut}
                  size={15}
                  color={active ? colors.brand.primary : colors.text.muted}
                />
                <Text style={[
                  styles.segmentText,
                  { color: active ? colors.text.primary : colors.text.secondary },
                  active && { fontWeight: '700' },
                ]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Descarga silenciosa en background — sin mostrar progreso al usuario */}

        {/* ── Sección Trenes ── */}
        {filter === 'trenes' && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.text.muted }]}>{t('home_countries_title')}</Text>
            <FlatList
              data={sortedCountries}
              keyExtractor={(c) => c.code}
              contentContainerStyle={styles.list}
              scrollEnabled={false}
              windowSize={5}
              removeClippedSubviews={true}
              renderItem={({ item: c }) => (
                <CountryCard
                  country={c}
                  isFav={favs.includes(c.code)}
                  onPress={handleCountryPress}
                  onMetroPress={handleMetroPress}
                  onFavToggle={handleFavToggle}
                />
              )}
            />
          </>
        )}

        {/* ── Sección Metro ── */}
        {filter === 'metro' && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.text.muted }]}>{t('home_metros_title')}</Text>
            <FlatList
              data={sortedMetros}
              keyExtractor={(m) => m.code}
              contentContainerStyle={styles.list}
              scrollEnabled={false}
              windowSize={5}
              removeClippedSubviews={true}
              renderItem={({ item: m }) => (
                <MetroCard
                  metro={m}
                  isFav={favs.includes(m.code)}
                  onPress={handleMetroPress}
                  onFavToggle={handleFavToggle}
                />
              )}
            />
          </>
        )}

        {/* ── Internacional — próximamente ── */}
        {filter === 'internacional' && (
          <View style={styles.empty}>
            <Ionicons name="globe-outline" size={56} color={colors.text.muted} style={{ marginBottom: 18 }} />
            <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>{t('home_intl_title')}</Text>
            <Text style={[styles.emptySub,   { color: colors.text.secondary }]}>{t('home_intl_sub')}</Text>
          </View>
        )}

        <View style={{ height: 12 }} />
      </ScrollView>

      {/* ── Fade hint — indica que hay más contenido debajo ── */}
      <LinearGradient
        colors={['transparent', colors.bg.base + 'CC', colors.bg.base]}
        locations={[0, 0.6, 1]}
        style={styles.scrollFade}
        pointerEvents="none"
      />

      {/* ── GPS Banner — estilo original mejorado ── */}
      <Pressable
        style={({ pressed }) => [
          styles.gpsBanner,
          { backgroundColor: colors.bg.elevated, borderColor: colors.border.default },
          pressed && { opacity: 0.88 },
        ]}
        onPress={handleGPS}
        disabled={gpsLoading}
      >
        <View style={[styles.gpsPinWrap, { backgroundColor: colors.brand.primary }]}>
          <Ionicons name="location" size={20} color="#fff" />
        </View>
        <View style={styles.gpsBannerInfo}>
          <Text style={[styles.gpsBannerTitle, { color: colors.text.primary }]} numberOfLines={1}>
            {t('home_gps_question')}
          </Text>
          <Text style={[styles.gpsBannerSub, { color: colors.text.secondary }]} numberOfLines={1}>
            {t('home_gps_sub')}
          </Text>
        </View>
        <Pressable
          style={[styles.gpsBtn, { backgroundColor: colors.brand.primary, ...Shadows.glow }]}
          onPress={handleGPS}
          disabled={gpsLoading}
        >
          {gpsLoading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.gpsBtnText}>✦ {t('home_gps_btn')}</Text>
          }
        </Pressable>
      </Pressable>

      <BottomTabBar active="inicio" onTranslatePress={() => setTranslator(true)} />
      <TranslatorSheet visible={translator} onClose={() => setTranslator(false)} />
      <NotificationSheet visible={notifVisible} onClose={() => setNotifVisible(false)} />
    </SafeAreaView>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:          { flex: 1 },
  scroll:        { flex: 1 },
  scrollContent: { paddingBottom: 12 },

  // Header — limpio, tipografía pura
  header: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Bell — círculo neumórfico con badge rojo
  bellBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position:     'absolute',
    top:          4,
    right:        4,
    width:        9,
    height:       9,
    borderRadius: 5,
  },
  bellBadge: {
    position:        'absolute',
    top:             4,
    right:           4,
    minWidth:        16,
    height:          16,
    borderRadius:    8,
    backgroundColor: '#FF3B30',
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: 3,
  },
  bellBadgeText: {
    fontSize:   9,
    fontWeight: '800',
    color:      '#fff',
  },

  // Logo — fila con WoW italic + TRENES espaciado + speed lines
  logoRow: {
    flexDirection: 'row',
    alignItems:    'center',
    overflow:      'visible',
  },
  logoWow: {
    fontSize:      32,
    fontWeight:    '800',
    fontStyle:     'italic',
    letterSpacing: -0.5,
    lineHeight:    36,
  },
  logoTrenes: {
    fontSize:      22,
    fontWeight:    '300',
    letterSpacing: 5,
    lineHeight:    36,
  },
  logoSub: { fontSize: 13, marginTop: 3, letterSpacing: 0.1 },

  // Segmented control — Apple UISegmentedControl
  segmentedWrap: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: Radius.md,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
    flexDirection: 'row',
    gap: 5,
    overflow: 'hidden',
  },
  segmentBtnActive: {
    borderRadius: Radius.sm,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Section label — Apple Settings style
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    paddingHorizontal: 22,
    marginBottom: 12,
  },

  // Fade hint al final del scroll
  scrollFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 130,
  },

  // Lista
  list: { paddingHorizontal: 16, gap: 10 },

  // Wrapper de sombra (separado del contenido para evitar recorte en Android)
  cardShadow: {
    borderRadius: Radius.lg,
    marginBottom: 0, // gap lo maneja el list
  },
  // Card — sin strips, sin speed lines
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 14,
    minHeight: 80,
  },
  cardFlag:  { marginRight: 14 },
  cardInfo:  { flex: 1, gap: 2 },
  cardName:  { fontSize: 16, fontWeight: '600', letterSpacing: -0.2 },
  cardSub:   { fontSize: 13 },
  cardArrow: { fontSize: 22, paddingHorizontal: 10, fontWeight: '300' },

  // Metro pills
  metroRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  metroPill:    { borderRadius: Radius.full, paddingVertical: 3, paddingHorizontal: 9, borderWidth: 0.5 },
  metroPillText:{ fontSize: 11, fontWeight: '600' },

  // Favorito
  // Corazón — Ionicons vector, nunca se recorta
  favBtn: { paddingHorizontal: 10, paddingVertical: 8, flexShrink: 0 },

  // Empty state
  empty:      { alignItems: 'center', paddingVertical: 72, paddingHorizontal: 40 },
  emptyIcon:  { fontSize: 56, marginBottom: 18 },
  emptyTitle: { fontSize: 19, fontWeight: '600', marginBottom: 8, letterSpacing: -0.3 },
  emptySub:   { fontSize: 14, textAlign: 'center', lineHeight: 22 },

  // GPS banner
  gpsBanner: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 12, marginBottom: 4,
    borderRadius: Radius.xl, padding: 10, borderWidth: 0.5,
    gap: 10,
  },
  gpsPinWrap: {
    width: 40, height: 40, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  gpsPinIcon:    { fontSize: 20 },
  gpsBannerInfo: { flex: 1, overflow: 'hidden' },
  offlineBanner: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              6,
    backgroundColor:  '#FF9F0A',
    paddingVertical:  7,
    paddingHorizontal:16,
  },
  offlineBannerText: { fontSize: 12, color: '#fff', fontWeight: '600', flex: 1 },
  gpsBannerTitle:{ fontSize: 12, fontWeight: '700', marginBottom: 2 },
  gpsBannerSub:  { fontSize: 11, lineHeight: 15 },
  gpsBtn: {
    borderRadius: Radius.full,
    paddingVertical: 11, paddingHorizontal: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  gpsBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
});
