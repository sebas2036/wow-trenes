/**
 * ModeChip — Transport mode selector
 * Íconos vectoriales Ionicons. Segmented control Apple-style.
 */
import React, { memo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { hImpact, hSelection, hNotify, ImpactStyle, NotifyType } from '../services/haptics';
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

/** Minutos → texto legible: "45 min", "1 h", "4h 55m" */
export function formatEta(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h}h ${m}m`;
}

export default memo(function ModeChip({ selected, onChange, etas }: ModeChipProps) {
  const { colors } = useTheme();

  const handlePress = useCallback(async (mode: TransportMode) => {
    await hSelection();
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
              size={17}
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
              {(() => { const v = etas?.[cfg.mode]; return v != null ? formatEta(v) : '—'; })()}
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
    marginVertical: 4,
    borderRadius: Radius.md,
    padding: 2,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    borderRadius: Radius.sm,
    gap: 1,
  },
  btnActive: {
    borderRadius: Radius.sm,
  },
  label: { fontSize: 12, fontWeight: '500' },
  eta:   { fontSize: 12, fontWeight: '700', marginTop: 1 },
});
