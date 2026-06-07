/**
 * WoW Train — Home Screen
 * Diseño minimalista Apple / Dieter Rams
 * "Less, but better."
 */
import React, { useState, useCallback, useEffect } from 'react';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
  FadeInDown, FadeIn,
} from 'react-native-reanimated';
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  ActivityIndicator, Platform, FlatList, TextInput, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';

import { Radius, Shadows, Gradients } from '../theme';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Line } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
import FlagCircle from '../components/FlagCircle';
import { findNearestStation, setActiveCountry, detectCountryFromCoords } from '../services/gtfsDatabase';
import { prefetchInBackground, onDownloadProgress } from '../services/dbDownloadService';
import { buildTrainlineByName, buildBestBookingUrl } from '../services/affiliateEngine';
import { SCENIC_TRAINS } from '../data/scenicTrains';
import PartnerCard from '../components/PartnerCard';
import { getYesimOffer, getTiqetsOffer, getStorageOffer, getInsuranceOffer } from '../data/partnerOffers';
import AffiliateWebView from '../components/AffiliateWebView';
import { t } from '../services/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ONBOARDING_KEY } from './onboarding';
import TranslatorSheet from '../components/TranslatorSheet';
import DownloadProgressBar from '../components/DownloadProgressBar';
import BottomTabBar from '../components/BottomTabBar';
import { toggleFavorito, getFavoritos } from './favoritos';
import NotificationSheet from '../components/NotificationSheet';
import { useNotifications } from '../context/NotificationContext';
import { useNetwork } from '../hooks/useNetwork';
import type { CountryCode, Coordinates } from '../types';

// ── Tipo de filtro ──────────────────────────────────────────────────────────
type FilterTab = 'trenes' | 'internacional';

// ── Detección de ciudad metro por bounding box ───────────────────────────────
// Si el GPS cae dentro de una ciudad con metro → abrir modo metro directo
const METRO_CITY_BOUNDS: {
  code: CountryCode; city: string;
  minLat: number; maxLat: number; minLon: number; maxLon: number;
}[] = [
  { code: 'ES_MAD', city: 'Madrid',    minLat: 40.31, maxLat: 40.57, minLon: -3.83, maxLon: -3.52 },
  { code: 'ES_BCN', city: 'Barcelona', minLat: 41.31, maxLat: 41.47, minLon:  2.05, maxLon:  2.23 },
  { code: 'FR_PAR', city: 'París',     minLat: 48.81, maxLat: 48.91, minLon:  2.22, maxLon:  2.47 },
  { code: 'IT_ROM', city: 'Roma',      minLat: 41.79, maxLat: 41.99, minLon: 12.36, maxLon: 12.61 },
  { code: 'IT_MIL', city: 'Milán',     minLat: 45.38, maxLat: 45.54, minLon:  9.07, maxLon:  9.28 },
  { code: 'AT_VIE', city: 'Viena',     minLat: 48.12, maxLat: 48.32, minLon: 16.18, maxLon: 16.58 },
  { code: 'NL_AMS', city: 'Amsterdam', minLat: 52.29, maxLat: 52.43, minLon:  4.77, maxLon:  5.03 },
  { code: 'PT_LIS', city: 'Lisboa',    minLat: 38.66, maxLat: 38.80, minLon: -9.23, maxLon: -9.08 },
  { code: 'DE_BER', city: 'Berlín',    minLat: 52.34, maxLat: 52.68, minLon: 13.09, maxLon: 13.76 },
  { code: 'DE_MUN', city: 'Múnich',    minLat: 48.06, maxLat: 48.24, minLon: 11.36, maxLon: 11.72 },
  { code: 'BE_BRU', city: 'Bruselas',  minLat: 50.79, maxLat: 50.93, minLon:  4.27, maxLon:  4.47 },
];

function detectMetroCityFromCoords(coords: Coordinates): { code: CountryCode; city: string } | null {
  for (const b of METRO_CITY_BOUNDS) {
    if (coords.latitude  >= b.minLat && coords.latitude  <= b.maxLat &&
        coords.longitude >= b.minLon && coords.longitude <= b.maxLon) {
      return { code: b.code, city: b.city };
    }
  }
  return null;
}

