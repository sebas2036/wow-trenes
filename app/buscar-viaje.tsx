/**
 * buscar-viaje — Buscador nativo de viajes
 * Origen y destino ambos editables con autocomplete GTFS.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput,
  FlatList, ActivityIndicator, Linking, Platform,
  KeyboardAvoidingView, SafeAreaView, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Colors, Typography, Spacing, Radius } from '../theme';
import { searchStations, searchTrips, type TripResult } from '../services/gtfsDatabase';
import { buildBestBookingUrl } from '../services/affiliateEngine';
import type { Station } from '../types';

function fmt(d: Date) {
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function fmtDur(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m > 0 ? ` ${m}m` : ''}`.trim() : `${m} min`;
}
function makeStation(id: string, name: string): Station {
  return { id, name, nameLocal: name, coordinates: { latitude: 0, longitude: 0 }, platforms: [] } as unknown as Station;
}

// Color y etiqueta por tipo de tren
const TRAIN_META: Record<string, { color: string; label: string }> = {
  'AVE':       { color: '#C00', label: 'AVE' },
  'AVE INT':   { color: '#C00', label: 'AVE INT' },
  'AVLO':      { color: '#e63946', label: 'AVLO' },
  'AVANT':     { color: '#e07000', label: 'AVANT' },
  'AVANT EXP': { color: '#e07000', label: 'AVANT EXP' },
  'ALVIA':     { color: '#005f9e', label: 'ALVIA' },
  'EUROMED':   { color: '#6d4c9e', label: 'EUROMED' },
  'Intercity': { color: '#2a7d4f', label: 'IC' },
  'MD':        { color: '#555', label: 'MD' },
  'REGIONAL':  { color: '#555', label: 'REG' },
  'REG.EXP.':  { color: '#555', label: 'R.EXP' },
  // Internacional / otros países
  'IC':        { color: '#2a7d4f', label: 'IC' },
  'TGV':       { color: '#c00030', label: 'TGV' },
  'RE':        { color: '#666', label: 'RE' },
  'GL':        { color: '#8b5e00', label: 'Glacier' },
  'FR':        { color: '#c00030', label: 'Frecciarossa' },
  'ICD':       { color: '#005f9e', label: 'IC Direct' },
  'SPR':       { color: '#555', label: 'Sprinter' },
  // Alemania DB
  'ICE':       { color: '#C00', label: 'ICE' },
  'ICE sprinter': { color: '#C00', label: 'ICE-S' },
  'RB':        { color: '#777', label: 'RB' },
  'S':         { color: '#006ab3', label: 'S' },
  'FLX':       { color: '#00b251', label: 'FlixTrain' },
};
function trainMeta(name: string) {
  return TRAIN_META[name] ?? { color: '#555', label: name.slice(0, 6) };
}

function buildPurchaseUrl(origin: string, dest: string, date: Date, countryCode = 'ES'): string {
  return buildBestBookingUrl(origin, dest, date, countryCode);
}

type ActiveField = 'origin' | 'dest' | null;

export default function BuscarViaje() {
  const router = useRouter();
  const params = useLocalSearchParams<{ originId?: string; originName?: string }>();

  const [originStation, setOriginStation] = useState<Station | null>(null);
  const [destStation,   setDestStation]   = useState<Station | null>(null);
  const [originQuery,   setOriginQuery]   = useState('');
  const [destQuery,     setDestQuery]     = useState('');
  const [suggestions,   setSuggestions]   = useState<Station[]>([]);
  const [activeField,   setActiveField]   = useState<ActiveField>(null);
  const [searching,     setSearching]     = useState(false);
  const [dayOffset,     setDayOffset]     = useState(0);
  const [trips,         setTrips]         = useState<TripResult[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  const originRef = useRef<TextInput>(null);
  const destRef   = useRef<TextInput>(null);
  const DAY_LABELS = ['Hoy', 'Mañana', 'Pasado'];

  // Pre-llenar origen desde params (GPS)
  useEffect(() => {
    if (params.originId && params.originName) {
      const s = makeStation(params.originId, params.originName);
      setOriginStation(s);
      setOriginQuery(params.originName);
    }
  }, []);

  // Autocomplete — campo activo
  const activeQuery = activeField === 'origin' ? originQuery : destQuery;
  useEffect(() => {
    if (!activeField || activeQuery.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchStations(activeQuery, 12);
        // Filtrar la otra estación ya elegida
        const other = activeField === 'origin' ? destStation : originStation;
        setSuggestions(results.filter(s => s.id !== other?.id));
      } finally { setSearching(false); }
    }, 280);
    return () => clearTimeout(t);
  }, [activeQuery, activeField]);

  const selectStation = useCallback((station: Station) => {
    Haptics.selectionAsync();
    if (activeField === 'origin') {
      setOriginStation(station);
      setOriginQuery(station.name);
      setSuggestions([]);
      setActiveField(null);
      // Saltar al destino si está vacío
      if (!destStation) setTimeout(() => destRef.current?.focus(), 100);
    } else {
      setDestStation(station);
      setDestQuery(station.name);
      setSuggestions([]);
      setActiveField(null);
      destRef.current?.blur();
    }
    setTrips([]);
    setError(null);
  }, [activeField, destStation]);

  const swap = useCallback(() => {
    Haptics.selectionAsync();
    const tmpS = originStation;
    const tmpQ = originQuery;
    setOriginStation(destStation);
    setOriginQuery(destQuery);
    setDestStation(tmpS);
    setDestQuery(tmpQ);
    setTrips([]);
    setError(null);
  }, [originStation, destStation, originQuery, destQuery]);

  // Buscar viajes
  const doSearch = useCallback(async (dayOff = dayOffset) => {
    if (!originStation || !destStation) return;
    setLoading(true);
    setError(null);
    setTrips([]);
    try {
      const date = new Date();
      date.setDate(date.getDate() + dayOff);
      const results = await searchTrips(originStation.id, destStation.id, date, 12);
      if (results.length === 0) setError('No se encontraron trenes para esta ruta.');
      setTrips(results);
    } catch {
      setError('Error al consultar los horarios.');
    } finally { setLoading(false); }
  }, [originStation, destStation, dayOffset]);

  useEffect(() => {
    if (originStation && destStation) doSearch();
  }, [destStation, dayOffset]);

  const handleBuy = useCallback((trip: TripResult) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(buildPurchaseUrl(trip.origin.name, trip.destination.name, trip.departureTime, trip.origin.countryCode ?? 'ES'));
  }, []);

  const showSuggestions = activeField !== null && suggestions.length > 0;

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={Colors.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>Buscar viaje</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Formulario origen / destino */}
        <View style={styles.form}>
          {/* Origen */}
          <View style={styles.stationRow}>
            <View style={styles.dotOrigin} />
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>ORIGEN</Text>
              <TextInput
                ref={originRef}
                style={styles.fieldInput}
                placeholder="Ciudad o estación de salida"
                placeholderTextColor={Colors.text.muted}
                value={originQuery}
                onChangeText={t => { setOriginQuery(t); setOriginStation(null); setTrips([]); }}
                onFocus={() => setActiveField('origin')}
                onBlur={() => setTimeout(() => { if (activeField === 'origin') setActiveField(null); }, 150)}
                autoCorrect={false}
              />
            </View>
            {activeField === 'origin' && searching && (
              <ActivityIndicator size="small" color={Colors.brand.primary} />
            )}
          </View>

          {/* Línea + swap */}
          <View style={styles.midRow}>
            <View style={styles.routeLine} />
            <Pressable style={styles.swapBtn} onPress={swap}>
              <Ionicons name="swap-vertical" size={16} color={Colors.brand.glow} />
            </Pressable>
          </View>

          {/* Destino */}
          <View style={styles.stationRow}>
            <View style={styles.dotDest} />
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>DESTINO</Text>
              <TextInput
                ref={destRef}
                style={styles.fieldInput}
                placeholder="Ciudad o estación de llegada"
                placeholderTextColor={Colors.text.muted}
                value={destQuery}
                onChangeText={t => { setDestQuery(t); setDestStation(null); setTrips([]); }}
                onFocus={() => setActiveField('dest')}
                onBlur={() => setTimeout(() => { if (activeField === 'dest') setActiveField(null); }, 150)}
                autoCorrect={false}
              />
            </View>
            {activeField === 'dest' && searching && (
              <ActivityIndicator size="small" color={Colors.brand.primary} />
            )}
          </View>
        </View>

        {/* Autocomplete dropdown */}
        {showSuggestions && (
          <View style={styles.dropdown}>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 220 }}>
              {suggestions.map(s => (
                <Pressable key={s.id} style={styles.dropdownItem} onPress={() => selectStation(s)}>
                  <Ionicons name="train-outline" size={14} color={Colors.text.muted} />
                  <Text style={styles.dropdownText} numberOfLines={1}>{s.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Selector de día */}
        <View style={styles.dayRow}>
          {DAY_LABELS.map((label, i) => (
            <Pressable
              key={i}
              style={[styles.dayBtn, dayOffset === i && styles.dayBtnActive]}
              onPress={() => { setDayOffset(i); if (originStation && destStation) doSearch(i); }}
            >
              <Text style={[styles.dayBtnText, dayOffset === i && styles.dayBtnTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Botón buscar — visible cuando ambos campos están llenos */}
        {originStation && destStation && !loading && (
          <Pressable style={styles.searchBtn} onPress={() => doSearch()}>
            <Ionicons name="search" size={16} color="#fff" />
            <Text style={styles.searchBtnText}>Buscar trenes</Text>
          </Pressable>
        )}

        {/* Resultados */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.brand.primary} />
            <Text style={styles.loadingText}>Buscando trenes…</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Ionicons name="train-outline" size={40} color={Colors.text.muted} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : trips.length > 0 ? (
          <FlatList
            data={trips}
            keyExtractor={t => t.tripId}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View style={styles.listHeader}>
                <Ionicons name="information-circle-outline" size={13} color={Colors.text.muted} />
                <Text style={styles.listHeaderText}>Horarios Renfe · Toca para ver precios y comprar también con OUIGO, Iryo y más</Text>
              </View>
            }
            renderItem={({ item: trip, index }) => {
              const meta = trainMeta(trip.trainNumber);
              const isFastest = !!(trip as TripResult & { fastest?: boolean }).fastest;
              return (
                <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
                  <Pressable style={styles.card} onPress={() => handleBuy(trip)} android_ripple={{ color: Colors.brand.primary + '18' }}>

                    {/* Badge tipo tren + etiqueta "Más rápido" */}
                    <View style={styles.cardTopRow}>
                      <View style={[styles.trainBadge, { backgroundColor: meta.color + '22', borderColor: meta.color + '55' }]}>
                        <Text style={[styles.trainBadgeText, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                      <Text style={styles.directoText}>Sin cambios</Text>
                      <View style={{ flex: 1 }} />
                      {isFastest && (
                        <View style={styles.fastBadge}>
                          <Text style={styles.fastBadgeText}>MÁS RÁPIDO</Text>
                        </View>
                      )}
                    </View>

                    {/* Horarios */}
                    <View style={styles.timeRow}>
                      <View style={styles.timeBlock}>
                        <Text style={styles.timeVal}>{fmt(trip.departureTime)}</Text>
                        <Text style={styles.timeLabel} numberOfLines={1}>{trip.origin.name}</Text>
                      </View>

                      <View style={styles.durationBlock}>
                        <Text style={styles.durationVal}>{fmtDur(trip.durationMin)}</Text>
                        <View style={styles.durationLine}>
                          <View style={styles.durationDot} />
                          <View style={styles.durationLineInner} />
                          <View style={styles.durationDot} />
                        </View>
                      </View>

                      <View style={[styles.timeBlock, { alignItems: 'flex-end' }]}>
                        <Text style={styles.timeVal}>{fmt(trip.arrivalTime)}</Text>
                        <Text style={[styles.timeLabel, { textAlign: 'right' }]} numberOfLines={1}>{trip.destination.name}</Text>
                      </View>
                    </View>

                    {/* Botón comprar */}
                    <View style={styles.buyRow}>
                      <Text style={styles.buyHint}>Ver precios y comprar</Text>
                      <View style={styles.buyBtn}>
                        <Ionicons name="open-outline" size={13} color="#fff" />
                        <Text style={styles.buyBtnText}>Trainline</Text>
                      </View>
                    </View>

                  </Pressable>
                </Animated.View>
              );
            }}
          />
        ) : !originStation || !destStation ? (
          <View style={styles.center}>
            <Ionicons name="search-outline" size={40} color={Colors.text.muted} />
            <Text style={styles.hintText}>
              {!originStation ? 'Escribí la estación de origen' : 'Escribí la estación de destino'}
            </Text>
          </View>
        ) : null}

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg.base },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'], paddingVertical: Spacing['3'],
    borderBottomWidth: 1, borderBottomColor: Colors.border.subtle,
  },
  backBtn: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.full, backgroundColor: Colors.bg.elevated,
  },
  headerTitle: { fontSize: Typography.size.base, fontWeight: Typography.weight.bold, color: Colors.text.primary },

  form: {
    margin: Spacing['4'],
    backgroundColor: Colors.bg.elevated,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border.subtle,
    padding: Spacing['3'],
  },
  stationRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], paddingVertical: 4 },
  dotOrigin: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.brand.primary, marginLeft: 3 },
  dotDest:   { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.status.danger,  marginLeft: 3 },
  fieldWrap: { flex: 1 },
  fieldLabel: { fontSize: 8, fontWeight: Typography.weight.bold, color: Colors.text.muted, letterSpacing: 1.5, marginBottom: 2 },
  fieldInput: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: Colors.text.primary, padding: 0 },
  midRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 3, gap: Spacing['3'], marginVertical: 2 },
  routeLine: { width: 2, height: 18, backgroundColor: Colors.border.default },
  swapBtn: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.brand.primary + '22',
    borderWidth: 1, borderColor: Colors.brand.primary + '55',
    alignItems: 'center', justifyContent: 'center',
  },

  dropdown: {
    marginHorizontal: Spacing['4'],
    marginTop: -Spacing['2'],
    backgroundColor: Colors.bg.surface,
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border.subtle,
    overflow: 'hidden',
    zIndex: 100,
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing['2'],
    paddingVertical: Spacing['3'], paddingHorizontal: Spacing['3'],
    borderBottomWidth: 1, borderBottomColor: Colors.border.subtle,
  },
  dropdownText: { fontSize: Typography.size.sm, color: Colors.text.primary, flex: 1 },

  dayRow: { flexDirection: 'row', gap: Spacing['2'], paddingHorizontal: Spacing['4'], marginBottom: Spacing['2'] },
  dayBtn: {
    flex: 1, paddingVertical: 8, alignItems: 'center',
    borderRadius: Radius.md, backgroundColor: Colors.bg.elevated,
    borderWidth: 1, borderColor: Colors.border.subtle,
  },
  dayBtnActive: { backgroundColor: Colors.brand.primary + '22', borderColor: Colors.brand.primary },
  dayBtnText: { fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, color: Colors.text.secondary },
  dayBtnTextActive: { color: Colors.brand.glow },

  searchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing['2'],
    backgroundColor: Colors.brand.primary,
    borderRadius: Radius.md, paddingVertical: 13,
    marginHorizontal: Spacing['4'], marginBottom: Spacing['3'],
  },
  searchBtnText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.bold, color: '#fff' },

  list: { paddingHorizontal: Spacing['4'], paddingBottom: Spacing['8'], paddingTop: Spacing['2'], gap: Spacing['3'] },
  listHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 5,
    marginBottom: Spacing['2'], paddingHorizontal: 2,
  },
  listHeaderText: { fontSize: 11, color: Colors.text.muted, flex: 1, lineHeight: 16 },

  card: {
    backgroundColor: Colors.bg.elevated, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border.subtle,
    padding: Spacing['4'], gap: Spacing['3'],
    overflow: 'hidden',
  },

  // Fila top: badge tren + directo + más rápido
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] },
  trainBadge: {
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 5, borderWidth: 1,
  },
  trainBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  directoText: { fontSize: Typography.size.xs, color: Colors.text.muted, flex: 1 },
  fastBadge: {
    backgroundColor: Colors.brand.primary + '22',
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  fastBadgeText: { fontSize: 8, fontWeight: '800', color: Colors.brand.glow, letterSpacing: 0.8 },

  // Horarios
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeBlock: { flex: 1 },
  timeVal: { fontSize: 24, fontWeight: '800', color: Colors.text.primary, fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  timeLabel: { fontSize: 11, color: Colors.text.muted, marginTop: 2 },

  // Duración central
  durationBlock: { alignItems: 'center', paddingHorizontal: Spacing['2'], gap: 4 },
  durationVal: { fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, color: Colors.text.secondary },
  durationLine: { flexDirection: 'row', alignItems: 'center', gap: 3, width: 70 },
  durationLineInner: { flex: 1, height: 1, backgroundColor: Colors.border.default },
  durationDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.border.default },

  // Fila comprar
  buyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: Colors.border.subtle,
    paddingTop: Spacing['3'], marginTop: -Spacing['1'],
  },
  buyHint: { fontSize: Typography.size.xs, color: Colors.text.muted },
  buyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.brand.primary, borderRadius: Radius.md,
    paddingVertical: 7, paddingHorizontal: 12,
  },
  buyBtnText: { fontSize: Typography.size.xs, fontWeight: Typography.weight.bold, color: '#fff' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing['3'], padding: Spacing['8'] },
  loadingText: { fontSize: Typography.size.sm, color: Colors.text.secondary },
  errorText: { fontSize: Typography.size.sm, color: Colors.text.secondary, textAlign: 'center', lineHeight: 20 },
  hintText: { fontSize: Typography.size.sm, color: Colors.text.muted, textAlign: 'center' },
});
