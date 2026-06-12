/**
 * app/traductor.tsx — Traductor de señales (PANTALLA, no Modal).
 *
 * Es una ruta normal de expo-router, NO un <Modal>. Eso evita el bug de toques
 * muertos del Modal en Android. Texto vía translatorEngine (Google Translate +
 * fallback MyMemory + bundle offline). Cámara vía expo-camera (corre en Expo Go)
 * + OCR.space para leer carteles.
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, ActivityIndicator,
  ScrollView, StyleSheet, Keyboard, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { translate } from '../services/translatorEngine';
import { getLanguage } from '../services/i18n';
import BottomTabBar from '../components/BottomTabBar';

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

export default function TraductorScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [sourceLang, setSourceLang] = useState<string>('auto');
  const [targetLang, setTargetLang] = useState<string>(getLanguage() === 'es' ? 'en' : getLanguage());
  const [input,  setInput]  = useState('');
  const [output, setOutput] = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);

  const swap = useCallback(() => {
    if (sourceLang === 'auto') return; // "Detectar" no se puede invertir
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setInput(output);
    setOutput(input);
  }, [sourceLang, targetLang, input, output]);

  const doTranslate = useCallback(async (text: string) => {
    if (!text.trim()) return;
    Keyboard.dismiss();
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

  const openCamera = useCallback(async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) { setError('Se necesita permiso de cámara para escanear.'); return; }
    }
    setError(null);
    setCameraOpen(true);
  }, [permission, requestPermission]);

  const shoot = useCallback(async () => {
    if (!cameraRef.current || ocrLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setOcrLoading(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (!photo) { setOcrLoading(false); return; }
      const manip = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 1100 } }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      const fd = new FormData();
      fd.append('base64Image', `data:image/jpeg;base64,${manip.base64 ?? ''}`);
      fd.append('language', 'auto');
      fd.append('isOverlayRequired', 'false');
      fd.append('detectOrientation', 'true');
      fd.append('scale', 'true');
      fd.append('OCREngine', '2');
      const res  = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST', headers: { apikey: 'helloworld' }, body: fd,
      });
      const json = await res.json();
      const text: string = (json?.ParsedResults?.[0]?.ParsedText ?? '').trim();
      setCameraOpen(false);
      setOcrLoading(false);
      if (text) { setInput(text); doTranslate(text); }
      else setError('No se detectó texto. Acercate al cartel e intentá de nuevo.');
    } catch {
      setOcrLoading(false);
      setCameraOpen(false);
      setError('Error al leer la imagen.');
    }
  }, [ocrLoading, doTranslate]);

  // ── MODO CÁMARA ───────────────────────────────────────────────────────────
  if (cameraOpen) {
    return (
      <View style={StyleSheet.absoluteFill}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        <View style={[styles.camOverlay, { paddingTop: insets.top + 12 }]}>
          <Pressable style={styles.camClose} onPress={() => setCameraOpen(false)} hitSlop={10}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          <View style={styles.scanBox}>
            <View style={[styles.corner, styles.tl]} /><View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} /><View style={[styles.corner, styles.br]} />
          </View>
          <Text style={styles.camHint}>Apuntá al cartel o frase</Text>
          <Pressable style={styles.shootBtn} onPress={shoot} disabled={ocrLoading}>
            {ocrLoading ? <ActivityIndicator color="#fff" /> : <Ionicons name="scan" size={30} color="#fff" />}
          </Pressable>
        </View>
      </View>
    );
  }

  // ── PANTALLA PRINCIPAL ──────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <LinearGradient colors={['#0E0E2E', '#0A0820', '#06040F']} style={StyleSheet.absoluteFill} />
      <StatusBar barStyle="light-content" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingHorizontal: 18, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
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
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{l.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Entrada */}
        <View style={styles.card}>
          <TextInput
            style={styles.input}
            placeholder="Escribí o usá la cámara…"
            placeholderTextColor="rgba(255,255,255,0.45)"
            multiline
            maxLength={1000}
            value={input}
            onChangeText={setInput}
          />
          <View style={styles.inputFooter}>
            {input.length > 0 ? (
              <Pressable onPress={() => { setInput(''); setOutput(''); }} hitSlop={8}>
                <Text style={styles.clearText}>Limpiar</Text>
              </Pressable>
            ) : <View />}
            <Pressable style={styles.cameraBtn} onPress={openCamera}>
              <Ionicons name="camera" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Botón traducir */}
        <Pressable
          style={({ pressed }) => [styles.translateBtn, (!input.trim() || loading) && styles.translateBtnDisabled, pressed && { opacity: 0.85 }]}
          onPress={() => doTranslate(input)}
          disabled={loading || !input.trim()}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <><Text style={styles.translateBtnText}>Traducir</Text><Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} /></>}
        </Pressable>

        {error && <Text style={styles.error}>{error}</Text>}

        {/* Idioma destino */}
        <Text style={styles.langLabel}>A</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} keyboardShouldPersistTaps="handled">
          {TARGET_LANGS.map(l => {
            const active = targetLang === l.code;
            return (
              <Pressable key={l.code} onPress={() => setTargetLang(l.code)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{l.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Salida */}
        <View style={[styles.card, styles.outputCard]}>
          {loading
            ? <Text style={styles.placeholder}>Traduciendo…</Text>
            : <Text style={output ? styles.outputText : styles.placeholder}>{output || 'La traducción aparecerá acá…'}</Text>}
        </View>
      </ScrollView>

      <BottomTabBar active="traducir" />
    </View>
  );
}

const PURPLE = '#7C3AED';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0820' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '800', color: '#fff' },
  swapBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,92,246,0.25)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.5)' },

  langLabel: { fontSize: 11, fontWeight: '700', color: '#A78BFA', letterSpacing: 1.5, marginBottom: 8, marginTop: 4 },
  chipRow: { marginBottom: 14 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', marginRight: 8 },
  chipActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  chipText: { fontSize: 14, color: 'rgba(255,255,255,0.75)', fontWeight: '600' },
  chipTextActive: { color: '#fff', fontWeight: '700' },

  card: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  input: { fontSize: 18, color: '#fff', minHeight: 110, textAlignVertical: 'top' },
  inputFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  clearText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' },
  cameraBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center' },

  translateBtn: { flexDirection: 'row', backgroundColor: PURPLE, paddingVertical: 15, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  translateBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.15)' },
  translateBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  error: { color: '#FCA5A5', fontSize: 14, marginTop: 10, textAlign: 'center' },

  outputCard: { marginTop: 4, minHeight: 130, backgroundColor: 'rgba(139,92,246,0.10)', borderColor: 'rgba(139,92,246,0.30)' },
  outputText: { fontSize: 19, color: '#fff', lineHeight: 26 },
  placeholder: { fontSize: 16, color: 'rgba(255,255,255,0.45)', fontStyle: 'italic' },

  // Cámara
  camOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  camClose: { position: 'absolute', top: 50, left: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  scanBox: { width: 290, height: 160 },
  corner: { position: 'absolute', width: 26, height: 26, borderColor: '#A78BFA' },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 10 },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 10 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 10 },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 10 },
  camHint: { color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 28, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, overflow: 'hidden' },
  shootBtn: { position: 'absolute', bottom: 60, alignSelf: 'center', width: 74, height: 74, borderRadius: 37, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.4)' },
});