// ── Datos países ─────────────────────────────────────────────────────────────
interface MetroOption { code: CountryCode; label?: string; labelKey?: string }
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
  { code: 'ES', flag: '🇪🇸', name: 'Spain',        trainLabel: 'AVE · Renfe',        color: '#C0392B',
    metroOptions: [{ code: 'ES_MAD', label: 'Madrid' }, { code: 'ES_BCN', label: 'Barcelona' }] },
  { code: 'FR', flag: '🇫🇷', name: 'France',         trainLabel: 'TGV · SNCF',         color: '#2980B9',
    metroOptions: [{ code: 'FR_PAR', labelKey: 'city_paris' }] },
  { code: 'IT', flag: '🇮🇹', name: 'Italy',          trainLabel: 'Frecciarossa',       color: '#27AE60',
    metroOptions: [{ code: 'IT_ROM', labelKey: 'city_rome' }, { code: 'IT_MIL', labelKey: 'city_milan' }] },
  { code: 'DE', flag: '🇩🇪', name: 'Germany',        trainLabel: 'ICE · RE · DB',      color: '#E74C3C',
    metroOptions: [{ code: 'DE_BER', labelKey: 'city_berlin' }, { code: 'DE_MUN', label: 'Munich' }] },
  { code: 'AT', flag: '🇦🇹', name: 'Austria',       trainLabel: 'Railjet · ÖBB',     color: '#C0392B',
    metroOptions: [{ code: 'AT_VIE', labelKey: 'city_vienna' }] },
  { code: 'NL', flag: '🇳🇱', name: 'Netherlands',    trainLabel: 'Intercity · NS',     color: '#E67E22',
    metroOptions: [{ code: 'NL_AMS', labelKey: 'city_amsterdam' }] },
  { code: 'BE', flag: '🇧🇪', name: 'Belgium',        trainLabel: 'IC · Thalys',        color: '#F39C12',
    metroOptions: [{ code: 'BE_BRU', labelKey: 'city_brussels' }] },
  { code: 'PT', flag: '🇵🇹', name: 'Portugal',      trainLabel: 'Alfa Pendular · CP', color: '#27AE60',
    metroOptions: [{ code: 'PT_LIS', labelKey: 'city_lisbon' }] },
  { code: 'CH', flag: '🇨🇭', name: 'Switzerland',    trainLabel: 'SBB · Glacier',      color: '#DC143C' },
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
  code:     CountryCode;
  city:     string;
  cityKey?: string;
  flag:     string;
  lines:    string;
  color:    string;
  hidden?:  boolean;
}

