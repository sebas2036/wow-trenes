/**
 * WoW TRENES — Tablero (Asistente de viaje personal)
 * GPS automático → detecta país y estación → carga horarios sin acción del usuario.
 * Si GPS no cubre la zona, selector manual de país/estación.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  ActivityIndicator, Modal, TextInput, FlatList,
  KeyboardAvoidingView, Platform, Linking, InteractionManager,
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
  setActiveTmbStop, getActiveTmbStopName, searchTmbStops,
  setActiveMadridStop, getActiveMadridStopName, searchMadridStops,
  setActiveGermanyStation, getActiveGermanyStationName, searchGermanyStations, type GermanyStation,
  detectCountryFromCoords, findNearestStation, searchStations,
} from '../services/gtfsDatabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t } from '../services/i18n';
import { buildBestBookingUrl } from '../services/affiliateEngine';
import { useLocation } from '../hooks/useLocation';
import * as Location from 'expo-location';
import BottomTabBar from '../components/BottomTabBar';
import TranslatorSheet from '../components/TranslatorSheet';
import FlagCircle from '../components/FlagCircle';
import { useNetwork } from '../hooks/useNetwork';
import { isDbReady, downloadDb } from '../services/dbDownloadService';
import type { CountryCode } from '../types';

// Países que usan descarga lazy (DBs grandes, no en bundle)
const LAZY_COUNTRIES = new Set<CountryCode>(['FR', 'BE', 'AT']);

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
];

// Países con selector de estación real-time
const RT_STATION_COUNTRIES: Partial<Record<CountryCode, true>> = {
  ES: true, CH: true, IT: true, BE: true, FR: true, AT: true, PT: true, NL: true, ES_BCN: true, ES_MAD: true, DE: true,
};

type BoardMode = 'salidas' | 'arribos';

// ── Helpers de estación por país ──────────────────────────────────────────────
async function searchForCountry(code: CountryCode, query: string): Promise<{ id: string; name: string }[]> {
  if (!query.trim()) return [];
  let results: { id: string; name: string }[] = [];
  try {
    switch (code) {
      case 'CH':     results = (await searchSwissStations(query)).map(s => ({ id: s.id,     name: s.name })); break;
      case 'IT':     results = (await searchItalyStations(query)).map(s => ({ id: s.id,     name: s.name })); break;
      case 'BE':     results = (await searchBelgiumStations(query)).map(s => ({ id: s.id,   name: s.name })); break;
      case 'FR':     results = (await searchFranceStations(query)).map(s => ({ id: s.id,    name: s.name })); break;
      case 'AT':     results = (await searchAustriaStations(query)).map(s => ({ id: s.extId, name: s.name })); break;
      case 'PT':     results = (await searchPortugalStations(query)).map(s => ({ id: s.code, name: s.name })); break;
      case 'ES_BCN': results = searchTmbStops(query); break;
      case 'ES_MAD': results = await searchMadridStops(query); break;
      case 'DE':     results = (await searchGermanyStations(query)).map(s => ({ id: s.locationId, name: s.name })); break;
    }
  } catch { /* fallback abajo */ }
  // Fallback a GTFS local si la API no devolvió nada
  if (results.length === 0) {
    const gtfs = await searchStations(query, 10, code);
    results = gtfs.map(s => ({ id: s.id, name: s.name }));
  }
  return results;
}

function setStationForCountry(code: CountryCode, id: string, name: string): void {
  switch (code) {
    case 'CH':     setActiveSwissStation(id, name); break;
    case 'IT':     setActiveItalyStation({ id, name }); break;
    case 'BE':     setActiveBelgiumStation({ id, name, standardname: name }); break;
    case 'FR':     setActiveFranceStation({ id, name }); break;
    case 'AT':     setActiveAustriaStation({ extId: id, name }); break;
    case 'PT':     setActivePortugalStation({ code: id, name }); break;
    case 'ES_BCN': setActiveTmbStop(id, name); break;
    case 'ES_MAD': setActiveMadridStop(id, name); break;
    case 'DE':     setActiveGermanyStation({ locationId: id, name, evaNr: '' }); break;
  }
}

function getStationNameForCountry(code: CountryCode): string {
  switch (code) {
    case 'CH':     return getActiveSwissStationName();
    case 'IT':     return getActiveItalyStationName();
    case 'BE':     return getActiveBelgiumStationName();
    case 'FR':     return getActiveFranceStationName();
    case 'AT':     return getActiveAustriaStationName();
    case 'PT':     return getActivePortugalStationName();
    case 'ES_BCN': return getActiveTmbStopName();
    case 'ES_MAD': return getActiveMadridStopName();
    case 'DE':     return getActiveGermanyStationName();
    default:       return '';
  }
}

