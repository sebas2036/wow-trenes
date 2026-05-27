/**
 * DestinationSearch — Input de dirección → estación de llegada más cercana
 *
 * El usuario escribe una calle, barrio o landmark y el componente devuelve
 * la estación de metro/tren más cercana al destino.
 *
 * Props:
 *   onStationFound — callback con la estación de llegada encontrada
 *   countryHint    — ISO-2 para mejorar precisión del geocoder ("ES", "US"…)
 *   placeholder    — texto del input
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Keyboard,
  Platform,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  Layout,
} from 'react-native-reanimated';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { useAddressToStation, type AddressSearchResult } from '../hooks/useAddressToStation';
import type { Station } from '../types';

// ── Props ─────────────────────────────────────────────────────────────────────
interface DestinationSearchProps {
  onStationFound:  (station: Station, walkMinutes: number) => void;
  countryHint?:    string;
  placeholder?:    string;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function DestinationSearch({
  onStationFound,
  countryHint,
  placeholder = '¿A dónde vas? Escribe la dirección…',
}: DestinationSearchProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const { status, result, error, search, clear } = useAddressToStation();

  const isSearching = status === 'geocoding' || status === 'searching';

  const handleSubmit = useCallback(() => {
    if (!text.trim() || isSearching) return;
    Keyboard.dismiss();
    search(text.trim(), countryHint);
  }, [text, isSearching, search, countryHint]);

  const handleClear = useCallback(() => {
    setText('');
    clear();
    inputRef.current?.focus();
  }, [clear]);

  const handleUse = useCallback((res: AddressSearchResult) => {
    onStationFound(res.station, res.walkMinutes);
  }, [onStationFound]);

  return (
    <View style={styles.container}>
      {/* Input row */}
      <View style={styles.inputRow}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={Colors.text.muted}
          returnKeyType="search"
          onSubmitEditing={handleSubmit}
          autoCorrect={false}
          autoCapitalize="words"
          clearButtonMode="never"
        />
        {/* Clear / spinner */}
        {isSearching ? (
          <ActivityIndicator size="small" color={Colors.brand.glow} style={styles.spinner} />
        ) : text.length > 0 ? (
          <Pressable onPress={handleClear} style={styles.clearBtn} hitSlop={8}>
            <Text style={styles.clearText}>✕</Text>
          </Pressable>
        ) : null}

        {/* Buscar btn */}
        <Pressable
          style={({ pressed }) => [
            styles.searchBtn,
            (!text.trim() || isSearching) && styles.searchBtnDisabled,
            pressed && { opacity: 0.7 },
          ]}
          onPress={handleSubmit}
          disabled={!text.trim() || isSearching}
          accessibilityRole="button"
          accessibilityLabel="Buscar estación"
        >
          <Text style={styles.searchBtnText}>Buscar</Text>
        </Pressable>
      </View>

      {/* Resultado */}
      {status === 'found' && result && (
        <Animated.View
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(200)}
          layout={Layout.springify()}
          style={styles.resultCard}
        >
          {/* Header */}
          <View style={styles.resultHeader}>
            <Text style={styles.resultStation} numberOfLines={1}>
              🚇 {result.station.name}
            </Text>
            <View style={styles.distancePill}>
              <Text style={styles.distanceText}>
                {result.distanceMeters < 1000
                  ? `${Math.round(result.distanceMeters)} m`
                  : `${(result.distanceMeters / 1000).toFixed(1)} km`}
              </Text>
            </View>
          </View>

          {/* Dirección resuelta */}
          <Text style={styles.resolvedAddress} numberOfLines={2}>
            📍 {result.resolvedAddress}
          </Text>

          {/* Walk + CTA */}
          <View style={styles.resultFooter}>
            <View style={styles.walkInfo}>
              <Text style={styles.walkIcon}>🚶</Text>
              <Text style={styles.walkText}>
                {result.walkMinutes < 1
                  ? 'Menos de 1 min caminando'
                  : `${result.walkMinutes} min caminando desde la estación`}
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.useBtn,
                pressed && { opacity: 0.75 },
              ]}
              onPress={() => handleUse(result)}
              accessibilityRole="button"
              accessibilityLabel={`Ir a ${result.station.name}`}
            >
              <Text style={styles.useBtnText}>Usar →</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}

      {/* Error / not found */}
      {(status === 'not_found' || status === 'error') && error && (
        <Animated.View
          entering={FadeIn.duration(250)}
          exiting={FadeOut.duration(200)}
          style={styles.errorCard}
        >
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
        </Animated.View>
      )}
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    gap: Spacing['2'],
  },

  // Input
  inputRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               Spacing['2'],
    backgroundColor:   Colors.bg.elevated,
    borderRadius:      Radius.lg,
    borderWidth:       1,
    borderColor:       Colors.border.default,
    paddingHorizontal: Spacing['3'],
    paddingVertical:   Platform.OS === 'ios' ? Spacing['3'] : Spacing['1'],
  },
  searchIcon: {
    fontSize: 15,
  },
  input: {
    flex:       1,
    fontSize:   Typography.size.sm,
    color:      Colors.text.primary,
    minHeight:  44,
  },
  spinner: {
    marginHorizontal: Spacing['1'],
  },
  clearBtn: {
    width:          28,
    height:         28,
    alignItems:     'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg.overlay,
    borderRadius:   Radius.full,
  },
  clearText: {
    fontSize: 11,
    color:    Colors.text.secondary,
    fontWeight: '600',
  },
  searchBtn: {
    paddingVertical:   Spacing['2'],
    paddingHorizontal: Spacing['3'],
    backgroundColor:   Colors.brand.primary,
    borderRadius:      Radius.md,
    minHeight:         36,
    justifyContent:    'center',
  },
  searchBtnDisabled: {
    backgroundColor: Colors.bg.overlay,
  },
  searchBtnText: {
    fontSize:   Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color:      Colors.text.primary,
  },

  // Result card
  resultCard: {
    backgroundColor: Colors.bg.elevated,
    borderRadius:    Radius.md,
    borderWidth:     1,
    borderColor:     Colors.brand.primary + '55',
    padding:         Spacing['3'],
    gap:             Spacing['2'],
    // Glow morado sutil
    shadowColor:     Colors.brand.primary,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.25,
    shadowRadius:    12,
    elevation:       6,
  },
  resultHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            Spacing['2'],
  },
  resultStation: {
    flex:       1,
    fontSize:   Typography.size.base,
    fontWeight: Typography.weight.bold,
    color:      Colors.text.primary,
  },
  distancePill: {
    paddingVertical:   2,
    paddingHorizontal: Spacing['2'],
    backgroundColor:   'rgba(124,58,237,0.15)',
    borderRadius:      Radius.full,
    borderWidth:       1,
    borderColor:       'rgba(124,58,237,0.30)',
  },
  distanceText: {
    fontSize:   Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color:      Colors.text.brand,
  },
  resolvedAddress: {
    fontSize:   Typography.size.xs,
    color:      Colors.text.secondary,
    lineHeight: 16,
  },
  resultFooter: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            Spacing['2'],
    paddingTop:     Spacing['1'],
    borderTopWidth: 1,
    borderTopColor: Colors.border.subtle,
  },
  walkInfo: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  walkIcon: { fontSize: 13 },
  walkText: {
    fontSize: Typography.size.xs,
    color:    Colors.text.secondary,
    flex:     1,
  },
  useBtn: {
    paddingVertical:   Spacing['2'],
    paddingHorizontal: Spacing['3'],
    backgroundColor:   Colors.brand.primary,
    borderRadius:      Radius.md,
  },
  useBtnText: {
    fontSize:   Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color:      Colors.text.primary,
  },

  // Error card
  errorCard: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    gap:             Spacing['2'],
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius:    Radius.md,
    borderWidth:     1,
    borderColor:     'rgba(239,68,68,0.20)',
    padding:         Spacing['3'],
  },
  errorIcon: { fontSize: 14, marginTop: 1 },
  errorText: {
    flex:       1,
    fontSize:   Typography.size.xs,
    color:      Colors.status.danger,
    lineHeight: 16,
  },
});
