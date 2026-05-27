/**
 * ModeChip — Transport mode selector (STEP 2)
 * Touch targets: ≥48×48px (WCAG 2.5.5)
 * Animated selection state via Reanimated
 */
import React, { memo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Gradients, Typography, Spacing, Radius, Motion } from '../theme';
import type { TransportMode } from '../types';

// ── Mode definitions ──────────────────────────────────────────────────────
interface ModeConfig {
  mode:        TransportMode;
  icon:        string;
  label:       string;
  description: string;
  deepLinkBase?:string;
}

const MODES: ModeConfig[] = [
  {
    mode:        'walk',
    icon:        '🚶',
    label:       'Caminando',
    description: 'A pie desde tu ubicación',
  },
  {
    mode:        'bus',
    icon:        '🚌',
    label:       'Bus',
    description: 'Transporte público',
  },
  {
    mode:        'rideshare',
    icon:        '🚗',
    label:       'Uber/Cabify',
    description: 'Solicitar un coche',
    deepLinkBase:'uber://',
  },
];

// ── Component ─────────────────────────────────────────────────────────────
interface ModeChipProps {
  selected:    TransportMode;
  onChange:    (mode: TransportMode) => void;
  destination?: { latitude: number; longitude: number };
}

export default memo(function ModeChip({ selected, onChange, destination }: ModeChipProps) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Modo de transporte">
      {MODES.map((cfg) => (
        <Chip
          key={cfg.mode}
          config={cfg}
          isSelected={selected === cfg.mode}
          onPress={onChange}
          destination={destination}
        />
      ))}
    </View>
  );
});

// ── Single Chip ───────────────────────────────────────────────────────────
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function Chip({
  config,
  isSelected,
  onPress,
  destination,
}: {
  config:      ModeConfig;
  isSelected:  boolean;
  onPress:     (mode: TransportMode) => void;
  destination?:{ latitude: number; longitude: number };
}) {
  const scale    = useSharedValue(1);
  const selected = useSharedValue(isSelected ? 1 : 0);

  React.useEffect(() => {
    selected.value = withTiming(isSelected ? 1 : 0, { duration: Motion.fast });
  }, [isSelected, selected]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = useCallback(async () => {
    scale.value = withSpring(0.94, { damping: 20, stiffness: 400 });
    setTimeout(() => { scale.value = withSpring(1, Motion.spring); }, 120);
    await Haptics.selectionAsync();

    // If rideshare and we have destination, we could open deeplink
    // (passive — only after explicit tap on a ride-share chip)
    onPress(config.mode);
  }, [config.mode, onPress, scale]);

  return (
    <AnimatedPressable
      style={[styles.chip, isSelected && styles.chipSelected, animStyle]}
      onPress={handlePress}
      accessible
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={config.label}
      accessibilityHint={config.description}
    >
      {isSelected && (
        <LinearGradient
          colors={Gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <Text style={styles.icon}>{config.icon}</Text>
      <Text style={[styles.label, isSelected && styles.labelSelected]}>
        {config.label}
      </Text>
    </AnimatedPressable>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  row: {
    flexDirection:  'row',
    gap:            Spacing['2'],
    paddingHorizontal: Spacing['3'],
    paddingVertical:   Spacing['2'],
  },
  chip: {
    flex:            1,
    minHeight:       48, // WCAG 2.5.5
    minWidth:        48,
    alignItems:      'center',
    justifyContent:  'center',
    borderRadius:    Radius.md,
    paddingVertical: Spacing['2'],
    paddingHorizontal: Spacing['3'],
    backgroundColor: Colors.bg.elevated,
    borderWidth:     1,
    borderColor:     Colors.border.default,
    overflow:        'hidden',
    gap:             Spacing['1'],
  },
  chipSelected: {
    borderColor: Colors.brand.primary,
  },
  icon:  { fontSize: 22 },
  label: {
    fontSize:   Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color:      Colors.text.secondary,
    textAlign:  'center',
  },
  labelSelected: {
    color: Colors.white,
  },
});
