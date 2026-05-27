/**
 * WoW TRENES — Favoritos
 * Países guardados por el usuario. Persistidos en AsyncStorage.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import { Colors, Radius } from '../theme';
import { setActiveCountry } from '../services/gtfsDatabase';
import BottomTabBar from '../components/BottomTabBar';
import TranslatorSheet from '../components/TranslatorSheet';
import type { CountryCode } from '../types';

const STORAGE_KEY = '@wowtrenes_favoritos';

export const ALL_COUNTRIES = [
  { code: 'ES' as CountryCode, flag: '🇪🇸', icon: '🏟️', name: 'España',       sub: 'AVE · Renfe',       color: '#C0392B' },
  { code: 'IT' as CountryCode, flag: '🇮🇹', icon: '🏛️', name: 'Italia',        sub: 'Frecciarossa',      color: '#27AE60' },
  { code: 'FR' as CountryCode, flag: '🇫🇷', icon: '🗼', name: 'Francia',       sub: 'TGV · SNCF',        color: '#2980B9' },
  { code: 'DE' as CountryCode, flag: '🇩🇪', icon: '🏰', name: 'Alemania',      sub: 'ICE · DB',          color: '#E74C3C' },
  { code: 'CH' as CountryCode, flag: '🇨🇭', icon: '🏔️', name: 'Suiza',         sub: 'SBB · Glacier',     color: '#DC143C' },
  { code: 'GB' as CountryCode, flag: '🇬🇧', icon: '🎡', name: 'Reino Unido',   sub: 'Avanti · LNER',     color: '#C0192B' },
  { code: 'NL' as CountryCode, flag: '🇳🇱', icon: '🌷', name: 'Países Bajos',  sub: 'Intercity · NS',    color: '#E67E22' },
  { code: 'AT' as CountryCode, flag: '🇦🇹', icon: '🎭', name: 'Austria',       sub: 'Railjet · ÖBB',     color: '#C0392B' },
  { code: 'NO' as CountryCode, flag: '🇳🇴', icon: '🌊', name: 'Noruega',       sub: 'Bergensbanen',      color: '#003F87' },
  { code: 'PT' as CountryCode, flag: '🇵🇹', icon: '🏖️', name: 'Portugal',      sub: 'Alfa Pendular',     color: '#27AE60' },
  { code: 'BE' as CountryCode, flag: '🇧🇪', icon: '🏅', name: 'Bélgica',       sub: 'IC · Thalys',       color: '#F39C12' },
  { code: 'US' as CountryCode, flag: '🇺🇸', icon: '🗽', name: 'USA',           sub: 'Amtrak',            color: '#1A6BBE' },
  { code: 'JP' as CountryCode, flag: '🇯🇵', icon: '⛩️', name: 'Japón',         sub: 'Shinkansen',        color: '#E74C3C' },
  { code: 'US_NYC' as CountryCode, flag: '🇺🇸', icon: '🗽', name: 'New York',     sub: 'MTA Subway',      color: '#1A6BBE' },
  { code: 'ES_MAD' as CountryCode, flag: '🇪🇸', icon: '🏟️', name: 'Madrid Metro', sub: '13 líneas',      color: '#C0392B' },
  { code: 'GB_LON' as CountryCode, flag: '🇬🇧', icon: '🎡', name: 'London Tube',  sub: 'TfL · Elizabeth', color: '#C0192B' },
  { code: 'US_CHI' as CountryCode, flag: '🇺🇸', icon: '🌆', name: 'Chicago',      sub: 'CTA L Train',    color: '#0057A8' },
  { code: 'US_LAX' as CountryCode, flag: '🇺🇸', icon: '🌴', name: 'Los Angeles',  sub: 'LA Metro Rail',  color: '#7C3AED' },
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

export default function FavoritosScreen() {
  const router = useRouter();
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
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Favoritos</Text>
        <Text style={styles.subtitle}>
          {favCountries.length > 0 ? 'Tus destinos guardados' : 'Guardá tus destinos favoritos desde el inicio'}
        </Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}>

        {favCountries.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>❤️</Text>
            <Text style={styles.emptyTitle}>Sin favoritos aún</Text>
            <Text style={styles.emptySub}>
              Tocá el corazón en cualquier tarjeta de país para guardarlo acá.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.8 }]}
              onPress={() => router.push('/')}
            >
              <Text style={styles.emptyBtnText}>Explorar países</Text>
            </Pressable>
          </View>
        ) : (
          favCountries.map((d) => (
            <Pressable
              key={d.code}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
              onPress={() => handlePress(d.code)}
            >
              <View style={[styles.strip, { backgroundColor: d.color }]} />
              <Text style={styles.icon}>{d.icon}</Text>
              <View style={styles.info}>
                <View style={styles.nameRow}>
                  <Text style={styles.flag}>{d.flag}</Text>
                  <Text style={styles.name}>{d.name}</Text>
                </View>
                <Text style={styles.sub}>🚄 {d.sub}</Text>
              </View>
              <Pressable
                style={styles.heartBtn}
                onPress={() => handleRemove(d.code)}
                hitSlop={12}
              >
                <Text style={styles.heartFilled}>❤️</Text>
              </Pressable>
              <Text style={styles.arrow}>›</Text>
            </Pressable>
          ))
        )}
        <View style={{ height: 8 }} />
      </ScrollView>

      <BottomTabBar active="favoritos" onTranslatePress={() => setTranslator(true)} />
      <TranslatorSheet visible={translator} onClose={() => setTranslator(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.bg.base },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title:    { fontSize: 28, fontWeight: '800', color: Colors.text.primary },
  subtitle: { fontSize: 13, color: Colors.text.secondary, marginTop: 4 },
  scroll: { flex: 1 },
  list:   { paddingHorizontal: 16, gap: 10 },

  // Card
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#13131A',
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden', minHeight: 64,
  },
  strip: { width: 4, alignSelf: 'stretch' },
  icon:  { fontSize: 28, marginHorizontal: 14 },
  info:  { flex: 1, paddingVertical: 12, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flag:  { fontSize: 16 },
  name:  { fontSize: 16, fontWeight: '700', color: Colors.text.primary },
  sub:   { fontSize: 12, color: Colors.text.secondary },
  heartBtn: { padding: 8 },
  heartFilled: { fontSize: 18 },
  arrow: { fontSize: 22, color: Colors.text.muted, paddingHorizontal: 14, fontWeight: '300' },

  // Empty state
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyIcon:  { fontSize: 64, marginBottom: 20 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: Colors.text.primary, marginBottom: 10 },
  emptySub:   { fontSize: 15, color: Colors.text.secondary, textAlign: 'center', lineHeight: 24, marginBottom: 28 },
  emptyBtn: {
    backgroundColor: Colors.brand.primary,
    borderRadius: Radius.full,
    paddingVertical: 13, paddingHorizontal: 28,
  },
  emptyBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
