/**
 * WoW TRENES — Split-Screen 50/50 (STEP 2 + Tourist v2)
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
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Constants from 'expo-constants';
import { t } from '../services/i18n';

// En Expo Go el mapa de Google no funciona (requiere build nativo)
const IS_EXPO_GO = Constants.appOwnership === 'expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MapView, { Marker, Polyline, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';

import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import TrainCountdown    from '../components/TrainCountdown';
import ModeChip          from '../components/ModeChip';
import AffiliateWebView  from '../components/AffiliateWebView';

import { useTrainSchedules }          from '../hooks/useTrainSchedules';
import { useLocation }                from '../hooks/useLocation';
import { useLiveTrainPosition }       from '../services/liveTrainPosition';
import { findNearestStation, getStationById, getFirstStation, getMainStation, searchStations, detectCountryFromCoords, setActiveCountry } from '../services/gtfsDatabase';
import { optimizeRoute, calculateETA } from '../services/routeOptimizer';
import { startPlatformMonitoring, stopPlatformMonitoring } from '../services/trainArrivalMonitor';
import { registerDestinationGeofence, refreshGeofences }  from '../tasks/geofenceTask';
import { storeTicket }                from '../services/ticketStorage';
import { getPlaceName }              from '../services/geocodingService';

import DestinationSearch from '../components/DestinationSearch';

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
// Tarjetas dominantes: 58% superior para trenes, 42% para mapa + modos
const HALF_H = H * 0.58;

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
    <Animated.View entering={FadeIn.duration(400)} exiting={FadeOut.duration(300)} style={styles.successBanner}>
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
    </Animated.View>
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
  const mapRef     = useRef<MapView>(null);
  const isTourist  = params.mode === 'tourist';
  // Modo metro: país con código de ciudad (US_NYC, ES_MAD, ES_BCN…)
  const isMetro    = !!params.metroCity;
  // Hint ISO-2 para el geocoder (extrae el country base del código)
  const countryHint = params.country?.split('_')[0] ?? 'ES';

  // ── State ──────────────────────────────────────────────────────────────
  const [transportMode,    setTransportMode]    = useState<TransportMode>('walk');
  const [selectedStation,  setSelectedStation]  = useState<Station | null>(null);
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
  const [showDestSearch,   setShowDestSearch]   = useState(true); // visible en modo país y metro

  // ETAs para los 3 modos de transporte (minutos)
  const [etas, setEtas] = useState<Record<TransportMode, number | null>>({
    walk: null, bus: null, rideshare: null,
  });

  // Nombre del lugar donde está el usuario (reverse geocoding)
  const [placeName, setPlaceName] = useState<string | null>(null);
  // Distancia en metros a la estación más cercana
  const [distToStation, setDistToStation] = useState<number | null>(null);

  // Checkout — affiliate WebView (primary)
  const [affiliateVisible, setAffiliateVisible] = useState(false);

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
          if (st) { setSelectedStation(st); return; }
        } catch { /* fall through to GPS fallback */ }
      }
      // Country mode — si el usuario eligió un país explícitamente,
      // intentar GPS solo si las coordenadas caen dentro de ese país.
      // Si el GPS está en otro país (ej: fake Madrid → Alemania), ignorar GPS
      // y usar la estación principal del país seleccionado.
      if (userCoords) {
        const gpsCountry = detectCountryFromCoords(userCoords);
        const selectedCountry = params.country?.split('_')[0] ?? null;
        // Solo usar GPS si coincide con el país seleccionado
        if (!selectedCountry || gpsCountry === selectedCountry || gpsCountry === params.country) {
          const station = await findNearestStation(userCoords);
          if (station) { setSelectedStation(station); return; }
        }
      }
      // GPS no coincide con el país → estación principal hardcodeada del país
      if (params.country) {
        await setActiveCountry(params.country as any).catch(() => {});
      }
      const fallback = await getMainStation(params.country as CountryCode | undefined);
      if (fallback) {
        setSelectedStation(fallback);
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
        const results = await searchStations(stationQuery, 12, country);
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
  }, [params.country]);

  // Tap en "Comprar" → abre checkout + monitoreo
  const handleClockBuy = useCallback((clock: PredictiveClock) => {
    const svc = clock.train;
    setSelectedService(svc);
    startPlatformMonitoring(svc);
    setAffiliateVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
  }, [selectedService, params.destStationId, params.destName]);

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

      {/* ── TOP HALF: Predictive Clock ── */}
      <View style={styles.topHalf}>

        {/* Nav bar */}
        <View style={styles.topNav}>
          <Pressable
            onPress={handleBack}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Volver"
          >
            <Text style={styles.backText}>‹ {isTourist ? 'Mapa' : 'Países'}</Text>
          </Pressable>

          {/* Origin station pill — muestra estación actual, tappeable para cambiar */}
          <Pressable
            style={[styles.stationPill, { backgroundColor: colors.bg.elevated, borderColor: colors.brand.primary + '66' }]}
            onPress={() => { setStationQuery(''); setStationSuggestions([]); setShowStationPicker(true); }}
            accessibilityLabel="Cambiar estación"
            accessibilityHint="Toca para buscar otra estación"
          >
            <Ionicons name="location" size={13} color={colors.brand.primary} />
            <Text style={[styles.stationPillText, { color: selectedStation ? colors.text.primary : colors.text.muted }]} numberOfLines={1}>
              {selectedStation?.name ?? '…'}
            </Text>
            <Ionicons name="chevron-down" size={12} color={colors.brand.primary} />
          </Pressable>

          <Pressable onPress={refresh} style={styles.refreshBtn} accessibilityLabel="Actualizar horarios">
            <Text style={styles.refreshText}>↻</Text>
          </Pressable>
        </View>

        {/* ── Banner: dónde estás → distancia a estación ── */}
        {(placeName || distToStation !== null) && (
          <View style={[styles.locationBanner, { backgroundColor: colors.bg.surface, borderBottomColor: colors.border.subtle }]}>
            <Ionicons name="navigate-circle-outline" size={14} color={colors.brand.primary} />
            <View style={styles.locationBannerText}>
              {placeName && (
                <Text style={[styles.locationPlace, { color: colors.text.primary }]} numberOfLines={1}>
                  {placeName}
                </Text>
              )}
              {distToStation !== null && selectedStation && (
                <Text style={[styles.locationDist, { color: colors.text.muted }]} numberOfLines={1}>
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
          <Animated.View
            entering={FadeIn.duration(300)}
            exiting={FadeOut.duration(200)}
            style={[styles.destSearchWrap, { backgroundColor: colors.bg.surface, borderBottomColor: colors.border.subtle }]}
          >
            <View style={styles.destSearchHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name={isMetro ? 'subway-outline' : 'train-outline'} size={14} color={colors.text.primary} />
                <Text style={[styles.destSearchTitle, { color: colors.text.primary }]}>
                  {isMetro ? params.metroCity : '¿A dónde vas?'}
                </Text>
              </View>
              <Pressable onPress={() => setShowDestSearch(false)} hitSlop={8}>
                <Ionicons name="close" size={16} color={colors.text.secondary} />
              </Pressable>
            </View>
            <DestinationSearch
              onStationFound={handleDestinationFound}
              countryHint={countryHint}
              placeholder={isMetro ? 'Escribe una calle o lugar…' : 'Ciudad o estación destino…'}
              longDistance={!isMetro}
            />
          </Animated.View>
        )}

        {/* ── Botón para reabrir el buscador ── */}
        {!showDestSearch && (
          <Pressable
            style={[styles.reopenSearchBtn, { backgroundColor: colors.bg.elevated, borderColor: colors.border.default }]}
            onPress={() => setShowDestSearch(true)}
          >
            <Ionicons name="search-outline" size={13} color={colors.text.secondary} />
            <Text style={[styles.reopenSearchText, { color: colors.text.secondary }]} numberOfLines={1}>
              {destStation
                ? `Destino: ${destStation.name}`
                : isMetro ? `¿A dónde vas en ${params.metroCity}?` : '¿A dónde vas?'}
            </Text>
            {destStation && searchedDestWalk > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="walk-outline" size={12} color={colors.brand.primary} />
                <Text style={[styles.reopenSearchWalk, { color: colors.brand.primary }]}>
                  {searchedDestWalk} min
                </Text>
              </View>
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
        />
      </View>

      {/* Divider — acceso a otros horarios */}
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <View style={styles.dividerActions}>
          <Pressable
            style={[styles.dividerPill, styles.dividerPillBuy]}
            onPress={() => router.push({
              pathname: '/buscar-viaje',
              params: {
                originId:   selectedStation?.id   ?? '',
                originName: selectedStation?.name ?? '',
                country:    params.country ?? 'ES',
              },
            })}
          >
            <Ionicons name="calendar-outline" size={13} color="#fff" />
            <Text style={[styles.dividerPillText, { color: '#fff' }]}>{t('split_other_times')}</Text>
          </Pressable>
        </View>
        <View style={styles.dividerLine} />
      </View>

      {/* ── BOTTOM HALF: Multimodal Map ── */}
      <View style={styles.bottomHalf}>
        <ModeChip
          selected={transportMode}
          onChange={setTransportMode}
          destination={selectedStation?.coordinates}
          etas={etas}
        />

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
      </View>

      {/* ── Purchase success banner ── */}
      {purchaseBookingRef && (
        <PurchaseSuccessBanner
          bookingRef={purchaseBookingRef}
          destName={destLabel ?? selectedService?.destination.name ?? 'destino'}
          onDismiss={() => setPurchaseBookingRef(null)}
        />
      )}

      {/* ── Modal picker de estación manual ── */}
      <Modal visible={showStationPicker} animationType="slide" transparent onRequestClose={() => setShowStationPicker(false)}>
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.bg.base }]}>
            {/* Header */}
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: colors.text.primary }]}>Cambiar estación</Text>
              <Pressable onPress={() => setShowStationPicker(false)}>
                <Ionicons name="close" size={22} color={colors.text.muted} />
              </Pressable>
            </View>
            {/* Search input */}
            <View style={[styles.pickerInputRow, { backgroundColor: colors.bg.elevated, borderColor: colors.border.subtle }]}>
              <Ionicons name="search-outline" size={16} color={colors.text.muted} />
              <TextInput
                style={[styles.pickerInput, { color: colors.text.primary }]}
                placeholder="Buscar estación..."
                placeholderTextColor={colors.text.muted}
                value={stationQuery}
                onChangeText={setStationQuery}
                autoFocus
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={() => {
                  if (stationSuggestions.length > 0) {
                    setSelectedStation(stationSuggestions[0]);
                    setShowStationPicker(false);
                  }
                }}
              />
              {stationSearching && <ActivityIndicator size="small" color={colors.brand.primary} />}
            </View>
            {/* Sugerencias */}
            <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
              {stationSuggestions.map(s => (
                <Pressable
                  key={s.id}
                  style={[styles.pickerItem, { borderBottomColor: colors.border.subtle }]}
                  onPress={() => {
                    setSelectedStation(s);
                    setShowStationPicker(false);
                  }}
                >
                  <Ionicons name="train-outline" size={15} color={colors.brand.primary} />
                  <Text style={[styles.pickerItemText, { color: colors.text.primary }]} numberOfLines={1}>{s.name}</Text>
                </Pressable>
              ))}
              {stationQuery.length >= 2 && !stationSearching && stationSuggestions.length === 0 && (
                <Text style={[styles.pickerEmpty, { color: colors.text.muted }]}>Sin resultados para "{stationQuery}"</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

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

    </View>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: '#000000',
  },

  // Upper 50%
  topHalf: {
    height:            HALF_H,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  topNav: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: Spacing['4'],
    paddingTop:       Platform.select({ ios: 52, android: 36 }),
    paddingBottom:    Spacing['2'],
    gap:              Spacing['3'],
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
    paddingVertical:   8,
    paddingHorizontal: 12,
    backgroundColor:   '#2C2C2E',
    borderRadius:      Radius.full,
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.09)',
  },
  stationPillText: {
    fontSize:   13,
    fontWeight: '600',
    flex:       1,
  },

  // Station picker modal
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  pickerSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  pickerTitle: { fontSize: Typography.size.base, fontWeight: Typography.weight.bold },
  pickerInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
  },
  pickerInput: { flex: 1, fontSize: Typography.size.sm, padding: 0 },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, borderBottomWidth: 1,
  },
  pickerItemText: { fontSize: Typography.size.sm, flex: 1 },
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
    paddingBottom:     Spacing['2'],
    gap:               Spacing['2'],
    backgroundColor:   '#1C1C1E',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
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
    paddingVertical:   Spacing['2'],
    paddingHorizontal: Spacing['3'],
    backgroundColor:   '#2C2C2E',
    borderRadius:      Radius.lg,
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.09)',
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
  divider: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: Spacing['4'],
    paddingVertical:   Spacing['2'],
    gap:               Spacing['3'],
    backgroundColor:   '#1C1C1E',
    borderTopWidth:    1,
    borderTopColor:    'rgba(167,139,250,0.20)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(167,139,250,0.20)',
  },
  dividerLine: {
    flex:            1,
    height:          1,
    backgroundColor: 'rgba(167,139,250,0.25)',
  },
  dividerActions: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           0,
  },
  dividerPill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    paddingVertical:   6,
    paddingHorizontal: 12,
    borderRadius:      20,
    borderWidth:       1,
    borderColor:       'rgba(167,139,250,0.45)',
    backgroundColor:   'rgba(167,139,250,0.10)',
  },
  dividerPillBuy: {
    marginLeft:      8,
    backgroundColor: '#7C3AED',
    borderColor:     '#7C3AED',
  },
  dividerSep: {
    width:           1,
    height:          16,
    backgroundColor: 'rgba(167,139,250,0.20)',
    marginHorizontal:4,
  },
  dividerPillText: {
    fontSize:      10,
    fontWeight:    '700',
    color:         '#A78BFA',
    letterSpacing: 1.5,
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
    flex:     1,
    overflow: 'hidden',
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
    backgroundColor:  '#2C2C2E',
    borderTopWidth:   1,
    borderTopColor:   '#30D158',
    ...Shadows.card,
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
