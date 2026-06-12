if (!AbortSignal.timeout) { AbortSignal.timeout = (ms: number) => { const controller = new AbortController(); setTimeout(() => controller.abort(), ms); return controller.signal; }; }
/**
 * WoW Train — Split-Screen 50/50 (STEP 2 + Tourist v2)
 *
 * UPPER 50%: Reloj Predictivo de Pánico — próximos 3 trenes + buffer coloreado
 * LOWER 50%: Mapa Multimodal en tiempo real con chips de modo
 *
 * TOURIST MODE (mode="tourist"):
 *   • Recibe originStationId + destStationId + destName desde Home
 *   • AffiliateWebView como checkout principal (sin B2B, 0 acuerdos)
 *   • startPlatformMonitoring cuando el usuario selecciona un tren
 *   • registerDestinationGeofence en onPurchaseSuccess (Ring-3 destino)
 *   • Ticket almacenado localmente para geofencing Rings 1+2
 */
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Platform,
  Text,
  Pressable,
  Linking,
  Animated as RNAnimated,

  TextInput,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  Image,
  Keyboard,
} from 'react-native';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { t } from '../services/i18n';

// En Expo Go el mapa de Google no funciona (requiere build nativo)
const IS_EXPO_GO = Constants.appOwnership === 'expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { Colors, Typography, Spacing, Radius, Shadows, Gradients } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import TrainCountdown    from '../components/TrainCountdown';
import ModeChip          from '../components/ModeChip';
import AffiliateWebView  from '../components/AffiliateWebView';

import { useTrainSchedules }          from '../hooks/useTrainSchedules';
import { useLocation }                from '../hooks/useLocation';
import * as Location                  from 'expo-location';
import { useLiveTrainPosition }       from '../services/liveTrainPosition';
import { findNearestStation, getStationById, getFirstStation, getMainStation, searchStations, detectCountryFromCoords, setActiveCountry } from '../services/gtfsDatabase';
import { translateStationQuery } from '../services/stationTranslations';
import { buildTrainlineByName, buildBestBookingUrl, buildScenicTrainUrl } from '../services/affiliateEngine';
import { SCENIC_TRAINS, getScenicByCountry } from '../data/scenicTrains';
import PartnerCard from '../components/PartnerCard';
import AnimatedTrain from '../components/AnimatedTrain';
import TrainSceneBg from '../components/TrainSceneBg';
import { getCityOffers } from '../data/partnerOffers';
import { optimizeRoute, calculateETA } from '../services/routeOptimizer';
import { startPlatformMonitoring, stopPlatformMonitoring } from '../services/trainArrivalMonitor';
import { registerDestinationGeofence, refreshGeofences }  from '../tasks/geofenceTask';
import { storeTicket }                from '../services/ticketStorage';
import { getPlaceName }              from '../services/geocodingService';

import DestinationSearch from '../components/DestinationSearch';
import FlagCircle from '../components/FlagCircle';

import type {
  TransportMode,
  TrainService,
  PredictiveClock,
  Coordinates,
  Station,
  StoredTicket,
  CountryCode,
} from '../types';

const { height: H, width: W } = Dimensions.get('window');
// 38% superior scrolleable para trenes, 62% para mapa (guía GPS es función central)
const HALF_H = H * 0.38;

// ── Deep links for rideshare ─────────────────────────────────────────────
// En Android 11+ canOpenURL() siempre falla para apps de terceros sin
// declarar en el Manifest. Usamos universal links — Android los intercepta
// y abre la app instalada directamente sin necesitar el check previo.
function openRideshare(dest: Coordinates, stationName: string) {
  const lat  = dest.latitude;
  const lon  = dest.longitude;
  const name = encodeURIComponent(stationName);

  // Universal link de Uber — abre la app en iOS y Android si está instalada,
  // si no, carga la web móvil. No requiere canOpenURL().
  const uberUrl = `https://m.uber.com/ul/?action=setPickup`
    + `&dropoff[latitude]=${lat}`
    + `&dropoff[longitude]=${lon}`
    + `&dropoff[nickname]=${name}`
    + `&pickup=my_location`;

  Linking.openURL(uberUrl).catch(() => {
    // Fallback: Cabify web
    Linking.openURL(`https://cabify.com/`);
  });
}

// ── Map style — dark minimal ──────────────────────────────────────────────
const DARK_MAP_STYLE = [
  { elementType: 'geometry',             stylers: [{ color: '#09090B' }] },
  { elementType: 'labels.text.fill',     stylers: [{ color: '#71717A' }] },
  { featureType: 'road',       elementType: 'geometry', stylers: [{ color: '#27272A' }] },
  { featureType: 'water',      elementType: 'geometry', stylers: [{ color: '#0A0A14' }] },
  { featureType: 'transit.station.rail', elementType: 'geometry', stylers: [{ color: '#7C3AED' }] },
  { featureType: 'poi',        stylers: [{ visibility: 'off' }] },
];

// ── Success banner ────────────────────────────────────────────────────────
function PurchaseSuccessBanner({
  bookingRef,
  destName,
  onDismiss,
}: {
  bookingRef: string;
  destName:   string;
  onDismiss:  () => void;
}) {
  return (
    <View style={styles.successBanner}>
      <Ionicons name="checkmark-circle" size={28} color="#30D158" style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.successTitle}>¡Billete confirmado!</Text>
        <Text style={styles.successSub} numberOfLines={1}>
          {destName} · Ref: {bookingRef}
        </Text>
        <Text style={styles.successHint}>
          Recibirás el QR de Trainline por email. La app te avisará cuando llegues.
        </Text>
      </View>
      <Pressable onPress={onDismiss} style={styles.successClose} accessibilityLabel="Cerrar">
        <Ionicons name="close" size={16} color="rgba(235,235,245,0.60)" />
      </Pressable>
    </View>
  );
}

// ── LiveTrainMarker — punto animado del tren en el mapa ──────────────────────
/**
 * Muestra el tren como un punto azul pulsante.
 * - Outer ring: pulsa 0.6→1.0 en opacidad (efecto "ping")
 * - Inner dot:  fijo, azul sólido con borde blanco
 * El marker rota según el `bearing` para reflejar la dirección de marcha.
 */
