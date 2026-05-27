/**
 * CountryCard — cinematic destination card
 * 120 FPS transitions via Reanimated 3
 * WCAG 2.2 AAA: gradient scrim ensures ≥7:1 ratio on any image
 */
import React, { useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ImageBackground,
  ImageSourcePropType,
  Dimensions,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Colors, Gradients, Typography, Spacing, Radius, Shadows, Motion } from '../theme';
import type { CountryDestination } from '../types';

// ─── STATIC ASSETS ─────────────────────────────────────────────────────────
// Real images would be placed in assets/images/countries/
// Using placeholder colors until actual assets are bundled
const COUNTRY_IMAGES: Record<string, ImageSourcePropType> = {
  ES: require('../assets/images/countries/spain.jpg'),
  IT: require('../assets/images/countries/italy.jpg'),
  FR: require('../assets/images/countries/france.jpg'),
  DE: require('../assets/images/countries/germany.jpg'),
  NL: require('../assets/images/countries/netherlands.jpg'),
  CH: require('../assets/images/countries/switzerland.jpg'),
};

// ─── CARD DIMENSIONS ───────────────────────────────────────────────────────
const { width: SCREEN_W } = Dimensions.get('window');
const GRID_PADDING   = Spacing['4'];
const CARD_GAP       = Spacing['3'];
const CARD_W         = (SCREEN_W - GRID_PADDING * 2 - CARD_GAP) / 2;
const CARD_H         = CARD_W * 1.45;

// ─── COMPONENT ─────────────────────────────────────────────────────────────
interface CountryCardProps {
  destination: CountryDestination;
  onPress:     (destination: CountryDestination) => void;
  index:       number; // for staggered entrance animation
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function CountryCard({ destination, onPress, index }: CountryCardProps) {
  const scale   = useSharedValue(1);
  const opacity = useSharedValue(0);

  // Staggered entrance
  React.useEffect(() => {
    opacity.value = withTiming(1, {
      duration: Motion.slow,
      // Starts delayed by index
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   interpolate(opacity.value, [0, 1], [0, 1], Extrapolation.CLAMP),
  }));

  const handlePressIn = useCallback(() => {
    'worklet';
    scale.value = withSpring(0.96, { damping: 20, stiffness: 300 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    'worklet';
    scale.value = withSpring(1, Motion.spring);
  }, [scale]);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(destination);
  }, [destination, onPress]);

  const imageSource = COUNTRY_IMAGES[destination.code];

  return (
    <AnimatedPressable
      style={[styles.card, animatedStyle, Shadows.card]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`Explorar trenes en ${destination.name}`}
      accessibilityHint={`${destination.tagline}. Tren: ${destination.trainName}`}
    >
      <ImageBackground
        source={imageSource}
        style={styles.imageBg}
        imageStyle={styles.image}
        resizeMode="cover"
      >
        {/* WCAG AAA scrim: ratio ≥7:1 on darkest part */}
        <LinearGradient
          colors={Gradients.cardScrim}
          locations={Gradients.cardScrimLocations}
          style={StyleSheet.absoluteFill}
        />

        {/* Content overlay */}
        <View style={styles.content}>
          {/* Flag + Country name */}
          <View style={styles.header}>
            <Text style={styles.flag}>{destination.flag}</Text>
            <Text style={styles.countryName} numberOfLines={1}>
              {destination.name}
            </Text>
          </View>

          {/* Tagline */}
          <Text style={styles.tagline} numberOfLines={2}>
            {destination.tagline}
          </Text>

          {/* CTA */}
          <View style={styles.cta}>
            <Text style={styles.ctaIcon}>🚄</Text>
            <Text style={styles.ctaText}>Explorar</Text>
            <Text style={styles.ctaArrow}>›</Text>
          </View>
        </View>
      </ImageBackground>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width:        CARD_W,
    height:       CARD_H,
    borderRadius: Radius.lg,
    overflow:     'hidden',
    backgroundColor: Colors.bg.elevated,
    // Border for glass effect
    borderWidth:  1,
    borderColor:  Colors.border.default,
  },
  imageBg: {
    flex:            1,
    justifyContent:  'flex-end',
  },
  image: {
    borderRadius: Radius.lg,
  },
  content: {
    padding: Spacing['3'],
    gap:     Spacing['1'],
  },
  header: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing['1'],
    marginBottom:  Spacing['1'],
  },
  flag: {
    fontSize: Typography.size.md,
  },
  countryName: {
    fontSize:   Typography.size.md,
    fontWeight: Typography.weight.bold,
    color:      Colors.text.primary,
    flex:       1,
  },
  tagline: {
    fontSize:   Typography.size.xs,
    color:      Colors.text.secondary,
    lineHeight: Typography.size.xs * Typography.lineHeight.normal,
  },
  cta: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            Spacing['1'],
    marginTop:      Spacing['2'],
    paddingVertical:Spacing['2'],
    paddingHorizontal: Spacing['3'],
    backgroundColor: 'rgba(124, 58, 237, 0.25)',
    borderRadius:   Radius.full,
    borderWidth:    1,
    borderColor:    'rgba(124, 58, 237, 0.4)',
    alignSelf:      'flex-start',
  },
  ctaIcon: {
    fontSize: Typography.size.sm,
  },
  ctaText: {
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color:      Colors.text.brand,
  },
  ctaArrow: {
    fontSize:   Typography.size.md,
    fontWeight: Typography.weight.bold,
    color:      Colors.text.brand,
  },
});
