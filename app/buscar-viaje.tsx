/**
 * buscar-viaje — Buscador nativo de viajes
 * Origen y destino ambos editables con autocomplete GTFS.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, Image,
  FlatList, ActivityIndicator, Linking, Platform,
  KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors, Typography, Spacing, Radius, Gradients } from '../theme';
import { t, getLanguage } from '../services/i18n';
import { searchStations, searchTrips, getPopularDestinations, setActiveCountry, detectCountryFromCoords, searchFranceStations, searchFranceJourneys, type TripResult, type FranceJourney } from '../services/gtfsDatabase';
import { buildBestBookingUrl } from '../services/affiliateEngine';
import type { Station, CountryCode } from '../types';

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

function parseHHMM(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
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
  'MD':        { color: '#AEB6C8', label: 'MD' },
  'REGIONAL':  { color: '#AEB6C8', label: 'REG' },
  'REG.EXP.':  { color: '#AEB6C8', label: 'R.EXP' },
  // Internacional / otros países
  'IC':        { color: '#2a7d4f', label: 'IC' },
  'TGV':       { color: '#c00030', label: 'TGV' },
  'RE':        { color: '#AEB6C8', label: 'RE' },
  'GL':        { color: '#8b5e00', label: 'Glacier' },
  'FR':        { color: '#c00030', label: 'Frecciarossa' },
  'ICD':       { color: '#005f9e', label: 'IC Direct' },
  'SPR':       { color: '#AEB6C8', label: 'Sprinter' },
  // Alemania DB
  'ICE':       { color: '#C00', label: 'ICE' },
  'ICE sprinter': { color: '#C00', label: 'ICE-S' },
  'RB':        { color: '#AEB6C8', label: 'RB' },
  'S':         { color: '#006ab3', label: 'S' },
  'FLX':       { color: '#00b251', label: 'FlixTrain' },
};
function trainMeta(name: string) {
  return TRAIN_META[name] ?? { color: '#C4B5FD', label: name.slice(0, 6) };
}

function buildPurchaseUrl(origin: string, dest: string, date: Date, countryCode = 'ES'): string {
  return buildBestBookingUrl(origin, dest, date, countryCode);
}


type ActiveField = 'origin' | 'dest' | null;

export default function BuscarViaje() {
  const router = useRouter();
  const params = useLocalSearchParams<{ originId?: string; originName?: string; country?: string }>();

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
  const [sameCity,      setSameCity]      = useState(false);
  const [popularDests,  setPopularDests]  = useState<{ id: string; name: string; durationMin: number }[]>([]);

  const originRef = useRef<TextInput>(null);
  const destRef   = useRef<TextInput>(null);
  const DAY_LABELS = [t('search_today'), t('search_tomorrow'), t('search_after')];

  // ¿Estamos buscando en Francia con IDs Navitia?
  const isFrance = (id?: string) => id?.startsWith('stop_area:SNCF:') ?? false;
  const [usingNavitia, setUsingNavitia] = useState(false);

  // Pre-llenar origen desde params (GPS) y setear país activo
  useEffect(() => {
    if (params.country) {
      setActiveCountry(params.country as CountryCode).catch(() => {});
      if (params.country === 'FR') setUsingNavitia(true);
    }
    if (params.originId && params.originName) {
      const s = makeStation(params.originId, params.originName);
      setOriginStation(s);
      setOriginQuery(params.originName);
    }
  }, []);

  // Autocomplete — usa Navitia para FR, GTFS para el resto
  const activeQuery = activeField === 'origin' ? originQuery : destQuery;
  useEffect(() => {
    if (!activeField || activeQuery.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        let results: Station[];
        if (usingNavitia) {
          // Francia: buscar via Navitia → IDs stop_area:SNCF:...
          const fr = await searchFranceStations(activeQuery);
          results = fr.map(s => makeStation(s.id, s.name));
        } else {
          results = await searchStations(activeQuery, 12);
          // Si los primeros resultados son IDs Navitia, activar modo Francia
          if (results[0]?.id?.startsWith('stop_area:SNCF:')) setUsingNavitia(true);
        }
        const other = activeField === 'origin' ? destStation : originStation;
        setSuggestions(results.filter(s => s.id !== other?.id));
      } finally { setSearching(false); }
    }, 280);
    return () => clearTimeout(t);
  }, [activeQuery, activeField, usingNavitia]);

  const selectStation = useCallback((station: Station) => {
    Haptics.selectionAsync();
    // Detectar automáticamente si es una estación Navitia Francia
    if (isFrance(station.id)) setUsingNavitia(true);
    if (activeField === 'origin') {
      setOriginStation(station);
      setOriginQuery(station.name);
      setSuggestions([]);
      setActiveField(null);
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

  // Convierte FranceJourney → TripResult para reutilizar el mismo render
  const frJourneyToTripResult = (j: FranceJourney): TripResult => ({
    tripId:        j.tripId,
    operator:      j.category,
    trainNumber:   j.trainNumber || j.category,
    departureTime: parseHHMM(j.departureTime),
    arrivalTime:   parseHHMM(j.arrivalTime),
    durationMin:   j.durationMin,
    origin:        makeStation('fr_orig', j.origin),
    destination:   makeStation('fr_dest', j.destination),
  });

  // {t('search_title')}s — Navitia para FR, GTFS para el resto
  const cityOf = (name: string) => name.split(/[-–( ]/)[0].trim().toLowerCase();

  const doSearch = useCallback(async (dayOff = dayOffset) => {
    if (!originStation || !destStation) return;
    setLoading(true);
    setError(null);
    setTrips([]);
    setSameCity(false);
    try {
      const date = new Date();
      date.setDate(date.getDate() + dayOff);

      if (usingNavitia && isFrance(originStation.id) && isFrance(destStation.id)) {
        // Francia: Navitia real-time con horarios y conexiones reales
        const frJourneys = await searchFranceJourneys(originStation.id, destStation.id, date, 12);
        if (frJourneys.length === 0) setError(t('search_no_trains'));
        setTrips(frJourneys.map(frJourneyToTripResult));
      } else {
        // Resto de países: GTFS local
        const results = await searchTrips(originStation.id, destStation.id, date, 12);
        if (results.length === 0) {
          if (cityOf(originStation.name) === cityOf(destStation.name)) {
            setSameCity(true);
          } else {
            setError(t('search_no_trains'));
          }
        }
        setTrips(results);
      }
    } catch {
      setError(t('search_error'));
    } finally { setLoading(false); }
  }, [originStation, destStation, dayOffset, usingNavitia]);

  useEffect(() => {
    if (originStation && destStation) doSearch();
  }, [destStation, dayOffset]);

  // Cargar destinos populares cuando cambia el origen
  useEffect(() => {
    if (!originStation) { setPopularDests([]); return; }
    getPopularDestinations(originStation.id, 6).then(setPopularDests).catch(() => {});
  }, [originStation?.id]);

  const handleBuy = useCallback((trip: TripResult) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(buildPurchaseUrl(trip.origin.name, trip.destination.name, trip.departureTime, trip.origin.countryCode ?? 'ES'));
  }, []);

  const showSuggestions = activeField !== null && suggestions.length > 0;

  return (
    <View style={styles.rootGradient}>
      <Image source={require('../assets/images/bg-hero.png')} style={[StyleSheet.absoluteFillObject, { top: -280, bottom: 280 }]} resizeMode="cover" fadeDuration={0} />
      <LinearGradient colors={['rgba(10,8,30,0.55)', 'rgba(14,14,46,0.80)', 'rgba(14,14,46,0.93)']} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={Colors.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('search_title')}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Formulario origen / destino */}
        <View style={styles.form}>
          {/* Origen */}
          <View style={styles.stationRow}>
            <View style={styles.dotOrigin} />
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>{t('search_origin')}</Text>
              <TextInput
                ref={originRef}
                style={styles.fieldInput}
                placeholder={t('search_origin_hint')}
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
              <Ionicons name="swap-vertical" size={22} color="#FFFFFF" />
            </Pressable>
          </View>

          {/* Destino */}
          <View style={styles.stationRow}>
            <View style={styles.dotDest} />
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>{t('search_dest')}</Text>
              <TextInput
                ref={destRef}
                style={styles.fieldInput}
                placeholder={t('search_dest_hint')}
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
              {suggestions.map((s, i) => (
                <Pressable
                  key={s.id}
                  style={[styles.dropdownItem, i === 0 && styles.dropdownItemMain]}
                  onPress={() => selectStation(s)}
                >
                  <Ionicons name="train-outline" size={14} color={i === 0 ? '#8B5CF6' : Colors.text.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dropdownText, i === 0 && { color: '#FFFFFF' }]} numberOfLines={1}>{s.name}</Text>
                    {i === 0 && <Text style={styles.dropdownSubText}>{t('main_station_sub')}</Text>}
                  </View>
                  {i === 0
                    ? <View style={styles.dropdownBadge}><Text style={styles.dropdownBadgeText}>{t('main_station')}</Text></View>
                    : <Ionicons name="chevron-forward" size={12} color={Colors.text.muted} />
                  }
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
        <Text style={styles.dayDate}>
          {(() => {
            const d = new Date();
            d.setDate(d.getDate() + dayOffset);
            return d.toLocaleDateString(getLanguage(), { weekday: 'short', day: 'numeric', month: 'short' });
          })()}
        </Text>

        {/* Botón buscar — visible cuando ambos campos están llenos */}
        {originStation && destStation && !loading && (
          <Pressable style={styles.searchBtn} onPress={() => doSearch()}>
            <Ionicons name="search" size={16} color="#fff" />
            <Text style={styles.searchBtnText}>{t('search_btn')}</Text>
          </Pressable>
        )}

        {/* Destinos populares — visible cuando hay origen pero no destino */}
        {originStation && !destStation && !showSuggestions && popularDests.length > 0 && (
          <View style={styles.popularWrap}>
            <Text style={styles.popularTitle}>{t('search_popular_from').replace('{city}', originStation.name.split(/[-–,]/)[0].trim().toUpperCase())}</Text>
            <View style={styles.popularGrid}>
              {popularDests.map((dest) => (
                <Pressable
                  key={dest.id}
                  style={styles.popularChip}
                  onPress={() => {
                    Haptics.selectionAsync();
                    const s = { id: dest.id, name: dest.name, nameLocal: dest.name, coordinates: { latitude: 0, longitude: 0 }, platforms: [] } as unknown as Station;
                    setDestStation(s);
                    setDestQuery(dest.name);
                    setSuggestions([]);
                  }}
                >
                  <Ionicons name="train-outline" size={13} color={Colors.brand.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.popularName} numberOfLines={1}>{dest.name}</Text>
                    <Text style={styles.popularDur}>{fmtDur(dest.durationMin)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={13} color={Colors.text.muted} />
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Resultados */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.brand.primary} />
            <Text style={styles.loadingText}>{t('search_loading')}</Text>
          </View>
        ) : sameCity ? (
          <View style={styles.sameCityBox}>
            <Ionicons name="subway-outline" size={44} color={Colors.brand.primary} style={{ marginBottom: 12 }} />
            <Text style={styles.sameCityTitle}>Trayecto dentro de {originStation?.name.split(/[-–( ]/)[0]}</Text>
            <Text style={styles.sameCitySubtitle}>
              Para moverte dentro de la ciudad usá el metro o transporte urbano.
            </Text>
            <Pressable
              style={styles.sameCityBtn}
              onPress={() => router.push({ pathname: '/split-screen', params: { country: params.country ?? 'ES', mode: 'country' } })}
            >
              <Ionicons name="map-outline" size={16} color="#fff" />
              <Text style={styles.sameCityBtnText}>Ver metro y horarios urbanos</Text>
            </Pressable>
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
                <Text style={styles.listHeaderText}>{t('search_info')}</Text>
              </View>
            }
            renderItem={({ item: trip, index }) => {
              const meta = trainMeta(trip.trainNumber);
              const isFastest = !!(trip as TripResult & { fastest?: boolean }).fastest;
              return (
                <View>
                  <Pressable style={styles.card} onPress={() => handleBuy(trip)} android_ripple={{ color: Colors.brand.primary + '18' }}>

                    {/* Badge tipo tren + etiqueta "Más rápido" */}
                    <View style={styles.cardTopRow}>
                      <View style={[styles.trainBadge, { backgroundColor: meta.color + '22', borderColor: meta.color + '55' }]}>
                        <Text style={[styles.trainBadgeText, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                      <Text style={styles.directoText}>{t('search_no_changes')}</Text>
                      <View style={{ flex: 1 }} />
                      {isFastest && (
                        <View style={styles.fastBadge}>
                          <Text style={styles.fastBadgeText}>{t('search_fastest')}</Text>
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

                    {/* Precio real en el checkout del partner + botón comprar */}
                    <View style={styles.buyRow}>
                      <View style={{ flexShrink: 1 }}>
                        <Text style={styles.buyHint}>{t('search_price_hint')}</Text>
                      </View>
                      <View style={styles.buyBtn}>
                        <Ionicons name="cart-outline" size={13} color="#fff" />
                        <Text style={styles.buyBtnText}>{t('search_buy')}</Text>
                      </View>
                    </View>

                  </Pressable>
                </View>
              );
            }}
          />
        ) : !originStation || !destStation ? (
          <View style={styles.center}>
            <Ionicons name="search-outline" size={40} color={Colors.text.muted} />
            <Text style={styles.hintText}>
              {!originStation ? t('search_write_origin') : t('search_write_dest')}
            </Text>
          </View>
        ) : null}

      </KeyboardAvoidingView>
    </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  rootGradient: { flex: 1 },
  root: { flex: 1, backgroundColor: 'transparent' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'],
    paddingTop: Spacing['4'],
    paddingBottom: Spacing['3'],
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerTitle: { fontSize: Typography.size.md, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },

  form: {
    margin: Spacing['4'],
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: Radius.xl,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    padding: Spacing['3'],
  },
  stationRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], paddingVertical: 4 },
  dotOrigin: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.brand.primary, marginLeft: 3 },
  dotDest:   { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.status.danger,  marginLeft: 3 },
  fieldWrap: { flex: 1 },
  fieldLabel: { fontSize: 8, fontWeight: Typography.weight.bold, color: '#FFFFFF', letterSpacing: 1.5, marginBottom: 2 },
  fieldInput: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: '#FFFFFF', padding: 0 },
  midRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 3, gap: Spacing['3'], marginVertical: 2 },
  routeLine: { width: 2, height: 18, backgroundColor: Colors.border.default },
  swapBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.brand.primary,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.brand.primary, shadowOpacity: 0.55, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 5,
  },

  dropdown: {
    marginHorizontal: Spacing['4'],
    marginTop: -Spacing['2'],
    backgroundColor: '#1A1050',
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
    zIndex: 100,
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing['2'],
    paddingVertical: Spacing['3'], paddingHorizontal: Spacing['3'],
    borderBottomWidth: 1, borderBottomColor: Colors.border.subtle,
  },
  dropdownItemMain: { backgroundColor: 'rgba(139,92,246,0.08)' },
  dropdownText: { fontSize: Typography.size.sm, color: '#FFFFFF', flex: 1 },
  dropdownSubText: { fontSize: 11, color: 'rgba(167,139,250,0.70)', marginTop: 1 },
  dropdownBadge: {
    backgroundColor: 'rgba(139,92,246,0.20)', borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.40)',
  },
  dropdownBadgeText: { fontSize: 10, fontWeight: '700', color: '#C4B5FD' },

  dayRow: { flexDirection: 'row', gap: Spacing['2'], paddingHorizontal: Spacing['4'], marginBottom: Spacing['2'] },
  dayBtn: {
    flex: 1, paddingVertical: 9, alignItems: 'center',
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  dayBtnActive: { backgroundColor: '#7C3AED', borderColor: '#8B5CF6' },
  dayBtnText: { fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, color: 'rgba(255,255,255,0.65)' },
  dayBtnTextActive: { color: '#FFFFFF', fontWeight: Typography.weight.bold },
  dayDate: {
    textAlign: 'center', textTransform: 'capitalize',
    fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.55)',
    marginTop: Spacing['1'], marginBottom: Spacing['2'],
  },

  searchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing['2'],
    backgroundColor: '#8B5CF6',
    borderRadius: Radius.xl, paddingVertical: 15,
    marginHorizontal: Spacing['4'], marginBottom: Spacing['3'],
    shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.40, shadowRadius: 16, elevation: 8,
  },
  searchBtnText: { fontSize: Typography.size.base, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },

  list: { paddingHorizontal: Spacing['4'], paddingBottom: Spacing['8'], paddingTop: Spacing['2'], gap: Spacing['3'] },
  listHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 5,
    marginBottom: Spacing['2'], paddingHorizontal: 2,
  },
  listHeaderText: { fontSize: 11, color: '#FFFFFF', flex: 1, lineHeight: 16 },

  card: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: Radius.xl,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)',
    padding: Spacing['4'], gap: Spacing['3'],
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 24,
  },

  // Fila top: badge tren + directo + más rápido
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] },
  trainBadge: {
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 5, borderWidth: 1,
  },
  trainBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  directoText: { fontSize: Typography.size.xs, color: '#FFFFFF', flex: 1 },
  fastBadge: {
    backgroundColor: Colors.brand.primary + '22',
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  fastBadgeText: { fontSize: 8, fontWeight: '800', color: Colors.brand.glow, letterSpacing: 0.8 },

  // Horarios
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeBlock: { flex: 1 },
  timeVal: { fontSize: 28, fontWeight: '900', color: '#FFFFFF', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  timeLabel: { fontSize: 11, color: '#FFFFFF', marginTop: 2, fontWeight: '300' },

  // Duración central
  durationBlock: { alignItems: 'center', paddingHorizontal: Spacing['2'], gap: 4 },
  durationVal: { fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, color: '#FFFFFF' },
  durationLine: { flexDirection: 'row', alignItems: 'center', gap: 3, width: 70 },
  durationLineInner: { flex: 1, height: 1, backgroundColor: Colors.border.default },
  durationDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.border.default },

  // Fila comprar
  buyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: Colors.border.subtle,
    paddingTop: Spacing['3'], marginTop: -Spacing['1'],
  },
  priceEstimate: { fontSize: 22, fontWeight: '900', color: '#C4B5FD', letterSpacing: -0.5 },
  buyHint: { fontSize: Typography.size.xs, color: '#FFFFFF', fontWeight: '300' },

  popularWrap: { paddingHorizontal: Spacing['4'], marginBottom: Spacing['2'] },
  popularTitle: { fontSize: 10, fontWeight: '700', color: '#FFFFFF', letterSpacing: 1.2, marginBottom: Spacing['2'] },
  popularGrid: { gap: Spacing['2'] },
  popularChip: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing['2'],
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)',
    paddingVertical: 12, paddingHorizontal: Spacing['3'],
  },
  popularName: { fontSize: Typography.size.sm, fontWeight: '600', color: '#FFFFFF' },
  popularDur:  { fontSize: 11, color: '#FFFFFF', marginTop: 1 },
  buyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.brand.primary, borderRadius: Radius.md,
    paddingVertical: 7, paddingHorizontal: 12,
  },
  buyBtnText: { fontSize: Typography.size.xs, fontWeight: Typography.weight.bold, color: '#fff' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing['3'], padding: Spacing['8'] },
  loadingText: { fontSize: Typography.size.sm, color: '#FFFFFF' },
  errorText: { fontSize: Typography.size.sm, color: '#FFFFFF', textAlign: 'center', lineHeight: 20 },
  hintText: { fontSize: Typography.size.sm, color: '#FFFFFF', textAlign: 'center' },

  // Panel misma ciudad
  sameCityBox: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: Spacing['8'], gap: Spacing['3'],
  },
  sameCityTitle: {
    fontSize: 17, fontWeight: '700', color: '#FFFFFF',
    textAlign: 'center',
  },
  sameCitySubtitle: {
    fontSize: 13, color: '#FFFFFF',
    textAlign: 'center', lineHeight: 20,
  },
  sameCityBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 8, backgroundColor: Colors.brand.primary,
    borderRadius: Radius.full, paddingVertical: 13, paddingHorizontal: 24,
  },
  sameCityBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
