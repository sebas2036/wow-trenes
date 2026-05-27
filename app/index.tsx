/**
 * WoW TRENES — Home Screen
 *
 * DOS FLUJOS desde la misma pantalla:
 *   1. PAÍS  → toca una tarjeta → split-screen con horarios del país
 *   2. GPS   → "Usar mi ubicación" → detección POI + mapa turista
 *
 * IDIOMA AUTOMÁTICO:
 *   Toda la UI se muestra en el idioma configurado en el teléfono del usuario.
 *   Turista japonés en Italia → ve la app en japonés desde el primer segundo.
 *
 * PAÍSES: España · Italia · Francia · Alemania · Suiza · Países Bajos
 *         Japón · Reino Unido · Austria · Portugal · Bélgica · USA · Noruega
 *
 * METRO: NYC Subway+LIRR+Metro-North · Madrid Metro · Barcelona TMB (próx.)
 *
 * CRITERIO DE INCLUSIÓN: datos GTFS abiertos + turismo masivo verificado.
 * China fue excluida: CR no publica datos abiertos → no podemos ofrecer info real.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';

import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { t } from '../services/i18n';
import { findNearestStation, setActiveCountry } from '../services/gtfsDatabase';
import TranslatorSheet from '../components/TranslatorSheet';
import type { CountryCode, Coordinates } from '../types';

const { width: W } = Dimensions.get('window');
const CARD_W = (W - Spacing['4'] * 2 - Spacing['3']) / 2;

// ── Datos de países ───────────────────────────────────────────────────────────
interface MetroOption {
  code:  CountryCode;
  label: string;   // "New York", "Madrid", "Barcelona"
  emoji: string;   // 🚇
}

interface CountryEntry {
  code:         CountryCode;
  flag:         string;
  name:         string;
  tagline:      string;
  trainLabel:   string;
  color:        string;
  pois:         string[];
  metroOptions?: MetroOption[];   // ciudades con metro propio
}

const COUNTRIES: CountryEntry[] = [
  {
    code: 'ES', flag: '🇪🇸', name: 'España',
    tagline: 'AVE, playas y ciudades vibrantes.',
    trainLabel: 'AVE', color: '#C0392B',
    pois: ['Sagrada Família', 'Alhambra'],
    metroOptions: [
      { code: 'ES_MAD', label: 'Madrid',    emoji: '🚇' },
      { code: 'ES_BCN', label: 'Barcelona', emoji: '🚇' },
    ],
  },
  {
    code: 'IT', flag: '🇮🇹', name: 'Italia',
    tagline: 'Historia, arte y paisajes que enamoran.',
    trainLabel: 'Frecciarossa', color: '#27AE60',
    pois: ['Coliseo', 'Duomo'],
  },
  {
    code: 'FR', flag: '🇫🇷', name: 'Francia',
    tagline: 'TGV, gastronomía y destinos inolvidables.',
    trainLabel: 'TGV', color: '#2980B9',
    pois: ['Torre Eiffel', 'Versalles'],
  },
  {
    code: 'DE', flag: '🇩🇪', name: 'Alemania',
    tagline: 'ICE, Castillos y naturaleza desbordante.',
    trainLabel: 'ICE', color: '#E74C3C',
    pois: ['Neuschwanstein', 'Brandenburgo'],
  },
  {
    code: 'NL', flag: '🇳🇱', name: 'Países Bajos',
    tagline: 'Canales, tulipanes y ciudades encantadoras.',
    trainLabel: 'Intercity Direct', color: '#E67E22',
    pois: ['Rijksmuseum', 'Keukenhof'],
  },
  {
    code: 'CH', flag: '🇨🇭', name: 'Suiza',
    tagline: 'Los trenes más escénicos del planeta.',
    trainLabel: 'Glacier Express', color: '#C0392B',
    pois: ['Jungfrau', 'Matterhorn'],
  },
  {
    code: 'US', flag: '🇺🇸', name: 'USA',
    tagline: 'Amtrak de costa a costa. Northeast Corridor.',
    trainLabel: 'Amtrak Acela', color: '#1A6BBE',
    pois: ['New York', 'Washington DC'],
    metroOptions: [
      { code: 'US_NYC', label: 'New York',  emoji: '🚇' },
    ],
  },
  {
    code: 'GB', flag: '🇬🇧', name: 'Reino Unido',
    tagline: 'De Londres a los castillos de Escocia.',
    trainLabel: 'Avanti · LNER · GWR', color: '#C0192B',
    pois: ['Big Ben', 'Edimburgo'],
    metroOptions: [
      { code: 'GB_LON', label: 'London Underground', emoji: '🚇' },
    ],
  },
  {
    code: 'AT', flag: '🇦🇹', name: 'Austria',
    tagline: 'Alpes, música y palacios imperiales.',
    trainLabel: 'Railjet ÖBB', color: '#C0392B',
    pois: ['Schönbrunn', 'Hallstatt'],
  },
  {
    code: 'JP', flag: '🇯🇵', name: 'Japón',
    tagline: 'Shinkansen, tradición y vanguardia tecnológica.',
    trainLabel: 'Shinkansen', color: '#E74C3C',
    pois: ['Senso-ji', 'Monte Fuji'],
  },
  {
    code: 'NO', flag: '🇳🇴', name: 'Noruega',
    tagline: 'Fiordos, auroras y la ruta Bergen.',
    trainLabel: 'Bergensbanen', color: '#003F87',
    pois: ['Bergen', 'Oslo'],
  },
  {
    code: 'PT', flag: '🇵🇹', name: 'Portugal',
    tagline: 'Lisboa, Porto y el Algarve en tren.',
    trainLabel: 'Alfa Pendular', color: '#27AE60',
    pois: ['Torre de Belém', 'Sintra'],
  },
  {
    code: 'BE', flag: '🇧🇪', name: 'Bélgica',
    tagline: 'Hub europeo: Bruselas, Brujas y Thalys.',
    trainLabel: 'IC / Thalys', color: '#F39C12',
    pois: ['Grand Place', 'Brujas'],
  },
];

// ── Tarjeta de país ───────────────────────────────────────────────────────────
function CountryCard({
  country,
  onPress,
  onMetroPress,
}: {
  country:      CountryEntry;
  onPress:      (c: CountryEntry) => void;
  onMetroPress: (code: CountryCode, label: string) => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        pressed && { opacity: 0.88, transform: [{ scale: 0.97 }] },
      ]}
      onPress={() => onPress(country)}
      accessibilityRole="button"
      accessibilityLabel={`Explorar trenes en ${country.name}`}
    >
      {/* Accent strip izquierda — marca de color del país */}
      <View style={[styles.cardAccentLeft, { backgroundColor: country.color }]} />

      <View style={styles.cardBody}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <Text style={styles.cardFlag}>{country.flag}</Text>
          <Text style={styles.cardName}>{country.name}</Text>
        </View>

        <Text style={styles.cardTagline} numberOfLines={2}>{country.tagline}</Text>

        {/* Tren icónico */}
        <View style={styles.trainPill}>
          <Text style={styles.trainPillText}>🚄 {country.trainLabel}</Text>
        </View>

        {/* POIs */}
        <View style={styles.poiRow}>
          {country.pois.slice(0, 2).map((poi) => (
            <View key={poi} style={styles.poiChip}>
              <Text style={styles.poiChipText} numberOfLines={1}>{poi}</Text>
            </View>
          ))}
        </View>

        {/* Metro sub-opciones */}
        {country.metroOptions && country.metroOptions.length > 0 && (
          <View style={styles.metroRow}>
            {country.metroOptions.map((metro) => (
              <Pressable
                key={metro.code}
                style={({ pressed }) => [
                  styles.metroPill,
                  pressed && { opacity: 0.75, transform: [{ scale: 0.95 }] },
                ]}
                onPress={(e) => {
                  e.stopPropagation?.();
                  onMetroPress(metro.code, metro.label);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Metro de ${metro.label}`}
              >
                <Text style={styles.metroEmoji}>{metro.emoji}</Text>
                <Text style={styles.metroLabel}>{metro.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Explorar CTA */}
        <View style={styles.cardCTA}>
          <Text style={styles.cardCTAText}>{t('home_explore_btn')}</Text>
          <Text style={styles.cardCTAArrow}>›</Text>
        </View>
      </View>
    </Pressable>
  );
}

// ── Pantalla ──────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const [gpsLoading,        setGpsLoading]        = useState(false);
  const [translatorVisible, setTranslatorVisible] = useState(false);

  // ── Flujo por país (intercity) ───────────────────────────────────────────
  const handleCountryPress = useCallback((country: CountryEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveCountry(country.code as CountryCode).catch(() => {});
    router.push({
      pathname: '/split-screen',
      params: { country: country.code, mode: 'country' },
    });
  }, [router]);

  // ── Flujo metro urbano ───────────────────────────────────────────────────
  const handleMetroPress = useCallback((code: CountryCode, label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // setActiveCountry puede rechazar si el DB no está disponible aún (requiere
    // ejecutar create_metro_placeholders.py). El catch es no-fatal: se navega
    // igualmente y el split-screen mostrará estado vacío con mensaje.
    setActiveCountry(code).catch(() => {});
    router.push({
      pathname: '/split-screen',
      params: { country: code, mode: 'country', metroCity: label },
    });
  }, [router]);

  // ── Flujo GPS / turista ──────────────────────────────────────────────────
  const handleGPS = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setGpsLoading(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setGpsLoading(false); return; }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const coords: Coordinates = {
        latitude:  loc.coords.latitude,
        longitude: loc.coords.longitude,
      };

      const nearestStation = await findNearestStation(coords);

      router.push({
        pathname: '/split-screen',
        params: {
          lat:             String(coords.latitude),
          lon:             String(coords.longitude),
          mode:            'tourist',
          originStationId: nearestStation?.id ?? '',
        },
      });
    } catch {
      // non-fatal
    } finally {
      setGpsLoading(false);
    }
  }, [router]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces
      >
        {/* ── Hero ── */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>
            <Text style={styles.heroWow}>WoW</Text>
            {'  '}
            <Text style={styles.heroTrains}>TRENES</Text>
          </Text>
          <Text style={styles.heroTagline}>{t('home_tagline')}</Text>
          <Text style={styles.heroSub}>{t('home_sub')}</Text>

          <View style={styles.statsRow}>
            <View style={styles.statChip}>
              <Text style={styles.statIcon}>🚉</Text>
              <Text style={styles.statText}>{t('home_stat_countries', { n: COUNTRIES.length })}</Text>
            </View>
            <View style={styles.statChip}>
              <Text style={styles.statIcon}>📍</Text>
              <Text style={styles.statText}>{t('home_stat_routes')}</Text>
            </View>
            <View style={styles.statChip}>
              <Text style={styles.statIcon}>🕐</Text>
              <Text style={styles.statText}>{t('home_stat_realtime')}</Text>
            </View>
          </View>
        </View>

        {/* ── Sección header ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🧳 {t('home_explore_title')}</Text>
          <Text style={styles.sectionSub}>{t('home_explore_sub')}</Text>
        </View>

        {/* ── Grid de países ── */}
        <View style={styles.grid}>
          {COUNTRIES.map((country) => (
            <CountryCard
              key={country.code}
              country={country}
              onPress={handleCountryPress}
              onMetroPress={handleMetroPress}
            />
          ))}
        </View>

      </ScrollView>

      {/* ── FAB Traductor ── */}
      <Pressable
        style={({ pressed }) => [styles.translatorFAB, pressed && { opacity: 0.85 }]}
        onPress={() => setTranslatorVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="Abrir traductor de señales"
      >
        <Text style={styles.translatorFABIcon}>🌐</Text>
        <Text style={styles.translatorFABText}>Traducir señal</Text>
      </Pressable>

      {/* ── Translator Sheet ── */}
      <TranslatorSheet
        visible={translatorVisible}
        onClose={() => setTranslatorVisible(false)}
      />

      {/* ── GPS CTA fijo al fondo ── */}
      <View style={styles.gpsCTA}>
        <View style={styles.gpsLeft}>
          <View style={styles.gpsIconBox}>
            <Text style={styles.gpsIconEmoji}>📍</Text>
          </View>
          <View style={styles.gpsTexts}>
            <Text style={styles.gpsQuestion}>{t('home_gps_question')}</Text>
            <Text style={styles.gpsSub} numberOfLines={2}>{t('home_gps_sub')}</Text>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.gpsBtn, pressed && { opacity: 0.85 }]}
          onPress={handleGPS}
          disabled={gpsLoading}
          accessibilityRole="button"
          accessibilityLabel={t('home_gps_btn')}
        >
          {gpsLoading
            ? <ActivityIndicator size="small" color="#fff" />
            : (
              <>
                <Text style={styles.gpsBtnIcon}>✦</Text>
                <Text style={styles.gpsBtnText}>{t('home_gps_btn')}</Text>
              </>
            )
          }
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: Colors.bg.base },
  scroll:        { flex: 1 },
  scrollContent: { paddingBottom: 140 },

  // Hero
  hero: {
    paddingHorizontal: Spacing['4'],
    paddingTop:        Spacing['4'],
    paddingBottom:     Spacing['5'],
  },
  heroTitle: {
    fontSize:     42,
    lineHeight:   48,
    letterSpacing:-0.5,
    marginBottom: Spacing['2'],
  },
  heroWow:    { color: Colors.brand.glow,  fontWeight: Typography.weight.black },
  heroTrains: { color: Colors.text.primary, fontWeight: Typography.weight.black },
  heroTagline: {
    fontSize:   Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color:      Colors.text.primary,
    marginBottom: 2,
  },
  heroSub: {
    fontSize:   Typography.size.sm,
    color:      Colors.text.secondary,
    lineHeight: 20,
    marginBottom: Spacing['4'],
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           Spacing['2'],
  },
  statChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    paddingVertical:   Spacing['1'],
    paddingHorizontal: Spacing['3'],
    backgroundColor:   Colors.bg.surface,
    borderRadius:      Radius.full,
    borderWidth:       1,
    borderColor:       Colors.border.subtle,
  },
  statIcon: { fontSize: 12 },
  statText: {
    fontSize:   Typography.size.xs,
    color:      Colors.text.secondary,
    fontWeight: Typography.weight.medium,
  },

  // Section header
  sectionHeader: {
    paddingHorizontal: Spacing['4'],
    marginBottom:      Spacing['3'],
  },
  sectionTitle: {
    fontSize:   Typography.size.md,
    fontWeight: Typography.weight.bold,
    color:      Colors.text.primary,
    marginBottom: 2,
  },
  sectionSub: {
    fontSize: Typography.size.xs,
    color:    Colors.text.secondary,
  },

  // Grid
  grid: {
    flexDirection:     'row',
    flexWrap:          'wrap',
    paddingHorizontal: Spacing['4'],
    gap:               Spacing['3'],
    paddingBottom:     Spacing['4'],
  },

  // Country card
  card: {
    width:           CARD_W,
    backgroundColor: Colors.bg.elevated,
    borderRadius:    Radius.lg,
    overflow:        'hidden',
    borderWidth:     1,
    borderColor:     Colors.border.subtle,
    flexDirection:   'row',  // accent izquierda + body derecha
    ...Shadows.card,
  },
  // Accent vertical izquierda (4px de ancho, todo el alto)
  cardAccentLeft: {
    width:        4,
    borderTopLeftRadius:    Radius.lg,
    borderBottomLeftRadius: Radius.lg,
  },
  cardBody:   { flex: 1, padding: Spacing['3'], gap: 2 },
  cardHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing['1'],
    marginBottom:  2,
  },
  cardFlag: { fontSize: 18 },
  cardName: {
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color:      Colors.text.primary,
  },
  cardTagline: {
    fontSize:   Typography.size.xs,
    color:      Colors.text.secondary,
    lineHeight: 15,
    marginBottom: Spacing['1'],
  },
  trainPill: {
    alignSelf:         'flex-start',
    paddingVertical:   2,
    paddingHorizontal: Spacing['2'],
    backgroundColor:   Colors.bg.overlay,
    borderRadius:      Radius.full,
    marginBottom:      Spacing['1'],
  },
  trainPillText: {
    fontSize:   9,
    color:      Colors.text.brand,
    fontWeight: Typography.weight.semibold,
  },
  poiRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           3,
    marginBottom:  Spacing['1'],
  },
  poiChip: {
    paddingVertical:   1,
    paddingHorizontal: 5,
    backgroundColor:   'rgba(124,58,237,0.08)',
    borderRadius:      Radius.sm,
    borderWidth:       1,
    borderColor:       'rgba(124,58,237,0.18)',
  },
  poiChipText: { fontSize: 9, color: Colors.text.brand },

  // Metro sub-opciones
  metroRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           4,
    marginBottom:  Spacing['1'],
  },
  metroPill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               3,
    paddingVertical:   3,
    paddingHorizontal: Spacing['2'],
    backgroundColor:   'rgba(34,197,94,0.10)',
    borderRadius:      Radius.full,
    borderWidth:       1,
    borderColor:       'rgba(34,197,94,0.25)',
  },
  metroEmoji: { fontSize: 10 },
  metroLabel: {
    fontSize:   9,
    fontWeight: Typography.weight.semibold,
    color:      Colors.status.safe,
  },

  cardCTA: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginTop:      Spacing['1'],
    paddingTop:     Spacing['1'],
    borderTopWidth: 1,
    borderTopColor: Colors.border.subtle,
  },
  cardCTAText: {
    fontSize:   9,
    color:      Colors.brand.glow,
    fontWeight: Typography.weight.semibold,
  },
  cardCTAArrow: {
    fontSize:   Typography.size.sm,
    color:      Colors.brand.glow,
    fontWeight: Typography.weight.bold,
  },

  // GPS CTA fijo
  gpsCTA: {
    position:          'absolute',
    bottom:            0,
    left:              0,
    right:             0,
    flexDirection:     'row',
    alignItems:        'center',
    gap:               Spacing['3'],
    paddingHorizontal: Spacing['4'],
    paddingTop:        Spacing['3'],
    paddingBottom:     Platform.select({ ios: 28, android: 16 }),
    backgroundColor:   Colors.bg.elevated,
    borderTopWidth:    1,
    borderTopColor:    Colors.border.subtle,
    ...Shadows.card,
  },
  gpsLeft: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing['2'],
  },
  gpsIconBox: {
    width:          36,
    height:         36,
    borderRadius:   Radius.md,
    backgroundColor:Colors.brand.primary,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  gpsIconEmoji: { fontSize: 16 },
  gpsTexts:    { flex: 1 },
  gpsQuestion: {
    fontSize:   Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color:      Colors.text.primary,
  },
  gpsSub: {
    fontSize:  9,
    color:     Colors.text.secondary,
    lineHeight:13,
  },
  gpsBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               Spacing['1'],
    paddingVertical:   Spacing['2'],
    paddingHorizontal: Spacing['3'],
    backgroundColor:   Colors.brand.primary,
    borderRadius:      Radius.full,
    flexShrink:        0,
    minHeight:         44,
  },
  gpsBtnIcon: { fontSize: 11, color: '#fff' },
  gpsBtnText: {
    fontSize:   Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color:      '#fff',
  },

  // Translator FAB
  translatorFAB: {
    position:          'absolute',
    bottom:            Platform.select({ ios: 110, android: 96 }), // encima del GPS CTA
    right:             Spacing['4'],
    flexDirection:     'row',
    alignItems:        'center',
    gap:               Spacing['1'],
    paddingVertical:   Spacing['2'],
    paddingHorizontal: Spacing['3'],
    backgroundColor:   Colors.bg.elevated,
    borderRadius:      Radius.full,
    borderWidth:       1,
    borderColor:       Colors.border.default,
    ...Shadows.card,
  },
  translatorFABIcon: { fontSize: 15 },
  translatorFABText: {
    fontSize:   Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color:      Colors.text.secondary,
  },
});
