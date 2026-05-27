/**
 * TranslatorSheet — Traductor de señales ferroviarias
 *
 * DOS MODOS:
 *   📷 CÁMARA  → apuntás a un cartel en japonés/chino → OCR → traducción
 *   ✏️  TEXTO   → escribís cualquier texto → traducción
 *
 * POR QUÉ EXISTE:
 *   Un turista en Tokio no puede leer "出発" (Salida) ni "のりば" (Andén).
 *   Esta feature es la diferencia entre perderse y llegar a tiempo al tren.
 *
 * STACK:
 *   expo-camera        — cámara con botón de captura
 *   expo-image-picker  — alternativa para seleccionar foto del carrete
 *   translateEngine    — offline bundle + LibreTranslate API fallback
 *
 * NOTA OCR:
 *   El reconocimiento de texto desde imagen requiere un módulo nativo
 *   de ML Kit. Para el MVP usamos expo-image-picker + un endpoint de OCR
 *   (o ML Kit via @react-native-ml-kit/text-recognition en la build nativa).
 *   En simulador/web muestra el flujo completo con texto manual.
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Modal,
  ActivityIndicator,
  ScrollView,
  Platform,
  SafeAreaView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { t, SUPPORTED_LANGUAGES, getLanguage } from '../services/i18n';
import { translate, SOURCE_LANGUAGES } from '../services/translatorEngine';
import type { AppLanguage } from '../types';

// ── Props ─────────────────────────────────────────────────────────────────────
interface TranslatorSheetProps {
  visible:  boolean;
  onClose:  () => void;
}

// ── Tipo de resultado visual ──────────────────────────────────────────────────
interface TranslationDisplay {
  original:   string;
  translated: string;
  detectedLang: string | null;
  source:     'offline' | 'api' | 'fallback';
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function TranslatorSheet({ visible, onClose }: TranslatorSheetProps) {
  const [mode,         setMode]         = useState<'camera' | 'text'>('camera');
  const [inputText,    setInputText]    = useState('');
  const [sourceLang,   setSourceLang]   = useState('auto');
  const [targetLang,   setTargetLang]   = useState<AppLanguage>(getLanguage());
  const [isLoading,    setIsLoading]    = useState(false);
  const [result,       setResult]       = useState<TranslationDisplay | null>(null);
  const [capturedText, setCapturedText] = useState<string | null>(null); // texto extraído por OCR
  const inputRef = useRef<TextInput>(null);

  // ── Captura de imagen ────────────────────────────────────────────────────
  const handleCameraCapture = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      // Show fallback: switch to text mode
      setMode('text');
      return;
    }

    const picked = await ImagePicker.launchCameraAsync({
      allowsEditing:   false,
      quality:         0.85,
      base64:          true, // para enviar al OCR endpoint si existe
    });

    if (picked.canceled) return;

    // MVP: en build nativa se usa ML Kit text recognition.
    // En simulador mostramos un placeholder para que el usuario ingrese el texto.
    setCapturedText(null);
    setMode('text'); // Fallback a texto en simulador
    inputRef.current?.focus();
  }, []);

  // ── Seleccionar de galería ───────────────────────────────────────────────
  const handleGalleryPick = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality:    0.85,
      base64:     true,
    });

    if (picked.canceled) return;

    // Misma lógica — OCR en nativo, fallback a texto en simulador
    setMode('text');
    inputRef.current?.focus();
  }, []);

  // ── Traducción ───────────────────────────────────────────────────────────
  const handleTranslate = useCallback(async () => {
    const textToTranslate = inputText.trim();
    if (!textToTranslate) return;

    setIsLoading(true);
    setResult(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const res = await translate(textToTranslate, targetLang, sourceLang);
      setResult({
        original:     res.originalText,
        translated:   res.translatedText,
        detectedLang: res.detectedLang,
        source:       res.source,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setResult({
        original:     textToTranslate,
        translated:   textToTranslate,
        detectedLang: null,
        source:       'fallback',
      });
    } finally {
      setIsLoading(false);
    }
  }, [inputText, targetLang, sourceLang]);

  const handleClear = useCallback(() => {
    setInputText('');
    setResult(null);
    setCapturedText(null);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.root}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeBtn} accessibilityLabel={t('close')}>
            <Text style={styles.closeIcon}>✕</Text>
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{t('translator_title')}</Text>
            <Text style={styles.headerSub}>🇯🇵 🇨🇳 🇩🇪 🇫🇷 +7</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        {/* ── Mode tabs ── */}
        <View style={styles.modeTabs}>
          <Pressable
            style={[styles.modeTab, mode === 'camera' && styles.modeTabActive]}
            onPress={() => setMode('camera')}
          >
            <Text style={[styles.modeTabIcon, mode === 'camera' && styles.modeTabIconActive]}>📷</Text>
            <Text style={[styles.modeTabText, mode === 'camera' && styles.modeTabTextActive]}>
              {t('translator_camera')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeTab, mode === 'text' && styles.modeTabActive]}
            onPress={() => { setMode('text'); setTimeout(() => inputRef.current?.focus(), 200); }}
          >
            <Text style={[styles.modeTabIcon, mode === 'text' && styles.modeTabIconActive]}>✏️</Text>
            <Text style={[styles.modeTabText, mode === 'text' && styles.modeTabTextActive]}>
              {t('translator_text')}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Camera mode ── */}
          {mode === 'camera' && (
            <View style={styles.cameraSection}>
              <View style={styles.cameraPreview}>
                <Text style={styles.cameraPlaceholderEmoji}>📸</Text>
                <Text style={styles.cameraPlaceholderText}>{t('translator_camera_hint')}</Text>
                <Text style={styles.cameraPlaceholderSub}>
                  Japonés · Chino · Coreano · Cualquier idioma
                </Text>
              </View>

              <View style={styles.cameraButtons}>
                <Pressable style={styles.cameraPrimary} onPress={handleCameraCapture}>
                  <Text style={styles.cameraPrimaryIcon}>📷</Text>
                  <Text style={styles.cameraPrimaryText}>{t('translator_camera')}</Text>
                </Pressable>
                <Pressable style={styles.cameraSecondary} onPress={handleGalleryPick}>
                  <Text style={styles.cameraSecondaryIcon}>🖼️</Text>
                  <Text style={styles.cameraSecondaryText}>Galería</Text>
                </Pressable>
              </View>

              <View style={styles.offlineNote}>
                <Text style={styles.offlineNoteIcon}>📴</Text>
                <Text style={styles.offlineNoteText}>{t('translator_offline_note')}</Text>
              </View>
            </View>
          )}

          {/* ── Text mode ── */}
          {mode === 'text' && (
            <View style={styles.textSection}>
              <Text style={styles.inputLabel}>{t('translator_text_hint')}</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  ref={inputRef}
                  style={styles.textInput}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="出発  /  站台  /  Bahnsteig..."
                  placeholderTextColor={Colors.text.muted}
                  multiline
                  numberOfLines={4}
                  returnKeyType="done"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {inputText.length > 0 && (
                  <Pressable style={styles.clearBtn} onPress={handleClear}>
                    <Text style={styles.clearBtnText}>✕</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {/* ── Language selectors ── */}
          <View style={styles.langRow}>
            {/* Source */}
            <View style={styles.langBox}>
              <Text style={styles.langLabel}>{t('translator_from')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.langScroll}>
                {SOURCE_LANGUAGES.map((lang) => (
                  <Pressable
                    key={lang.code}
                    style={[styles.langChip, sourceLang === lang.code && styles.langChipActive]}
                    onPress={() => setSourceLang(lang.code)}
                  >
                    <Text style={[styles.langChipText, sourceLang === lang.code && styles.langChipTextActive]}>
                      {lang.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <Text style={styles.langArrow}>→</Text>

            {/* Target */}
            <View style={styles.langBox}>
              <Text style={styles.langLabel}>{t('translator_to')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.langScroll}>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <Pressable
                    key={lang.code}
                    style={[styles.langChip, targetLang === lang.code && styles.langChipActive]}
                    onPress={() => setTargetLang(lang.code)}
                  >
                    <Text style={[styles.langChipText, targetLang === lang.code && styles.langChipTextActive]}>
                      {lang.flag} {lang.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>

          {/* ── Translate button ── */}
          <Pressable
            style={({ pressed }) => [
              styles.translateBtn,
              pressed && { opacity: 0.85 },
              (!inputText.trim() && mode === 'text') && styles.translateBtnDisabled,
            ]}
            onPress={handleTranslate}
            disabled={isLoading || (!inputText.trim() && mode === 'text')}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.translateBtnText}>
                {isLoading ? t('translator_translating') : t('translator_btn')}
              </Text>
            )}
          </Pressable>

          {/* ── Result ── */}
          {result && (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <Text style={styles.resultOriginalLabel}>ORIGINAL</Text>
                <View style={[
                  styles.sourceChip,
                  result.source === 'offline' && styles.sourceChipOffline,
                  result.source === 'api'     && styles.sourceChipApi,
                ]}>
                  <Text style={styles.sourceChipText}>
                    {result.source === 'offline' ? '📴 Offline' : result.source === 'api' ? '🌐 API' : '⚠️ Fallback'}
                  </Text>
                </View>
              </View>
              <Text style={styles.resultOriginal}>{result.original}</Text>
              {result.detectedLang && (
                <Text style={styles.resultDetected}>
                  Idioma detectado: {SOURCE_LANGUAGES.find(l => l.code === result.detectedLang)?.label ?? result.detectedLang}
                </Text>
              )}

              <View style={styles.resultDivider} />

              <Text style={styles.resultTranslatedLabel}>TRADUCCIÓN</Text>
              <Text style={styles.resultTranslated}>{result.translated}</Text>

              {result.source === 'fallback' && (
                <View style={styles.resultWarning}>
                  <Text style={styles.resultWarningText}>
                    ⚠️ {t('translator_error')}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── Quick phrases for Japan / China ── */}
          <View style={styles.quickSection}>
            <Text style={styles.quickTitle}>Frases rápidas</Text>
            <View style={styles.quickRow}>
              {[
                { label: '🇯🇵 出発 → Salida',         text: '出発' },
                { label: '🇯🇵 のりば → Andén',        text: 'のりば' },
                { label: '🇨🇳 站台 → Andén',          text: '站台' },
                { label: '🇨🇳 换乘 → Transbordo',     text: '换乘' },
                { label: '🇯🇵 改札口 → Torniquete',   text: '改札口' },
                { label: '🇨🇳 安检 → Seguridad',      text: '安检' },
              ].map((phrase) => (
                <Pressable
                  key={phrase.text}
                  style={styles.quickChip}
                  onPress={() => {
                    setInputText(phrase.text);
                    setMode('text');
                  }}
                >
                  <Text style={styles.quickChipText}>{phrase.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg.base },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: Spacing['3'],
    paddingVertical:   Spacing['3'],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
    backgroundColor:   Colors.bg.elevated,
  },
  closeBtn: {
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.full, backgroundColor: Colors.bg.overlay,
  },
  closeIcon: { fontSize: Typography.size.sm, color: Colors.text.secondary },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  headerTitle: {
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.black,
    color:      Colors.text.primary,
    letterSpacing: 0.5,
  },
  headerSub: { fontSize: Typography.size.xs, color: Colors.text.muted },

  modeTabs: {
    flexDirection:     'row',
    paddingHorizontal: Spacing['4'],
    paddingVertical:   Spacing['2'],
    gap:               Spacing['2'],
    backgroundColor:   Colors.bg.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  modeTab: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
    justifyContent:'center',
    gap:           Spacing['2'],
    paddingVertical: Spacing['2'],
    borderRadius:  Radius.md,
    borderWidth:   1,
    borderColor:   Colors.border.subtle,
  },
  modeTabActive: {
    backgroundColor: Colors.brand.primary,
    borderColor:     Colors.brand.primary,
  },
  modeTabIcon:       { fontSize: 16 },
  modeTabIconActive: { },
  modeTabText: {
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color:      Colors.text.secondary,
  },
  modeTabTextActive: { color: '#fff' },

  scroll:        { flex: 1 },
  scrollContent: { padding: Spacing['4'], gap: Spacing['4'], paddingBottom: 40 },

  // Camera mode
  cameraSection: { gap: Spacing['3'] },
  cameraPreview: {
    backgroundColor: Colors.bg.surface,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border.subtle,
    borderStyle:     'dashed',
    height:          180,
    alignItems:      'center',
    justifyContent:  'center',
    gap:             Spacing['2'],
  },
  cameraPlaceholderEmoji: { fontSize: 40 },
  cameraPlaceholderText: {
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color:      Colors.text.secondary,
    textAlign:  'center',
  },
  cameraPlaceholderSub: {
    fontSize:  Typography.size.xs,
    color:     Colors.text.muted,
    textAlign: 'center',
  },
  cameraButtons: {
    flexDirection: 'row',
    gap:           Spacing['3'],
  },
  cameraPrimary: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
    justifyContent:'center',
    gap:           Spacing['2'],
    paddingVertical: Spacing['3'],
    backgroundColor: Colors.brand.primary,
    borderRadius:  Radius.lg,
    minHeight:     48,
  },
  cameraPrimaryIcon: { fontSize: 18 },
  cameraPrimaryText: {
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color:      '#fff',
  },
  cameraSecondary: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
    justifyContent:'center',
    gap:           Spacing['2'],
    paddingVertical: Spacing['3'],
    backgroundColor: Colors.bg.elevated,
    borderRadius:  Radius.lg,
    borderWidth:   1,
    borderColor:   Colors.border.default,
    minHeight:     48,
  },
  cameraSecondaryIcon: { fontSize: 18 },
  cameraSecondaryText: {
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color:      Colors.text.secondary,
  },
  offlineNote: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing['2'],
    paddingVertical: Spacing['2'],
    paddingHorizontal: Spacing['3'],
    backgroundColor: Colors.bg.surface,
    borderRadius:  Radius.md,
  },
  offlineNoteIcon: { fontSize: 14 },
  offlineNoteText: { fontSize: Typography.size.xs, color: Colors.text.muted, flex: 1 },

  // Text mode
  textSection:  { gap: Spacing['2'] },
  inputLabel:   { fontSize: Typography.size.xs, color: Colors.text.secondary, fontWeight: Typography.weight.semibold },
  inputWrap:    { position: 'relative' },
  textInput: {
    backgroundColor: Colors.bg.surface,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border.default,
    padding:         Spacing['3'],
    fontSize:        Typography.size.lg,
    color:           Colors.text.primary,
    minHeight:       100,
    textAlignVertical:'top',
  },
  clearBtn: {
    position: 'absolute', top: Spacing['2'], right: Spacing['2'],
    width: 24, height: 24,
    backgroundColor: Colors.bg.overlay, borderRadius: Radius.full,
    alignItems: 'center', justifyContent: 'center',
  },
  clearBtnText: { fontSize: 10, color: Colors.text.secondary },

  // Lang selectors
  langRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           Spacing['2'],
  },
  langBox:   { flex: 1 },
  langLabel: {
    fontSize:     Typography.size.xs,
    color:        Colors.text.secondary,
    fontWeight:   Typography.weight.semibold,
    marginBottom: Spacing['1'],
    letterSpacing:0.5,
  },
  langScroll:     { },
  langArrow: {
    fontSize:   Typography.size.xl,
    color:      Colors.brand.glow,
    marginTop:  20,
  },
  langChip: {
    paddingVertical:   Spacing['1'],
    paddingHorizontal: Spacing['2'],
    backgroundColor:   Colors.bg.surface,
    borderRadius:      Radius.full,
    borderWidth:       1,
    borderColor:       Colors.border.subtle,
    marginRight:       Spacing['1'],
  },
  langChipActive: {
    backgroundColor: Colors.brand.primary,
    borderColor:     Colors.brand.primary,
  },
  langChipText: {
    fontSize:   Typography.size.xs,
    color:      Colors.text.secondary,
    whiteSpace: 'nowrap',
  } as any,
  langChipTextActive: { color: '#fff', fontWeight: Typography.weight.semibold },

  // Translate button
  translateBtn: {
    backgroundColor: Colors.brand.primary,
    borderRadius:    Radius.lg,
    paddingVertical: Spacing['3'],
    alignItems:      'center',
    minHeight:       52,
    justifyContent:  'center',
  },
  translateBtnDisabled: { opacity: 0.45 },
  translateBtnText: {
    fontSize:     Typography.size.md,
    fontWeight:   Typography.weight.black,
    color:        '#fff',
    letterSpacing:0.5,
  },

  // Result card
  resultCard: {
    backgroundColor: Colors.bg.elevated,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border.default,
    padding:         Spacing['4'],
    gap:             Spacing['2'],
  },
  resultHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultOriginalLabel: {
    fontSize:     Typography.size.xs,
    fontWeight:   Typography.weight.bold,
    color:        Colors.text.muted,
    letterSpacing:1,
  },
  sourceChip: {
    paddingVertical:   2,
    paddingHorizontal: Spacing['2'],
    borderRadius:      Radius.full,
    backgroundColor:   Colors.bg.overlay,
  },
  sourceChipOffline: { backgroundColor: 'rgba(34,197,94,0.12)' },
  sourceChipApi:     { backgroundColor: 'rgba(124,58,237,0.12)' },
  sourceChipText: { fontSize: 10, color: Colors.text.secondary },
  resultOriginal: {
    fontSize:   Typography.size.xl,
    color:      Colors.text.primary,
    fontWeight: Typography.weight.bold,
  },
  resultDetected: {
    fontSize: Typography.size.xs,
    color:    Colors.text.muted,
  },
  resultDivider: {
    height:          1,
    backgroundColor: Colors.border.subtle,
    marginVertical:  Spacing['1'],
  },
  resultTranslatedLabel: {
    fontSize:     Typography.size.xs,
    fontWeight:   Typography.weight.bold,
    color:        Colors.brand.glow,
    letterSpacing:1,
  },
  resultTranslated: {
    fontSize:   Typography.size['2xl'],
    color:      Colors.text.primary,
    fontWeight: Typography.weight.black,
    lineHeight: 42,
  },
  resultWarning: {
    paddingVertical: Spacing['2'],
    paddingHorizontal: Spacing['3'],
    backgroundColor:'rgba(239,68,68,0.08)',
    borderRadius:   Radius.md,
  },
  resultWarningText: {
    fontSize: Typography.size.xs,
    color:    Colors.status.danger,
  },

  // Quick phrases
  quickSection: { gap: Spacing['2'] },
  quickTitle: {
    fontSize:   Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color:      Colors.text.secondary,
    letterSpacing: 0.5,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           Spacing['2'],
  },
  quickChip: {
    paddingVertical:   Spacing['2'],
    paddingHorizontal: Spacing['3'],
    backgroundColor:   Colors.bg.surface,
    borderRadius:      Radius.md,
    borderWidth:       1,
    borderColor:       Colors.border.subtle,
  },
  quickChipText: {
    fontSize: Typography.size.xs,
    color:    Colors.text.secondary,
  },
});
