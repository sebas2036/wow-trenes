/**
 * app/traductor.tsx — Traductor de texto + voz (PANTALLA, no Modal).
 *
 * Es una ruta normal de expo-router, NO un <Modal> (eso evitaba el bug de toques
 * muertos en Android). Texto vía translatorEngine (Google Translate + fallback
 * MyMemory + bundle offline). Voz universal vía Google TTS + expo-av (habla
 * cualquier idioma sin depender de las voces instaladas en el teléfono).
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, ActivityIndicator,
  ScrollView, StyleSheet, Keyboard, StatusBar, Image, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Shadows } from '../theme';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { translate } from '../services/translatorEngine';
import { getLanguage } from '../services/i18n';
import BottomTabBar from '../components/BottomTabBar';
import FlagCircle from '../components/FlagCircle';

// Tipo exacto del parámetro de idioma destino de translate() — evita importar AppLanguage
type TargetLang = Parameters<typeof translate>[1];

type Lang = { code: string; name: string };

const SOURCE_LANGS: Lang[] = [
  { code: 'auto', name: 'Detectar' },
  { code: 'es', name: 'Español' },  { code: 'en', name: 'Inglés' },
  { code: 'fr', name: 'Francés' },  { code: 'de', name: 'Alemán' },
  { code: 'it', name: 'Italiano' }, { code: 'pt', name: 'Portugués' },
  { code: 'ja', name: '日本語' },    { code: 'zh', name: '中文' },
  { code: 'ko', name: '한국어' },    { code: 'ar', name: 'العربية' },
];
const TARGET_LANGS: Lang[] = SOURCE_LANGS.filter(l => l.code !== 'auto');

// Código de idioma → país (ISO alpha-2) para FlagCircle
const LANG_TO_COUNTRY: Record<string, string> = {
  es: 'es', en: 'gb', fr: 'fr', de: 'de', it: 'it',
  pt: 'pt', ja: 'jp', zh: 'cn', ko: 'kr', ar: 'sa',
};

// Locale para Google TTS
const ttsLocale = (code: string): string => (code === 'zh' ? 'zh-CN' : code);

// Google TTS limita ~200 chars por request → partir el texto en pedazos reproducibles
function chunkText(text: string, maxLen: number): string[] {
  const clean = text.trim();
  if (clean.length <= maxLen) return [clean];
  const out: string[] = [];
  let rest = clean;
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf(' ', maxLen);
    if (cut <= 0) cut = maxLen; // sin espacios (CJK) → corte duro
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export default function TraductorScreen() {
  const insets = useSafeAreaInsets();

  const [sourceLang, setSourceLang] = useState<string>('auto');
  const [targetLang, setTargetLang] = useState<string>(getLanguage() === 'es' ? 'en' : getLanguage());
  const [input,  setInput]  = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const pulse      = useRef(new Animated.Value(1)).current;
  const soundRef   = useRef<Audio.Sound | null>(null);
  const speakIdRef = useRef(0); // token para cancelar la reproducción en curso

  // Animación de pulso del parlante mientras habla
  useEffect(() => {
    if (!speaking) { pulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.22, duration: 450, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,    duration: 450, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [speaking, pulse]);

  // Descargar el audio al desmontar (evita fuga de memoria)
  useEffect(() => () => { soundRef.current?.unloadAsync().catch(() => {}); }, []);

  const stopSpeak = useCallback(async () => {
    speakIdRef.current++; // invalida la reproducción en curso
    try { await soundRef.current?.unloadAsync(); } catch {}
    soundRef.current = null;
    setSpeaking(false);
  }, []);

  // Voz UNIVERSAL: Google TTS — habla cualquier idioma sin depender de las voces del teléfono
  const speak = useCallback(async () => {
    if (!output) return;
    if (speaking) { stopSpeak(); return; }
    Haptics.selectionAsync();
    setError(null);
    setSpeaking(true);
    const myId = ++speakIdRef.current;
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const tl = ttsLocale(targetLang);
      for (const chunk of chunkText(output, 190)) {
        if (speakIdRef.current !== myId) break; // cancelado
        const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(chunk)}`;
        const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true });
        soundRef.current = sound;
        await new Promise<void>((resolve) => {
          sound.setOnPlaybackStatusUpdate((st) => {
            if (!st.isLoaded) { resolve(); return; }
            if (st.didJustFinish) resolve();
          });
        });
        await sound.unloadAsync().catch(() => {});
      }
    } catch {
      setError('No se pudo reproducir la voz. Revisá tu conexión.');
    } finally {
      if (speakIdRef.current === myId) { setSpeaking(false); soundRef.current = null; }
    }
  }, [output, speaking, targetLang, stopSpeak]);

  const swap = useCallback(() => {
    if (sourceLang === 'auto') return; // "Detectar" no se puede invertir
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setInput(output);
    setOutput(input);
  }, [sourceLang, targetLang, input, output]);

  const doTranslate = useCallback(async (text: string) => {
    if (!text.trim()) return;
    // OJO: NO cerrar el teclado acá — el auto-traductor corre en segundo plano
    // mientras escribís; cerrarlo te sacaba del medio de la frase.
    setLoading(true); setError(null); setOutput('');
    try {
      const r = await translate(text, targetLang as TargetLang, sourceLang);
      setOutput(r.translatedText);
    } catch {
      setError('No se pudo traducir. Revisá tu conexión.');
    } finally {
      setLoading(false);
    }
  }, [targetLang, sourceLang]);

  // Auto-traducir mientras escribís (debounce) y al cambiar de idioma
  useEffect(() => {
    if (!input.trim()) { setOutput(''); return; }
    const id = setTimeout(() => { doTranslate(input); }, 650);
    return () => clearTimeout(id);
  }, [input, doTranslate]);

  return (
    <View style={styles.root}>
      {/* Fondo hero + gradiente — mismo look que Inicio/Salidas */}
      <Image
        source={require('../assets/images/bg-hero.png')}
        style={[StyleSheet.absoluteFillObject, { top: -280, bottom: 280 }]}
        resizeMode="cover"
        fadeDuration={0}
      />
      <LinearGradient
        colors={['rgba(10,8,30,0.20)', 'rgba(14,14,46,0.45)', 'rgba(14,14,46,0.65)']}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <StatusBar barStyle="light-content" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 14, paddingHorizontal: 18, paddingBottom: 12 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Traductor</Text>
          <Pressable style={styles.swapBtn} onPress={swap} hitSlop={8}>
            <Ionicons name="swap-horizontal" size={20} color="#fff" />
          </Pressable>
        </View>

        {/* Idioma origen */}
        <Text style={styles.langLabel}>DESDE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} keyboardShouldPersistTaps="handled">
          {SOURCE_LANGS.map(l => {
            const active = sourceLang === l.code;
            return (
              <Pressable key={l.code} onPress={() => setSourceLang(l.code)} style={[styles.chip, active && styles.chipActive]}>
                {active && <LinearGradient colors={BRAND_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.chipGrad} />}
                {l.code === 'auto'
                  ? <Ionicons name="globe-outline" size={16} color={active ? '#fff' : 'rgba(255,255,255,0.7)'} />
                  : <FlagCircle countryCode={LANG_TO_COUNTRY[l.code] ?? l.code} size="sm" />}
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{l.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Entrada */}
        <View style={styles.card}>
          <TextInput
            style={styles.input}
            placeholder="Escribí lo que querés traducir…"
            placeholderTextColor="rgba(255,255,255,0.45)"
            multiline
            maxLength={1000}
            value={input}
            onChangeText={setInput}
          />
          {input.length > 0 && (
            <View style={styles.inputFooter}>
              <Pressable onPress={() => { setInput(''); setOutput(''); }} hitSlop={8}>
                <Text style={styles.clearText}>Limpiar</Text>
              </Pressable>
              <Text style={styles.charCount}>{input.length}/1000</Text>
            </View>
          )}
        </View>

        {/* Botón traducir */}
        <Pressable
          style={({ pressed }) => [
            styles.translateBtnWrap,
            (!input.trim() || loading) && { opacity: 0.5 },
            pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
          ]}
          onPress={() => { Keyboard.dismiss(); doTranslate(input); }}
          disabled={loading || !input.trim()}
        >
          <LinearGradient
            colors={BRAND_GRAD}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.translateBtn}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <><Text style={styles.translateBtnText}>Traducir</Text><Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} /></>}
          </LinearGradient>
        </Pressable>

        {error && <Text style={styles.error}>{error}</Text>}

        {/* Idioma destino */}
        <Text style={styles.langLabel}>A</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} keyboardShouldPersistTaps="handled">
          {TARGET_LANGS.map(l => {
            const active = targetLang === l.code;
            return (
              <Pressable key={l.code} onPress={() => setTargetLang(l.code)} style={[styles.chip, active && styles.chipActive]}>
                {active && <LinearGradient colors={BRAND_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.chipGrad} />}
                <FlagCircle countryCode={LANG_TO_COUNTRY[l.code] ?? l.code} size="sm" />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{l.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Salida */}
        <View style={[styles.card, styles.outputCard]}>
          {!!output && !loading && (
            <Pressable
              style={[styles.speakBtn, speaking && styles.speakBtnActive]}
              onPress={speak}
              hitSlop={8}
            >
              <Animated.View style={{ transform: [{ scale: speaking ? pulse : 1 }] }}>
                <Ionicons name={speaking ? 'volume-high' : 'volume-medium'} size={20} color="#C4B5FD" />
              </Animated.View>
            </Pressable>
          )}
          {loading
            ? <Text style={styles.placeholder}>Traduciendo…</Text>
            : <Text style={[output ? styles.outputText : styles.placeholder, !!output && { paddingRight: 36 }]}>{output || 'La traducción aparecerá acá…'}</Text>}
        </View>
      </ScrollView>

      <BottomTabBar active="traducir" />
    </View>
  );
}

const PURPLE = '#8B5CF6'; // brand.primary (dark) — igual que el resto de la app
const BRAND_GRAD = ['#8B5CF6', '#7C3AED', '#6D28D9'] as const; // Gradients.brandVertical

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0820' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '800', color: '#fff' },
  swapBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,92,246,0.25)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.5)' },

  langLabel: { fontSize: 11, fontWeight: '700', color: '#A78BFA', letterSpacing: 1.5, marginBottom: 8, marginTop: 4 },
  chipRow: { flexGrow: 0, flexShrink: 0, height: 50, marginBottom: 14 },
  chip: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 8, paddingRight: 14, paddingVertical: 7, borderRadius: 22, backgroundColor: 'rgba(14,14,46,0.70)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', marginRight: 8 },
  chipActive: { borderColor: 'rgba(196,181,253,0.65)', ...Shadows.glow },
  chipGrad: { ...StyleSheet.absoluteFillObject, borderRadius: 22 },
  chipText: { fontSize: 14, color: 'rgba(255,255,255,0.75)', fontWeight: '600' },
  chipTextActive: { color: '#fff', fontWeight: '700' },

  card: { flex: 1, minHeight: 130, backgroundColor: 'rgba(14,14,46,0.80)', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  input: { flex: 1, fontSize: 18, color: '#fff', textAlignVertical: 'top' },
  inputFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  clearText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' },
  charCount: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },

  translateBtnWrap: { marginTop: 14, borderRadius: 14, overflow: 'hidden', ...Shadows.glow },
  translateBtn: { flexDirection: 'row', paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  translateBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  error: { color: '#FCA5A5', fontSize: 14, marginTop: 10, textAlign: 'center' },

  outputCard: { marginTop: 4, backgroundColor: 'rgba(14,14,46,0.80)', borderColor: 'rgba(139,92,246,0.40)' },
  speakBtn: { position: 'absolute', top: 12, right: 12, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,92,246,0.18)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.4)', zIndex: 2 },
  speakBtnActive: { backgroundColor: 'rgba(139,92,246,0.55)', borderColor: '#A78BFA', ...Shadows.glow },
  outputText: { fontSize: 19, color: '#fff', lineHeight: 26 },
  placeholder: { fontSize: 16, color: 'rgba(255,255,255,0.45)', fontStyle: 'italic' },
});
