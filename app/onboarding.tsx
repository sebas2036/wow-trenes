/**
 * WoW Train — Onboarding
 * 3 slides · Swipe horizontal · Detecta idioma del teléfono automáticamente
 * Solo se muestra en el primer arranque (AsyncStorage flag).
 */
import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList,
  Dimensions, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTheme } from '../context/ThemeContext';
import { t } from '../services/i18n';

const { width: W } = Dimensions.get('window');
export const ONBOARDING_KEY = '@wow_onboarding_done';

// ── Datos de slides ───────────────────────────────────────────────────────────
function getSlides() {
  return [
    {
      id: '1',
      icon:     '🚆',
      gradient: ['#1a1a2e', '#16213e', '#0f3460'] as const,
      accent:   '#6C63FF',
    },
    {
      id: '2',
      icon:     '🏔️',
      gradient: ['#1a2a1a', '#1e3a1e', '#0f4a2a'] as const,
      accent:   '#34D399',
    },
    {
      id: '3',
      icon:     '🔒',
      gradient: ['#1a1a2e', '#2a1a3e', '#1a0f40'] as const,
      accent:   '#A78BFA',
    },
  ] as const;
}

// ── Componente slide individual ───────────────────────────────────────────────
function Slide({
  item,
  isLast,
  onFinish,
  onSkip,
}: {
  item: ReturnType<typeof getSlides>[number];
  isLast: boolean;
  onFinish: () => void;
  onSkip: () => void;
}) {
  const { colors } = useTheme();

  // Mapeo de texto por slide id
  const content = {
    '1': {
      title: t('ob1_title'),
      sub:   t('ob1_sub'),
      cta:   t('ob_next'),
    },
    '2': {
      title: t('ob2_title'),
      sub:   t('ob2_sub'),
      cta:   t('ob_next'),
    },
    '3': {
      title: t('ob3_title'),
      sub:   t('ob3_sub'),
      cta:   t('ob_start'),
    },
  }[item.id]!;

  return (
    <LinearGradient
      colors={[...item.gradient]}
      style={styles.slide}
    >
      {/* Icono grande */}
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>{item.icon}</Text>
        {/* Glow ring */}
        <View style={[styles.iconGlow, { borderColor: item.accent + '40' }]} />
      </View>

      {/* Accent line */}
      <View style={[styles.accentLine, { backgroundColor: item.accent }]} />

      {/* Texto */}
      <View style={styles.textWrap}>
        <Text style={styles.title}>{content.title}</Text>
        <Text style={[styles.sub, { color: 'rgba(255,255,255,0.65)' }]}>{content.sub}</Text>
      </View>

      {/* CTA */}
      <Pressable
        style={({ pressed }) => [
          styles.ctaBtn,
          { backgroundColor: item.accent, opacity: pressed ? 0.85 : 1 },
        ]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onFinish();
        }}
        accessibilityRole="button"
      >
        <Text style={styles.ctaText}>{content.cta}</Text>
      </Pressable>

      {/* Saltar — solo slides 1 y 2 */}
      {!isLast && (
        <Pressable
          style={styles.skipBtn}
          onPress={() => {
            Haptics.selectionAsync();
            onSkip();
          }}
          hitSlop={12}
        >
          <Text style={styles.skipText}>{t('ob_skip')}</Text>
        </Pressable>
      )}
    </LinearGradient>
  );
}

// ── Pantalla principal ────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const router   = useRouter();
  const listRef  = useRef<FlatList>(null);
  const [current, setCurrent] = useState(0);
  const slides = getSlides();

  const finish = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, '1');
    router.replace('/');
  };

  const goNext = () => {
    if (current < slides.length - 1) {
      const next = current + 1;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setCurrent(next);
    } else {
      finish();
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={[]}>
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(s) => s.id}
        horizontal
        pagingEnabled
        scrollEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / W);
          setCurrent(idx);
        }}
        renderItem={({ item, index }) => (
          <Slide
            item={item}
            isLast={index === slides.length - 1}
            onFinish={goNext}
            onSkip={finish}
          />
        )}
      />

      {/* Dots indicator */}
      <View style={styles.dots}>
        {slides.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === current ? styles.dotActive : styles.dotInactive,
            ]}
          />
        ))}
      </View>
    </SafeAreaView>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a12' },

  slide: {
    width:           W,
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: 36,
    paddingBottom:   120, // espacio para los dots
  },

  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  icon: {
    fontSize: 80,
    lineHeight: 96,
  },
  iconGlow: {
    position:     'absolute',
    width:        130,
    height:       130,
    borderRadius: 65,
    borderWidth:  1.5,
  },

  accentLine: {
    width:        48,
    height:       3,
    borderRadius: 2,
    marginBottom: 28,
  },

  textWrap: {
    alignItems: 'center',
    gap:        14,
    marginBottom: 48,
  },
  title: {
    fontSize:      32,
    fontWeight:    '800',
    color:         '#ffffff',
    textAlign:     'center',
    letterSpacing: -0.5,
    lineHeight:    38,
  },
  sub: {
    fontSize:   16,
    lineHeight: 24,
    textAlign:  'center',
    maxWidth:   280,
  },

  ctaBtn: {
    paddingVertical:   16,
    paddingHorizontal: 56,
    borderRadius:      50,
    shadowColor:       '#000',
    shadowOffset:      { width: 0, height: 4 },
    shadowOpacity:     0.3,
    shadowRadius:      8,
    elevation:         6,
  },
  ctaText: {
    fontSize:      17,
    fontWeight:    '700',
    color:         '#ffffff',
    letterSpacing: 0.3,
  },

  skipBtn: {
    position:   'absolute',
    top:        56,
    right:      28,
  },
  skipText: {
    fontSize:   15,
    color:      'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },

  dots: {
    position:       'absolute',
    bottom:         48,
    left:           0,
    right:          0,
    flexDirection:  'row',
    justifyContent: 'center',
    alignItems:     'center',
    gap:            8,
  },
  dot: {
    height:       6,
    borderRadius: 3,
  },
  dotActive: {
    width:           24,
    backgroundColor: '#ffffff',
  },
  dotInactive: {
    width:           6,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
});
