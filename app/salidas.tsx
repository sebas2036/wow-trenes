/**
 * WoW TRENES — Salidas & Arribos
 * Board GTFS real · Segmented control · Selector de país con FlagCircle
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  ActivityIndicator, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { Radius, Spacing, Typography, Shadows } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { getCountryBoard, setActiveCountry, type BoardEntry } from '../services/gtfsDatabase';
import BottomTabBar from '../components/BottomTabBar';
import TranslatorSheet from '../components/TranslatorSheet';
import FlagCircle from '../components/FlagCircle';
import type { CountryCode } from '../types';

// ── Destinos disponibles ──────────────────────────────────────────────────────
const DESTINATIONS = [
  { code: 'ES'     as CountryCode, iso: 'es', name: 'España',       sub: 'AVE · Renfe'      },
  { code: 'IT'     as CountryCode, iso: 'it', name: 'Italia',        sub: 'Frecciarossa'     },
  { code: 'FR'     as CountryCode, iso: 'fr', name: 'Francia',       sub: 'TGV · SNCF'       },
  { code: 'DE'     as CountryCode, iso: 'de', name: 'Alemania',      sub: 'ICE · DB'         },
  { code: 'CH'     as CountryCode, iso: 'ch', name: 'Suiza',         sub: 'SBB'              },
  { code: 'GB'     as CountryCode, iso: 'gb', name: 'Reino Unido',   sub: 'Avanti · LNER'    },
  { code: 'NL'     as CountryCode, iso: 'nl', name: 'Países Bajos',  sub: 'Intercity · NS'   },
  { code: 'AT'     as CountryCode, iso: 'at', name: 'Austria',       sub: 'Railjet · ÖBB'    },
  { code: 'NO'     as CountryCode, iso: 'no', name: 'Noruega',       sub: 'Bergensbanen'     },
  { code: 'PT'     as CountryCode, iso: 'pt', name: 'Portugal',      sub: 'Alfa Pendular'    },
  { code: 'BE'     as CountryCode, iso: 'be', name: 'Bélgica',       sub: 'IC · Thalys'      },
  { code: 'US'     as CountryCode, iso: 'us', name: 'USA',           sub: 'Amtrak'           },
  { code: 'JP'     as CountryCode, iso: 'jp', name: 'Japón',         sub: 'Shinkansen'       },
  { code: 'US_NYC' as CountryCode, iso: 'us', name: 'New York',      sub: 'MTA Subway'       },
  { code: 'ES_MAD' as CountryCode, iso: 'es', name: 'Madrid Metro',  sub: '13 líneas'        },
  { code: 'GB_LON' as CountryCode, iso: 'gb', name: 'London Tube',   sub: 'TfL'              },
  { code: 'US_CHI' as CountryCode, iso: 'us', name: 'Chicago',       sub: 'CTA L Train'      },
  { code: 'US_LAX' as CountryCode, iso: 'us', name: 'Los Angeles',   sub: 'LA Metro Rail'    },
];

type BoardMode = 'salidas' | 'arribos';

// ── Fila del board ────────────────────────────────────────────────────────────
function BoardRow({ entry, index }: { entry: BoardEntry; index: number }) {
  const { colors } = useTheme();
  const isEven = index % 2 === 0;

  return (
    <View style={[
      styles.boardRow,
      { backgroundColor: isEven ? colors.bg.card : colors.bg.elevated,
        borderColor: colors.border.subtle },
    ]}>
      {/* Hora */}
      <Text style={[styles.boardTime, { color: colors.brand.primary }]} numberOfLines={1}>
        {entry.time}
      </Text>

      {/* Info central */}
      <View style={styles.boardInfo}>
        <Text style={[styles.boardTrain, { color: colors.text.primary }]} numberOfLines={1}>
          {entry.endpoint !== '—' ? entry.endpoint : entry.train}
        </Text>
        <Text style={[styles.boardStation, { color: colors.text.muted }]} numberOfLines={1}>
          {entry.train !== '—' ? entry.train + ' · ' : ''}{entry.station}
        </Text>
      </View>

      {/* Estado */}
      <View style={[styles.statusPill, {
        backgroundColor: entry.status === 'ontime' ? '#30D15820' : '#FF453A20',
      }]}>
        <View style={[styles.statusDot, {
          backgroundColor: entry.status === 'ontime' ? '#30D158' : '#FF453A',
        }]} />
        <Text style={[styles.statusText, {
          color: entry.status === 'ontime' ? '#30D158' : '#FF453A',
        }]}>
          {entry.status === 'ontime' ? 'En horario' : 'Retraso'}
        </Text>
      </View>
    </View>
  );
}

