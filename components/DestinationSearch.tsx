/**
 * DestinationSearch — Input de dirección → estación de llegada más cercana
 *
 * El usuario escribe una calle, barrio o landmark y el componente devuelve
 * la estación de metro/tren más cercana al destino.
 * Siempre se muestra sobre fondo oscuro (split-screen modo metro).
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
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { Typography, Spacing, Radius } from '../theme';
import { useAddressToStation, type AddressSearchResult } from '../hooks/useAddressToStation';
import type { Station } from '../types';

// Paleta oscura fija — este componente siempre aparece sobre split-screen oscuro
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
  longDistance?:  boolean; // true = modo país, filtrar solo larga distancia
}

export default function DestinationSearch({
  onStationFound,
  countryHint,
  placeholder = '¿A dónde vas? Escribe la dirección…',
  longDistance = false,
}: DestinationSearchProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const { status, result, error, search, clear } = useAddressToStation();

  const isSearching = status === 'geocoding' || status === 'searching';

  const handleSubmit = useCallback(() => {
    if (!text.trim() || isSearching) return;
    Keyboard.dismiss();
    search(text.trim(), countryHint, longDistance);
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
          clearButtonMode="never"
        />

        {isSearching ? (
          <ActivityIndicator size="small" color={D.primary} style={styles.spinner} />
        ) : text.length > 0 ? (
          <Pressable onPress={handleClear} style={styles.clearBtn} hitSlop={8}>
            <Ionicons name="close" size={13} color={D.secondary} />
          </Pressable>
        ) : null}

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
          <View style={styles.resultHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <Ionicons name="subway-outline" size={14} color={D.primary} />
              <Text style={styles.resultStation} numberOfLines={1}>
                {result.station.name}
              </Text>
            </View>
            <View style={styles.distancePill}>
              <Text style={styles.distanceText}>
                {result.distanceMeters < 1000
                  ? `${Math.round(result.distanceMeters)} m`
                  : `${(result.distanceMeters / 1000).toFixed(1)} km`}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 5 }}>
            <Ionicons name="location-outline" size={13} color={D.muted} style={{ marginTop: 1 }} />
            <Text style={styles.resolvedAddress} numberOfLines={2}>
              {result.resolvedAddress}
            </Text>
          </View>

          <View style={styles.resultFooter}>
            <View style={styles.walkInfo}>
              <Ionicons name="walk-outline" size={14} color={D.primary} />
              <Text style={styles.walkText}>
                {result.walkMinutes < 1
                  ? 'Menos de 1 min caminando'
                  : `${result.walkMinutes} min caminando`}
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.useBtn, pressed && { opacity: 0.75 }]}
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
          <Ionicons name="warning-outline" size={14} color={D.danger} style={{ marginTop: 1 }} />
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
    flexDirection:     'row',
    alignItems:        'center',
    gap:               Spacing['2'],
    backgroundColor:   D.bg,
    borderRadius:      Radius.lg,
    borderWidth:       1,
    borderColor:       D.border,
    paddingHorizontal: Spacing['3'],
    paddingVertical:   Platform.OS === 'ios' ? Spacing['3'] : Spacing['1'],
  },
  input: {
    flex:      1,
    fontSize:  Typography.size.sm,
    color:     D.text,
    minHeight: 44,
  },
  spinner: { marginHorizontal: Spacing['1'] },
  clearBtn: {
    width:           28,
    height:          28,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: D.bgOverlay,
    borderRadius:    Radius.full,
  },
  searchBtn: {
    paddingVertical:   Spacing['2'],
    paddingHorizontal: Spacing['3'],
    backgroundColor:   D.primary,
    borderRadius:      Radius.md,
    minHeight:         36,
    justifyContent:    'center',
  },
  searchBtnDisabled: { backgroundColor: D.bgOverlay },
  searchBtnText: {
    fontSize:   Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color:      D.text,
  },

  // Result card
  resultCard: {
    backgroundColor: D.bg,
    borderRadius:    Radius.md,
    borderWidth:     1,
    borderColor:     D.primary + '55',
    padding:         Spacing['3'],
    gap:             Spacing['2'],
    shadowColor:     D.primary,
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
    color:      D.text,
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
    color:      D.brand,
  },
  resolvedAddress: {
    flex:       1,
    fontSize:   Typography.size.xs,
    color:      D.secondary,
    lineHeight: 16,
  },
  resultFooter: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            Spacing['2'],
    paddingTop:     Spacing['1'],
    borderTopWidth: 1,
    borderTopColor: D.border,
  },
  walkInfo: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  walkText: {
    fontSize: Typography.size.xs,
    color:    D.secondary,
    flex:     1,
  },
  useBtn: {
    paddingVertical:   Spacing['2'],
    paddingHorizontal: Spacing['3'],
    backgroundColor:   D.primary,
    borderRadius:      Radius.md,
  },
  useBtnText: {
    fontSize:   Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color:      D.text,
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
  errorText: {
    flex:       1,
    fontSize:   Typography.size.xs,
    color:      D.danger,
    lineHeight: 16,
  },
});
