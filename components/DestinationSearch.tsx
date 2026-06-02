/**
 * DestinationSearch — Búsqueda de estación destino
 *
 * Modo 'station' (país/larga distancia):
 *   Escribe "Málaga" → lista de estaciones GTFS que coinciden → elegís una
 *   Offline-first, sin geocoding, sin API key.
 *
 * Modo 'address' (metro):
 *   Escribe dirección/barrio → geocodifica → estación más cercana
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, TextInput, Text, StyleSheet,
  Pressable, ActivityIndicator, Keyboard,
  Platform, ScrollView,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { Typography, Spacing, Radius } from '../theme';
import { useAddressToStation, type AddressSearchResult } from '../hooks/useAddressToStation';
import { searchStations } from '../services/gtfsDatabase';
import type { Station, CountryCode } from '../types';

const D = {
  bg:        '#2C2C2E',
  bgOverlay: 'rgba(0,0,0,0.6)',
  border:    'rgba(255,255,255,0.09)',
  primary:   '#8B5CF6',
  text:      '#FFFFFF',
  muted:     'rgba(235,235,245,0.30)',
  secondary: 'rgba(235,235,245,0.60)',
  brand:     '#C4B5FD',
  danger:    '#FF453A',
} as const;

interface DestinationSearchProps {
  onStationFound: (station: Station, walkMinutes: number) => void;
  countryHint?:   string;
  placeholder?:   string;
  longDistance?:  boolean; // true = modo station (larga distancia), false = modo address (metro)
}

export default function DestinationSearch({
  onStationFound,
  countryHint,
  placeholder,
  longDistance = false,
}: DestinationSearchProps) {
  const defaultPlaceholder = longDistance ? 'Ciudad o estación destino…' : '¿A dónde vas? Escribe la dirección…';

  return longDistance
    ? <StationSearch
        onStationFound={onStationFound}
        countryHint={countryHint}
        placeholder={placeholder ?? defaultPlaceholder}
      />
    : <AddressSearch
        onStationFound={onStationFound}
        countryHint={countryHint}
        placeholder={placeholder ?? defaultPlaceholder}
      />;
}

// ── Modo station — busca directamente en GTFS ─────────────────────────────────
function StationSearch({ onStationFound, countryHint, placeholder }: {
  onStationFound: (station: Station, walkMinutes: number) => void;
  countryHint?:   string;
  placeholder:    string;
}) {
  const [text,       setText]       = useState('');
  const [results,    setResults]    = useState<Station[]>([]);
  const [searching,  setSearching]  = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Búsqueda automática mientras escribe (debounce 300ms)
  useEffect(() => {
    if (text.trim().length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const country = countryHint as CountryCode | undefined;
        const found = await searchStations(text.trim(), 15, country);
        setResults(found);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [text, countryHint]);

  const handleClear = useCallback(() => {
    setText('');
    setResults([]);
    inputRef.current?.focus();
  }, []);

  return (
    <View style={styles.container}>
      {/* Input */}
      <View style={styles.inputRow}>
        <Ionicons name="search-outline" size={15} color={D.secondary} />
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={D.muted}
          returnKeyType="search"
          onSubmitEditing={() => Keyboard.dismiss()}
          autoCorrect={false}
          autoCapitalize="words"
        />
        {searching
          ? <ActivityIndicator size="small" color={D.primary} style={styles.spinner} />
          : text.length > 0
            ? <Pressable onPress={handleClear} style={styles.clearBtn} hitSlop={8}>
                <Ionicons name="close" size={13} color={D.secondary} />
              </Pressable>
            : null}
      </View>

      {/* Lista de resultados */}
      {results.length > 0 && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.listCard}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 240 }}
            showsVerticalScrollIndicator={false}
          >
            {results.map((station, i) => (
              <Pressable
                key={station.id}
                style={({ pressed }) => [
                  styles.listItem,
                  i < results.length - 1 && styles.listItemBorder,
                  pressed && { backgroundColor: 'rgba(139,92,246,0.10)' },
                ]}
                onPress={() => {
                  Keyboard.dismiss();
                  setText(station.name);
                  setResults([]);
                  onStationFound(station, 0);
                }}
              >
                <Ionicons name="train-outline" size={14} color={D.primary} style={{ marginTop: 1 }} />
                <Text style={styles.listItemText} numberOfLines={1}>{station.name}</Text>
                <Ionicons name="chevron-forward" size={12} color={D.muted} />
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      )}

      {/* Sin resultados */}
      {text.length >= 2 && !searching && results.length === 0 && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.errorCard}>
          <Ionicons name="search-outline" size={14} color={D.muted} />
          <Text style={styles.errorText}>Sin resultados para "{text}"</Text>
        </Animated.View>
      )}
    </View>
  );
}

