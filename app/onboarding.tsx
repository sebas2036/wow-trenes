/**
 * WoW Train — Onboarding (rediseño premium)
 * 3 slides · Swipe horizontal · Fondo de noche compartido + violeta de marca.
 * Entrada animada por slide con el Animated API nativo (sin Reanimated → sin crashes).
 * Solo se muestra en el primer arranque (AsyncStorage flag).
 */
import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList,
  Dimensions, Animated, Easing, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { hImpact, hSelection, hNotify, ImpactStyle, NotifyType } from '../services/haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Circle, Rect, Line, Polyline } from 'react-native-svg';

import { t } from '../services/i18n';

const { width: W } = Dimensions.get('window');
export const ONBOARDING_KEY = '@wow_onboarding_done';

// Paleta de marca (violeta) — unificada en los 3 slides
const VIOLET       = '#A78BFA';
const VIOLET_DEEP  = '#7C3AED';

// ── SVG Icons ─────────────────────────────────────────────────────────────────
function IconTrain({ color }: { color: string }) {
  return (
    <Svg width={64} height={64} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="4" width="18" height="13" rx="3" stroke={color} strokeWidth="1.5" />
      <Rect x="5.5" y="7" width="4" height="3.5" rx="1" stroke={color} strokeWidth="1.3" />
      <Rect x="14.5" y="7" width="4" height="3.5" rx="1" stroke={color} strokeWidth="1.3" />
      <Line x1="3" y1="13" x2="21" y2="13" stroke={color} strokeWidth="1.3" />
      <Circle cx="7.5" cy="19" r="2" stroke={color} strokeWidth="1.5" />
      <Circle cx="16.5" cy="19" r="2" stroke={color} strokeWidth="1.5" />
      <Line x1="9.5" y1="17" x2="14.5" y2="17" stroke={color} strokeWidth="1.3" />
      <Line x1="1" y1="22" x2="23" y2="22" stroke={color} strokeWidth="1.3" strokeDasharray="2 2" />
    </Svg>
  );
}
function IconScenic({ color }: { color: string }) {
  return (
    <Svg width={64} height={64} viewBox="0 0 24 24" fill="none">
      <Path d="M2 20 L8 8 L14 20" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <Path d="M10 20 L17 5 L24 20" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <Path d="M14.5 9 L17 5 L19.5 9" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
      <Line x1="0" y1="21.5" x2="24" y2="21.5" stroke={color} strokeWidth="1.5" />
      <Circle cx="5" cy="6" r="2" stroke={color} strokeWidth="1.3" />
    </Svg>
  );
}
function IconPrivacy({ color }: { color: string }) {
  return (
    <Svg width={64} height={64} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2 L20 5.5 L20 12 C20 16.4 16.4 20.4 12 22 C7.6 20.4 4 16.4 4 12 L4 5.5 Z"
        stroke={color} strokeWidth="1.5" strokeLinejoin="round"
      />
      <Polyline points="8,12 11,15 16,9" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const SLIDES = [
  { id: '1', titleKey: 'ob1_title', subKey: 'ob1_sub', cta: 'ob_next'  },
  { id: '2', titleKey: 'ob2_title', subKey: 'ob2_sub', cta: 'ob_next'  },
  { id: '3', titleKey: 'ob3_title', subKey: 'ob3_sub', cta: 'ob_start' },
] as const;

// ── Slide ───────────────────────────────────────────────────────────────────
function Slide({
  item, index, isActive, isLast, onFinish, onSkip,
}: {
  item: typeof SLIDES[number];
  index: number;
  isActive: boolean;
  isLast: boolean;
  onFinish: () => void;
  onSkip: () => void;
}) {
  // Entrada animada: cuando el slide se vuelve activo
  const enter = useRef(new Animated.Value(0)).current;   // 0 → 1
  const pulse = useRef(new Animated.Value(1)).current;    // CTA del último slide

  useEffect(() => {
    if (isActive) {
      enter.setValue(0);
      Animated.timing(enter, {
        toValue: 1, duration: 620, delay: 60,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start();
    }
  }, [isActive, enter]);

  // Pulso suave del CTA en el último slide
  useEffect(() => {
    if (isActive && isLast) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.05, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1,    duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [isActive, isLast, pulse]);

  const fade = enter;
  const rise = enter.interpolate({ inputRange: [0, 1], outputRange: [26, 0] });
  const riseSlow = enter.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
  const iconScale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });

  return (
    <View style={styles.slide}>
      {/* Ícono en círculo glass con glow violeta */}
      <Animated.View style={[styles.iconOuter, { opacity: fade, transform: [{ scale: iconScale }] }]}>
        <View style={styles.iconGlow} />
        <View style={styles.iconGlass}>
          {item.id === '1' && <IconTrain   color={VIOLET} />}
          {item.id === '2' && <IconScenic  color={VIOLET} />}
          {item.id === '3' && <IconPrivacy color={VIOLET} />}
        </View>
      </Animated.View>

      {/* Línea de acento */}
      <Animated.View style={[styles.accentLine, { opacity: fade }]} />

      {/* Texto */}
      <Animated.View style={[styles.textWrap, { opacity: fade, transform: [{ translateY: rise }] }]}>
        <Text style={styles.title}>{t(item.titleKey as any)}</Text>
        <Text style={styles.sub}>{t(item.subKey as any)}</Text>
      </Animated.View>

      {/* CTA */}
      <Animated.View style={{ opacity: fade, transform: [{ translateY: riseSlow }, { scale: isLast ? pulse : 1 }] }}>
        <Pressable
          onPress={() => { hImpact(ImpactStyle.Light); onFinish(); }}
          accessibilityRole="button"
        >
          <LinearGradient
            colors={[VIOLET_DEEP, '#4F46E5']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.ctaBtn}
          >
            <Text style={styles.ctaText}>{t(item.cta as any)}</Text>
          </LinearGradient>
        </Pressable>
      </Animated.View>

      {/* Saltar — slides 1 y 2 */}
      {!isLast && (
        <Pressable
          style={styles.skipBtn}
          onPress={() => { hSelection(); onSkip(); }}
          hitSlop={12}
        >
          <Text style={styles.skipText}>{t('ob_skip')}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Pantalla ──────────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const router  = useRouter();
  const listRef = useRef<FlatList>(null);
  const [current, setCurrent] = useState(0);

  const finish = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, '1');
    router.replace('/');
  };

  const goNext = () => {
    if (current < SLIDES.length - 1) {
      const next = current + 1;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setCurrent(next);
    } else {
      finish();
    }
  };

  return (
    <View style={styles.root}>
      {/* Fondo de noche compartido (mismo que la app) */}
      <Image
        source={require('../assets/images/bg-hero.png')}
        style={[StyleSheet.absoluteFillObject, { top: -120 }]}
        resizeMode="cover"
        fadeDuration={0}
      />
      <LinearGradient
        colors={['rgba(10,8,30,0.55)', 'rgba(14,14,46,0.82)', 'rgba(10,8,26,0.96)']}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      {/* Orbes de glow violeta */}
      <View style={[styles.orb, styles.orbTop]} pointerEvents="none" />
      <View style={[styles.orb, styles.orbBottom]} pointerEvents="none" />

      {/* Logo WoW TRAIN */}
      <SafeAreaView style={styles.logoSafe} edges={['top']} pointerEvents="none">
        <View style={styles.logoRow}>
          <Text style={styles.logoWow}>WoW</Text>
          <Text style={styles.logoTrain}> TRAIN</Text>
        </View>
      </SafeAreaView>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / W))}
        renderItem={({ item, index }) => (
          <Slide
            item={item}
            index={index}
            isActive={index === current}
            isLast={index === SLIDES.length - 1}
            onFinish={goNext}
            onSkip={finish}
          />
        )}
      />

      {/* Dots */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === current ? styles.dotActive : styles.dotInactive]} />
        ))}
      </View>
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a12' },

  orb: { position: 'absolute', borderRadius: 9999 },
  orbTop: {
    width: 320, height: 320, top: -80, right: -90,
    backgroundColor: 'rgba(124,58,237,0.20)',
  },
  orbBottom: {
    width: 380, height: 380, bottom: -120, left: -120,
    backgroundColor: 'rgba(79,70,229,0.16)',
  },

  logoSafe: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 5 },
  logoRow:  { flexDirection: 'row', alignItems: 'baseline', marginTop: 14 },
  logoWow:  { fontSize: 26, fontWeight: '900', fontStyle: 'italic', letterSpacing: -1, color: VIOLET },
  logoTrain:{ fontSize: 26, fontWeight: '300', letterSpacing: 4, color: '#fff' },

  slide: {
    width: W, flex: 1,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 36, paddingBottom: 110,
  },

  iconOuter: { alignItems: 'center', justifyContent: 'center', marginBottom: 36 },
  iconGlow: {
    position: 'absolute', width: 168, height: 168, borderRadius: 84,
    backgroundColor: 'rgba(124,58,237,0.22)',
  },
  iconGlass: {
    width: 120, height: 120, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.35)',
  },

  accentLine: {
    width: 44, height: 3, borderRadius: 2,
    backgroundColor: VIOLET, marginBottom: 26,
  },

  textWrap: { alignItems: 'center', gap: 14, marginBottom: 44 },
  title: {
    fontSize: 33, fontWeight: '800', color: '#fff',
    textAlign: 'center', letterSpacing: -0.8, lineHeight: 39,
  },
  sub: {
    fontSize: 16, lineHeight: 24, textAlign: 'center',
    color: 'rgba(255,255,255,0.68)', maxWidth: 300,
  },

  ctaBtn: {
    paddingVertical: 16, paddingHorizontal: 60, borderRadius: 50,
    shadowColor: VIOLET_DEEP, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55, shadowRadius: 18, elevation: 8,
  },
  ctaText: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },

  skipBtn:  { position: 'absolute', top: 56, right: 28 },
  skipText: { fontSize: 15, color: 'rgba(255,255,255,0.5)', fontWeight: '500' },

  dots: {
    position: 'absolute', bottom: 46, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  dot: { height: 6, borderRadius: 3 },
  dotActive:   { width: 24, backgroundColor: VIOLET },
  dotInactive: { width: 6,  backgroundColor: 'rgba(255,255,255,0.28)' },
});
