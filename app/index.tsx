/**
 * WoW TRENES — Home Screen (Rediseño Premium v2)
 *
 * FLUJOS:
 *   1. PAÍS     → toca card → split-screen con horarios del país
 *   2. METRO    → tab Metro → ciudades con metro propio
 *   3. GPS      → botón GPS → detección automática de estación cercana
 *   4. TRADUCIR → tab Traducir → TranslatorSheet
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  Dimensions, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';

import { Colors, Radius } from '../theme';
import { findNearestStation, setActiveCountry } from '../services/gtfsDatabase';
import TranslatorSheet from '../components/TranslatorSheet';
import BottomTabBar from '../components/BottomTabBar';
import { toggleFavorito, getFavoritos } from './favoritos';
import type { CountryCode, Coordinates } from '../types';

const { width: W } = Dimensions.get('window');
const CARD_W = (W - 48) / 2;  // 2 cols, 16px padding each side + 16px gap

// ── Tipo de filtro ──────────────────────────────────────────────────────────
type FilterTab = 'trenes' | 'metro' | 'internacional';

// ── Datos países ────────────────────────────────────────────────────────────
interface MetroOption { code: CountryCode; label: string }
interface CountryEntry {
  code:          CountryCode;
  flag:          string;
  icon:          string;   // emoji 3D representativo
  name:          string;
  trainLabel:    string;
  color:         string;
  metroOptions?: MetroOption[];
}

const COUNTRIES: CountryEntry[] = [
  {
    code: 'ES', flag: '🇪🇸', icon: '🏟️', name: 'España',
    trainLabel: 'AVE · Renfe', color: '#C0392B',
    metroOptions: [{ code: 'ES_MAD', label: 'Madrid' }, { code: 'ES_BCN', label: 'Barcelona' }],
  },
  {
    code: 'IT', flag: '🇮🇹', icon: '🏛️', name: 'Italia',
    trainLabel: 'Frecciarossa', color: '#27AE60',
  },
  {
    code: 'FR', flag: '🇫🇷', icon: '🗼', name: 'Francia',
    trainLabel: 'TGV · SNCF', color: '#2980B9',
  },
  {
    code: 'US', flag: '🇺🇸', icon: '🗽', name: 'USA',
    trainLabel: 'Amtrak', color: '#1A6BBE',
    metroOptions: [{ code: 'US_NYC', label: 'New York' }],
  },
  {
    code: 'DE', flag: '🇩🇪', icon: '🏰', name: 'Alemania',
    trainLabel: 'ICE · DB', color: '#E74C3C',
  },
  {
    code: 'GB', flag: '🇬🇧', icon: '🎡', name: 'Reino Unido',
    trainLabel: 'Avanti · LNER', color: '#C0192B',
    metroOptions: [{ code: 'GB_LON', label: 'London Underground' }],
  },
  {
    code: 'CH', flag: '🇨🇭', icon: '🏔️', name: 'Suiza',
    trainLabel: 'SBB · Glacier', color: '#DC143C',
  },
  {
    code: 'JP', flag: '🇯🇵', icon: '⛩️', name: 'Japón',
    trainLabel: 'Shinkansen', color: '#E74C3C',
  },
  {
    code: 'NL', flag: '🇳🇱', icon: '🌷', name: 'Países Bajos',
    trainLabel: 'Intercity · NS', color: '#E67E22',
  },
  {
    code: 'AT', flag: '🇦🇹', icon: '🎭', name: 'Austria',
    trainLabel: 'Railjet · ÖBB', color: '#C0392B',
  },
  {
    code: 'NO', flag: '🇳🇴', icon: '🌊', name: 'Noruega',
    trainLabel: 'Bergensbanen', color: '#003F87',
  },
  {
    code: 'PT', flag: '🇵🇹', icon: '🏖️', name: 'Portugal',
    trainLabel: 'Alfa Pendular', color: '#27AE60',
  },
  {
    code: 'BE', flag: '🇧🇪', icon: '🏅', name: 'Bélgica',
    trainLabel: 'IC · Thalys', color: '#F39C12',
  },
];

// ── Datos metro ─────────────────────────────────────────────────────────────
interface MetroCity {
  code:  CountryCode;
  city:  string;
  flag:  string;
  icon:  string;
  lines: string;
  color: string;
}

const METRO_CITIES: MetroCity[] = [
  { code: 'US_NYC', city: 'New York',        flag: '🇺🇸', icon: '🗽', lines: '27 líneas · MTA Subway', color: '#1A6BBE' },
  { code: 'ES_MAD', city: 'Madrid',          flag: '🇪🇸', icon: '🏟️', lines: '13 líneas · Metro Madrid', color: '#C0392B' },
  { code: 'GB_LON', city: 'London',          flag: '🇬🇧', icon: '🎡', lines: '14 líneas · TfL Tube + Elizabeth', color: '#C0192B' },
  { code: 'US_CHI', city: 'Chicago',         flag: '🇺🇸', icon: '🌆', lines: '8 líneas · CTA L Train', color: '#0057A8' },
  { code: 'US_LAX', city: 'Los Angeles',     flag: '🇺🇸', icon: '🌴', lines: '6 líneas · LA Metro Rail', color: '#7C3AED' },
  { code: 'ES_BCN', city: 'Barcelona',       flag: '🇪🇸', icon: '🏖️', lines: 'TMB · próximamente', color: '#F39C12' },
];

// ── Componente: tarjeta de país ─────────────────────────────────────────────
function CountryCard({
  country, isFav, onPress, onMetroPress, onFavToggle,
}: {
  country:      CountryEntry;
  isFav:        boolean;
  onPress:      (c: CountryEntry) => void;
  onMetroPress: (code: CountryCode, label: string) => void;
  onFavToggle:  (code: CountryCode) => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] }]}
      onPress={() => onPress(country)}
      accessibilityRole="button"
    >
      <View style={[styles.cardStrip, { backgroundColor: country.color }]} />
      <Text style={styles.cardIcon}>{country.icon}</Text>

      <View style={styles.cardInfo}>
        <View style={styles.cardNameRow}>
          <Text style={styles.cardFlag}>{country.flag}</Text>
          <Text style={styles.cardName}>{country.name}</Text>
        </View>
        <Text style={styles.cardTrain}>🚄 {country.trainLabel}</Text>
        {country.metroOptions && country.metroOptions.length > 0 && (
          <View style={styles.metroRow}>
            {country.metroOptions.slice(0, 2).map((m) => (
              <Pressable
                key={m.code}
                style={({ pressed }) => [styles.metroPill, pressed && { opacity: 0.7 }]}
                onPress={(e) => { e.stopPropagation?.(); onMetroPress(m.code, m.label); }}
              >
                <Text style={styles.metroPillText}>🚇 {m.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={styles.speedLines}>
        <View style={[styles.speedLine, { width: 32, opacity: 0.55, backgroundColor: country.color }]} />
        <View style={[styles.speedLine, { width: 22, opacity: 0.35, backgroundColor: country.color }]} />
        <View style={[styles.speedLine, { width: 14, opacity: 0.2,  backgroundColor: country.color }]} />
      </View>

      {/* Botón favorito */}
      <Pressable
        style={[styles.favBtn, isFav && styles.favBtnActive]}
        onPress={(e) => { e.stopPropagation?.(); onFavToggle(country.code); }}
        hitSlop={10}
      >
        <Text style={styles.favIcon}>{isFav ? '❤️' : '♡'}</Text>
      </Pressable>

      <Text style={styles.cardArrow}>›</Text>
    </Pressable>
  );
}

