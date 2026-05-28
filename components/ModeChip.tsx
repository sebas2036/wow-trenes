/**
 * ModeChip — Transport mode selector
 * Íconos vectoriales Ionicons. Segmented control Apple-style.
 */
import React, { memo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Radius, Shadows } from '../theme';
import { useTheme } from '../context/ThemeContext';
import type { TransportMode } from '../types';

interface ModeConfig {
  mode:  TransportMode;
  icon:  keyof typeof Ionicons.glyphMap;
  label: string;
}

const MODES: ModeConfig[] = [
  { mode: 'walk',      icon: 'walk-outline',   label: 'A pie' },
  { mode: 'bus',       icon: 'bus-outline',    label: 'Bus'   },
  { mode: 'rideshare', icon: 'car-sport-outline', label: 'Uber'  },
];

interface ModeChipProps {
  selected:     TransportMode;
  onChange:     (mode: TransportMode) => void;
  destination?: { latitude: number; longitude: number };
  etas?:        Record<TransportMode, number | null>;
}

export default memo(function ModeChip({ selected, onChange, etas }: ModeChipProps) {
  const { colors } = useTheme();

  const handlePress = useCallback(async (mode: TransportMode) => {
    await Haptics.selectionAsync();
    onChange(mode);
  }, [onChange]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg.elevated }]}>
      {MODES.map((cfg) => {
        const active = selected === cfg.mode;
        return (
          <Pressable
            key={cfg.mode}
            style={[
              styles.btn,
              active && [styles.btnActive, { backgroundColor: colors.bg.card, ...Shadows.segment }],
            ]}
            onPress={() => handlePress(cfg.mode)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={cfg.label}
          >
            <Ionicons
              name={active ? cfg.icon.replace('-outline', '') as any : cfg.icon as any}
              size={20}
              color={active ? colors.brand.primary : colors.text.muted}
            />
            <Text style={[
              styles.label,
              { color: active ? colors.text.primary : colors.text.secondary },
              active && { fontWeight: '600' },
            ]}>
              {cfg.label}
            </Text>
            {/* ETA — siempre visible debajo del label */}
            <Text style={[styles.eta, { color: active ? colors.brand.primary : colors.text.muted }]}>
              {etas?.[cfg.mode] != null ? `${etas[cfg.mode]} min` : '—'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginVertical: 10,
    borderRadius: Radius.md,
    padding: 3,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: Radius.sm,
    gap: 4,
  },
  btnActive: {
    borderRadius: Radius.sm,
  },
  label: { fontSize: 11, fontWeight: '500' },
  eta:   { fontSize: 10, fontWeight: '600', marginTop: 1 },
});