function LiveTrainMarker({
  coordinate,
  bearing,
  isLive,
}: {
  coordinate: { latitude: number; longitude: number };
  bearing:    number;
  isLive:     boolean;
}) {
  const pulse = useRef(new RNAnimated.Value(0.6)).current;

  useEffect(() => {
    const anim = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulse, { toValue: 1,   duration: 900, useNativeDriver: true }),
        RNAnimated.timing(pulse, { toValue: 0.6, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      flat
      rotation={bearing}
      title={isLive ? '🚂 Posición en vivo' : '🚂 Posición estimada'}
    >
      <View style={liveStyles.wrapper}>
        {/* Pulse ring */}
        <RNAnimated.View style={[liveStyles.ring, { opacity: pulse }]} />
        {/* Core dot */}
        <View style={liveStyles.dot} />
        {/* Direction arrow (small triangle at top) */}
        <View style={liveStyles.arrow} />
      </View>
    </Marker>
  );
}

const liveStyles = StyleSheet.create({
  wrapper: {
    width:          34,
    height:         34,
    alignItems:     'center',
    justifyContent: 'center',
  },
  ring: {
    position:        'absolute',
    width:           34,
    height:          34,
    borderRadius:    17,
    borderWidth:     2,
    borderColor:     '#3B82F6',
    backgroundColor: 'rgba(59,130,246,0.15)',
  },
  dot: {
    width:           16,
    height:          16,
    borderRadius:    8,
    backgroundColor: '#3B82F6',
    borderWidth:     2,
    borderColor:     '#FFFFFF',
    zIndex:          2,
  },
  arrow: {
    position:         'absolute',
    top:              2,
    width:            0,
    height:           0,
    borderLeftWidth:  4,
    borderRightWidth: 4,
    borderBottomWidth:6,
    borderStyle:      'solid',
    borderLeftColor:  'transparent',
    borderRightColor: 'transparent',
    borderBottomColor:'#FFFFFF',
    zIndex:           3,
  },
});

// ── Delay badge en el mapa ────────────────────────────────────────────────────
function DelayBadge({ minutes, isLive }: { minutes: number; isLive: boolean }) {
  const { colors } = useTheme();
  if (minutes === 0 && isLive) return null;

  const color = minutes > 10
    ? colors.status.danger
    : minutes > 3
      ? colors.status.warn
      : colors.status.safe;

  return (
    <View style={[delayStyles.badge, { borderColor: colors.border.default }]}>
      <View style={[delayStyles.dot, { backgroundColor: isLive ? '#3B82F6' : colors.text.muted }]} />
      <Text style={[delayStyles.text, { color }]}>
        {minutes > 0 ? `+${minutes} min` : 'En hora'}
      </Text>
      {!isLive && <Text style={[delayStyles.estimated, { color: colors.text.muted }]}>est.</Text>}
    </View>
  );
}

const delayStyles = StyleSheet.create({
  badge: {
    position:         'absolute',
    bottom:           Spacing['3'],
    left:             Spacing['3'],
    flexDirection:    'row',
    alignItems:       'center',
    gap:              Spacing['1'],
    paddingHorizontal:Spacing['2'],
    paddingVertical:  4,
    borderRadius:     Radius.full,
    backgroundColor:  'rgba(9,9,11,0.85)',
    borderWidth:      1,
    borderColor:      'rgba(255,255,255,0.09)',
  },
  dot: {
    width:        6,
    height:       6,
    borderRadius: 3,
  },
  text: {
    fontSize:   Typography.size.xs,
    fontWeight: Typography.weight.bold,
    fontVariant:['tabular-nums'],
  },
  estimated: {
    fontSize: Typography.size.xs,
    color:    'rgba(235,235,245,0.30)',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
export default function SplitScreen() {
  const params = useLocalSearchParams<{
    lat?:             string;
    lon?:             string;
    country?:         string;
    mode?:            string;   // "tourist" | "country"
    originStationId?: string;   // Pre-resolved origin from Home (tourist mode)
    destStationId?:   string;   // Destination station from Home
    destName?:        string;   // Human-readable destination name (e.g. "Vaticano")
    destPoiId?:       string;   // Source POI id (analytics/future)
    metroCity?:       string;   // Ciudad de metro urbano (e.g. "New York", "Madrid")
  }>();
  const router     = useRouter();
  const { colors } = useTheme();
  const insets     = useSafeAreaInsets();
  const mapRef     = useRef<MapView>(null);
  const isTourist  = params.mode === 'tourist';
  // Modo metro: país con código de ciudad (US_NYC, ES_MAD, ES_BCN…)
  const isMetro    = !!params.metroCity;
  // Hint ISO-2 para el geocoder (extrae el country base del código)
  const countryHint = params.country?.split('_')[0] ?? 'ES';

  // ── State ──────────────────────────────────────────────────────────────
  const [transportMode,    setTransportMode]    = useState<TransportMode>('walk');
  const [selectedStation,  setSelectedStation]  = useState<Station | null>(null);
  // Estación GPS original (auto-detectada al entrar) — el botón ↻ vuelve a ella
  const [gpsStation,       setGpsStation]       = useState<Station | null>(null);
  // Destino del mapa (separado de selectedStation para no recargar el tablero)
  const [mapDestination,   setMapDestination]   = useState<Station | null>(null);
  const [showStationPicker,  setShowStationPicker]  = useState(false);
  const [stationQuery,       setStationQuery]       = useState('');
  const [stationSuggestions, setStationSuggestions] = useState<Station[]>([]);
  const [stationSearching,   setStationSearching]   = useState(false);
  const [destStation,      setDestStation]      = useState<Station | null>(null);
  const [selectedService,  setSelectedService]  = useState<TrainService | null>(null);
  const [routePolyline,    setRoutePolyline]    = useState<Coordinates[]>([]);
  // Estación de llegada encontrada por búsqueda de dirección (modo metro)
  const [searchedDestWalk, setSearchedDestWalk] = useState<number>(0);
  const [showDestSearch,   setShowDestSearch]   = useState(false); // abre como modal al tocar el chip

  // ETAs para los 3 modos de transporte (minutos)
  const [etas, setEtas] = useState<Record<TransportMode, number | null>>({
    walk: null, bus: null, rideshare: null,
  });

  // Nombre del lugar donde está el usuario (reverse geocoding)
  const [placeName, setPlaceName] = useState<string | null>(null);
  // Distancia en metros a la estación más cercana
  const [distToStation, setDistToStation] = useState<number | null>(null);

  // Mapa: 'hidden' | 'peek' (precompra, 38%) | 'full' (post-pago, 62%)
  const [mapMode, setMapMode] = useState<'hidden' | 'peek' | 'full'>('hidden');
  const mapHeight = useSharedValue(0);

  const animatedMapStyle = useAnimatedStyle(() => ({ height: mapHeight.value, overflow: 'hidden' }));

  const openMapPeek = useCallback(() => {
    mapHeight.value = withTiming(H * 0.38, { duration: 350, easing: Easing.out(Easing.cubic) });
    setMapMode('peek');
  }, [mapHeight]);

  const openMapFull = useCallback(() => {
    mapHeight.value = withTiming(H * 0.62, { duration: 400, easing: Easing.out(Easing.cubic) });
    setMapMode('full');
  }, [mapHeight]);

  const closeMap = useCallback(() => {
    mapHeight.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
    setMapMode('hidden');
  }, [mapHeight]);

  // Al cambiar de estación (picker manual) → cerrar mapa para evitar área negra huérfana
  useEffect(() => {
    if (!selectedStation) return;
    mapHeight.value = 0;
    setMapMode('hidden');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStation?.id]);

  // Checkout — affiliate WebView (primary)
  const [affiliateVisible,  setAffiliateVisible]  = useState(false);
  const [scenicVisible,     setScenicVisible]     = useState<string | null>(null);
  const [showTravelModal,   setShowTravelModal]   = useState(false);

  // Pulso para el botón "PARA TU VIAJE"
  const travelPulse = useRef(new RNAnimated.Value(1)).current;
  useEffect(() => {
    const anim = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(travelPulse, { toValue: 1.06, duration: 800, useNativeDriver: true }),
        RNAnimated.timing(travelPulse, { toValue: 1,    duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  // Post-purchase success banner
  const [purchaseBookingRef, setPurchaseBookingRef] = useState<string | null>(null);

  const { locationState, requestLocation } = useLocation();

  // Resolve user coordinates (from params or live GPS)
  // useMemo evita crear un objeto nuevo en cada render → previene infinite loops en useEffect
  const userCoords = useMemo<Coordinates | null>(() => {
    if (params.lat && params.lon) {
      return { latitude: parseFloat(params.lat), longitude: parseFloat(params.lon) };
    }
    return locationState.status === 'granted' ? locationState.coords : null;
  }, [params.lat, params.lon, locationState.status, locationState.status === 'granted' ? locationState.coords : null]);

  // ── Resolve origin station ────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      if (params.originStationId) {
        // Tourist mode — station already resolved by Home
        try {
          const st = await getStationById(params.originStationId);
          if (st) { setSelectedStation(st); setGpsStation(st); return; }
        } catch { /* fall through to GPS fallback */ }
      }

      // Obtener coordenadas GPS: usar las de params si vienen, sino pedir GPS activamente
      let coords: Coordinates | null = userCoords;
      if (!coords) {
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === 'granted') {
            // Cascada Balanced → Low → Lowest (misma lógica que salidas/index)
            for (const accuracy of [
              Location.Accuracy.Balanced,
              Location.Accuracy.Low,
              Location.Accuracy.Lowest,
            ]) {
              try {
                const res = await Promise.race([
                  Location.getCurrentPositionAsync({ accuracy }),
                  new Promise<null>(r => setTimeout(() => r(null), 3000)),
                ]);
                if (res) {
                  coords = { latitude: res.coords.latitude, longitude: res.coords.longitude };
                  break;
                }
              } catch {}
            }
            // Último recurso: lastKnown
            if (!coords) {
              const last = await Location.getLastKnownPositionAsync();
              if (last) coords = { latitude: last.coords.latitude, longitude: last.coords.longitude };
            }
          }
        } catch {}
      }

      // Country mode — usar GPS solo si coincide con el país seleccionado
      if (coords) {
        const gpsCountry = detectCountryFromCoords(coords);
        const selectedCountry = params.country?.split('_')[0] ?? null;
        if (!selectedCountry || gpsCountry === selectedCountry || gpsCountry === params.country) {
          const station = await findNearestStation(coords);
          if (station) { setSelectedStation(station); setGpsStation(station); return; }
        }
      }

      // GPS no disponible o no coincide con el país → estación principal del país
      if (params.country) {
        await setActiveCountry(params.country as any).catch(() => {});
      }
      const fallback = await getMainStation(params.country as CountryCode | undefined);
      if (fallback) {
        setSelectedStation(fallback);
        setGpsStation(fallback);
        setTimeout(() => {
          mapRef.current?.animateToRegion({
            latitude:      fallback.coordinates.latitude,
            longitude:     fallback.coordinates.longitude,
            latitudeDelta: 0.02,
            longitudeDelta:0.02,
          }, 600);
        }, 500);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Resolve destination station (tourist mode) ────────────────────────
  useEffect(() => {
    if (!params.destStationId) return;
    (async () => {
      try {
        const st = await getStationById(params.destStationId!);
        if (st) setDestStation(st);
      } catch { /* non-fatal */ }
    })();
  }, [params.destStationId]);

  // ── Live train position (polling 15s, solo si hay tren seleccionado) ──
  // Activo solo cuando el tren saldrá en < 3 horas o ya partió
  const livePosition = useLiveTrainPosition(
    selectedService,
    selectedService !== null,
  );

  // ── Train schedules for selected origin station ───────────────────────
  const { clocks, isLoading, isLive, refresh } = useTrainSchedules({
    stationId:      selectedStation?.id ?? 'STOP_PLACEHOLDER',
    destStationId:  destStation?.id,
    userLocation:   userCoords,
    transportMode,
    maxResults:     8,
  });

  // ── Auto-seguimiento de cámara al tren en movimiento ─────────────────
  useEffect(() => {
    if (!livePosition.coordinates || !mapRef.current) return;
    // Solo seguir si el tren está en marcha (isLive) y hay posición real
    if (!livePosition.isLive) return;

    mapRef.current.animateCamera(
      {
        center:  {
          latitude:  livePosition.coordinates.latitude,
          longitude: livePosition.coordinates.longitude,
        },
        heading: livePosition.bearing,
        zoom:    13,
        pitch:   0,
      },
      { duration: 800 },
    );
  }, [livePosition.coordinates, livePosition.bearing, livePosition.isLive]);

  // Distancia Haversine en km entre dos coords
  const haversineKm = (a: Coordinates, b: Coordinates): number => {
    const R = 6371;
    const dLat = (b.latitude  - a.latitude)  * Math.PI / 180;
    const dLon = (b.longitude - a.longitude) * Math.PI / 180;
    const s = Math.sin(dLat/2) ** 2 +
              Math.cos(a.latitude * Math.PI / 180) *
              Math.cos(b.latitude * Math.PI / 180) *
              Math.sin(dLon/2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  };

  // ── Reverse geocoding — nombre del lugar donde está el usuario ───────
  useEffect(() => {
    if (!userCoords) return;
    getPlaceName(userCoords.latitude, userCoords.longitude)
      .then(setPlaceName)
      .catch(() => {});
  }, [userCoords]);

  // ── Distancia a la estación en metros ─────────────────────────────────
  useEffect(() => {
    if (!userCoords || !selectedStation) { setDistToStation(null); return; }
    const dist = haversineKm(userCoords, selectedStation.coordinates) * 1000;
    setDistToStation(dist > 500_000 ? null : Math.round(dist)); // null si >500km
  }, [userCoords, selectedStation]);

  // ── ETAs para los 3 modos en paralelo ────────────────────────────────
  useEffect(() => {
    const target = mapDestination ?? selectedStation;
    if (!userCoords || !target) return;
    const distKm = haversineKm(userCoords, target.coordinates);
    if (distKm > 500) {
      setEtas({ walk: null, bus: null, rideshare: null });
      return;
    }
    Promise.all([
      calculateETA(userCoords, target.coordinates, 'walk'),
      calculateETA(userCoords, target.coordinates, 'bus'),
      calculateETA(userCoords, target.coordinates, 'rideshare'),
    ]).then(([walk, bus, ride]) => {
      setEtas({
        walk:      Math.round(walk.durationMinutes),
        bus:       Math.round(bus.durationMinutes),
        rideshare: Math.round(ride.durationMinutes),
      });
    }).catch(() => {});
  }, [userCoords, selectedStation, mapDestination]);

  // ── Route optimization (user → destino del mapa) ──────────────────────
  useEffect(() => {
    const target = mapDestination ?? selectedStation;
    if (!userCoords || !target) return;
    const distKm = haversineKm(userCoords, target.coordinates);
    if (distKm > 500) { setRoutePolyline([]); return; }
    (async () => {
      try {
        const route = await optimizeRoute(userCoords, target.coordinates, transportMode);
        setRoutePolyline(route.polyline ?? []);
        if (mapRef.current && route.polyline && route.polyline.length > 0) {
          mapRef.current.fitToCoordinates(route.polyline, {
            edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
            animated:    true,
          });
        }
      } catch {
        setRoutePolyline([]);
      }
    })();
  }, [transportMode, userCoords, selectedStation, mapDestination]);

  // ── Rideshare deeplink ────────────────────────────────────────────────
  useEffect(() => {
    const target = mapDestination ?? selectedStation;
    if (transportMode === 'rideshare' && target) {
      openRideshare(target.coordinates, target.name);
    }
  }, [transportMode, selectedStation]);

  // ── Autocomplete para el picker manual de estación ───────────────────
  useEffect(() => {
    if (stationQuery.length < 2) { setStationSuggestions([]); return; }
    const t = setTimeout(async () => {
      setStationSearching(true);
      try {
        const country = params.country as CountryCode | undefined;
        const results = await searchStations(translateStationQuery(stationQuery), 12, country);
        setStationSuggestions(results);
      } catch { setStationSuggestions([]); }
      finally { setStationSearching(false); }
    }, 280);
    return () => clearTimeout(t);
  }, [stationQuery, params.country]);

  // ── Destino encontrado por búsqueda de dirección ─────────────────────
  const handleDestinationFound = useCallback((station: Station, walkMinutes: number) => {
    setDestStation(station);
    setSearchedDestWalk(walkMinutes);
    setShowDestSearch(false);   // colapsar el buscador
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Centrar mapa en la estación de destino
    if (mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude:       station.coordinates.latitude,
          longitude:      station.coordinates.longitude,
          latitudeDelta:  0.015,
          longitudeDelta: 0.015,
        },
        500,
      );
    }
  }, []);

  // ── Clock / service selection ─────────────────────────────────────────
  // Tap en la card → solo actualiza destino del mapa, sin tocar el tablero
  const handleClockSelect = useCallback((clock: PredictiveClock) => {
    const svc = clock.train;
    setSelectedService(svc);

    if (svc.destination?.coordinates) {
      setMapDestination({
        id:          svc.destination.id,
        name:        svc.destination.name,
        nameLocal:   svc.destination.nameLocal ?? svc.destination.name,
        country:     svc.destination.country ?? (params.country ?? 'ES'),
        coordinates: svc.destination.coordinates,
        platforms:   [],
      });
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openMapPeek();
  }, [params.country, openMapPeek]);

  // Tap en "Comprar" → abre checkout + monitoreo
  const handleClockBuy = useCallback((clock: PredictiveClock) => {
    const svc = clock.train;
    setSelectedService(svc);
    startPlatformMonitoring(svc);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Redirige al navegador externo, igual que el tablero de salidas.
    // (El AffiliateWebView interno no renderiza dentro del Modal en Android.)
    const departure = new Date(svc.departureTime);
    const url = buildBestBookingUrl(
      svc.origin.name,
      svc.destination.name,
      departure,
      svc.origin.country,
    );
    Linking.openURL(url).catch(() => {});
  }, []);

  // ── Purchase success ──────────────────────────────────────────────────
  /**
   * Called by AffiliateWebView when Trainline's confirmation URL is detected.
   * 1. Register Ring-3 destination geofence ("preparate para bajar")
   * 2. Store minimal affiliate-booking record for Ring-1/2 notifications
   * 3. Refresh geofences so new regions are registered immediately
   */
  const handlePurchaseSuccess = useCallback(async (bookingRef: string) => {
    if (!selectedService) return;

    setAffiliateVisible(false);
    setPurchaseBookingRef(bookingRef);
    openMapFull();

    // Determine destination station id for Ring-3
    const destId = params.destStationId ?? selectedService.destination.id;
    const destDisplayName = params.destName ?? selectedService.destination.name;

    // ── Register Ring-3 geofence (arrival alert at destination) ──────────
    registerDestinationGeofence({
      destinationStationId: destId,
      ticketId:             bookingRef,
      trainNumber:          selectedService.trainNumber,
      operator:             selectedService.operator,
      destinationName:      destDisplayName,
      platform:             selectedService.platform,
    });

    // ── Store affiliate booking record (enables Ring-1/2 approach alerts) ─
    // In affiliate model we don't have the actual QR from Trainline,
    // so we store the bookingRef as qrData — the notification system
    // still works; the user gets the real QR ticket from Trainline via email.
    const now = new Date();
    const ticket: StoredTicket = {
      id:           bookingRef,
      bookingRef,
      qrData:       bookingRef,          // Trainline sends real QR via email
      qrFormat:     'QR_CODE',
      trainService: selectedService,
      passenger:    { firstName: '', lastName: '' }, // RGPD: not persisted
      issuedAt:     now,
      validUntil:   selectedService.arrivalTime,
      operator:     selectedService.operator,
      status:       'valid',
      storedAt:     now,
      associatedStation: selectedService.origin.id,
    };

    try {
      await storeTicket(ticket);
      // Refresh geofences so new rings are registered with expo-location
      await refreshGeofences();
    } catch (err) {
      console.warn('[SplitScreen] storeTicket failed (non-fatal):', err);
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [selectedService, params.destStationId, params.destName, openMapFull]);

  // ── Back ──────────────────────────────────────────────────────────────
  const handleBack = useCallback(() => {
    // Stop any active platform monitoring when leaving screen
    if (selectedService) stopPlatformMonitoring(selectedService.serviceId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, [router, selectedService]);

  // ── Map initial region ────────────────────────────────────────────────
  // Si el usuario está lejos de la estación (>500km, ej: desde Argentina),
  // centrar el mapa en la estación — no en las coords del usuario
  const mapCenter = useMemo(() => {
    if (selectedStation) {
      if (!userCoords) return selectedStation.coordinates;
      const distKm = haversineKm(userCoords, selectedStation.coordinates);
      if (distKm > 500) return selectedStation.coordinates;
      return userCoords;
    }
    return userCoords;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStation, userCoords]);

  const initialRegion = mapCenter
    ? { latitude: mapCenter.latitude, longitude: mapCenter.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : { latitude: 48.8566, longitude: 2.3522, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  // ── Destination label for tourist mode ───────────────────────────────
  const destLabel = params.destName ?? destStation?.name ?? null;

  return (
    <View style={styles.root}>
      <Image
        source={require('../assets/images/bg-hero.png')}
        style={[StyleSheet.absoluteFillObject, { top: -280, bottom: 280 }]}
        resizeMode="cover"
        fadeDuration={0}
      />
      <LinearGradient
        colors={['rgba(10,8,30,0.20)', 'rgba(14,14,46,0.45)', 'rgba(14,14,46,0.65)']}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      {/* ── TOP HALF: todo scrolleable en un solo ScrollView ── */}
      <ScrollView style={styles.topHalf} showsVerticalScrollIndicator={false} bounces={false}>

        {/* Nav bar */}
        <View style={styles.topNav}>
          {/* Bandera del país */}
          <View style={styles.navFlag}>
            <FlagCircle countryCode={(params.country ?? 'ES').split('_')[0].toLowerCase()} size="sm" />
          </View>

          <Pressable
            onPress={handleBack}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Volver"
          >
            <Text style={styles.backText}>‹ {isTourist ? t('split_back_map') : t('split_back_countries')}</Text>
          </Pressable>

          {/* Origin station pill — muestra estación actual, tappeable para cambiar */}
          <Pressable
            style={[styles.stationPill, { backgroundColor: 'rgba(14,14,46,0.45)', borderColor: 'rgba(139,92,246,0.65)' }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setStationQuery(''); setStationSuggestions([]); setShowStationPicker(true); }}
            accessibilityLabel="Cambiar estación"
            accessibilityHint="Toca para buscar otra estación"
            hitSlop={8}
          >
            <Ionicons name="location" size={13} color={colors.brand.primary} />
            <Text style={[styles.stationPillText, { color: selectedStation ? colors.text.primary : colors.text.muted }]} numberOfLines={1}>
              {selectedStation?.name ?? '…'}
            </Text>
            <Ionicons name="chevron-down" size={12} color={colors.brand.primary} />
          </Pressable>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              // Volver a la estación GPS original (si estás viendo otra) y recargar
              if (gpsStation && gpsStation.id !== selectedStation?.id) {
                setSelectedStation(gpsStation);
              } else {
                refresh();
              }
            }}
            style={styles.refreshBtn}
            accessibilityLabel="Volver a mi ubicación y actualizar"
          >
            <Text style={styles.refreshText}>↻</Text>
          </Pressable>
        </View>

        {/* ── Banner: dónde estás → distancia a estación ── */}
        {(placeName || distToStation !== null) && (
          <View style={[styles.locationBanner, { backgroundColor: 'rgba(255,255,255,0.05)', borderBottomColor: 'rgba(255,255,255,0.08)' }]}>
            <Ionicons name="navigate-circle-outline" size={14} color={colors.brand.primary} />
            <View style={styles.locationBannerText}>
              {placeName && (
                <Text style={[styles.locationPlace, { color: colors.text.primary }]} numberOfLines={1}>
                  {placeName}
                </Text>
              )}
              {distToStation !== null && selectedStation && (
                <Text style={[styles.locationDist, { color: 'rgba(255,255,255,0.80)' }]} numberOfLines={1}>
                  {distToStation < 1000
                    ? `${distToStation}m de ${selectedStation.name}`
                    : `${(distToStation / 1000).toFixed(1)}km de ${selectedStation.name}`}
                  {etas.walk !== null ? `  ·  🚶 ${etas.walk} min` : ''}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* ── Buscador "¿A dónde vas?" — modo país y metro ── */}
        {showDestSearch && (
          <View
            style={[styles.destSearchWrap, { backgroundColor: 'transparent' }]}
          >
            <View style={styles.destSearchHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name={isMetro ? 'subway-outline' : 'train-outline'} size={14} color={colors.text.primary} />
                <Text style={[styles.destSearchTitle, { color: colors.text.primary }]}>
                  {isMetro ? params.metroCity : t('split_where_going')}
                </Text>
              </View>
              <Pressable
                onPress={() => setShowDestSearch(false)}
                hitSlop={12}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#C4B5FD' }}>{t('close')}</Text>
              </Pressable>
            </View>
            <DestinationSearch
              onStationFound={handleDestinationFound}
              countryHint={countryHint}
              placeholder={isMetro ? t('split_search_addr') : t('split_search_city')}
              longDistance={!isMetro}
            />
          </View>
        )}

        {/* ── Botón para reabrir el buscador ── */}
        {!showDestSearch && (
          <Pressable
            style={[styles.reopenSearchBtn, {
              backgroundColor: 'rgba(255,255,255,0.07)',
              borderColor: destStation ? 'rgba(139,92,246,0.80)' : 'rgba(255,255,255,0.13)',
            }]}
            onPress={() => setShowDestSearch(true)}
          >
            <Ionicons
              name={destStation ? 'navigate' : 'search-outline'}
              size={13}
              color={destStation ? colors.brand.primary : colors.text.secondary}
            />
            <Text style={[styles.reopenSearchText, {
              color: destStation ? '#FFFFFF' : 'rgba(255,255,255,0.80)',
              flex: 1,
            }]} numberOfLines={1}>
              {destStation
                ? destStation.name
                : isMetro ? `${t('split_where_going')} · ${params.metroCity}` : t('split_where_going')}
            </Text>
            {destStation && searchedDestWalk > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="walk-outline" size={12} color={colors.brand.primary} />
                <Text style={[styles.reopenSearchWalk, { color: colors.brand.primary }]}>
                  {searchedDestWalk} min
                </Text>
              </View>
            )}
            {/* X para limpiar destino con un tap */}
            {destStation && (
              <Pressable
                onPress={() => {
                  setDestStation(null);
                  setSearchedDestWalk(0);
                  setMapDestination(null);
                }}
                hitSlop={10}
                style={styles.destClearBtn}
              >
                <Ionicons name="close" size={13} color={colors.text.primary} />
              </Pressable>
            )}
          </Pressable>
        )}

        {/* Destination strip (tourist mode only) */}
        {isTourist && destLabel && (
          <View style={styles.destStrip}>
            <Text style={[styles.destStripLabel, { color: colors.status.safe }]}>DESTINO</Text>
            <Ionicons name="business-outline" size={13} color={colors.status.safe} />
            <Text style={[styles.destStripName, { color: colors.text.primary }]} numberOfLines={1}>{destLabel}</Text>
          </View>
        )}

        <TrainCountdown
          clocks={clocks}
          isLoading={isLoading}
          isLive={isLive}
          onSelect={handleClockSelect}
          onBuy={handleClockBuy}
          originName={selectedStation?.name}
          destStationId={destStation?.id}
          destStationName={destStation?.name}
        />


      </ScrollView>

      {/* ── Barra flotante fija — siempre visible ── */}
      <View style={styles.floatingBar}>
        <Pressable
          style={[styles.floatingBtn, styles.floatingBtnPrimary]}
          onPress={() => router.push({
            pathname: '/buscar-viaje',
            params: {
              originId:   selectedStation?.id   ?? '',
              originName: selectedStation?.name ?? '',
              country:    params.country ?? 'ES',
            },
          })}
        >
          <Ionicons name="time-outline" size={14} color="#A78BFA" />
          <Text style={[styles.floatingBtnText, { color: '#A78BFA' }]}>{t('split_other_times')}</Text>
        </Pressable>
        <RNAnimated.View style={{ flex: 1, transform: [{ scale: travelPulse }] }}>
          <Pressable
            style={[styles.floatingBtn, styles.floatingBtnTravel, { flex: 0 }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowTravelModal(true); }}
          >
            <Ionicons name="sparkles" size={16} color="#FCD34D" />
            <Text style={[styles.floatingBtnText, { color: '#FCD34D' }]}>{t('split_discover')}</Text>
          </Pressable>
        </RNAnimated.View>
      </View>

      {/* ── BOTTOM HALF: Mapa animado ── */}
      <Animated.View style={[styles.bottomHalf, animatedMapStyle]}>
        {/* Barra superior del mapa con botón cerrar */}
        {mapMode !== 'hidden' && (
          <View style={styles.mapBar}>
            <ModeChip
              selected={transportMode}
              onChange={setTransportMode}
              destination={selectedStation?.coordinates}
              etas={etas}
            />
            <Pressable onPress={closeMap} style={styles.mapCloseBtn} hitSlop={12}>
              <Ionicons name="chevron-down" size={18} color="rgba(255,255,255,0.5)" />
            </Pressable>
          </View>
        )}


        {IS_EXPO_GO ? (
          // Expo Go no soporta Google Maps nativo — mostrar placeholder
          <View style={[styles.map, styles.mapPlaceholder]}>
            <Ionicons name="map-outline" size={40} color="rgba(124,58,237,0.4)" />
            <Text style={styles.mapPlaceholderText}>{t('split_map_native')}</Text>
            {selectedStation && (
              <Text style={styles.mapPlaceholderSub}>
                📍 {selectedStation.name}
              </Text>
            )}
          </View>
        ) : (
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            initialRegion={initialRegion}
            customMapStyle={DARK_MAP_STYLE}
            showsUserLocation
            showsMyLocationButton={false}
            showsCompass={false}
            showsTraffic={false}
            showsBuildings={false}
            rotateEnabled={false}
            userInterfaceStyle="dark"
          >
            {routePolyline.length > 1 && (
              <Polyline
                coordinates={routePolyline}
                strokeColor={colors.brand.primary}
                strokeWidth={4}
                lineDashPattern={transportMode === 'walk' ? [8, 6] : undefined}
              />
            )}
            {/* Marker estación origen (púrpura) — solo si no hay destino de tren */}
            {selectedStation && !mapDestination && (
              <Marker
                coordinate={selectedStation.coordinates}
                title={selectedStation.name}
                description="Estación de origen"
                pinColor="#C4B5FD"
              />
            )}
            {/* Marker destino del tren seleccionado (verde) */}
            {mapDestination && (
              <Marker
                coordinate={mapDestination.coordinates}
                title={mapDestination.name}
                description="Destino del tren"
                pinColor="#30D158"
              />
            )}
            {destStation && !mapDestination && (
              <Marker
                coordinate={destStation.coordinates}
                title={destLabel ?? destStation.name}
                description="Tu destino"
                pinColor="#30D158"
              />
            )}
            {selectedStation && (
              <Circle
                center={selectedStation.coordinates}
                radius={50}
                fillColor="rgba(124,58,237,0.08)"
                strokeColor="rgba(124,58,237,0.4)"
                strokeWidth={1}
              />
            )}
            {livePosition.coordinates && !livePosition.isLoading && (
              <LiveTrainMarker
                coordinate={livePosition.coordinates}
                bearing={livePosition.bearing}
                isLive={livePosition.isLive}
              />
            )}
          </MapView>
        )}

        {/* Delay badge superpuesto sobre el mapa */}
        {selectedService && !livePosition.isLoading && (
          <DelayBadge
            minutes={livePosition.delayMinutes}
            isLive={livePosition.isLive}
          />
        )}
      </Animated.View>

      {/* ── Purchase success banner ── */}
      {purchaseBookingRef && (
        <PurchaseSuccessBanner
          bookingRef={purchaseBookingRef}
          destName={destLabel ?? selectedService?.destination.name ?? 'destino'}
          onDismiss={() => setPurchaseBookingRef(null)}
        />
      )}

      {/* ── DISCOVER — overlay absoluto (igual que station picker, evita bugs Modal Android) ── */}
      {showTravelModal && (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 998, backgroundColor: 'transparent' }]}>
          <LinearGradient colors={[...Gradients.screenBg]} style={[StyleSheet.absoluteFillObject, styles.travelModalRoot]}>
            {/* Header */}
            <View style={[styles.travelModalHeader, { borderBottomColor: 'rgba(255,255,255,0.08)', paddingTop: 50 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="sparkles" size={18} color="#F59E0B" />
                <Text style={[styles.travelModalTitle, { color: colors.text.primary }]}>{t('split_discover')}</Text>
              </View>
              <Pressable onPress={() => setShowTravelModal(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.text.muted} />
              </Pressable>
            </View>

            <TrainSceneBg />
            <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.travelModalContent, { minHeight: 500 }]} showsVerticalScrollIndicator={false}>

              {/* Trenes escénicos — país actual primero, luego el resto */}
              {(() => {
                const currentCode = params.country?.split('_')[0] ?? '';
                const local  = SCENIC_TRAINS.filter(t => t.country === currentCode);
                const others = SCENIC_TRAINS.filter(t => t.country !== currentCode);
                const renderCard = (train: typeof SCENIC_TRAINS[0]) => (
                  <Pressable
                    key={train.id}
                    style={[styles.scenicCard, { backgroundColor: 'rgba(255,255,255,0.07)', borderColor: train.colors[0] + '66' }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setShowTravelModal(false);
                      const dep = new Date(); dep.setHours(9, 0, 0, 0);
                      // Navegador externo (el AffiliateWebView interno no renderiza en Android).
                      Linking.openURL(buildScenicTrainUrl(train.origin, train.dest, dep)).catch(() => {});
                    }}
                  >
                    <LinearGradient colors={train.colors} style={styles.scenicIconBadge} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                      <Ionicons name="train" size={22} color="#fff" />
                    </LinearGradient>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.scenicTitle, { color: colors.text.primary }]}>{train.name}</Text>
                      <Text style={[styles.scenicSub, { color: colors.text.muted }]}>{train.route} · {train.duration}</Text>
                      {train.description && <Text style={[styles.scenicDesc, { color: colors.text.secondary }]}>{t(('scenic_' + train.id.replace(/-/g, '_') + '_desc') as any)}</Text>}
                    </View>
                    <View style={[styles.scenicBadge, { backgroundColor: '#7C3AED' }]}><Text style={styles.scenicBadgeText}>{t('intl_book')}</Text></View>
                  </Pressable>
                );
                return (
                  <>
                    {local.length > 0 && (
                      <>
                        <Text style={[styles.travelModalSection, { color: colors.text.muted }]}>{t('intl_scenic')}</Text>
                        {local.map(renderCard)}
                      </>
                    )}
                    {others.length > 0 && (
                      <>
                        <Text style={[styles.travelModalSection, { color: colors.text.muted, marginTop: local.length > 0 ? 16 : 0 }]}>
                          {local.length > 0 ? t('discover_other') : t('intl_scenic')}
                        </Text>
                        {others.map(renderCard)}
                      </>
                    )}
                  </>
                );
              })()}

              {/* Partners por ciudad */}
              {selectedStation && (() => {
                const cityOffers = getCityOffers(selectedStation.name);
                if (cityOffers.length === 0) return null;
                return (
                  <>
                    <Text style={[styles.travelModalSection, { color: colors.text.muted }]}>{t('discover_services')}</Text>
                    {cityOffers.map((offer, i) => (
                      <View key={`partner-modal-${i}`} style={{ marginBottom: 10 }}>
                        <PartnerCard {...offer} />
                      </View>
                    ))}
                  </>
                );
              })()}

            </ScrollView>
          </LinearGradient>
        </View>
      )}

      {/* ── Picker de estación manual — overlay absoluto (evita bugs de Modal transparent en Android) ── */}
      {showStationPicker && (
        <View style={styles.pickerOverlay}>
          {/* Backdrop: toca fuera para cerrar */}
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => { Keyboard.dismiss(); setShowStationPicker(false); }} />
          <View style={[styles.pickerSheet, { backgroundColor: '#13133A', paddingTop: insets.top + 16 }]}>

            {/* ── Header explicativo ── */}
            <View style={styles.pickerHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.pickerTitle, { color: colors.text.primary }]}>Estación de salida</Text>
                <Text style={[styles.pickerSubtitle, { color: 'rgba(255,255,255,0.72)' }]}>
                  Elegí desde qué estación querés ver las salidas
                </Text>
              </View>
              <Pressable
                onPress={() => { Keyboard.dismiss(); setShowStationPicker(false); }}
                hitSlop={8}
                style={({ pressed }) => [styles.pickerClose, pressed && { backgroundColor: 'rgba(255,255,255,0.18)' }]}
              >
                <Ionicons name="close" size={20} color={colors.text.primary} />
              </Pressable>
            </View>

            {/* ── Estación actual seleccionada ── */}
            {selectedStation && (
              <View style={[styles.pickerCurrentRow, { backgroundColor: 'rgba(139,92,246,0.12)', borderColor: 'rgba(139,92,246,0.35)' }]}>
                <Ionicons name="location" size={16} color={colors.brand.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pickerCurrentLabel, { color: 'rgba(255,255,255,0.6)' }]}>Saliendo desde</Text>
                  <Text style={[styles.pickerCurrentName, { color: colors.text.primary }]}>{selectedStation.name}</Text>
                </View>
                <View style={[styles.pickerGpsBadge, { borderColor: 'rgba(139,92,246,0.40)' }]}>
                  <Ionicons name="navigate-circle-outline" size={11} color={colors.brand.primary} />
                  <Text style={[styles.pickerGpsText, { color: colors.brand.primary }]}>GPS</Text>
                </View>
              </View>
            )}

            {/* ── Buscador ── */}
            <View style={[styles.pickerInputRow, { backgroundColor: colors.bg.elevated, borderColor: colors.border.subtle }]}>
              <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.6)" />
              <TextInput
                style={[styles.pickerInput, { color: colors.text.primary }]}
                placeholder="Buscar otra ciudad o estación…"
                placeholderTextColor="rgba(255,255,255,0.6)"
                value={stationQuery}
                onChangeText={setStationQuery}
                autoFocus
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={() => {
                  if (stationSuggestions.length > 0) {
                    Keyboard.dismiss();
                    setSelectedStation(stationSuggestions[0]);
                    setShowStationPicker(false);
                  }
                }}
              />
              {stationSearching && <ActivityIndicator size="small" color={colors.brand.primary} />}
            </View>
            {/* Sugerencias */}
            <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
              {stationSuggestions.map((s, i) => (
                <Pressable
                  key={s.id}
                  style={({ pressed }) => [
                    styles.pickerItem,
                    { borderBottomColor: colors.border.subtle },
                    i === 0 && styles.pickerItemMain,
                    pressed && { backgroundColor: 'rgba(139,92,246,0.12)' },
                  ]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setSelectedStation(s);
                    setShowStationPicker(false);
                  }}
                >
                  <Ionicons name="train-outline" size={15} color={i === 0 ? colors.brand.primary : colors.text.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pickerItemText, { color: i === 0 ? colors.text.primary : colors.text.secondary }]} numberOfLines={1}>{s.name}</Text>
                    {i === 0 && <Text style={styles.pickerItemSub}>{t('main_station_sub')}</Text>}
                  </View>
                  {i === 0
                    ? <View style={styles.pickerMainBadge}><Text style={styles.pickerMainBadgeText}>{t('main_station')}</Text></View>
                    : <Ionicons name="chevron-forward" size={12} color={colors.text.muted} />
                  }
                </Pressable>
              ))}
              {stationQuery.length >= 2 && !stationSearching && stationSuggestions.length === 0 && (
                <Text style={[styles.pickerEmpty, { color: colors.text.muted }]}>Sin resultados para "{stationQuery}"</Text>
              )}
            </ScrollView>
          </View>
        </View>
      )}

      {/* ── Affiliate WebView checkout (primary) ── */}
      {selectedService && (
        <AffiliateWebView
          service={selectedService}
          visible={affiliateVisible}
          onClose={() => {
            setAffiliateVisible(false);
            // Stop monitoring if user cancels checkout
            stopPlatformMonitoring(selectedService.serviceId);
          }}
          onPurchaseSuccess={handlePurchaseSuccess}
        />
      )}

      {/* WebView tren escénico seleccionado */}
      {(() => {
        const train = SCENIC_TRAINS.find(t => t.id === scenicVisible);
        if (!train) return null;
        const dep = new Date(); dep.setHours(9, 0, 0, 0);
        const arr = new Date(); arr.setHours(9, 0, 0, 0);
        return (
          <AffiliateWebView
            service={{
              serviceId:    train.id,
              operator:     'other' as any,
              trainType:    'high-speed',
              trainNumber:  train.id.toUpperCase().slice(0, 3),
              origin:       { id: '', name: train.origin, nameLocal: train.origin, country: train.originCountry as any, coordinates: train.originCoords, platforms: [] },
              destination:  { id: '', name: train.dest,   nameLocal: train.dest,   country: train.destCountry as any,   coordinates: train.destCoords,   platforms: [] },
              departureTime: dep,
              arrivalTime:   arr,
              delayMinutes: 0,
              status:       'on-time',
              classes:      ['first', 'second'],
            }}
            visible={!!scenicVisible}
            onClose={() => setScenicVisible(null)}
            onPurchaseSuccess={() => setScenicVisible(null)}
          />
        );
      })()}

    </View>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  // Upper 50%
  topHalf: {
    flex:              1,
    backgroundColor:   'transparent',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  topNav: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: Spacing['4'],
    paddingTop:       Platform.select({ ios: 52, android: 36 }),
    paddingBottom:    Spacing['2'],
    gap:              Spacing['3'],
  },
  navFlag: {
    // Pequeño badge de bandera en el nav — target del shared element transition
    width:  30,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
  },
  backBtn: {
    paddingVertical:   Spacing['2'],
    paddingHorizontal: Spacing['3'],
    minHeight:         44,
    justifyContent:    'center',
  },
  backText: {
    fontSize:   Typography.size.md,
    color:      '#C4B5FD',
    fontWeight: Typography.weight.semibold,
  },
  stationPill: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    paddingVertical:   9,
    paddingHorizontal: 14,
    backgroundColor:   'rgba(255,255,255,0.08)',
    borderRadius:      Radius.full,
    borderWidth:       1,
    borderColor:       'rgba(139,92,246,0.50)',
  },
  stationPillText: {
    fontSize:   13,
    fontWeight: '600',
    flex:       1,
  },

  // Station picker modal
  pickerOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end',
    zIndex: 999,
  },
  pickerSheet: { flex: 1, paddingHorizontal: 20, paddingBottom: 20 },
  pickerHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  pickerClose: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  pickerTitle:    { fontSize: Typography.size.lg, fontWeight: Typography.weight.bold },
  pickerSubtitle: { fontSize: Typography.size.sm, marginTop: 3, lineHeight: 18 },
  pickerCurrentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12,
  },
  pickerCurrentLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  pickerCurrentName:  { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold },
  pickerGpsBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
  },
  pickerGpsText: { fontSize: 10, fontWeight: '700' as const },
  pickerInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
  },
  pickerInput: { flex: 1, fontSize: Typography.size.sm, padding: 0 },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, borderBottomWidth: 1,
  },
  pickerItemMain: {
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderRadius: 10,
    paddingHorizontal: 8,
    marginHorizontal: -8,
    borderBottomWidth: 0,
    marginBottom: 4,
  },
  pickerItemText: { fontSize: Typography.size.sm, flex: 1 },
  pickerItemSub:  { fontSize: 11, color: 'rgba(196,181,253,0.70)', marginTop: 2 },
  pickerMainBadge: {
    backgroundColor: 'rgba(139,92,246,0.20)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.50)',
  },
  pickerMainBadgeText: { fontSize: 10, fontWeight: '700' as const, color: '#C4B5FD' },
  pickerEmpty: { textAlign: 'center', marginTop: 30, fontSize: Typography.size.sm },
  refreshBtn: {
    width:          44,
    height:         44,
    alignItems:     'center',
    justifyContent: 'center',
  },
  refreshText: {
    fontSize: Typography.size.xl,
    color:    'rgba(235,235,245,0.60)',
  },

  // Buscador de dirección (metro mode)
  destSearchWrap: {
    paddingHorizontal: Spacing['4'],
    paddingTop:        Spacing['1'],
    paddingBottom:     Spacing['2'],
    gap:               Spacing['1'],
    borderBottomWidth: 0,
  },
  destSearchHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  destSearchTitle: {
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color:      '#FFFFFF',
  },
  destSearchClose: {
    fontSize: Typography.size.sm,
    color:    'rgba(235,235,245,0.60)',
    padding:  Spacing['1'],
  },

  // "Reabrir buscador" pill cuando está colapsado
  reopenSearchBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               Spacing['2'],
    marginHorizontal:  Spacing['4'],
    marginBottom:      Spacing['2'],
    paddingVertical:   12,
    paddingHorizontal: Spacing['3'],
    backgroundColor:   'rgba(255,255,255,0.07)',
    borderRadius:      Radius.xl,
    borderWidth:       1,
    borderColor:       'rgba(139,92,246,0.30)',
  },
  reopenSearchIcon: { fontSize: 13 },
  reopenSearchText: {
    flex:       1,
    fontSize:   Typography.size.xs,
    color:      'rgba(235,235,245,0.60)',
  },
  reopenSearchWalk: {
    fontSize:   Typography.size.xs,
    color:      '#C4B5FD',
    fontWeight: Typography.weight.semibold,
  },
  destClearBtn: {
    width:           22,
    height:          22,
    borderRadius:    11,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems:      'center',
    justifyContent:  'center',
    marginLeft:      4,
  },

  // Destination strip (tourist mode)
  destStrip: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              Spacing['2'],
    paddingHorizontal: Spacing['4'],
    paddingVertical:  Spacing['1'],
    backgroundColor:  'rgba(34,197,94,0.06)',
    borderBottomWidth: 1,
    borderBottomColor:'rgba(34,197,94,0.15)',
  },
  destStripLabel: {
    fontSize:     Typography.size.xs,
    fontWeight:   Typography.weight.bold,
    color:        '#30D158',
    letterSpacing:1.5,
  },
  destStripName: {
    flex:       1,
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color:      '#FFFFFF',
  },

  // Divider
  // Trenes panorámicos destacados
  scenicCard: {
    flexDirection:    'row',
    alignItems:       'center',
    marginHorizontal: Spacing['3'],
    marginBottom:     Spacing['2'],
    padding:          Spacing['3'],
    borderRadius:     Radius.lg,
    borderWidth:      1,
    gap:              Spacing['3'],
  },
  scenicSectionLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.2,
    marginHorizontal: Spacing['3'], marginTop: Spacing['2'], marginBottom: 2,
  },
  scenicIconBadge: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  scenicTitle:      { fontSize: Typography.size.sm, fontWeight: Typography.weight.bold },
  scenicSub:        { fontSize: Typography.size.xs, marginTop: 2 },
  scenicDesc:       { fontSize: 13, marginTop: 6, lineHeight: 19, opacity: 0.80 },
  scenicBadge: {
    paddingHorizontal: Spacing['3'],
    paddingVertical:   Spacing['2'],
    borderRadius:      Radius.md,
    alignSelf:         'center',
  },
  scenicBadgeText:  { fontSize: Typography.size.xs, fontWeight: '700', color: '#fff' },

  floatingBar: {
    flexDirection:     'row',
    gap:               10,
    marginHorizontal:  12,
    marginVertical:    8,
    paddingHorizontal: 12,
    paddingVertical:   10,
    backgroundColor:   'rgba(14,14,46,0.55)',
    borderRadius:      28,
    borderWidth:       1,
    borderColor:       'rgba(167,139,250,0.35)',
    shadowColor:       '#7C3AED',
    shadowOffset:      { width: 0, height: 4 },
    shadowOpacity:     0.20,
    shadowRadius:      16,
    elevation:         8,
  },
  floatingBtn: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               6,
    paddingVertical:   11,
    borderRadius:      30,
    borderWidth:       1,
  },
  floatingBtnPrimary: {
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderColor:     'rgba(139,92,246,0.70)',
  },
  floatingBtnTravel: {
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderColor:     'rgba(245,158,11,0.70)',
  },
  floatingBtnText: {
    fontSize:      11,
    fontWeight:    '700',
    letterSpacing: 1.2,
  },
  travelModalRoot: {
    flex: 1,
  },
  travelModalHeader: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 16,
    paddingVertical:   14,
    borderBottomWidth: 1,
  },
  travelModalTitle: {
    fontSize:      13,
    fontWeight:    '700',
    letterSpacing: 1.5,
  },
  travelModalContent: {
    padding: 14,
    paddingBottom: 40,
  },
  travelModalSection: {
    fontSize:      10,
    fontWeight:    '700',
    letterSpacing: 1.5,
    marginTop:     12,
    marginBottom:  8,
    marginLeft:    2,
  },

  // WebView bar
  wvBar: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: Spacing['3'],
    paddingVertical:   Spacing['2'],
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor:   '#1C1C1E',
  },
  wvTitle: {
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color:      '#fff',
  },
  wvBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 18,
  },

  // Lower 50%
  bottomHalf: {
    overflow: 'hidden',
  },
  mapBar: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingRight:   8,
  },
  mapCloseBtn: {
    padding: 6,
    marginLeft: -4,
  },
  map: {
    flex: 1,
  },
  mapPlaceholder: {
    backgroundColor: '#0a0a0f',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  mapPlaceholderText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
    fontWeight: '500',
  },
  mapPlaceholderSub: {
    color: 'rgba(124,58,237,0.7)',
    fontSize: 12,
  },

  // Purchase success banner
  successBanner: {
    position:         'absolute',
    bottom:           0,
    left:             0,
    right:            0,
    flexDirection:    'row',
    alignItems:       'flex-start',
    gap:              Spacing['3'],
    padding:          Spacing['4'],
    paddingBottom:    Platform.select({ ios: 34, android: 20 }),
    backgroundColor:  'rgba(52,211,153,0.12)',
    borderTopWidth:   1,
    borderTopColor:   '#34D399',
    borderLeftWidth:  0,
    ...Shadows.glass,
  },
  successTitle: {
    fontSize:   Typography.size.md,
    fontWeight: Typography.weight.bold,
    color:      '#FFFFFF',
    marginBottom: 2,
  },
  successSub: {
    fontSize:   Typography.size.sm,
    color:      '#C4B5FD',
    fontWeight: Typography.weight.semibold,
    marginBottom: 4,
  },
  successHint: {
    fontSize: Typography.size.xs,
    color:    'rgba(235,235,245,0.60)',
    lineHeight: 16,
  },
  successClose: {
    width:          32,
    height:         32,
    alignItems:     'center',
    justifyContent: 'center',
    borderRadius:   Radius.full,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  locationBanner: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              8,
    paddingHorizontal:16,
    paddingVertical:  8,
    borderBottomWidth:1,
  },
  locationBannerText: { flex: 1 },
  locationPlace: { fontSize: 13, fontWeight: '600' },
  locationDist:  { fontSize: 11, marginTop: 1 },
});