const METRO_CITIES: MetroCity[] = [
  // ── EUROPA ───────────────────────────────────────────────────────────
  { code: 'ES_MAD', city: 'Madrid',       flag: '🇪🇸', lines: 'Metro Madrid · L1-L12',         color: '#C0392B' },
  { code: 'ES_BCN', city: 'Barcelona',    flag: '🇪🇸', lines: 'TMB · L1-L11 · 166 estaciones', color: '#F39C12' },
  { code: 'FR_PAR', city: 'Paris',         cityKey: 'city_paris',    flag: '🇫🇷', lines: 'RATP · M1-M14 · RER A-E',  color: '#003CA6' },
  { code: 'IT_ROM', city: 'Rome',          cityKey: 'city_rome',     flag: '🇮🇹', lines: 'ATAC · Lines A, B, C',      color: '#E74C3C' },
  { code: 'IT_MIL', city: 'Milan',         cityKey: 'city_milan',    flag: '🇮🇹', lines: 'ATM · M1-M5',              color: '#27AE60' },
  { code: 'AT_VIE', city: 'Vienna',        cityKey: 'city_vienna',   flag: '🇦🇹', lines: 'Wiener Linien · U1-U6',    color: '#E52020' },
  { code: 'NL_AMS', city: 'Amsterdam',     cityKey: 'city_amsterdam',flag: '🇳🇱', lines: 'GVB · Lines 51-54',        color: '#FF6B00' },
  { code: 'PT_LIS', city: 'Lisbon',        cityKey: 'city_lisbon',   flag: '🇵🇹', lines: 'Metro Lisboa · 4 lines',   color: '#27AE60' },
  { code: 'BE_BRU', city: 'Brussels',      cityKey: 'city_brussels', flag: '🇧🇪', lines: 'STIB · L1, L2, L5, L6',   color: '#F39C12' },
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
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[animStyle, styles.cardShadow, styles.cardGlow, { borderRadius: Radius.xl }]}>
      <Pressable
        style={[styles.card, styles.glassCard]}
        onPress={() => onPress(country)}
        onPressIn={() => { scale.value = withSpring(0.955, { damping: 18, stiffness: 350 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 10, stiffness: 180 }); }}
        accessibilityRole="button"
      >
        {/* Blur real del fondo */}
        <BlurView
          intensity={Platform.OS === 'ios' ? 65 : 20}
          tint="dark"
          style={[StyleSheet.absoluteFillObject, { borderRadius: Radius.xl }]}
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        />
        {/* Glass rim light — brillo superior blanco */}
        <LinearGradient
          colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.00)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 0.5 }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: Radius.xl }]}
          pointerEvents="none"
        />
        <Animated.View sharedTransitionTag={`flag-${country.code}`} style={styles.cardFlag}>
          <FlagCircle countryCode={isoFromCode(country.code)} size="lg" />
        </Animated.View>

        <View style={styles.cardInfo}>
          <Text style={[styles.cardName, { color: '#FFFFFF' }]}>{country.name}</Text>
          <Text style={[styles.cardSub, { color: 'rgba(255,255,255,0.75)' }]}>{country.trainLabel}</Text>
          {country.metroOptions && country.metroOptions.length > 0 && (
            <View style={styles.metroRow}>
              {country.metroOptions.slice(0, 2).map((m) => (
                <Pressable
                  key={m.code}
                  style={({ pressed }) => [
                    styles.metroPill,
                    styles.glassPill,
                    pressed && { opacity: 0.65 },
                  ]}
                  onPress={(e) => { e.stopPropagation?.(); onMetroPress(m.code, m.label ?? (m.labelKey ? t(m.labelKey as any) : '')); }}
                >
                  <Ionicons name="navigate" size={9} color={colors.brand.accent} />
                  <Text style={[styles.metroPillText, { color: colors.brand.accent }]}>
                    {m.labelKey ? t(m.labelKey as any) : m.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <Pressable
          style={[styles.favBtn, isFav && styles.favBtnActive]}
          onPress={(e) => { e.stopPropagation?.(); onFavToggle(country.code); }}
          hitSlop={12}
        >
          <Ionicons
            name={isFav ? 'heart' : 'heart-outline'}
            size={20}
            color={isFav ? '#FF453A' : 'rgba(255,255,255,0.65)'}
          />
        </Pressable>

        <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.60)" />
      </Pressable>
    </Animated.View>
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
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[animStyle, styles.cardShadow, styles.cardGlow, { borderRadius: Radius.xl }]}>
      <Pressable
        style={[styles.card, styles.glassCard]}
        onPress={() => onPress(metro.code)}
        onPressIn={() => { scale.value = withSpring(0.955, { damping: 18, stiffness: 350 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 10, stiffness: 180 }); }}
      >
        {/* Blur real del fondo */}
        <BlurView
          intensity={Platform.OS === 'ios' ? 65 : 20}
          tint="dark"
          style={[StyleSheet.absoluteFillObject, { borderRadius: Radius.xl }]}
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        />
        {/* Glass rim light — brillo superior blanco */}
        <LinearGradient
          colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.00)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 0.5 }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: Radius.xl }]}
          pointerEvents="none"
        />
        <Animated.View sharedTransitionTag={`flag-${metro.code}`} style={styles.cardFlag}>
          <FlagCircle countryCode={isoFromCode(metro.code)} size="lg" />
        </Animated.View>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardName, { color: '#FFFFFF' }]}>{metro.cityKey ? t(metro.cityKey as any) : metro.city}</Text>
          <Text style={[styles.cardSub,  { color: 'rgba(255,255,255,0.75)' }]}>{metro.lines}</Text>
        </View>
        <Pressable
          style={styles.favBtn}
          onPress={(e) => { e.stopPropagation?.(); onFavToggle(metro.code); }}
          hitSlop={12}
        >
          <Ionicons
            name={isFav ? 'heart' : 'heart-outline'}
            size={22}
            color={isFav ? '#FF3B30' : 'rgba(255,255,255,0.65)'}
          />
        </Pressable>
        <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.60)" />
      </Pressable>
    </Animated.View>
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