// ── Pantalla ──────────────────────────────────────────────────────────────────
export default function SalidasScreen() {
  const router  = useRouter();
  const { colors, isDark } = useTheme();
  const [translator,   setTranslator]   = useState(false);
  const [mode,         setMode]         = useState<BoardMode>('salidas');
  const [selected,     setSelected]     = useState<typeof DESTINATIONS[0]>(DESTINATIONS[0]);
  const [board,        setBoard]        = useState<BoardEntry[]>([]);
  const [loading,      setLoading]      = useState(false);
  const loadRef = useRef(0);

  const loadBoard = useCallback(async (dest: typeof DESTINATIONS[0], m: BoardMode) => {
    const token = ++loadRef.current;
    setLoading(true);
    setBoard([]);
    try {
      const entries = await getCountryBoard(dest.code, m, 40);
      if (token === loadRef.current) setBoard(entries);
    } catch { /* empty DB → [] */ }
    finally  { if (token === loadRef.current) setLoading(false); }
  }, []);

  useEffect(() => { loadBoard(selected, mode); }, [selected, mode]);

  const handleDestPress = useCallback((dest: typeof DESTINATIONS[0]) => {
    Haptics.selectionAsync();
    setSelected(dest);
  }, []);

  const handleModeChange = useCallback((m: BoardMode) => {
    Haptics.selectionAsync();
    setMode(m);
  }, []);

  const handleBoardTap = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveCountry(selected.code).catch(() => {});
    router.push({ pathname: '/split-screen', params: { country: selected.code, mode: 'country' } });
  }, [selected, router]);

  const TABS: { key: BoardMode; label: string; icon: string }[] = [
    { key: 'salidas', label: 'Salidas', icon: 'arrow-up-circle-outline' },
    { key: 'arribos', label: 'Arribos', icon: 'arrow-down-circle-outline' },
  ];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg.base }]} edges={['top']}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title,    { color: colors.text.primary   }]}>Tablero</Text>
          <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
            Horarios en tiempo real
          </Text>
        </View>
      </View>

      {/* ── Segmented control Salidas / Arribos ── */}
      <View style={[styles.segWrap, { backgroundColor: colors.bg.elevated }]}>
        {TABS.map((t) => {
          const active = mode === t.key;
          return (
            <Pressable
              key={t.key}
              style={[styles.segBtn, active && styles.segBtnActive]}
              onPress={() => handleModeChange(t.key)}
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
                    margin: 1.2, borderRadius: Radius.sm - 1,
                    backgroundColor: colors.bg.card,
                  }]} pointerEvents="none" />
                </>
              )}
              <Ionicons
                name={t.icon as any}
                size={15}
                color={active ? colors.brand.primary : colors.text.muted}
              />
              <Text style={[
                styles.segText,
                { color: active ? colors.text.primary : colors.text.secondary },
                active && { fontWeight: '700' },
              ]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Selector de país / ciudad ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.destScroll}
        contentContainerStyle={styles.destContent}
      >
        {DESTINATIONS.map((d) => {
          const active = d.code === selected.code;
          return (
            <Pressable
              key={d.code}
              style={[
                styles.destChip,
                { backgroundColor: active ? colors.brand.primary + '18' : colors.bg.elevated,
                  borderColor: active ? colors.brand.primary : colors.border.subtle,
                  borderWidth: active ? 1.5 : 0.5 },
              ]}
              onPress={() => handleDestPress(d)}
            >
              <FlagCircle countryCode={d.iso} size="sm" />
              <Text style={[
                styles.destChipText,
                { color: active ? colors.brand.primary : colors.text.secondary },
                active && { fontWeight: '700' },
              ]}>
                {d.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Board ── */}
      <View style={styles.boardHeader}>
        <Text style={[styles.boardLabel, { color: colors.text.muted }]}>
          {mode === 'salidas' ? 'PRÓXIMAS SALIDAS' : 'PRÓXIMAS LLEGADAS'} · {selected.name.toUpperCase()}
        </Text>
        <Pressable onPress={handleBoardTap} hitSlop={8}>
          <Text style={[styles.boardMore, { color: colors.brand.primary }]}>Ver todo ›</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand.primary} />
          <Text style={[styles.loadingText, { color: colors.text.muted }]}>
            Cargando horarios…
          </Text>
        </View>
      ) : board.length === 0 ? (
        <View style={styles.center}>
          <Ionicons
            name={mode === 'salidas' ? 'train-outline' : 'git-pull-request-outline'}
            size={48}
            color={colors.text.muted}
          />
          <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>
            Sin horarios disponibles
          </Text>
          <Text style={[styles.emptySub, { color: colors.text.secondary }]}>
            Los datos GTFS de {selected.name}{'\n'}se cargan al seleccionar el país.
          </Text>
          <Pressable
            style={[styles.openBtn, { backgroundColor: colors.brand.primary }]}
            onPress={handleBoardTap}
          >
            <Ionicons name="navigate-outline" size={15} color="#fff" />
            <Text style={styles.openBtnText}>Abrir {selected.name}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={styles.boardScroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
        >
          {board.map((entry, i) => (
            <BoardRow key={i} entry={entry} index={i} />
          ))}
        </ScrollView>
      )}

      <BottomTabBar active="salidas" onTranslatePress={() => setTranslator(true)} />
      <TranslatorSheet visible={translator} onClose={() => setTranslator(false)} />
    </SafeAreaView>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:   { flex: 1 },

  header: {
    paddingHorizontal: 22,
    paddingTop:        18,
    paddingBottom:     14,
  },
  title:    { fontSize: 30, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { fontSize: 13, marginTop: 3 },

  // Segmented control
  segWrap: {
    flexDirection:    'row',
    marginHorizontal: 16,
    marginBottom:     16,
    borderRadius:     Radius.md,
    padding:          3,
  },
  segBtn: {
    flex: 1, paddingVertical: 9,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.sm,
    flexDirection: 'row', gap: 5,
    overflow: 'hidden',
  },
  segBtnActive: { borderRadius: Radius.sm },
  segText: { fontSize: 13, fontWeight: '500' },

  // Selector horizontal de países
  destScroll:  { flexGrow: 0, marginBottom: 16 },
  destContent: { paddingHorizontal: 16, gap: 8 },
  destChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: Radius.full,
  },
  destChipText: { fontSize: 13, fontWeight: '500' },

  // Board header
  boardHeader: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 22,
    marginBottom:      10,
  },
  boardLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.7 },
  boardMore:  { fontSize: 12, fontWeight: '600' },

  // Filas del board
  boardScroll: { flex: 1 },
  boardRow: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  boardTime:    { fontSize: 22, fontWeight: '700', width: 70, letterSpacing: -0.5 },
  boardInfo:    { flex: 1, gap: 2 },
  boardTrain:   { fontSize: 14, fontWeight: '600' },
  boardStation: { fontSize: 11 },

  // Status pill
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 4, paddingHorizontal: 8,
    borderRadius: Radius.full,
  },
  statusDot:  { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '600' },

  // Empty / loading
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, gap: 12,
  },
  loadingText: { fontSize: 13, marginTop: 8 },
  emptyTitle:  { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptySub:    { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  openBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 8, paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: Radius.full,
  },
  openBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