// ── Componente: tarjeta de metro ────────────────────────────────────────────
function MetroCard({
  metro,
  onPress,
}: {
  metro:   MetroCity;
  onPress: (code: CountryCode) => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.metroCard,
        { borderColor: metro.color + '66' },
        pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
      ]}
      onPress={() => onPress(metro.code)}
    >
      <Text style={styles.metroCardIcon}>{metro.icon}</Text>
      <View style={styles.metroCardInfo}>
        <View style={styles.metroCardNameRow}>
          <Text style={styles.metroCardFlag}>{metro.flag}</Text>
          <Text style={styles.metroCardCity}>{metro.city}</Text>
        </View>
        <Text style={styles.metroCardLines}>{metro.lines}</Text>
      </View>
      <Text style={styles.metroCardArrow}>›</Text>
    </Pressable>
  );
}

// ── Pantalla principal ──────────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const [filter,     setFilter]     = useState<FilterTab>('trenes');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [translator, setTranslator] = useState(false);
  const [favs,       setFavs]       = useState<CountryCode[]>([]);

  // Cargar favoritos al montar
  useEffect(() => { getFavoritos().then(setFavs); }, []);

  const handleFavToggle = useCallback(async (code: CountryCode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = await toggleFavorito(code);
    setFavs(updated);
  }, []);

  // Navegar a país intercity
  const handleCountryPress = useCallback((country: CountryEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveCountry(country.code).catch(() => {});
    router.push({ pathname: '/split-screen', params: { country: country.code, mode: 'country' } });
  }, [router]);

  // Navegar a metro urbano
  const handleMetroPress = useCallback((code: CountryCode, label?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveCountry(code).catch(() => {});
    router.push({ pathname: '/split-screen', params: { country: code, mode: 'country', metroCity: label ?? '' } });
  }, [router]);

  // GPS — ubicación automática
  const handleGPS = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setGpsLoading(false); return; }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coords: Coordinates = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      const station = await findNearestStation(coords);

      router.push({
        pathname: '/split-screen',
        params: { lat: String(coords.latitude), lon: String(coords.longitude), mode: 'tourist', originStationId: station?.id ?? '' },
      });
    } catch { /* non-fatal */ }
    finally { setGpsLoading(false); }
  }, [router]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>

      {/* ── Scroll principal ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header logo ── */}
        <View style={styles.header}>
          <Text style={styles.logoWow}>WoW </Text>
          <Text style={styles.logoTrenes}>TRENES</Text>
        </View>

        {/* ── Hero texto ── */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>
            Tu viaje <Text style={styles.heroAccent}>empieza aquí.</Text>
          </Text>
          <Text style={styles.heroSub}>Fácil, rápido y hecho para viajeros como vos.</Text>
        </View>

        {/* ── Badges ── */}
        <View style={styles.badgeRow}>
          {['+13 países', 'Miles de rutas', 'Tiempo real'].map((b) => (
            <View key={b} style={styles.badge}>
              <Text style={styles.badgeText}>{b}</Text>
            </View>
          ))}
        </View>

        {/* ── Tabs de filtro ── */}
        <View style={styles.filterRow}>
          {(['trenes', 'metro', 'internacional'] as FilterTab[]).map((f) => (
            <Pressable
              key={f}
              style={[styles.filterTab, filter === f && styles.filterTabActive]}
              onPress={() => { Haptics.selectionAsync(); setFilter(f); }}
            >
              <Text style={[styles.filterTabText, filter === f && styles.filterTabTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── Sección Trenes ── */}
        {filter === 'trenes' && (
          <>
            <Text style={styles.sectionLabel}>EXPLORÁ EL MUNDO EN TREN</Text>
            <View style={styles.list}>
              {[...COUNTRIES].sort((a, b) => {
                const aFav = favs.includes(a.code) ? 0 : 1;
                const bFav = favs.includes(b.code) ? 0 : 1;
                return aFav - bFav;
              }).map((c) => (
                <CountryCard
                  key={c.code}
                  country={c}
                  isFav={favs.includes(c.code)}
                  onPress={handleCountryPress}
                  onMetroPress={handleMetroPress}
                  onFavToggle={handleFavToggle}
                />
              ))}
            </View>
          </>
        )}

        {/* ── Sección Metro ── */}
        {filter === 'metro' && (
          <>
            <Text style={styles.sectionLabel}>METROS URBANOS</Text>
            <View style={styles.metroList}>
              {METRO_CITIES.map((m) => (
                <MetroCard key={m.code} metro={m} onPress={handleMetroPress} />
              ))}
            </View>
          </>
        )}

        {/* ── Sección Internacional ── */}
        {filter === 'internacional' && (
          <View style={styles.comingSoon}>
            <Text style={styles.comingSoonIcon}>🌍</Text>
            <Text style={styles.comingSoonTitle}>Rutas internacionales</Text>
            <Text style={styles.comingSoonSub}>
              Eurostar · Thalys · Nightjet · Rail Europe{'\n'}Próximamente disponible.
            </Text>
          </View>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* ── GPS CTA fijo sobre el tab bar ── */}
      <Pressable
        style={({ pressed }) => [styles.gpsBanner, pressed && { opacity: 0.88 }]}
        onPress={handleGPS}
        disabled={gpsLoading}
      >
        <View style={styles.gpsPinWrap}>
          <Text style={styles.gpsPinIcon}>📍</Text>
        </View>
        <View style={styles.gpsBannerLeft}>
          <Text style={styles.gpsBannerTitle} numberOfLines={1}>¿No sabés por dónde empezar?</Text>
          <Text style={styles.gpsBannerSub} numberOfLines={1}>Te mostramos los trenes más cercanos</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.gpsBtn, pressed && { opacity: 0.85 }]}
          onPress={handleGPS}
          disabled={gpsLoading}
        >
          {gpsLoading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.gpsBtnText}>✦ Usar mi ubicación</Text>
          }
        </Pressable>
      </Pressable>

      {/* ── Tab Bar fijo ── */}
      <BottomTabBar active="inicio" onTranslatePress={() => setTranslator(true)} />

      {/* ── Translator Sheet ── */}
      <TranslatorSheet visible={translator} onClose={() => setTranslator(false)} />
    </SafeAreaView>
  );
}

// ── Estilos ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.bg.base },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 8 },

  // Header
  header: { flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  logoWow:    { fontSize: 34, fontWeight: '900', color: Colors.brand.glow },
  logoTrenes: { fontSize: 34, fontWeight: '900', color: Colors.text.primary },

  // Hero
  hero: { paddingHorizontal: 20, paddingBottom: 16 },
  heroTitle:  { fontSize: 22, fontWeight: '700', color: Colors.text.primary, lineHeight: 30 },
  heroAccent: { color: Colors.brand.glow },
  heroSub:    { fontSize: 14, color: Colors.text.secondary, marginTop: 4 },

  // Badges
  badgeRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 20 },
  badge:     { backgroundColor: Colors.bg.elevated, borderRadius: Radius.full, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  badgeText: { fontSize: 12, color: Colors.text.secondary, fontWeight: '500' },

  // Filter tabs
  filterRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 20 },
  filterTab: {
    paddingVertical: 8, paddingHorizontal: 18,
    borderRadius: Radius.full,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  filterTabActive: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  filterTabText:       { fontSize: 14, color: Colors.text.secondary, fontWeight: '600' },
  filterTabTextActive: { color: Colors.text.primary },

  // Section label
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.2,
    color: Colors.text.muted, paddingHorizontal: 20, marginBottom: 14,
  },

  // Country cards — horizontal list
  list: { paddingHorizontal: 16, gap: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#13131A',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    minHeight: 72,
  },
  cardStrip: { width: 4, alignSelf: 'stretch' },
  cardIcon:  { fontSize: 32, marginHorizontal: 14 },
  cardInfo:  { flex: 1, paddingVertical: 12, gap: 3 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardFlag: { fontSize: 16 },
  cardName: { fontSize: 16, fontWeight: '700', color: Colors.text.primary },
  cardTrain: { fontSize: 12, color: Colors.text.secondary },
  metroRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  metroPill: {
    backgroundColor: 'rgba(124,58,237,0.18)',
    borderRadius: Radius.full,
    paddingVertical: 3, paddingHorizontal: 8,
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.35)',
  },
  metroPillText: { fontSize: 11, color: Colors.brand.glow, fontWeight: '600' },
  cardArrow: { fontSize: 22, color: Colors.text.muted, paddingRight: 14, paddingLeft: 6, fontWeight: '300' },

  // Favorite button & badge
  favBtn: {
    width: 34, height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 4,
  },
  favBtnActive: {
    backgroundColor: 'rgba(220,53,69,0.18)',
    borderColor: 'rgba(220,53,69,0.4)',
  },
  favIcon:  { fontSize: 17, color: Colors.text.secondary },
  favBadge: { fontSize: 13, marginLeft: 2 },

  // Speed lines
  speedLines: { justifyContent: 'center', gap: 5, paddingRight: 2 },
  speedLine:  { height: 2, borderRadius: 2 },

  // Metro list
  metroList: { paddingHorizontal: 16, gap: 12 },
  metroCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#16161E',
    borderRadius: Radius.lg, borderWidth: 1.5,
    padding: 16, gap: 14,
  },
  metroCardIcon:    { fontSize: 40 },
  metroCardInfo:    { flex: 1 },
  metroCardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  metroCardFlag:    { fontSize: 18 },
  metroCardCity:    { fontSize: 17, fontWeight: '700', color: Colors.text.primary },
  metroCardLines:   { fontSize: 13, color: Colors.text.secondary },
  metroCardArrow:   { fontSize: 22, color: Colors.brand.glow, fontWeight: '300' },

  // Coming soon
  comingSoon: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 40 },
  comingSoonIcon:  { fontSize: 64, marginBottom: 16 },
  comingSoonTitle: { fontSize: 20, fontWeight: '700', color: Colors.text.primary, marginBottom: 10 },
  comingSoonSub:   { fontSize: 15, color: Colors.text.secondary, textAlign: 'center', lineHeight: 24 },

  // GPS banner — estilo Uber, compacto
  gpsBanner: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 12, marginBottom: 4,
    backgroundColor: '#1C1525',
    borderRadius: Radius.xl, padding: 10,
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.25)',
    gap: 10,
  },
  gpsPinWrap: {
    width: 38, height: 38,
    backgroundColor: Colors.brand.primary,
    borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  gpsPinIcon:     { fontSize: 18 },
  gpsBannerLeft:  { flex: 1, overflow: 'hidden' },
  gpsBannerTitle: { fontSize: 12, fontWeight: '700', color: Colors.text.primary, marginBottom: 1 },
  gpsBannerSub:   { fontSize: 11, color: Colors.text.secondary },
  gpsBtn: {
    backgroundColor: Colors.brand.primary,
    borderRadius: 50,
    paddingVertical: 11, paddingHorizontal: 14,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  gpsBtnText: { fontSize: 12, fontWeight: '700', color: Colors.text.primary },
});
