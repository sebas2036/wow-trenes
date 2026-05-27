/**
 * WoW TRENES — Salidas
 * Selector rápido de país → split-screen con próximas salidas.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { Colors, Radius } from '../theme';
import { setActiveCountry } from '../services/gtfsDatabase';
import BottomTabBar from '../components/BottomTabBar';
import TranslatorSheet from '../components/TranslatorSheet';
import type { CountryCode } from '../types';

const DESTINATIONS = [
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
  // Metros
  { code: 'US_NYC'  as CountryCode, flag: '🇺🇸', icon: '🗽', name: 'New York',       sub: 'MTA Subway',         color: '#1A6BBE' },
  { code: 'ES_MAD'  as CountryCode, flag: '🇪🇸', icon: '🏟️', name: 'Madrid Metro',   sub: '13 líneas · CRTM',   color: '#C0392B' },
  { code: 'GB_LON'  as CountryCode, flag: '🇬🇧', icon: '🎡', name: 'London Tube',    sub: 'TfL · Elizabeth',    color: '#C0192B' },
  { code: 'US_CHI'  as CountryCode, flag: '🇺🇸', icon: '🌆', name: 'Chicago',        sub: 'CTA L Train',        color: '#0057A8' },
  { code: 'US_LAX'  as CountryCode, flag: '🇺🇸', icon: '🌴', name: 'Los Angeles',    sub: 'LA Metro Rail',      color: '#7C3AED' },
];

export default function SalidasScreen() {
  const router = useRouter();
  const [translator, setTranslator] = useState(false);

  const handlePress = (code: CountryCode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveCountry(code).catch(() => {});
    router.push({ pathname: '/split-screen', params: { country: code, mode: 'country' } });
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Salidas</Text>
        <Text style={styles.subtitle}>Seleccioná un destino para ver las próximas salidas</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}>
        {DESTINATIONS.map((d) => (
          <Pressable
            key={d.code}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.8, transform: [{ scale: 0.985 }] }]}
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
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        ))}
        <View style={{ height: 8 }} />
      </ScrollView>

      <BottomTabBar active="salidas" onTranslatePress={() => setTranslator(true)} />
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
  arrow: { fontSize: 22, color: Colors.text.muted, paddingHorizontal: 14, fontWeight: '300' },
});
