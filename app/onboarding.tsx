/**
 * WoW Train — Onboarding
 * 3 slides · Swipe horizontal · Detecta idioma del teléfono automáticamente
 * Solo se muestra en el primer arranque (AsyncStorage flag).
 */
import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Circle, Rect, Line, Polyline, G } from 'react-native-svg';

import { useTheme } from '../context/ThemeContext';
import { t } from '../services/i18n';

const { width: W } = Dimensions.get('window');
export const ONBOARDING_KEY = '@wow_onboarding_done';

// ── SVG Icons ─────────────────────────────────────────────────────────────────

function IconTrain({ color }: { color: string }) {
  return (
    <Svg width={72} height={72} viewBox="0 0 24 24" fill="none">
      {/* Cuerpo del tren */}
      <Rect x="3" y="4" width="18" height="13" rx="3" stroke={color} strokeWidth="1.5" />
      {/* Ventanas */}
      <Rect x="5.5" y="7" width="4" height="3.5" rx="1" stroke={color} strokeWidth="1.3" />
      <Rect x="14.5" y="7" width="4" height="3.5" rx="1" stroke={color} strokeWidth="1.3" />
      {/* Línea central */}
      <Line x1="3" y1="13" x2="21" y2="13" stroke={color} strokeWidth="1.3" />
      {/* Ruedas */}
      <Circle cx="7.5" cy="19" r="2" stroke={color} strokeWidth="1.5" />
      <Circle cx="16.5" cy="19" r="2" stroke={color} strokeWidth="1.5" />
      {/* Eje */}
      <Line x1="9.5" y1="17" x2="14.5" y2="17" stroke={color} strokeWidth="1.3" />
      {/* Vías */}
      <Line x1="1" y1="22" x2="23" y2="22" stroke={color} strokeWidth="1.3" strokeDasharray="2 2" />
    </Svg>
  );
}

function IconScenic({ color }: { color: string }) {
  return (
    <Svg width={72} height={72} viewBox="0 0 24 24" fill="none">
      {/* Montaña izquierda */}
      <Path d="M2 20 L8 8 L14 20" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      {/* Montaña derecha (más alta) */}
      <Path d="M10 20 L17 5 L24 20" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      {/* Nieve pico */}
      <Path d="M14.5 9 L17 5 L19.5 9" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
      {/* Vías en primer plano */}
      <Line x1="0" y1="21.5" x2="24" y2="21.5" stroke={color} strokeWidth="1.5" />
      <Line x1="3" y1="20" x2="3" y2="23" stroke={color} strokeWidth="1.3" />
      <Line x1="8" y1="20" x2="8" y2="23" stroke={color} strokeWidth="1.3" />
      <Line x1="13" y1="20" x2="13" y2="23" stroke={color} strokeWidth="1.3" />
      <Line x1="18" y1="20" x2="18" y2="23" stroke={color} strokeWidth="1.3" />
      {/* Sol */}
      <Circle cx="5" cy="6" r="2" stroke={color} strokeWidth="1.3" />
      <Line x1="5" y1="2.5" x2="5" y2="3.5" stroke={color} strokeWidth="1.2" />
      <Line x1="5" y1="8.5" x2="5" y2="9.5" stroke={color} strokeWidth="1.2" />
      <Line x1="1.5" y1="6" x2="2.5" y2="6" stroke={color} strokeWidth="1.2" />
      <Line x1="7.5" y1="6" x2="8.5" y2="6" stroke={color} strokeWidth="1.2" />
    </Svg>
  );
}

function IconPrivacy({ color }: { color: string }) {
  return (
    <Svg width={72} height={72} viewBox="0 0 24 24" fill="none">
      {/* Escudo */}
      <Path
        d="M12 2 L20 5.5 L20 12 C20 16.4 16.4 20.4 12 22 C7.6 20.4 4 16.4 4 12 L4 5.5 Z"
        stroke={color} strokeWidth="1.5" strokeLinejoin="round"
      />
      {/* Check */}
      <Polyline
        points="8,12 11,15 16,9"
        stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

// ── Datos de slides ───────────────────────────────────────────────────────────
function getSlides() {
  return [
    {
      id: '1',
      gradient: ['#1a1a2e', '#16213e', '#0f3460'] as const,
      accent:   '#6C63FF',
    },
    {
      id: '2',
      gradient: ['#1a2a1a', '#1e3a1e', '#0f4a2a'] as const,
      accent:   '#34D399',
    },
    {
      id: '3',
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
      {/* Icono SVG */}
      <View style={styles.iconWrap}>
        <View style={[styles.iconGlow, { borderColor: item.accent + '40' }]} />
        {item.id === '1' && <IconTrain  color={item.accent} />}
        {item.id === '2' && <IconScenic color={item.accent} />}
        {item.id === '3' && <IconPrivacy color={item.accent} />}
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