// ── Modo address — geocodifica dirección (metro) ───────────────────────────────
function AddressSearch({ onStationFound, countryHint, placeholder }: {
  onStationFound: (station: Station, walkMinutes: number) => void;
  countryHint?:   string;
  placeholder:    string;
}) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const { status, result, error, search, clear } = useAddressToStation();

  const isSearching = status === 'geocoding' || status === 'searching';

  const handleSubmit = useCallback(() => {
    if (!text.trim() || isSearching) return;
    Keyboard.dismiss();
    search(text.trim(), countryHint, false);
  }, [text, isSearching, search, countryHint]);

  const handleClear = useCallback(() => {
    setText('');
    clear();
    inputRef.current?.focus();
  }, [clear]);

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <Ionicons name="search-outline" size={15} color={D.secondary} />
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={D.muted}
          returnKeyType="search"
          onSubmitEditing={handleSubmit}
          autoCorrect={false}
          autoCapitalize="words"
        />
        {isSearching
          ? <ActivityIndicator size="small" color={D.primary} style={styles.spinner} />
          : text.length > 0
            ? <Pressable onPress={handleClear} style={styles.clearBtn} hitSlop={8}>
                <Ionicons name="close" size={13} color={D.secondary} />
              </Pressable>
            : null}
        <Pressable
          style={[styles.searchBtn, (!text.trim() || isSearching) && styles.searchBtnDisabled]}
          onPress={handleSubmit}
          disabled={!text.trim() || isSearching}
        >
          <Text style={styles.searchBtnText}>Buscar</Text>
        </Pressable>
      </View>

      {status === 'found' && result && (
        <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)} style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <Ionicons name="subway-outline" size={14} color={D.primary} />
            <Text style={styles.resultStation} numberOfLines={1}>{result.station.name}</Text>
            <View style={styles.distancePill}>
              <Text style={styles.distanceText}>
                {result.distanceMeters < 1000
                  ? `${Math.round(result.distanceMeters)} m`
                  : `${(result.distanceMeters / 1000).toFixed(1)} km`}
              </Text>
            </View>
          </View>
          <Text style={styles.resolvedAddress} numberOfLines={2}>{result.resolvedAddress}</Text>
          <View style={styles.resultFooter}>
            <View style={styles.walkInfo}>
              <Ionicons name="walk-outline" size={14} color={D.primary} />
              <Text style={styles.walkText}>
                {result.walkMinutes < 1 ? 'Menos de 1 min' : `${result.walkMinutes} min caminando`}
              </Text>
            </View>
            <Pressable style={styles.useBtn} onPress={() => onStationFound(result.station, result.walkMinutes)}>
              <Text style={styles.useBtnText}>Usar →</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}

      {(status === 'not_found' || status === 'error') && error && (
        <Animated.View entering={FadeIn.duration(250)} style={styles.errorCard}>
          <Ionicons name="warning-outline" size={14} color={D.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </Animated.View>
      )}
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { gap: Spacing['2'] },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing['2'],
    backgroundColor: D.bg, borderRadius: Radius.lg, borderWidth: 1,
    borderColor: D.border, paddingHorizontal: Spacing['3'],
    paddingVertical: Platform.OS === 'ios' ? Spacing['3'] : Spacing['1'],
  },
  input: { flex: 1, fontSize: Typography.size.sm, color: D.text, minHeight: 44 },
  spinner: { marginHorizontal: Spacing['1'] },
  clearBtn: {
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
    backgroundColor: D.bgOverlay, borderRadius: Radius.full,
  },
  searchBtn: {
    paddingVertical: Spacing['2'], paddingHorizontal: Spacing['3'],
    backgroundColor: D.primary, borderRadius: Radius.md, minHeight: 36, justifyContent: 'center',
  },
  searchBtnDisabled: { backgroundColor: D.bgOverlay },
  searchBtnText: { fontSize: Typography.size.xs, fontWeight: Typography.weight.bold, color: D.text },

  // Lista modo station
  listCard: {
    backgroundColor: D.bg, borderRadius: Radius.md,
    borderWidth: 1, borderColor: D.primary + '55', overflow: 'hidden',
  },
  listItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing['3'], paddingVertical: 13,
  },
  listItemBorder: { borderBottomWidth: 1, borderBottomColor: D.border },
  listItemText: { flex: 1, fontSize: Typography.size.sm, color: D.text },

  // Resultado modo address
  resultCard: {
    backgroundColor: D.bg, borderRadius: Radius.md, borderWidth: 1,
    borderColor: D.primary + '55', padding: Spacing['3'], gap: Spacing['2'],
  },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resultStation: { flex: 1, fontSize: Typography.size.base, fontWeight: Typography.weight.bold, color: D.text },
  distancePill: {
    paddingVertical: 2, paddingHorizontal: Spacing['2'],
    backgroundColor: 'rgba(124,58,237,0.15)', borderRadius: Radius.full,
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.30)',
  },
  distanceText: { fontSize: Typography.size.xs, fontWeight: Typography.weight.bold, color: D.brand },
  resolvedAddress: { fontSize: Typography.size.xs, color: D.secondary, lineHeight: 16 },
  resultFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: Spacing['2'], paddingTop: Spacing['1'], borderTopWidth: 1, borderTopColor: D.border,
  },
  walkInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  walkText: { fontSize: Typography.size.xs, color: D.secondary, flex: 1 },
  useBtn: {
    paddingVertical: Spacing['2'], paddingHorizontal: Spacing['3'],
    backgroundColor: D.primary, borderRadius: Radius.md,
  },
  useBtnText: { fontSize: Typography.size.xs, fontWeight: Typography.weight.bold, color: D.text },

  // Error
  errorCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing['2'],
    backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: Radius.md,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.20)', padding: Spacing['3'],
  },
  errorText: { flex: 1, fontSize: Typography.size.xs, color: D.danger, lineHeight: 16 },
});
