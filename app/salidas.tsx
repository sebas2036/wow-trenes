/**
 * WoW TRENES — Salidas & Arribos
 * Board real-time · Selector de país · Selector de estación por país
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  ActivityIndicator, Modal, TextInput, FlatList, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { Radius, Shadows } from '../theme';
import { useTheme } from '../context/ThemeContext';
import {
  getCountryBoard, setActiveCountry, type BoardEntry,
  searchSwissStations, setActiveSwissStation, getActiveSwissStationName,
  searchItalyStations, setActiveItalyStation, getActiveItalyStationName,
  searchBelgiumStations, setActiveBelgiumStation, getActiveBelgiumStationName,
  searchFranceStations, setActiveFranceStation, getActiveFranceStationName,
  searchAustriaStations, setActiveAustriaStation, getActiveAustriaStationName,
  searchPortugalStations, setActivePortugalStation, getActivePortugalStationName,
} from '../services/gtfsDatabase';
import BottomTabBar from '../components/BottomTabBar';
import TranslatorSheet from '../components/TranslatorSheet';
import FlagCircle from '../components/FlagCircle';
import { useNetwork } from '../hooks/useNetwork';
import type { CountryCode } from '../types';

// ── Países disponibles ────────────────────────────────────────────────────────
const DESTINATIONS = [
  { code: 'ES'     as CountryCode, iso: 'es', name: 'España',       sub: 'AVE · Renfe'      },
  { code: 'IT'     as CountryCode, iso: 'it', name: 'Italia',        sub: 'Frecciarossa'     },
  { code: 'FR'     as CountryCode, iso: 'fr', name: 'Francia',       sub: 'TGV · SNCF'       },
  { code: 'DE'     as CountryCode, iso: 'de', name: 'Alemania',      sub: 'ICE · DB'         },
  { code: 'CH'     as CountryCode, iso: 'ch', name: 'Suiza',         sub: 'SBB'              },
  { code: 'NL'     as CountryCode, iso: 'nl', name: 'Países Bajos',  sub: 'Intercity · NS'   },
  { code: 'AT'     as CountryCode, iso: 'at', name: 'Austria',       sub: 'Railjet · ÖBB'    },
  { code: 'PT'     as CountryCode, iso: 'pt', name: 'Portugal',      sub: 'Alfa Pendular'    },
  { code: 'BE'     as CountryCode, iso: 'be', name: 'Bélgica',       sub: 'IC · Thalys'      },
  { code: 'US_NYC' as CountryCode, iso: 'us', name: 'New York',      sub: 'MTA Subway'       },
  { code: 'ES_MAD' as CountryCode, iso: 'es', name: 'Madrid Metro',  sub: '13 líneas'        },
  { code: 'GB_LON' as CountryCode, iso: 'gb', name: 'London Tube',   sub: 'TfL'              },
  { code: 'US_CHI' as CountryCode, iso: 'us', name: 'Chicago',       sub: 'CTA L Train'      },
  { code: 'US_LAX' as CountryCode, iso: 'us', name: 'Los Angeles',   sub: 'LA Metro Rail'    },
];

// Países con selector de estación real-time
const RT_STATION_COUNTRIES: Partial<Record<CountryCode, true>> = {
  CH: true, IT: true, BE: true, FR: true, AT: true, PT: true,
};

type BoardMode = 'salidas' | 'arribos';

// ── Helpers de estación por país ──────────────────────────────────────────────

async function searchForCountry(code: CountryCode, query: string): Promise<{ id: string; name: string }[]> {
  if (!query.trim()) return [];
  switch (code) {
    case 'CH': return (await searchSwissStations(query)).map(s => ({ id: s.id,   name: s.name }));
    case 'IT': return (await searchItalyStations(query)).map(s => ({ id: s.id,   name: s.name }));
    case 'BE': return (await searchBelgiumStations(query)).map(s => ({ id: s.id, name: s.name }));
    case 'FR': return (await searchFranceStations(query)).map(s => ({ id: s.id,  name: s.name }));
    case 'AT': return (await searchAustriaStations(query)).map(s => ({ id: s.extId, name: s.name }));
    case 'PT': return (await searchPortugalStations(query)).map(s => ({ id: s.code, name: s.name }));
    default:   return [];
  }
}

function setStationForCountry(code: CountryCode, id: string, name: string): void {
  switch (code) {
    case 'CH': setActiveSwissStation(id, name); break;
    case 'IT': setActiveItalyStation({ id, name }); break;
    case 'BE': setActiveBelgiumStation({ id, name, standardname: name }); break;
    case 'FR': setActiveFranceStation({ id, name }); break;
    case 'AT': setActiveAustriaStation({ extId: id, name }); break;
    case 'PT': setActivePortugalStation({ code: id, name }); break;
  }
}

function getStationNameForCountry(code: CountryCode): string {
  switch (code) {
    case 'CH': return getActiveSwissStationName();
    case 'IT': return getActiveItalyStationName();
    case 'BE': return getActiveBelgiumStationName();
    case 'FR': return getActiveFranceStationName();
    case 'AT': return getActiveAustriaStationName();
    case 'PT': return getActivePortugalStationName();
    default:   return '';
  }
}

// ── BoardRow ──────────────────────────────────────────────────────────────────
function BoardRow({ entry, index }: { entry: BoardEntry; index: number }) {
  const { colors } = useTheme();
  return (
    <View style={[
      styles.boardRow,
      { backgroundColor: index % 2 === 0 ? colors.bg.card : colors.bg.elevated,
        borderColor: colors.border.subtle },
    ]}>
      <Text style={[styles.boardTime, { color: colors.brand.primary }]} numberOfLines={1}>
        {entry.time}
      </Text>
      <View style={styles.boardInfo}>
        <Text style={[styles.boardTrain, { color: colors.text.primary }]} numberOfLines={1}>
          {entry.endpoint !== '—' ? entry.endpoint : entry.train}
        </Text>
        <Text style={[styles.boardStation, { color: colors.text.muted }]} numberOfLines={1}>
          {entry.train !== '—' ? entry.train + ' · ' : ''}{entry.station}
          {entry.platform ? `  ·  Andén ${entry.platform}` : ''}
        </Text>
      </View>
      <View style={[styles.statusPill, {
        backgroundColor: entry.status === 'cancelled' ? '#FF453A30'
          : entry.status === 'delayed' ? '#FF9F0A20' : '#30D15820',
      }]}>
        <View style={[styles.statusDot, {
          backgroundColor: entry.status === 'cancelled' ? '#FF453A'
            : entry.status === 'delayed' ? '#FF9F0A' : '#30D158',
        }]} />
        <Text style={[styles.statusText, {
          color: entry.status === 'cancelled' ? '#FF453A'
            : entry.status === 'delayed' ? '#FF9F0A' : '#30D158',
        }]}>
          {entry.status === 'cancelled' ? 'Cancelado'
            : entry.delay ? entry.delay
            : 'En horario'}
        </Text>
      </View>
    </View>
  );
}

// ── StationPicker modal ───────────────────────────────────────────────────────
function StationPicker({
  visible, country, onSelect, onClose,
}: {
  visible:  boolean;
  country:  CountryCode;
  onSelect: (id: string, name: string) => void;
  onClose:  () => void;
}) {
  const { colors } = useTheme();
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) { setQuery(''); setResults([]); }
  }, [visible]);

  const handleQuery = useCallback((text: string) => {
    setQuery(text);
    if (searchRef.current) clearTimeout(searchRef.current);
    if (text.length < 2) { setResults([]); return; }
    searchRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchForCountry(country, text);
        setResults(r);
      } catch { setResults([]); }
      finally  { setLoading(false); }
    }, 350);
  }, [country]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.pickerOverlay}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.pickerSheet, { backgroundColor: colors.bg.card }]}>

          {/* Handle */}
          <View style={[styles.pickerHandle, { backgroundColor: colors.border.subtle }]} />

          {/* Título */}
          <Text style={[styles.pickerTitle, { color: colors.text.primary }]}>
            Seleccionar estación
          </Text>

          {/* Input búsqueda */}
          <View style={[styles.searchRow, { backgroundColor: colors.bg.elevated, borderColor: colors.border.subtle }]}>
            <Ionicons name="search-outline" size={16} color={colors.text.muted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text.primary }]}
              placeholder="Buscar estación…"
              placeholderTextColor={colors.text.muted}
              value={query}
              onChangeText={handleQuery}
              autoFocus
              autoCorrect={false}
            />
            {loading && <ActivityIndicator size="small" color={colors.brand.primary} />}
            {query.length > 0 && !loading && (
              <Pressable onPress={() => handleQuery('')}>
                <Ionicons name="close-circle" size={16} color={colors.text.muted} />
              </Pressable>
            )}
          </View>

          {/* Resultados */}
          <FlatList
            data={results}
            keyExtractor={item => item.id}
            style={styles.pickerList}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              query.length >= 2 && !loading ? (
                <Text style={[styles.pickerEmpty, { color: colors.text.muted }]}>
                  Sin resultados para "{query}"
                </Text>
              ) : null
            }
            renderItem={({ item }) => (
              <Pressable
                style={[styles.pickerItem, { borderColor: colors.border.subtle }]}
                onPress={() => { Haptics.selectionAsync(); onSelect(item.id, item.name); }}
              >
                <Ionicons name="location-outline" size={16} color={colors.brand.primary} />
                <Text style={[styles.pickerItemText, { color: colors.text.primary }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.text.muted} />
              </Pressable>
            )}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Pantalla principal ────────────────────────────────────────────────────────
export default function SalidasScreen() {
  const router  = useRouter();
  const { colors } = useTheme();
  const [translator,    setTranslator]    = useState(false);
  const [mode,          setMode]          = useState<BoardMode>('salidas');
  const [selected,      setSelected]      = useState<typeof DESTINATIONS[0]>(DESTINATIONS[0]);
  const [board,         setBoard]         = useState<BoardEntry[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [pickerOpen,    setPickerOpen]    = useState(false);
  const [stationName,   setStationName]   = useState('');
  const loadRef = useRef(0);
  const { isOffline } = useNetwork();

  const hasStationPicker = RT_STATION_COUNTRIES[selected.code] === true;

  // Actualiza el nombre de estación cuando cambia el país
  useEffect(() => {
    setStationName(getStationNameForCountry(selected.code));
  }, [selected.code]);

  const loadBoard = useCallback(async (
    dest: typeof DESTINATIONS[0], m: BoardMode, silent = false,
  ) => {
    const token = ++loadRef.current;
    if (!silent) { setLoading(true); setBoard([]); }
    try {
      const entries = await getCountryBoard(dest.code, m, 40);
      if (token === loadRef.current) setBoard(entries);
    } catch (e) {
      console.warn('[salidas] getCountryBoard error:', e);
      if (token === loadRef.current) setBoard([]);
    }
    finally  { if (token === loadRef.current) setLoading(false); }
  }, []);

  useEffect(() => {
    loadBoard(selected, mode);
    const timer = setInterval(() => loadBoard(selected, mode, true), 60_000);
    return () => clearInterval(timer);
  }, [selected, mode, loadBoard]);

  const handleDestPress = useCallback((dest: typeof DESTINATIONS[0]) => {
    Haptics.selectionAsync();
    setSelected(dest);
  }, []);

  const handleStationSelect = useCallback((id: string, name: string) => {
    setStationForCountry(selected.code, id, name);
    setStationName(name);
    setPickerOpen(false);
    // Recargar el board con la nueva estación
    setTimeout(() => loadBoard(selected, mode), 100);
  }, [selected, mode, loadBoard]);

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

      {/* ── Offline Banner ── */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color="#fff" />
          <Text style={styles.offlineText}>Sin conexión · Mostrando horarios programados</Text>
        </View>
      )}

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title,    { color: colors.text.primary   }]}>Tablero</Text>
          <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
            {isOffline ? 'Horarios programados (offline)' : 'Horarios en tiempo real'}
          </Text>
        </View>
      </View>

      {/* ── Segmented control ── */}
      <View style={[styles.segWrap, { backgroundColor: colors.bg.elevated }]}>
        {TABS.map((t) => {
          const active = mode === t.key;
          return (
            <Pressable
              key={t.key}
              style={[styles.segBtn, active && styles.segBtnActive]}
              onPress={() => { Haptics.selectionAsync(); setMode(t.key); }}
            >
              {active && (
                <>
                  <LinearGradient
                    colors={['rgba(109,40,217,0.55)', 'rgba(167,139,250,1.00)', 'rgba(109,40,217,0.55)']}
                    start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
                    style={[StyleSheet.absoluteFillObject, { borderRadius: Radius.sm }]}
                    pointerEvents="none"
                  />
                  <View style={[StyleSheet.absoluteFillObject, {
                    margin: 1.2, borderRadius: Radius.sm - 1,
                    backgroundColor: colors.bg.card,
                  }]} pointerEvents="none" />
                </>
              )}
              <Ionicons name={t.icon as any} size={15}
                color={active ? colors.brand.primary : colors.text.muted} />
              <Text style={[styles.segText,
                { color: active ? colors.text.primary : colors.text.secondary },
                active && { fontWeight: '700' },
              ]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Selector de país ── */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={styles.destScroll} contentContainerStyle={styles.destContent}
      >
        {DESTINATIONS.map((d) => {
          const active = d.code === selected.code;
          return (
            <Pressable
              key={d.code}
              style={[styles.destChip, {
                backgroundColor: active ? colors.brand.primary + '18' : colors.bg.elevated,
                borderColor: active ? colors.brand.primary : colors.border.subtle,
                borderWidth: active ? 1.5 : 0.5,
              }]}
              onPress={() => handleDestPress(d)}
            >
              <FlagCircle countryCode={d.iso} size="sm" />
              <Text style={[styles.destChipText,
                { color: active ? colors.brand.primary : colors.text.secondary },
                active && { fontWeight: '700' },
              ]}>
                {d.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Selector de estación (solo países con RT) ── */}
      {hasStationPicker && (
        <Pressable
          style={[styles.stationPill, { backgroundColor: colors.bg.elevated, borderColor: colors.border.subtle }]}
          onPress={() => setPickerOpen(true)}
        >
          <Ionicons name="location-outline" size={14} color={colors.brand.primary} />
          <Text style={[styles.stationPillText, { color: colors.text.primary }]} numberOfLines={1}>
            {stationName || getStationNameForCountry(selected.code)}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.text.muted} />
        </Pressable>
      )}

      {/* ── Board header ── */}
      <View style={styles.boardHeader}>
        <Text style={[styles.boardLabel, { color: colors.text.muted }]}>
          {mode === 'salidas' ? 'PRÓXIMAS SALIDAS' : 'PRÓXIMAS LLEGADAS'} · {selected.name.toUpperCase()}
        </Text>
        <Pressable onPress={handleBoardTap} hitSlop={8}>
          <Text style={[styles.boardMore, { color: colors.brand.primary }]}>Ver todo ›</Text>
        </Pressable>
      </View>

      {/* ── Contenido ── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand.primary} />
          <Text style={[styles.loadingText, { color: colors.text.muted }]}>Cargando horarios…</Text>
        </View>
      ) : board.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="train-outline" size={48} color={colors.text.muted} />
          <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>
            Sin horarios disponibles
          </Text>
          <Text style={[styles.emptySub, { color: colors.text.secondary }]}>
            Los datos de {selected.name}{'\n'}se cargan al seleccionar el país.
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
        <ScrollView style={styles.boardScroll} showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}>
          {board.map((entry, i) => <BoardRow key={i} entry={entry} index={i} />)}
        </ScrollView>
      )}

      <BottomTabBar active="salidas" onTranslatePress={() => setTranslator(true)} />
      <TranslatorSheet visible={translator} onClose={() => setTranslator(false)} />

      {/* ── Modal selector de estación ── */}
      <StationPicker
        visible={pickerOpen}
        country={selected.code}
        onSelect={handleStationSelect}
        onClose={() => setPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:   { flex: 1 },

  header: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 14 },
  title:    { fontSize: 30, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { fontSize: 13, marginTop: 3 },

  segWrap: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 16,
    borderRadius: Radius.md, padding: 3,
  },
  segBtn: {
    flex: 1, paddingVertical: 9, alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.sm, flexDirection: 'row', gap: 5, overflow: 'hidden',
  },
  segBtnActive: { borderRadius: Radius.sm },
  segText: { fontSize: 13, fontWeight: '500' },

  destScroll:  { flexGrow: 0, marginBottom: 12 },
  destContent: { paddingHorizontal: 16, gap: 8 },
  destChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: Radius.full,
  },
  destChipText: { fontSize: 13, fontWeight: '500' },

  // Station pill
  stationPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: 16, marginBottom: 12,
    paddingVertical: 9, paddingHorizontal: 14,
    borderRadius: Radius.full, borderWidth: 0.5,
  },
  stationPillText: { flex: 1, fontSize: 13, fontWeight: '500' },

  boardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 22, marginBottom: 10,
  },
  boardLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.7 },
  boardMore:  { fontSize: 12, fontWeight: '600' },

  boardScroll: { flex: 1 },
  boardRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 0.5, gap: 12,
  },
  boardTime:    { fontSize: 22, fontWeight: '700', width: 70, letterSpacing: -0.5 },
  boardInfo:    { flex: 1, gap: 2 },
  boardTrain:   { fontSize: 14, fontWeight: '600' },
  boardStation: { fontSize: 11 },

  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 4, paddingHorizontal: 8, borderRadius: Radius.full,
  },
  statusDot:  { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '600' },

  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, gap: 12,
  },
  loadingText: { fontSize: 13, marginTop: 8 },
  offlineBanner: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              6,
    backgroundColor:  '#FF9F0A',
    paddingVertical:  6,
    paddingHorizontal:16,
  },
  offlineText: { fontSize: 12, color: '#fff', fontWeight: '600' },
  emptyTitle:  { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptySub:    { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  openBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 8, paddingVertical: 12, paddingHorizontal: 20, borderRadius: Radius.full,
  },
  openBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // StationPicker modal
  pickerOverlay: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  pickerSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 34, maxHeight: '75%',
  },
  pickerHandle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center', marginTop: 10, marginBottom: 16,
  },
  pickerTitle: {
    fontSize: 17, fontWeight: '700',
    marginHorizontal: 20, marginBottom: 14,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    borderRadius: Radius.md, borderWidth: 0.5,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15 },
  pickerList:  { maxHeight: 340 },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, paddingHorizontal: 20,
    borderBottomWidth: 0.5,
  },
  pickerItemText: { flex: 1, fontSize: 15 },
  pickerEmpty: { textAlign: 'center', marginTop: 24, fontSize: 14 },
});