// ── Obtener info de país por code ─────────────────────────────────────────────
function getDestByCode(code: CountryCode): typeof DESTINATIONS[0] | undefined {
  return DESTINATIONS.find(d => d.code === code);
}

// ── BoardRow ──────────────────────────────────────────────────────────────────
function BoardRow({
  entry,
  index,
  originName,
  countryCode,
}: {
  entry: BoardEntry;
  index: number;
  originName: string;
  countryCode: string;
}) {
  const { colors } = useTheme();

  const handleBuy = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const dest = entry.endpoint !== '—' ? entry.endpoint : entry.train;
    const url = buildBestBookingUrl(originName, dest, new Date(), countryCode);
    Linking.openURL(url).catch(() => {});
  }, [originName, entry, countryCode]);

  return (
    <View style={[
      styles.boardRow,
      { backgroundColor: colors.bg.card, borderBottomColor: colors.border.default },
    ]}>
      <View style={{ alignItems: 'center' }}>
        <Text style={[styles.boardTime, { color: '#ffffff' }]} numberOfLines={1}>
          {entry.time}
        </Text>
        {entry.isTomorrow && (
          <Text style={{ fontSize: 9, fontWeight: '700', color: '#F59E0B', letterSpacing: 0.5 }}>
            MAÑANA
          </Text>
        )}
      </View>
      <View style={styles.boardInfo}>
        <Text style={[styles.boardTrain, { color: colors.text.primary }]} numberOfLines={1}>
          {(entry.endpoint !== '—' ? entry.endpoint : entry.train)
            .toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
        </Text>
        <Text style={[styles.boardStation, { color: colors.text.muted }]} numberOfLines={1}>
          {entry.train !== '—' ? entry.train + ' · ' : ''}{entry.station}
          {entry.platform ? `  ·  Andén ${entry.platform}` : ''}
        </Text>
      </View>
      <View style={[styles.statusPill, {
        backgroundColor: entry.status === 'cancelled' ? '#FF453A20'
          : entry.status === 'delayed' ? '#FF9F0A15' : '#22c55e15',
      }]}>
        <View style={[styles.statusDot, {
          backgroundColor: entry.status === 'cancelled' ? '#FF453A'
            : entry.status === 'delayed' ? '#FF9F0A' : '#4ade80',
        }]} />
        <Text style={[styles.statusText, {
          color: entry.status === 'cancelled' ? '#FF453A'
            : entry.status === 'delayed' ? '#FF9F0A' : '#4ade80',
        }]}>
          {entry.status === 'cancelled' ? 'Cancelado'
            : entry.delay ? entry.delay
            : 'En horario'}
        </Text>
      </View>
      {/* Botón Comprar */}
      <Pressable
        style={styles.buyBtn}
        onPress={handleBuy}
        hitSlop={6}
      >
        <Text style={styles.buyBtnText}>Comprar</Text>
      </Pressable>
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
            {t('board_change_station')}
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
  const { locationState, requestLocation } = useLocation();
  const [translator,      setTranslator]      = useState(false);
  const [mode,            setMode]            = useState<BoardMode>('salidas');
  const [selected,        setSelected]        = useState<typeof DESTINATIONS[0]>(DESTINATIONS[0]);
  const [board,           setBoard]           = useState<BoardEntry[]>([]);
  const [loading,         setLoading]         = useState(false);
  const [pickerOpen,      setPickerOpen]      = useState(false);
  const [stationName,     setStationName]     = useState('');
  const [currentStationId, setCurrentStationId] = useState<string | undefined>(undefined);
  // GPS: null = no intentado; 'loading' = buscando; 'found' | 'notfound'
  const [gpsStatus,       setGpsStatus]       = useState<'idle' | 'loading' | 'found' | 'notfound'>('idle');
  const [gpsStationName,  setGpsStationName]  = useState<string>('');
  const [gpsDetected,     setGpsDetected]     = useState(false);
  const [dbDownloading,   setDbDownloading]   = useState(false);
  const loadRef = useRef(0);
  const didAutoGps = useRef(false);
  const { isOffline } = useNetwork();

  const hasStationPicker = RT_STATION_COUNTRIES[selected.code] === true;

  // ── Auto GPS al montar ────────────────────────────────────────────────────
  useEffect(() => {
    if (didAutoGps.current) return;
    didAutoGps.current = true;

    (async () => {
      setGpsStatus('loading');
      // Timeout global — nunca queda colgado más de 12 segundos
      const safetyTimer = setTimeout(() => setGpsStatus('notfound'), 12000);
      try {
        // Usar GPS real del dispositivo (evita DEV_LOCATION hardcodeado en useLocation)
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { setGpsStatus('notfound'); return; }
        let loc = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<null>(r => setTimeout(() => r(null), 8000)),
        ]);
        if (!loc) loc = await Location.getLastKnownPositionAsync() ?? null;
        if (!loc) { setGpsStatus('notfound'); return; }
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        if (!coords) {
          setGpsStatus('notfound');
          return;
        }
        const countryCode = detectCountryFromCoords(coords);
        if (!countryCode) {
          setGpsStatus('notfound');
          return;
        }
        const dest = getDestByCode(countryCode);
        if (!dest) {
          setGpsStatus('notfound');
          return;
        }
        // Buscar estación más cercana en GTFS
        const station = await findNearestStation(coords);
        if (station) {
          setGpsStationName(station.name);
          setCurrentStationId(station.id);
          if (RT_STATION_COUNTRIES[countryCode]) {
            // Para países con API real-time, buscar el ID correcto del API por nombre
            // (el ID de GTFS no coincide con el formato del API real-time)
            try {
              const rtResults = await searchForCountry(countryCode, station.name);
              const rtStation = rtResults[0];
              if (rtStation) {
                setStationForCountry(countryCode, rtStation.id, rtStation.name);
                setGpsStationName(rtStation.name);
              } else {
                setStationForCountry(countryCode, station.id, station.name);
              }
            } catch {
              setStationForCountry(countryCode, station.id, station.name);
            }
          }
        }
        setSelected(dest);
        setStationName(station?.name ?? getStationNameForCountry(countryCode));
        setGpsDetected(true);
        setGpsStatus('found');
      } catch {
        setGpsStatus('notfound');
      } finally {
        clearTimeout(safetyTimer);
      }
    })();
  }, [requestLocation]);

  // Actualiza el nombre de estación cuando cambia el país
  useEffect(() => {
    if (!gpsDetected) {
      setStationName(getStationNameForCountry(selected.code));
    }
  }, [selected.code, gpsDetected]);

  // Parsea "HH:MM" y devuelve minutos desde medianoche
  const timeToMinutes = (t: string): number => {
    const [h, m] = t.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };

  // Hora actual en minutos para el país seleccionado (no del dispositivo)
  // Evita filtrar trenes europeos cuando el usuario está en otra zona horaria
  const COUNTRY_UTC_OFFSET: Record<string, number> = {
    ES:2, FR:2, DE:2, IT:2, CH:2, AT:2, BE:2, NL:2, PT:1,
    NO:2, DK:2, GB:1, GB_LON:1,
    ES_MAD:2, ES_BCN:2, FR_PAR:2, DE_BER:2, DE_MUN:2,
    IT_ROM:2, IT_MIL:2, AT_VIE:2, NL_AMS:2, BE_BRU:2,
    PT_LIS:1, DK_CPH:2, NO_OSL:2,
    US:-5, US_NYC:-5, US_CHI:-6, US_LAX:-8,
  };

  const countryNowMinutes = (code: string): number => {
    const utcOffset    = COUNTRY_UTC_OFFSET[code] ?? 0;
    const deviceOffset = -new Date().getTimezoneOffset() / 60;
    const diffMs       = (utcOffset - deviceOffset) * 3_600_000;
    const countryNow   = new Date(Date.now() + diffMs);
    return countryNow.getHours() * 60 + countryNow.getMinutes();
  };

  // Filtra trenes ya partidos del board actual (sin re-fetch)
  const prunePastTrains = useCallback(() => {
    const nowMin = countryNowMinutes(selected.code);
    setBoard(prev => {
      const seen = new Set<string>();
      const deduped = prev.filter(e => {
        const key = e.tripId ?? `${e.time}|${e.endpoint}|${e.train}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return deduped.filter(e => (e.isTomorrow && nowMin >= 23 * 60) || timeToMinutes(e.time) >= nowMin - 1);
    });
  }, [selected.code]);

  const BOARD_CACHE_KEY = (code: string, m: string) => `@board_cache_${code}_${m}`;

  const dedupeAndFilter = (raw: BoardEntry[], countryCode: string): BoardEntry[] => {
    const seen   = new Set<string>();
    const nowMin = countryNowMinutes(countryCode);
    return raw.filter(e => {
      const key = e.tripId ?? `${e.time}|${e.endpoint}|${e.train}`;
      if (seen.has(key)) return false;
      seen.add(key);
      // isTomorrow: solo válido si aún es "tarde" (>= 22:00 hora local del país)
      // Si ya es de día nuevo, tratar como hoy y aplicar filtro normal
      if (e.isTomorrow && nowMin >= 23 * 60) return true;
      return timeToMinutes(e.time) >= nowMin - 1;
    });
  };

  const loadBoard = useCallback(async (
    dest: typeof DESTINATIONS[0], m: BoardMode, silent = false, overrideStationId?: string,
  ) => {
    const token = ++loadRef.current;
    const stId = overrideStationId ?? currentStationId;

    // Stale-While-Revalidate: mostrar caché inmediatamente mientras se busca fresco
    if (!silent) {
      try {
        const cached = await AsyncStorage.getItem(BOARD_CACHE_KEY(dest.code, m));
        if (cached) {
          const { entries, ts } = JSON.parse(cached) as { entries: BoardEntry[]; ts: number };
          const stale = dedupeAndFilter(entries, dest.code);
          if (stale.length > 0) {
            setBoard(stale);
            setLoading(false);
            // Si la caché tiene menos de 90s, no re-fetch (datos frescos)
            if (Date.now() - ts < 90_000) return;
          } else {
            setLoading(true);
            setBoard([]);
          }
        } else {
          setLoading(true);
          setBoard([]);
        }
      } catch {
        setLoading(true);
        setBoard([]);
      }
    }

    try {
      const raw = await getCountryBoard(dest.code, m, 50, stId);
      if (token !== loadRef.current) return;
      const entries = dedupeAndFilter(raw, dest.code);
      setBoard(entries);
      // Guardar en caché solo si hay datos útiles
      if (entries.length > 0) {
        AsyncStorage.setItem(BOARD_CACHE_KEY(dest.code, m), JSON.stringify({ entries, ts: Date.now() })).catch(() => {});
      }
    } catch (e) {
      console.warn('[salidas] getCountryBoard error:', e);
      // Si ya hay datos de caché mostrándose, no pisar con vacío
      if (token === loadRef.current) setBoard(prev => prev.length > 0 ? prev : []);
    }
    finally { if (token === loadRef.current) setLoading(false); }
  }, [currentStationId]);

  useEffect(() => {
    // Solo cargar si ya pasó el GPS (o falló)
    if (gpsStatus === 'loading') return;
    loadBoard(selected, mode);
    const fetchTimer = setInterval(() => loadBoard(selected, mode, true), 60_000);
    const pruneTimer = setInterval(prunePastTrains, 30_000);

    // Recargar al pasar la medianoche local del país para convertir "mañana" en "hoy"
    const nowMin = countryNowMinutes(selected.code);
    const msToMidnight = ((24 * 60 - nowMin) * 60 + 30) * 1000;
    const midnightTimer = setTimeout(() => loadBoard(selected, mode), msToMidnight);

    return () => { clearInterval(fetchTimer); clearInterval(pruneTimer); clearTimeout(midnightTimer); };
  }, [selected, mode, loadBoard, prunePastTrains, gpsStatus]);

  // ── Descarga lazy DB para países grandes ────────────────────────────────────
  useEffect(() => {
    if (!LAZY_COUNTRIES.has(selected.code)) {
      setDbDownloading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const dbName = `gtfs_${selected.code === 'FR' ? 'france' : selected.code === 'BE' ? 'belgium' : 'austria'}.db`;
      const ready = await isDbReady(dbName);
      if (ready || cancelled) {
        setDbDownloading(false);
        return;
      }
      setDbDownloading(true);
      const ok = await downloadDb(dbName);
      if (cancelled) return;
      setDbDownloading(false);
      if (ok) {
        // DB descargado — recargar el board para mostrar datos reales
        loadBoard(selected, mode);
      }
    })();
    return () => { cancelled = true; };
  }, [selected.code, loadBoard, mode]);

  const handleDestPress = useCallback((dest: typeof DESTINATIONS[0]) => {
    Haptics.selectionAsync();
    setGpsDetected(false);
    setGpsStationName('');
    setCurrentStationId(undefined);
    setSelected(dest);
  }, []);

  const handleStationSelect = useCallback((id: string, name: string) => {
    setStationForCountry(selected.code, id, name);
    setStationName(name);
    setGpsStationName(name);
    setCurrentStationId(id);
    setPickerOpen(false);
    // Pasar el stationId directo para no depender del state que aún no actualizó
    InteractionManager.runAfterInteractions(() => {
      loadBoard(selected, mode, false, id);
    });
  }, [selected, mode, loadBoard]);

  const handleBoardTap = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveCountry(selected.code).catch(() => {});
    router.push({ pathname: '/split-screen', params: { country: selected.code, mode: 'country' } });
  }, [selected, router]);

  const handleRetryGps = useCallback(async () => {
    setGpsStatus('loading');
    setGpsDetected(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setGpsStatus('notfound'); return; }
      let loc2 = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>(r => setTimeout(() => r(null), 10000)),
      ]);
      if (!loc2) loc2 = await Location.getLastKnownPositionAsync() ?? null;
      if (!loc2) { setGpsStatus('notfound'); return; }
      const coords = { latitude: loc2.coords.latitude, longitude: loc2.coords.longitude };
      const countryCode = detectCountryFromCoords(coords);
      if (!countryCode) { setGpsStatus('notfound'); return; }
      const dest = getDestByCode(countryCode);
      if (!dest) { setGpsStatus('notfound'); return; }
      const station = await findNearestStation(coords);
      if (station) {
        setCurrentStationId(station.id);
        if (RT_STATION_COUNTRIES[countryCode]) {
          try {
            const rtResults = await searchForCountry(countryCode, station.name);
            const rtStation = rtResults[0];
            if (rtStation) {
              setStationForCountry(countryCode, rtStation.id, rtStation.name);
              setGpsStationName(rtStation.name);
            } else {
              setStationForCountry(countryCode, station.id, station.name);
              setGpsStationName(station.name);
            }
          } catch {
            setStationForCountry(countryCode, station.id, station.name);
            setGpsStationName(station.name);
          }
        } else {
          setGpsStationName(station.name);
        }
      }
      setSelected(dest);
      setStationName(station?.name ?? getStationNameForCountry(countryCode));
      setGpsDetected(true);
      setGpsStatus('found');
    } catch {
      setGpsStatus('notfound');
    }
  }, [requestLocation]);

  const TABS: { key: BoardMode; label: string; icon: string }[] = [
    { key: 'salidas', label: t('board_departures_tab'), icon: 'arrow-up-circle-outline' },
    { key: 'arribos', label: t('board_arrivals_tab'),   icon: 'arrow-down-circle-outline' },
  ];

  // Nombre de la estación visible en el header
  const displayStation = gpsStationName || stationName || getStationNameForCountry(selected.code) || selected.name;
  const displayCountrySub = selected.sub;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg.base }]} edges={['top']}>

      {/* ── Offline Banner ── */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color="#fff" />
          <Text style={styles.offlineText}>{t('board_offline')}</Text>
        </View>
      )}

      {/* ── Header con ubicación GPS ── */}
      <Pressable
        style={styles.header}
        onPress={() => setPickerOpen(hasStationPicker)}
        hitSlop={4}
      >
        <View style={styles.headerLeft}>
          {gpsStatus === 'loading' ? (
            <ActivityIndicator size="small" color={colors.brand.primary} style={{ marginRight: 6 }} />
          ) : (
            <Ionicons
              name={gpsDetected ? 'navigate' : 'navigate-outline'}
              size={17}
              color={gpsDetected ? colors.brand.primary : colors.text.muted}
              style={{ marginRight: 6, marginTop: 2 }}
            />
          )}
          <View>
            <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
              {displayStation}
            </Text>
            <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
              {selected.name} · {displayCountrySub}
              {isOffline ? ' · offline' : ''}
            </Text>
          </View>
        </View>
        {/* Botón refrescar GPS */}
        <Pressable
          style={[styles.refreshBtn, { backgroundColor: colors.bg.elevated, borderColor: colors.border.subtle }]}
          onPress={handleRetryGps}
          hitSlop={8}
        >
          <Ionicons name="refresh-outline" size={16} color={colors.brand.primary} />
        </Pressable>
      </Pressable>

      {/* ── Segmented control ── */}
      <View style={[styles.segWrap, { backgroundColor: colors.bg.elevated }]}>
        {TABS.map((t) => {
          const active = mode === t.key;
          return (
            <Pressable
              key={t.key}
              style={[
                styles.segBtn,
                active && styles.segBtnActive,
              ]}
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

      {/* ── Selector de país (chips horizontales) ── */}
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
          {mode === 'salidas' ? t('board_departures') : t('board_arrivals')} · {selected.name.toUpperCase()}
        </Text>
        <Pressable onPress={handleBoardTap} hitSlop={8}>
          <Text style={[styles.boardMore, { color: colors.brand.primary }]}>Ver todo ›</Text>
        </Pressable>
      </View>

      {/* ── Indicador de descarga DB ── */}
      {dbDownloading && (
        <View style={[styles.downloadBanner, { backgroundColor: colors.bg.elevated, borderColor: colors.border.subtle }]}>
          <ActivityIndicator size="small" color={colors.brand.primary} style={{ marginRight: 6 }} />
          <Text style={[styles.downloadBannerText, { color: colors.text.secondary }]}>
            {t('board_downloading')}
          </Text>
        </View>
      )}

      {/* ── Contenido ── */}
      {gpsStatus === 'loading' ? (
        <View style={styles.center}>
          <Ionicons name="navigate-circle-outline" size={48} color={colors.brand.primary} />
          <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>
            {t('board_detecting')}
          </Text>
          <Text style={[styles.emptySub, { color: colors.text.secondary }]}>
            {t('board_detecting_sub')}
          </Text>
          <ActivityIndicator color={colors.brand.primary} style={{ marginTop: 8 }} />
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand.primary} />
          <Text style={[styles.loadingText, { color: colors.text.muted }]}>{t('loading')}</Text>
        </View>
      ) : gpsStatus === 'notfound' && board.length === 0 ? (
        /* Estado vacío: GPS no disponible / fuera de cobertura */
        <View style={styles.center}>
          <Ionicons name="train-outline" size={48} color={colors.text.muted} />
          <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>
            {t('board_where')}
          </Text>
          <Text style={[styles.emptySub, { color: colors.text.secondary }]}>
            {t('board_where_sub')}
          </Text>
          <Pressable
            style={[styles.gpsBtn, { backgroundColor: colors.brand.primary }]}
            onPress={handleRetryGps}
          >
            <Ionicons name="navigate-outline" size={18} color="#fff" />
            <Text style={styles.gpsBtnText}>{t('board_use_gps')}</Text>
          </Pressable>
        </View>
      ) : board.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="train-outline" size={48} color={colors.text.muted} />
          <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>
            {t('board_no_service')}
          </Text>
          <Text style={[styles.emptySub, { color: colors.text.secondary }]}>
            {t('board_no_service_sub', { country: selected.name })}
          </Text>
          <Pressable
            style={[styles.openBtn, { backgroundColor: colors.brand.primary }]}
            onPress={handleBoardTap}
          >
            <Ionicons name="navigate-outline" size={15} color="#fff" />
            <Text style={styles.openBtnText}>{t('board_open_country', { country: selected.name })}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView style={styles.boardScroll} showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}>
          {board.map((entry, i) => (
            <BoardRow
              key={i}
              entry={entry}
              index={i}
              originName={displayStation}
              countryCode={selected.code}
            />
          ))}
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

  // Indicador de descarga DB lazy
  downloadBanner: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radius.md, borderWidth: 0.5,
  },
  downloadBannerText: { fontSize: 12, flex: 1 },

  // Header con ubicación
  header: {
    paddingHorizontal: 22, paddingTop: 18, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row', alignItems: 'flex-start', flex: 1, marginRight: 12,
  },
  title:    { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { fontSize: 12, marginTop: 2 },

  refreshBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 0.5,
  },

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
    borderBottomWidth: 1, gap: 10,
  },
  boardTime:    { fontSize: 20, fontWeight: '700', width: 62, letterSpacing: -0.5 },
  boardInfo:    { flex: 1, gap: 2 },
  boardTrain:   { fontSize: 14, fontWeight: '600' },
  boardStation: { fontSize: 11 },

  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 4, paddingHorizontal: 7, borderRadius: Radius.full,
  },
  statusDot:  { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '600' },

  // Botón comprar
  buyBtn: {
    backgroundColor: 'transparent',
    paddingVertical: 7, paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.7)',
  },
  buyBtnText: {
    fontSize: 11, fontWeight: '700', color: '#A78BFA',
  },

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

  // Botón GPS grande (estado vacío)
  gpsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 8, paddingVertical: 14, paddingHorizontal: 28,
    borderRadius: Radius.full,
  },
  gpsBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

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
