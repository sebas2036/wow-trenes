/**
 * WoW Train — Favoritos
 * Mismo lenguaje visual que Home: FlagCircle neumórfico, Ionicons, sin emoji.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Platform, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { LinearGradient } from 'expo-linear-gradient';
import { Radius, Shadows } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { setActiveCountry } from '../services/gtfsDatabase';
import BottomTabBar from '../components/BottomTabBar';
import TranslatorSheet from '../components/TranslatorSheet';
import FlagCircle from '../components/FlagCircle';
import type { CountryCode } from '../types';

const STORAGE_KEY = '@wowtrenes_favoritos';

function isoFromCode(code: string): string {
  return code.split('_')[0].toLowerCase();
}

export const ALL_COUNTRIES: { code: CountryCode; name: string; sub: string }[] = [
  { code: 'ES',     name: 'España',        sub: 'AVE · Renfe'      },
  { code: 'IT',     name: 'Italia',         sub: 'Frecciarossa'     },
  { code: 'FR',     name: 'Francia',        sub: 'TGV · SNCF'       },
  { code: 'DE',     name: 'Alemania',       sub: 'ICE · DB'         },
  { code: 'CH',     name: 'Suiza',          sub: 'SBB · Glacier'    },
  { code: 'GB',     name: 'Reino Unido',    sub: 'Avanti · LNER'    },
  { code: 'NL',     name: 'Países Bajos',   sub: 'Intercity · NS'   },
  { code: 'AT',     name: 'Austria',        sub: 'Railjet · ÖBB'    },
  { code: 'NO',     name: 'Noruega',        sub: 'Bergensbanen'     },
  { code: 'PT',     name: 'Portugal',       sub: 'Alfa Pendular'    },
  { code: 'BE',     name: 'Bélgica',        sub: 'IC · Thalys'      },
  { code: 'US',     name: 'USA',            sub: 'Amtrak'           },
  { code: 'JP',     name: 'Japón',          sub: 'Shinkansen'       },
  { code: 'US_NYC', name: 'New York',       sub: 'MTA Subway'       },
  { code: 'ES_MAD', name: 'Madrid Metro',   sub: '13 líneas · CRTM' },
  { code: 'GB_LON', name: 'London Tube',    sub: 'TfL · Elizabeth'  },
  { code: 'US_CHI', name: 'Chicago',        sub: 'CTA L Train'      },
  { code: 'US_LAX', name: 'Los Angeles',    sub: 'LA Metro Rail'    },
];

export async function toggleFavorito(code: CountryCode): Promise<CountryCode[]> {
  const raw  = await AsyncStorage.getItem(STORAGE_KEY);
  const list: CountryCode[] = raw ? JSON.parse(raw) : [];
  const idx  = list.indexOf(code);
  if (idx >= 0) list.splice(idx, 1); else list.push(code);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return list;
}

export async function getFavoritos(): Promise<CountryCode[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

// ── Tarjeta de favorito ───────────────────────────────────────────────────────
function FavCard({
  country, onPress, onRemove,
}: {
  country:  typeof ALL_COUNTRIES[number];
  onPress:  (code: CountryCode) => void;
  onRemove: (code: CountryCode) => void;
}) {
  const { colors, isDark } = useTheme();
  const shadowStyle = Platform.OS === 'ios'
    ? (isDark ? Shadows.cardDark : Shadows.card)
    : { elevation: 2 };

  return (
    <View style={[styles.cardShadow, shadowStyle, {
      backgroundColor: colors.bg.card, borderRadius: Radius.lg,
    }]}>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.bg.card, borderColor: colors.border.card },
          pressed && { opacity: 0.88, transform: [{ scale: 0.982 }] },
        ]}
        onPress={() => onPress(country.code)}
      >
        <View style={styles.cardFlag}>
          <FlagCircle countryCode={isoFromCode(country.code)} size="lg" />
        </View>

        <View style={styles.cardInfo}>
          <Text style={[styles.cardName, { color: colors.text.primary }]}>
            {country.name}
          </Text>
          <View style={styles.subRow}>
            <Ionicons name="train-outline" size={12} color={colors.text.muted} />
            <Text style={[styles.cardSub, { color: colors.text.secondary }]}>
              {country.sub}
            </Text>
          </View>
        </View>

        <Pressable style={styles.heartBtn} onPress={() => onRemove(country.code)} hitSlop={12}>
          <Ionicons name="heart" size={22} color="#FF3B30" />
        </Pressable>

        <Text style={[styles.arrow, { color: colors.text.muted }]}>›</Text>
      </Pressable>
    </View>
  );
}

// ── Pantalla ──────────────────────────────────────────────────────────────────
export default function FavoritosScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [favs,       setFavs]       = useState<CountryCode[]>([]);
  const [translator, setTranslator] = useState(false);

  useEffect(() => { getFavoritos().then(setFavs); }, []);

  const handleRemove = useCallback(async (code: CountryCode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = await toggleFavorito(code);
    setFavs(updated);
  }, []);

  const handlePress = useCallback((code: CountryCode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveCountry(code).catch(() => {});
    router.push({ pathname: '/split-screen', params: { country: code, mode: 'country' } });
  }, [router]);

  const favCountries = ALL_COUNTRIES.filter((c) => favs.includes(c.code));

  return (
    <View style={styles.rootWrap}>
      <Image source={require('../assets/images/bg-hero.png')} style={[StyleSheet.absoluteFillObject, { top: -280, bottom: 280 }]} resizeMode="cover" fadeDuration={0} />
      <LinearGradient colors={['rgba(10,8,30,0.35)', 'rgba(14,14,46,0.60)', 'rgba(14,14,46,0.80)']} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
    <SafeAreaView style={styles.root} edges={['top']}>

      <View style={styles.header}>
        <Text style={[styles.title,    { color: colors.text.primary   }]}>Favoritos</Text>
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
          {favCountries.length > 0
            ? 'Tus destinos guardados'
            : 'Guardá tus destinos favoritos desde el inicio'}
        </Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}>

        {favCountries.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIconWrap, { backgroundColor: colors.bg.elevated }]}>
              <Ionicons name="heart-outline" size={40} color={colors.text.muted} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>
              Sin favoritos aún
            </Text>
            <Text style={[styles.emptySub, { color: colors.text.secondary }]}>
              Tocá el corazón en cualquier tarjeta{'\n'}de país para guardarlo acá.
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.emptyBtn, { backgroundColor: colors.brand.primary },
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => router.push('/')}
            >
              <Ionicons name="compass-outline" size={16} color="#fff" />
              <Text style={styles.emptyBtnText}>Explorar países</Text>
            </Pressable>
          </View>
        ) : (
          favCountries.map((c) => (
            <FavCard key={c.code} country={c} onPress={handlePress} onRemove={handleRemove} />
          ))
        )}
        <View style={{ height: 8 }} />
      </ScrollView>

      <BottomTabBar active="inicio" onTranslatePress={() => setTranslator(true)} />
      <TranslatorSheet visible={translator} onClose={() => setTranslator(false)} />
    </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  rootWrap: { flex: 1 },
  root:     { flex: 1, backgroundColor: 'transparent' },
  header:   { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 14 },
  title:    { fontSize: 30, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { fontSize: 13, marginTop: 4 },
  scroll:   { flex: 1 },
  list:     { paddingHorizontal: 16, gap: 10 },

  cardShadow: { borderRadius: Radius.lg },
  card: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: Radius.lg, borderWidth: 0.5,
    paddingLeft: 12, paddingRight: 8, paddingVertical: 14, minHeight: 80,
  },
  cardFlag: { marginRight: 14 },
  cardInfo: { flex: 1, gap: 4 },
  cardName: { fontSize: 16, fontWeight: '700' },
  subRow:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardSub:  { fontSize: 12 },
  heartBtn: { padding: 6 },
  arrow:    { fontSize: 22, paddingHorizontal: 10, fontWeight: '300' },

  empty:         { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40, gap: 14 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle:    { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptySub:      { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  emptyBtn:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingVertical: 13, paddingHorizontal: 24, borderRadius: Radius.full },
  emptyBtnText:  { fontSize: 15, fontWeight: '700', color: '#fff' },
});
