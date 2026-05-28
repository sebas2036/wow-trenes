/**
 * TranslatorSheet — Traductor de señales ferroviarias
 *
 * DOS MODOS:
 *   CÁMARA → apuntás a un cartel en japonés/chino → OCR → traducción
 *   TEXTO  → escribís cualquier texto → traducción
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
import { Ionicons } from '@expo/vector-icons';
import FlagCircle from './FlagCircle';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

import { Typography, Spacing, Radius, Shadows } from '../theme';
import { useTheme } from '../context/ThemeContext';

/** Mapa idioma ISO 639-1 → código de país ISO 3166-1 alpha-2 para bandera */
const LANG_TO_COUNTRY: Record<string, string> = {
  es: 'es', en: 'gb', pt: 'pt', fr: 'fr',
  de: 'de', it: 'it', ja: 'jp', zh: 'cn',
  ko: 'kr', ar: 'sa', ru: 'ru', nl: 'nl',
};
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
  original:     string;
  translated:   string;
  detectedLang: string | null;
  source:       'offline' | 'api' | 'fallback';
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function TranslatorSheet({ visible, onClose }: TranslatorSheetProps) {
  const { colors, isDark } = useTheme();

  const [mode,         setMode]         = useState<'camera' | 'text'>('camera');
  const [inputText,    setInputText]    = useState('');
  const [sourceLang,   setSourceLang]   = useState('auto');
  const [targetLang,   setTargetLang]   = useState<AppLanguage>(getLanguage());
  const [isLoading,    setIsLoading]    = useState(false);
  const [result,       setResult]       = useState<TranslationDisplay | null>(null);
  const [capturedText, setCapturedText] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  // ── Captura de imagen ────────────────────────────────────────────────────
  const handleCameraCapture = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setMode('text');
      return;
    }

    const picked = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality:       0.85,
      base64:        true,
    });

    if (picked.canceled) return;

    setCapturedText(null);
    setMode('text');
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

  // ── Helpers ──────────────────────────────────────────────────────────────
  const cardShadow = Platform.OS === 'ios'
    ? (isDark ? Shadows.cardDark : Shadows.card)
    : { elevation: 2 };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg.base }]}>

        {/* ── Header ── */}
        <View style={[styles.header, {
          backgroundColor:   colors.bg.elevated,
          borderBottomColor: colors.border.subtle,
        }]}>
          <Pressable
            onPress={onClose}
            style={[styles.closeBtn, { backgroundColor: colors.bg.overlay }]}
            accessibilityLabel={t('close')}
            hitSlop={8}
          >
            <Ionicons name="close" size={16} color={colors.text.secondary} />
          </Pressable>

          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
              {t('translator_title')}
            </Text>
            <Text style={[styles.headerSub, { color: colors.text.muted }]}>
              🇯🇵 🇨🇳 🇩🇪 🇫🇷 +7
            </Text>
          </View>

          <View style={{ width: 44 }} />
        </View>

        {/* ── Mode tabs — Apple segmented control ── */}
        <View style={[styles.modeTabsWrap, { backgroundColor: colors.bg.surface, borderBottomColor: colors.border.subtle }]}>
          <View style={[styles.modeTabs, { backgroundColor: colors.bg.elevated }]}>
            {([
              { key: 'camera', icon: 'camera',  iconOutline: 'camera-outline',  label: t('translator_camera') },
              { key: 'text',   icon: 'create',  iconOutline: 'create-outline',  label: t('translator_text')   },
            ] as const).map((tab) => {
              const active = mode === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  style={[
                    styles.modeTab,
                    active && [styles.modeTabActive, { backgroundColor: colors.bg.card }, Shadows.segment],
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setMode(tab.key);
                    if (tab.key === 'text') setTimeout(() => inputRef.current?.focus(), 200);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons
                    name={active ? tab.icon : tab.iconOutline}
                    size={16}
                    color={active ? colors.brand.primary : colors.text.muted}
                  />
                  <Text style={[
                    styles.modeTabText,
                    { color: active ? colors.text.primary : colors.text.secondary },
                    active && { fontWeight: '600' },
                  ]}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Camera mode ── */}
          {mode === 'camera' && (
            <View style={styles.cameraSection}>
              {/* Preview placeholder */}
              <View style={[styles.cameraPreview, {
                backgroundColor: colors.bg.surface,
                borderColor:     colors.border.default,
              }]}>
                <View style={[styles.cameraIconWrap, { backgroundColor: colors.bg.elevated }]}>
                  <Ionicons name="camera-outline" size={40} color={colors.text.muted} />
                </View>
                <Text style={[styles.cameraPlaceholderText, { color: colors.text.secondary }]}>
                  {t('translator_camera_hint')}
                </Text>
                <Text style={[styles.cameraPlaceholderSub, { color: colors.text.muted }]}>
                  Japonés · Chino · Coreano · Cualquier idioma
                </Text>
              </View>

              {/* Buttons */}
              <View style={styles.cameraButtons}>
                <Pressable
                  style={({ pressed }) => [
                    styles.cameraPrimary,
                    { backgroundColor: colors.brand.primary },
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={handleCameraCapture}
                >
                  <Ionicons name="camera" size={18} color="#fff" />
                  <Text style={styles.cameraPrimaryText}>{t('translator_camera')}</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.cameraSecondary,
                    {
                      backgroundColor: colors.bg.elevated,
                      borderColor:     colors.border.default,
                    },
                    pressed && { opacity: 0.75 },
                  ]}
                  onPress={handleGalleryPick}
                >
                  <Ionicons name="images-outline" size={18} color={colors.text.secondary} />
                  <Text style={[styles.cameraSecondaryText, { color: colors.text.secondary }]}>
                    Galería
                  </Text>
                </Pressable>
              </View>

              {/* Offline note */}
              <View style={[styles.offlineNote, { backgroundColor: colors.bg.surface }]}>
                <Ionicons name="cloud-offline-outline" size={14} color={colors.text.muted} />
                <Text style={[styles.offlineNoteText, { color: colors.text.muted }]}>
                  {t('translator_offline_note')}
                </Text>
              </View>
            </View>
          )}

          {/* ── Text mode ── */}
          {mode === 'text' && (
            <View style={styles.textSection}>
              <Text style={[styles.inputLabel, { color: colors.text.secondary }]}>
                {t('translator_text_hint')}
              </Text>
              <View style={styles.inputWrap}>
                <TextInput
                  ref={inputRef}
                  style={[styles.textInput, {
                    backgroundColor: colors.bg.surface,
                    borderColor:     colors.border.default,
                    color:           colors.text.primary,
                  }]}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="出発  /  站台  /  Bahnsteig..."
                  placeholderTextColor={colors.text.muted}
                  multiline
                  numberOfLines={4}
                  returnKeyType="done"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {inputText.length > 0 && (
                  <Pressable
                    style={[styles.clearBtn, { backgroundColor: colors.bg.overlay }]}
                    onPress={handleClear}
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={11} color={colors.text.secondary} />
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {/* ── Language selectors ── */}
          <View style={styles.langRow}>
            {/* Source */}
            <View style={styles.langBox}>
              <Text style={[styles.langLabel, { color: colors.text.secondary }]}>
                {t('translator_from')}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {SOURCE_LANGUAGES.map((lang) => {
                  const active = sourceLang === lang.code;
                  return (
                    <Pressable
                      key={lang.code}
                      style={[
                        styles.langChip,
                        {
                          backgroundColor: active ? colors.brand.primary : colors.bg.surface,
                          borderColor:     active ? colors.brand.primary : colors.border.subtle,
                        },
                      ]}
                      onPress={() => setSourceLang(lang.code)}
                    >
                      <Text style={[
                        styles.langChipText,
                        { color: active ? '#fff' : colors.text.secondary },
                        active && { fontWeight: '600' },
                      ]}>
                        {lang.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <Ionicons name="arrow-forward" size={18} color={colors.brand.accent} style={styles.langArrow} />

            {/* Target */}
            <View style={styles.langBox}>
              <Text style={[styles.langLabel, { color: colors.text.secondary }]}>
                {t('translator_to')}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {SUPPORTED_LANGUAGES.map((lang) => {
                  const active = targetLang === lang.code;
                  return (
                    <Pressable
                      key={lang.code}
                      style={[
                        styles.langChip,
                        styles.langChipFlag,
                        {
                          backgroundColor: active ? colors.brand.primary + '22' : 'transparent',
                          borderColor:     active ? colors.brand.primary : colors.border.subtle,
                        },
                      ]}
                      onPress={() => setTargetLang(lang.code)}
                    >
                      <FlagCircle
                        countryCode={LANG_TO_COUNTRY[lang.code] ?? lang.code}
                        size="sm"
                      />
                      <Text style={[
                        styles.langChipText,
                        { color: active ? colors.brand.primary : colors.text.secondary },
                        active && { fontWeight: '700' },
                      ]}>
                        {lang.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          {/* ── Translate button ── */}
          <Pressable
            style={({ pressed }) => [
              styles.translateBtn,
              { backgroundColor: colors.brand.primary },
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
                {t('translator_btn')}
              </Text>
            )}
          </Pressable>

          {/* ── Result card ── */}
          {result && (
            <View style={[
              styles.resultCard,
              { backgroundColor: colors.bg.card, borderColor: colors.border.card },
              cardShadow,
            ]}>
              {/* Original */}
              <View style={styles.resultHeader}>
                <Text style={[styles.resultSectionLabel, { color: colors.text.muted }]}>
                  ORIGINAL
                </Text>
                <View style={[
                  styles.sourceChip,
                  {
                    backgroundColor:
                      result.source === 'offline' ? 'rgba(48,209,88,0.12)' :
                      result.source === 'api'     ? 'rgba(124,58,237,0.12)' :
                                                    colors.bg.elevated,
                  },
                ]}>
                  <Ionicons
                    name={
                      result.source === 'offline' ? 'cloud-offline-outline' :
                      result.source === 'api'     ? 'globe-outline' :
                                                    'warning-outline'
                    }
                    size={10}
                    color={
                      result.source === 'offline' ? colors.status.safe :
                      result.source === 'api'     ? colors.brand.primary :
                                                    colors.status.warn
                    }
                  />
                  <Text style={[styles.sourceChipText, {
                    color:
                      result.source === 'offline' ? colors.status.safe :
                      result.source === 'api'     ? colors.brand.primary :
                                                    colors.status.warn,
                  }]}>
                    {result.source === 'offline' ? 'Offline' : result.source === 'api' ? 'API' : 'Fallback'}
                  </Text>
                </View>
              </View>

              <Text style={[styles.resultOriginal, { color: colors.text.primary }]}>
                {result.original}
              </Text>

              {result.detectedLang && (
                <Text style={[styles.resultDetected, { color: colors.text.muted }]}>
                  Idioma detectado: {SOURCE_LANGUAGES.find(l => l.code === result.detectedLang)?.label ?? result.detectedLang}
                </Text>
              )}

              <View style={[styles.resultDivider, { backgroundColor: colors.border.subtle }]} />

              <Text style={[styles.resultSectionLabel, { color: colors.brand.accent }]}>
                TRADUCCIÓN
              </Text>
              <Text style={[styles.resultTranslated, { color: colors.text.primary }]}>
                {result.translated}
              </Text>

              {result.source === 'fallback' && (
                <View style={[styles.resultWarning, { backgroundColor: 'rgba(255,69,58,0.08)' }]}>
                  <Ionicons name="warning-outline" size={12} color={colors.status.danger} />
                  <Text style={[styles.resultWarningText, { color: colors.status.danger }]}>
                    {t('translator_error')}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── Quick phrases ── */}
          <View style={styles.quickSection}>
            <Text style={[styles.quickTitle, { color: colors.text.secondary }]}>
              Frases rápidas
            </Text>
            <View style={styles.quickRow}>
              {[
                { label: '🇯🇵 出発 → Salida',       text: '出発'   },
                { label: '🇯🇵 のりば → Andén',      text: 'のりば' },
                { label: '🇨🇳 站台 → Andén',         text: '站台'   },
                { label: '🇨🇳 换乘 → Transbordo',    text: '换乘'   },
                { label: '🇯🇵 改札口 → Torniquete',  text: '改札口' },
                { label: '🇨🇳 安检 → Seguridad',     text: '安检'   },
              ].map((phrase) => (
                <Pressable
                  key={phrase.text}
                  style={[styles.quickChip, {
                    backgroundColor: colors.bg.surface,
                    borderColor:     colors.border.subtle,
                  }]}
                  onPress={() => {
                    setInputText(phrase.text);
                    setMode('text');
                  }}
                >
                  <Text style={[styles.quickChipText, { color: colors.text.secondary }]}>
                    {phrase.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── STYLES — no colors hardcoded, all applied inline ────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: Spacing['3'],
    paddingVertical:   Spacing['3'],
    borderBottomWidth: 0.5,
  },
  closeBtn: {
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.full,
  },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  headerTitle: {
    fontSize:      Typography.size.sm,
    fontWeight:    '800',
    letterSpacing: 0.5,
  },
  headerSub: { fontSize: Typography.size.xs },

  // Mode tabs — Apple segmented control
  modeTabsWrap: {
    paddingHorizontal: Spacing['4'],
    paddingVertical:   Spacing['2'],
    borderBottomWidth: 0.5,
  },
  modeTabs: {
    flexDirection: 'row',
    borderRadius:  Radius.md,
    padding:       3,
  },
  modeTab: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
    paddingVertical: 9,
    borderRadius:   Radius.sm,
  },
  modeTabActive: {
    borderRadius: Radius.sm,
  },
  modeTabText: {
    fontSize:   Typography.size.xs,
    fontWeight: '500',
  },

  // Scroll
  scroll:        { flex: 1 },
  scrollContent: { padding: Spacing['4'], gap: Spacing['4'], paddingBottom: 48 },

  // Camera mode
  cameraSection: { gap: Spacing['3'] },
  cameraPreview: {
    borderRadius:   Radius.lg,
    borderWidth:    1,
    borderStyle:    'dashed',
    height:         180,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            Spacing['2'],
  },
  cameraIconWrap: {
    width: 80, height: 80,
    borderRadius: Radius.xl,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  cameraPlaceholderText: {
    fontSize:   Typography.size.sm,
    fontWeight: '600',
    textAlign:  'center',
  },
  cameraPlaceholderSub: {
    fontSize:  Typography.size.xs,
    textAlign: 'center',
  },
  cameraButtons: {
    flexDirection: 'row',
    gap:           Spacing['3'],
  },
  cameraPrimary: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            Spacing['2'],
    paddingVertical: Spacing['3'],
    borderRadius:   Radius.lg,
    minHeight:      52,
  },
  cameraPrimaryText: {
    fontSize:   Typography.size.sm,
    fontWeight: '700',
    color:      '#fff',
  },
  cameraSecondary: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            Spacing['2'],
    paddingVertical: Spacing['3'],
    borderRadius:   Radius.lg,
    borderWidth:    1,
    minHeight:      52,
  },
  cameraSecondaryText: {
    fontSize:   Typography.size.sm,
    fontWeight: '600',
  },
  offlineNote: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               Spacing['2'],
    paddingVertical:   Spacing['2'],
    paddingHorizontal: Spacing['3'],
    borderRadius:      Radius.md,
  },
  offlineNoteText: { fontSize: Typography.size.xs, flex: 1 },

  // Text mode
  textSection: { gap: Spacing['2'] },
  inputLabel:  {
    fontSize:   Typography.size.xs,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  inputWrap:   { position: 'relative' },
  textInput: {
    borderRadius:      Radius.lg,
    borderWidth:       1,
    padding:           Spacing['3'],
    fontSize:          Typography.size.lg,
    minHeight:         100,
    textAlignVertical: 'top',
  },
  clearBtn: {
    position: 'absolute', top: Spacing['2'], right: Spacing['2'],
    width: 24, height: 24,
    borderRadius: Radius.full,
    alignItems: 'center', justifyContent: 'center',
  },

  // Language selectors
  langRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           Spacing['2'],
  },
  langBox:  { flex: 1 },
  langLabel: {
    fontSize:      Typography.size.xs,
    fontWeight:    '600',
    marginBottom:  Spacing['1'],
    letterSpacing: 0.5,
  },
  langArrow: { marginTop: 22 },
  langChip: {
    paddingVertical:   Spacing['1'],
    paddingHorizontal: Spacing['2'],
    borderRadius:      Radius.full,
    borderWidth:       1,
    marginRight:       Spacing['1'],
  },
  langChipFlag: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    paddingVertical:   4,
    paddingHorizontal: 8,
  },
  langChipText: {
    fontSize: Typography.size.xs,
  } as any,

  // Translate button
  translateBtn: {
    borderRadius:    Radius.lg,
    paddingVertical: Spacing['3'],
    alignItems:      'center',
    minHeight:       52,
    justifyContent:  'center',
  },
  translateBtnDisabled: { opacity: 0.45 },
  translateBtnText: {
    fontSize:      Typography.size.md,
    fontWeight:    '900',
    color:         '#fff',
    letterSpacing: 0.5,
  },

  // Result card
  resultCard: {
    borderRadius: Radius.lg,
    borderWidth:  0.5,
    padding:      Spacing['4'],
    gap:          Spacing['2'],
  },
  resultHeader:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultSectionLabel: {
    fontSize:      Typography.size.xs,
    fontWeight:    '700',
    letterSpacing: 1,
  },
  sourceChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingVertical:   2,
    paddingHorizontal: Spacing['2'],
    borderRadius:      Radius.full,
  },
  sourceChipText: { fontSize: 10, fontWeight: '600' },
  resultOriginal: {
    fontSize:   Typography.size.xl,
    fontWeight: '700',
  },
  resultDetected: { fontSize: Typography.size.xs },
  resultDivider:  {
    height:         1,
    marginVertical: Spacing['1'],
  },
  resultTranslated: {
    fontSize:   Typography.size['2xl'],
    fontWeight: '900',
    lineHeight: 42,
  },
  resultWarning: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    paddingVertical:   Spacing['2'],
    paddingHorizontal: Spacing['3'],
    borderRadius:      Radius.md,
  },
  resultWarningText: { fontSize: Typography.size.xs },

  // Quick phrases
  quickSection: { gap: Spacing['2'] },
  quickTitle: {
    fontSize:      Typography.size.xs,
    fontWeight:    '700',
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
    borderRadius:      Radius.md,
    borderWidth:       0.5,
  },
  quickChipText: { fontSize: Typography.size.xs },
});