// ── Scenic Card (Internacional) ───────────────────────────────────────────────
function ScenicCard({ train, onPress }: { train: any; onPress: () => void }) {
  const scale    = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={animStyle}>
      <Pressable
        style={[
          styles.scenicIntlCard,
          { backgroundColor: 'rgba(14,14,46,0.45)', borderColor: train.colors[0] + '66' },
        ]}
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.955, { damping: 18, stiffness: 350 }); }}
        onPressOut={() => { scale.value = withSpring(1,     { damping: 10, stiffness: 180 }); }}
      >
        <LinearGradient
          colors={train.colors}
          style={styles.scenicIntlBadge}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        >
          <Ionicons name="train" size={14} color="#fff" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={[styles.scenicIntlName,  { color: '#fff' }]}>{train.name}</Text>
          <Text style={[styles.scenicIntlRoute, { color: 'rgba(255,255,255,0.80)' }]}>
            {train.route} · {train.duration}
          </Text>
        </View>
        <View style={[styles.scenicIntlReservar, { backgroundColor: train.colors[0] }]}>
          <Text style={styles.scenicIntlReservarText}>{t('intl_book')}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── Pantalla principal ────────────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [filter,     setFilter]     = useState<FilterTab>('trenes');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [userCoords, setUserCoords] = useState<Coordinates | null>(null);
  // Internacional
  const [intlOrigin,   setIntlOrigin]   = useState('');
  const [intlDest,     setIntlDest]     = useState('');
  const [intlDate,     setIntlDate]     = useState(0); // 0=hoy, 1=mañana, 2=pasado
  const [intlVisible,  setIntlVisible]  = useState(false);
  const [intlUrl,      setIntlUrl]      = useState('');
  const [scenicIntlId,   setScenicIntlId]   = useState<string | null>(null);
  const [showAllScenic,  setShowAllScenic]  = useState(false);
  const { isOffline } = useNetwork();
  const [translator,    setTranslator]    = useState(false);
  const [notifVisible,  setNotifVisible]  = useState(false);
  const { unreadCount, addNotification }  = useNotifications();
  const prevUnread = React.useRef(unreadCount);

  // ── Onboarding: primer arranque ──────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((done) => {
      if (!done) router.replace('/onboarding');
    });
  }, []);

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
              const c = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
              detectedCountry = detectCountryFromCoords(c);
              setUserCoords(c);
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
    router.push({ pathname: '/split-screen', params: {
      country: country.code,
      mode: 'country',
      ...(userCoords ? { lat: String(userCoords.latitude), lon: String(userCoords.longitude) } : {}),
    }});
  }, [router, userCoords]);

  const handleMetroPress = useCallback((code: CountryCode, label?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveCountry(code).catch(() => {});
    router.push({ pathname: '/split-screen', params: {
      country: code,
      mode: 'country',
      metroCity: label ?? '',
      ...(userCoords ? { lat: String(userCoords.latitude), lon: String(userCoords.longitude) } : {}),
    }});
  }, [router, userCoords]);

  const handleGPS = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setGpsLoading(false); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coords: Coordinates = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setUserCoords(coords);

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

      // ¿El usuario está dentro de una ciudad con metro?
      const metroCity = detectMetroCityFromCoords(coords);
      if (metroCity) {
        // Dentro de ciudad → modo metro directo
        await setActiveCountry(metroCity.code).catch(() => {});
        router.push({
          pathname: '/split-screen',
          params: {
            lat: String(coords.latitude),
            lon: String(coords.longitude),
            country:   metroCity.code,
            metroCity: metroCity.city,
            mode:      'tourist',
          },
        });
        return;
      }

      // Fuera de ciudad metro → trenes de larga distancia
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
    { key: 'trenes',        label: t('filter_trains'), icon: 'train',  iconOut: 'train-outline'  },
    { key: 'internacional', label: t('filter_intl'),   icon: 'globe',  iconOut: 'globe-outline'  },
  ];

  return (
    <View style={styles.root}>
      <Image
        source={require('../assets/images/bg-hero.png')}
        style={[StyleSheet.absoluteFillObject, { top: -280, bottom: 280 }]}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['rgba(10,8,30,0.35)', 'rgba(14,14,46,0.60)', 'rgba(14,14,46,0.80)']}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
    <SafeAreaView style={styles.rootInner} edges={['top']}>

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
            {/* Logo — WoW italic + TRAIN espaciado + speed lines */}
            <View style={styles.logoRow}>
              <Text style={[styles.logoWow, { color: colors.brand.primary }]}>WoW</Text>
              <Text style={[styles.logoTrenes, { color: colors.text.primary }]}> TRAIN</Text>
              <SpeedLines />
            </View>
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
        <View style={[styles.segmentedWrap, { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: Radius.md }]}>
          {TABS.map((t) => {
            const active = filter === t.key;
            return (
              <Pressable
                key={t.key}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => { Haptics.selectionAsync(); setFilter(t.key); setShowAllScenic(false); }}
              >
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
                      backgroundColor: 'rgba(88,28,135,0.75)',
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
          <Animated.View entering={FadeInDown.duration(320)}>
            <Text style={[styles.sectionLabel, { color: '#fff' }]}>{t('home_countries_title')}</Text>
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
          </Animated.View>
        )}

        {/* ── Sección Metro ── */}

        {/* ── Internacional ── */}
        {filter === 'internacional' && (
          <Animated.View entering={FadeInDown.duration(320)} style={styles.intlWrap}>
            <Text style={[styles.intlTitle, { color: colors.text.primary }]}>{t('intl_title')}</Text>
            <Text style={[styles.intlSub,   { color: 'rgba(255,255,255,0.80)' }]}>{t('intl_sub')}</Text>

            {/* Origen */}
            <View style={[styles.intlField, { backgroundColor: 'rgba(14,14,46,0.45)', borderColor: 'rgba(255,255,255,0.18)' }]}>
              <Ionicons name="ellipse" size={10} color={colors.brand.primary} />
              <TextInput
                style={[styles.intlInput, { color: '#fff' }]}
                placeholder={t('intl_origin')}
                placeholderTextColor="rgba(255,255,255,0.55)"
                value={intlOrigin}
                onChangeText={setIntlOrigin}
                autoCorrect={false}
              />
            </View>

            {/* Destino */}
            <View style={[styles.intlField, { backgroundColor: 'rgba(14,14,46,0.45)', borderColor: 'rgba(255,255,255,0.18)' }]}>
              <Ionicons name="ellipse" size={10} color="#30D158" />
              <TextInput
                style={[styles.intlInput, { color: '#fff' }]}
                placeholder={t('intl_dest')}
                placeholderTextColor="rgba(255,255,255,0.55)"
                value={intlDest}
                onChangeText={setIntlDest}
                autoCorrect={false}
              />
            </View>

            {/* Fecha */}
            <View style={styles.intlDayRow}>
              {[t('search_today'), t('search_tomorrow'), t('search_after')].map((label, i) => (
                <Pressable
                  key={i}
                  style={[styles.intlDayChip,
                    { backgroundColor: intlDate === i ? 'rgba(88,28,135,0.55)' : 'rgba(14,14,46,0.45)',
                      borderColor: intlDate === i ? colors.brand.primary : 'rgba(255,255,255,0.18)' }]}
                  onPress={() => { Haptics.selectionAsync(); setIntlDate(i); }}
                >
                  <Text style={[styles.intlDayText, { color: intlDate === i ? '#fff' : 'rgba(255,255,255,0.85)' }]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {/* Buscar */}
            <Pressable
              style={[styles.intlBtn, {
                backgroundColor: intlOrigin && intlDest ? colors.brand.primary : 'rgba(14,14,46,0.50)',
                borderWidth: 1.5,
                borderColor: intlOrigin && intlDest ? 'transparent' : 'rgba(255,255,255,0.40)',
              }]}
              onPress={() => {
                if (!intlOrigin.trim() || !intlDest.trim()) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                const date = new Date();
                date.setDate(date.getDate() + intlDate);
                const url = buildBestBookingUrl(intlOrigin.trim(), intlDest.trim(), date, 'INTL');
                setIntlUrl(url);
                setIntlVisible(true);
              }}
            >
              <Ionicons name="search" size={16} color={intlOrigin && intlDest ? '#fff' : 'rgba(255,255,255,0.75)'} />
              <Text style={[styles.intlBtnText, { color: intlOrigin && intlDest ? '#fff' : 'rgba(255,255,255,0.75)' }]}>
                {t('intl_search')}
              </Text>
            </Pressable>

            <Text style={[styles.intlHint, { color: 'rgba(255,255,255,0.75)' }]}>
              {t('intl_hint')}
            </Text>

            {/* ── Trenes escénicos destacados ── */}
            <Text style={[styles.intlSectionLabel, { color: '#fff' }]}>{t('intl_scenic')}</Text>
            {(showAllScenic ? SCENIC_TRAINS : SCENIC_TRAINS.slice(0, 3)).map((train) => (
              <ScenicCard
                key={train.id}
                train={train}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setScenicIntlId(train.id); }}
              />
            ))}

            {/* ── Divisor "Más / Menos experiencias" ── */}
            {SCENIC_TRAINS.length > 3 && (
              <Pressable
                style={styles.moreExpBtn}
                onPress={() => { Haptics.selectionAsync(); setShowAllScenic(v => !v); }}
              >
                <View style={styles.moreExpLine} />
                <View style={styles.moreExpPill}>
                  <Ionicons name="train-outline" size={12} color="#fff" />
                  <Text style={styles.moreExpText}>{showAllScenic ? t('less_exp') : t('more_exp')}</Text>
                  <Ionicons name={showAllScenic ? 'chevron-up' : 'chevron-down'} size={12} color="#fff" />
                </View>
                <View style={styles.moreExpLine} />
              </Pressable>
            )}

            {/* ── Para tu viaje · partners ── */}
            <Text style={[styles.intlSectionLabel, { color: '#fff', marginTop: 6 }]}>{t('for_trip')}</Text>
            <PartnerCard {...getInsuranceOffer()} />
            <PartnerCard {...getYesimOffer()} />
            <PartnerCard {...getTiqetsOffer()} />
            <PartnerCard {...getStorageOffer()} />
          </Animated.View>
        )}

        <View style={{ height: 12 }} />
      </ScrollView>

      {/* ── Fade hint — indica que hay más contenido debajo ── */}
      <LinearGradient
        colors={['transparent', '#0E0E2ECC', '#0E0E2E']}
        locations={[0, 0.6, 1]}
        style={styles.scrollFade}
        pointerEvents="none"
      />

      {/* ── GPS Banner — estilo original mejorado ── */}
      <Animated.View entering={FadeIn.duration(600).delay(200)}>
      <Pressable
        style={({ pressed }) => [
          styles.gpsBanner,
          styles.glassCard,
          pressed && { opacity: 0.85 },
        ]}
        onPress={handleGPS}
        disabled={gpsLoading}
      >
        <BlurView
          intensity={Platform.OS === 'ios' ? 45 : 18}
          tint="dark"
          style={StyleSheet.absoluteFillObject}
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        />
        <View style={[styles.gpsPinWrap, { backgroundColor: colors.brand.primary }]}>
          <Ionicons name="location" size={20} color="#fff" />
        </View>
        <View style={styles.gpsBannerInfo}>
          <Text style={[styles.gpsBannerTitle, { color: colors.text.primary }]} numberOfLines={1}>
            {t('home_gps_question')}
          </Text>
          <Text style={[styles.gpsBannerSub, { color: 'rgba(255,255,255,0.80)' }]} numberOfLines={1}>
            {t('home_gps_sub')}
          </Text>
        </View>
        <Pressable
          style={[styles.gpsBtn, { backgroundColor: colors.brand.primary }]}
          onPress={handleGPS}
          disabled={gpsLoading}
        >
          {gpsLoading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={[styles.gpsBtnText, { color: '#fff' }]}>✦ {t('home_gps_btn')}</Text>
          }
        </Pressable>
      </Pressable>
      </Animated.View>

      <BottomTabBar active="inicio" onTranslatePress={() => setTranslator(true)} onHomePress={() => setFilter('trenes')} />
      <TranslatorSheet visible={translator} onClose={() => setTranslator(false)} />
      <NotificationSheet visible={notifVisible} onClose={() => setNotifVisible(false)} />

      {/* ── WebView internacional ── */}
      {intlVisible && intlUrl ? (
        <AffiliateWebView
          service={{
            serviceId:     'intl',
            operator:      'other',
            trainType:     'intercity',
            trainNumber:   '',
            origin:        { id: '', name: intlOrigin, nameLocal: intlOrigin, country: 'ES', coordinates: { latitude: 0, longitude: 0 }, platforms: [] },
            destination:   { id: '', name: intlDest,   nameLocal: intlDest,   country: 'ES', coordinates: { latitude: 0, longitude: 0 }, platforms: [] },
            departureTime: (() => { const d = new Date(); d.setDate(d.getDate() + intlDate); return d; })(),
            arrivalTime:   (() => { const d = new Date(); d.setDate(d.getDate() + intlDate); return d; })(),
            delayMinutes:  0,
            status:        'on-time',
            classes:       ['second'],
          }}
          visible={intlVisible}
          onClose={() => setIntlVisible(false)}
          onPurchaseSuccess={() => setIntlVisible(false)}
        />
      ) : null}

      {/* WebView tren escénico desde Internacional */}
      {(() => {
        const train = SCENIC_TRAINS.find(t => t.id === scenicIntlId);
        if (!train) return null;
        const dep = new Date(); dep.setHours(9, 0, 0, 0);
        return (
          <AffiliateWebView
            service={{
              serviceId:    train.id,
              operator:     'other' as any,
              trainType:    'high-speed',
              trainNumber:  train.id.toUpperCase().slice(0, 3),
              origin:       { id: '', name: train.origin, nameLocal: train.origin, country: train.originCountry as any, coordinates: train.originCoords, platforms: [] },
              destination:  { id: '', name: train.dest,   nameLocal: train.dest,   country: train.destCountry as any,   coordinates: train.destCoords,   platforms: [] },
              departureTime: dep,
              arrivalTime:   dep,
              delayMinutes: 0,
              status:       'on-time',
              classes:      ['first', 'second'],
            }}
            visible={!!scenicIntlId}
            onClose={() => setScenicIntlId(null)}
            onPurchaseSuccess={() => setScenicIntlId(null)}
          />
        );
      })()}
    </SafeAreaView>
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#0E0E2E' },
  rootInner:     { flex: 1, backgroundColor: 'transparent' },

  scroll:        { flex: 1, backgroundColor: 'transparent' },
  scrollContent: { paddingBottom: 12 },

  // ── Glass Card — Glassmorphism ──
  glassCard: {
    backgroundColor: 'rgba(14,14,46,0.45)',
    borderColor:     'rgba(255,255,255,0.15)',
    borderWidth:     1,
    overflow:        'hidden',
  },
  glassPill: {
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderWidth:     0.5,
    borderColor:     'rgba(167,139,250,0.50)',
  },
  // Glow externo violeta
  cardGlow: {
    shadowColor:   '#7C3AED',
    shadowOffset:  { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius:  18,
    elevation:     10,
  },

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

  // Logo — fila con WoW italic + TRAIN espaciado + speed lines
  logoRow: {
    flexDirection: 'row',
    alignItems:    'center',
    overflow:      'visible',
  },
  logoWow: {
    fontSize:      34,
    fontWeight:    '900',
    fontStyle:     'italic',
    letterSpacing: -1,
    lineHeight:    38,
  },
  logoTrenes: {
    fontSize:      22,
    fontWeight:    '200',
    letterSpacing: 6,
    lineHeight:    38,
  },
  logoSub: { fontSize: 13, marginTop: 3, letterSpacing: 0.1 },

  // Segmented control — Apple UISegmentedControl
  segmentedWrap: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 28,
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
    marginBottom: 14,
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
  list: { paddingHorizontal: 16, gap: 14 },

  // Wrapper de sombra (separado del contenido para evitar recorte en Android)
  cardShadow: {
    borderRadius: Radius.xl,
    marginBottom: 0,
    overflow: 'hidden',
  },
  // Card — sin strips, sin speed lines
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.xl,
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: 10,
    minHeight: 62,
  },
  cardFlag:  { marginRight: 14 },
  cardInfo:  { flex: 1, gap: 3 },
  cardName:  { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  cardSub:   { fontSize: 12, fontWeight: '300', letterSpacing: 0.3 },

  // Metro pills
  metroRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  metroPill:    { borderRadius: Radius.sm, paddingVertical: 4, paddingHorizontal: 10, borderWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  metroPillText:{ fontSize: 11, fontWeight: '700' },

  // Favorito
  // Corazón — Ionicons vector, nunca se recorta
  favBtn: {
    paddingHorizontal: 8, paddingVertical: 8, flexShrink: 0,
    borderRadius: 20, alignItems: 'center', justifyContent: 'center',
  },
  favBtnActive: {
    backgroundColor: 'rgba(255,59,48,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.25)',
  },

  // Empty state
  // Internacional
  intlWrap:     { paddingHorizontal: 16, paddingTop: 4, gap: 8 },
  intlTitle:    { fontSize: 17, fontWeight: '700', letterSpacing: -0.4 },
  intlSub:      { fontSize: 12, marginTop: -4, marginBottom: 0 },
  intlField:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  intlInput:    { flex: 1, fontSize: 14 },
  intlDayRow:   { flexDirection: 'row', gap: 6 },
  intlDayChip:  { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  intlDayText:  { fontSize: 12, fontWeight: '600' },
  intlBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, borderRadius: 12 },
  intlBtnText:  { fontSize: 14, fontWeight: '700' },
  intlHint:          { fontSize: 11, textAlign: 'center', marginTop: -2 },
  intlSectionLabel:  { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginTop: 8, marginBottom: -4 },
  scenicIntlCard:    { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1 },
  scenicIntlBadge:   { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  scenicIntlName:    { fontSize: 13, fontWeight: '700' },
  scenicIntlRoute:   { fontSize: 11, marginTop: 1 },
  scenicIntlReservar:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },

  // Divisor "Más experiencias"
  moreExpBtn: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 12, marginTop: 8, marginBottom: 2, gap: 8,
  },
  moreExpLine: { flex: 1, height: 1, backgroundColor: 'rgba(167,139,250,0.25)' },
  moreExpPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 7, paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)',
  },
  moreExpText: { fontSize: 12, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  scenicIntlReservarText:{ fontSize: 11, fontWeight: '700', color: '#fff' },
  empty:      { alignItems: 'center', paddingVertical: 72, paddingHorizontal: 40 },
  emptyIcon:  { fontSize: 56, marginBottom: 18 },
  emptyTitle: { fontSize: 19, fontWeight: '600', marginBottom: 8, letterSpacing: -0.3 },
  emptySub:   { fontSize: 14, textAlign: 'center', lineHeight: 22 },

  // GPS banner
  gpsBanner: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 12, marginBottom: 16,
    borderRadius: Radius.xl, padding: 10, borderWidth: 0.5,
    gap: 10,
    overflow: 'hidden',
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
  gpsBtnText: { fontSize: 12, fontWeight: '700' },
});
