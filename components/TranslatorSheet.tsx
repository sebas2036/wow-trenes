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
import React, { useState, useRef, useCallback, useEffect } from 'react';
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
  Image,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FlagCircle from './FlagCircle';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

// ── Dimensiones del focus box (relativas al tamaño del preview) ───────────────
const FOCUS_BOX_W_RATIO = 0.84; // 84% del ancho del preview
const FOCUS_BOX_H_RATIO = 0.62; // 62% del alto del preview

import { Typography, Spacing, Radius, Shadows, Gradients } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';

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

  const [mode,         setMode]         = useState<'camera' | 'text'>('text');
  const [inputText,    setInputText]    = useState('');
  const [sourceLang,   setSourceLang]   = useState('auto');
  const [targetLang,   setTargetLang]   = useState<AppLanguage>(getLanguage());
  const [isLoading,    setIsLoading]    = useState(false);
  const autoTranslateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs para capturar siempre el valor más reciente en closures asíncronas
  const targetLangRef = useRef<AppLanguage>(getLanguage());
  const sourceLangRef = useRef<string>('auto');
  const [ocrLoading,   setOcrLoading]   = useState(false);
  const [ocrError,     setOcrError]     = useState<string | null>(null);
  const [result,       setResult]       = useState<TranslationDisplay | null>(null);
  const [capturedText, setCapturedText] = useState<string | null>(null);
  const [capturedUri,  setCapturedUri]  = useState<string | null>(null);

  // ── Cámara en vivo ────────────────────────────────────────────────────────
  const [camPermission,    requestCamPermission] = useCameraPermissions();
  const [cameraReady,      setCameraReady]       = useState(false);
  const [cameraViewSize,   setCameraViewSize]    = useState({ width: 1, height: 1 });
  const cameraRef = useRef<CameraView>(null);

  const scanAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);
  const sourceLangScrollRef = useRef<ScrollView>(null);
  const targetLangScrollRef = useRef<ScrollView>(null);
  const sourceLangWidths = useRef<{ [code: string]: { x: number; width: number } }>({});
  const targetLangWidths = useRef<{ [code: string]: { x: number; width: number } }>({});

  // ── Mantener refs sincronizados con el state ────────────────────────────
  useEffect(() => { targetLangRef.current = targetLang; }, [targetLang]);
  useEffect(() => { sourceLangRef.current = sourceLang; }, [sourceLang]);

  // ── Animación scan loop ──────────────────────────────────────────────────
  useEffect(() => {
    if (!ocrLoading) { scanAnim.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1, duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0, duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [ocrLoading]);

  // ── Auto-scroll: centra el chip de idioma activo ────────────────────────
  React.useEffect(() => {
    const chip = sourceLangWidths.current[sourceLang];
    if (!chip || !sourceLangScrollRef.current) return;
    const t = setTimeout(() => {
      const targetX = chip.x - 80 + chip.width / 2;
      sourceLangScrollRef.current?.scrollTo({ x: Math.max(0, targetX), animated: true });
    }, 120);
    return () => clearTimeout(t);
  }, [sourceLang]);

  React.useEffect(() => {
    const chip = targetLangWidths.current[targetLang];
    if (!chip || !targetLangScrollRef.current) return;
    const t = setTimeout(() => {
      const targetX = chip.x - 80 + chip.width / 2;
      targetLangScrollRef.current?.scrollTo({ x: Math.max(0, targetX), animated: true });
    }, 120);
    return () => clearTimeout(t);
  }, [targetLang]);

  // ── Retraducir cuando cambia idioma destino u origen (con texto presente) ─
  useEffect(() => {
    if (inputText.trim()) scheduleAutoTranslate(inputText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetLang, sourceLang]);

  // ── Detecta el script/idioma de una línea ───────────────────────────────
  // Claves visuales CJK:
  //  • Cada carácter ocupa un bloque cuadrado uniforme (monospace)
  //  • 区/简/国 → chino simplificado (China continental)
  //  • 區/國/繁 → chino tradicional (Taiwan/Hong Kong)
  //  • ぁ-ん/ア-ン → japonés (hiragana/katakana)
  //  • 가-힣 → coreano (hangul)
  const detectLineScript = (line: string): string => {
    // ── ORDEN CRÍTICO: los más específicos primero ──────────────────────────
    // 1. Japonés: hiragana (U+3041-U+309F) o katakana (U+30A0-U+30FF)
    //    DEBE ir antes del CJK genérico porque el japonés mezcla kanji con kana
    if (/[ぁ-ゟ]/.test(line)) return 'ja'; // hiragana: あいうえお...
    if (/[゠-ヿ]/.test(line)) return 'ja'; // katakana: アイウエオ...

    // 2. Coreano: hangul — completamente distinto a CJK
    if (/[가-힣]/.test(line)) return 'ko';

    // 3. Chino simplificado — caracteres exclusivos del estándar mainland
    if (/[区国简产来这时们设头发电话书买车东门见风]/.test(line)) return 'zh-CN';
    // 4. Chino tradicional — caracteres exclusivos de Taiwan/HK
    if (/[區國繁產來這時們設頭發電話書買車東門見風]/.test(line)) return 'zh-TW';
    // 5. CJK genérico (kanji sin kana → probablemente chino)
    if (/[一-鿿㐀-䶿]/.test(line))             return 'zh';

    if (/[؀-ۿ]/.test(line))                    return 'ar';
    if (/[Ѐ-ӿ]/.test(line))                    return 'ru';
    const lower = line.toLowerCase();
    const deScore = (lower.match(/\b(nicht|bitte|auf|der|die|das|und|ist|gleis|bahnhof|abfahrt|ankunft|zug|achtung|vorsicht|verboten|ausgang|eingang|halt|richtung|werde|ich|mit|von|nach|ein|eine|zum|zur|wird|jetzt|unter|geld|schnell|freunde)\b/g) ?? []).length;
    const frScore = (lower.match(/\b(voie|quai|sortie|gare|billet|arrivée|départ|train|attention|défense|bonjour|merci|ici|pour|avec|dans|sur|pas|les|des|une|est|que|pas)\b/g) ?? []).length;
    const itScore = (lower.match(/\b(binario|partenza|arrivo|treno|stazione|uscita|entrata|attenzione|biglietto|orario|con|per|del|della|una|non|che|sono)\b/g) ?? []).length;
    const ptScore = (lower.match(/\b(plataforma|chegada|partida|comboio|estação|saída|bilhete|com|para|não|uma|que|por|como|mais)\b/g) ?? []).length;
    const enScore = (lower.match(/\b(platform|departure|arrival|train|station|exit|entrance|ticket|the|and|for|with|from|this|that|are|you|not)\b/g) ?? []).length;
    const max = Math.max(deScore, frScore, itScore, ptScore, enScore);
    if (max === 0) return 'unknown';
    if (deScore === max) return 'de';
    if (frScore === max) return 'fr';
    if (itScore === max) return 'it';
    if (ptScore === max) return 'pt';
    return 'en';
  };

  // ── Limpia OCR: filtra ruido básico luego queda con idioma dominante ─────
  const cleanOcrText = (raw: string): { text: string; detectedLang: string | null } => {
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // 1. Filtro de ruido técnico y UI (blocklist mínima — solo lo obvio)
    const noNoise = lines.filter(line => {
      if (/https?:\/\//i.test(line))                   return false;
      if (/[\w\d]{20,}/.test(line))                    return false;
      if ((line.match(/[&=:%]/g) ?? []).length >= 2)   return false;
      // Solo filtrar "solo símbolos/dígitos" si NO contiene caracteres no-ASCII
      // \W en JS NO cubre CJK/árabe/cirílico — una línea china pura sería filtrada sin esta guarda
      if (/^[\s\W\d]+$/.test(line) && !/[^\x00-\x7F]/.test(line)) return false;
      if (/\w+\.\w{2,4}[\/\s]/.test(line))             return false;
      if (/^[#@]/.test(line))                          return false;
      if (line.length < 3)                             return false;
      // UI genérica
      if (/\b(glosx|wow train|instagram|facebook|twitter|tiktok|youtube|chrome|safari)\b/i.test(line)) return false;
      if (/\b(coincidencias|acerca de esta imagen|volver a la|visión general|creada por ia)\b/i.test(line)) return false;
      if (/\b(seleccionar texto|select text|copy|paste|cut|copiar|pegar|cortar)\b/i.test(line) && line.split(' ').length <= 3) return false;
      if (/^(todo|all|más|x|ok|cancel)$/i.test(line)) return false;
      if (/\b(buscar con google|search with google|google lens|buscar imagen)\b/i.test(line)) return false; // menú Android
      return true;
    });

    if (noNoise.length === 0) return { text: '', detectedLang: null };

    // 2. Detectar idioma de cada línea sustancial (>= 4 chars)
    const scored = noNoise.map(line => ({
      line,
      lang: detectLineScript(line),
      weight: line.length, // líneas más largas = más representativas del cartel
    }));

    // 3. Contar peso por idioma
    const langWeight: Record<string, number> = {};
    for (const { lang, weight } of scored) {
      langWeight[lang] = (langWeight[lang] ?? 0) + weight;
    }

    // 4. Idioma dominante (excluir 'unknown' y el idioma del usuario 'es'/'en' si hay otro)
    const candidates = Object.entries(langWeight)
      .filter(([lang]) => lang !== 'unknown')
      .sort((a, b) => b[1] - a[1]);

    // Si hay un idioma claramente distinto al español/inglés con más peso → es el cartel
    // Prioridad: CJK > europeo no-latino > de/fr/it/pt > en > es
    const preferred = candidates.find(([lang]) => !['es', 'en', 'unknown'].includes(lang))
                   ?? candidates.find(([lang]) => lang === 'en')
                   ?? candidates[0];
    const dominantLang = preferred?.[0] ?? 'unknown';

    // Normalizar variantes chinas para el filtro de líneas
    // zh-CN y zh-TW son variantes de zh — las tratamos como familia
    const isZhFamily = (l: string) => l === 'zh' || l === 'zh-CN' || l === 'zh-TW';
    const dominantIsZh = isZhFamily(dominantLang);

    // 5. Quedarse SOLO con líneas en el idioma dominante — sin 'unknown', sin mezcla
    const final = dominantLang === 'unknown'
      ? scored.filter(s => s.lang === 'unknown').map(s => s.line)
      : dominantIsZh
        ? scored.filter(s => isZhFamily(s.lang)).map(s => s.line) // zh-CN + zh-TW + zh juntos
        : scored.filter(s => s.lang === dominantLang).map(s => s.line);

    // Si no quedó nada con el filtro estricto, volver al modo permisivo
    const fallbackFinal = final.length > 0
      ? final
      : scored.map(s => s.line);

    return {
      text:         fallbackFinal.slice(0, 6).join(' ').trim().slice(0, 300),
      detectedLang: dominantLang === 'unknown' ? null : dominantLang,
    };
  };

  // ── Preprocesa imagen: resize + sharpen para OCR más preciso ────────────
  const preprocessImage = useCallback(async (uri: string): Promise<string | null> => {
    try {
      // 1. Redimensionar a 1100px de ancho máximo — óptimo para OCR.space (< 1MB base64)
      const step1 = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1100 } }],
        { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG, base64: false }
      );

      // 2. Segunda pasada con mayor contraste simulado via re-compresión nítida
      //    (expo-image-manipulator no soporta filtros de color, pero el re-encode
      //    puede ayudar con artifacts de compresión previos)
      const step2 = await ImageManipulator.manipulateAsync(
        step1.uri,
        [],
        { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      return step2.base64 ?? null;
    } catch {
      return null; // fallback: usar base64 original sin procesar
    }
  }, []);

  // ── OCR: extrae texto de imagen base64 via OCR.space ────────────────────
  const runOcr = useCallback(async (base64: string) => {
    setOcrLoading(true);
    setOcrError(null);
    setResult(null);
    setInputText('');
    setMode('camera'); // quedarse en cámara para mostrar scanner en el marco

    try {
      // Intentar detectar si la imagen tiene CJK haciendo un primer intento con engine 2
      // Si falla, reintentar con engine 1 + language específico
      const formData = new FormData();
      formData.append('base64Image', `data:image/jpeg;base64,${base64}`);
      formData.append('language',   'auto');
      formData.append('isOverlayRequired', 'false');
      formData.append('detectOrientation', 'true');
      formData.append('scale',      'true');
      formData.append('OCREngine',  '2');

      const res = await fetch('https://api.ocr.space/parse/image', {
        method:  'POST',
        headers: { apikey: 'helloworld' },   // clave pública gratuita
        body:    formData,
      });

      let json = await res.json();
      let parsed = json?.ParsedResults?.[0];
      let rawText: string = parsed?.ParsedText ?? '';

      // Reintentar con engine CJK si:
      // - No hay caracteres asiáticos en el resultado
      // - Y el usuario eligió un idioma CJK, O el texto parece ser solo ruido/UI
      const hasCjkInResult = /[一-鿿ぁ-ゟゞ-ヿ가-힣]/.test(rawText);
      const wantsCjk = ['zh', 'ja', 'ko'].includes(sourceLang);

      // Detectar si el texto ya obtenido tiene indicadores de simplificado/tradicional/japonés
      // para elegir el engine correcto en el retry
      const hasHiraganaKatakana = /[ぁ-ゟ゠-ヿ]/.test(rawText);
      const hasTraditional      = /[區國繁產來這時們設頭發電話書買車東門見風]/.test(rawText);
      const preferredChinese    = hasHiraganaKatakana ? 'jpn'
                                : hasTraditional      ? 'cht'
                                : 'chs';

      // Detecta ruido de UI de Android/iOS en cualquier parte del texto
      // (no solo al inicio — el menú contextual puede estar mezclado con el OCR del cartel)
      const uiNoisePatterns = [
        /buscar con google/i,
        /search with google/i,
        /google lens/i,
        /seleccionar todo/i,
        /select all/i,
        /copiar imagen/i,
        /copy image/i,
        /coincidencias exactas/i,
        /acerca de esta imagen/i,
        /visión general/i,
      ];
      const hasUiNoise = uiNoisePatterns.some(p => p.test(rawText));

      // Si el texto resultante es muy corto o está en latín básico sin caracteres
      // especiales, y el usuario quiere CJK, es probable que el engine 2 haya fallado
      const looksLikeLatinOnly = rawText.trim().length < 15 && !/[^\x00-\x7F]/.test(rawText);

      const seemsLikeNoise = !rawText.trim() || hasUiNoise || looksLikeLatinOnly;

      if (!hasCjkInResult && (wantsCjk || seemsLikeNoise)) {
        const fd2 = new FormData();
        fd2.append('base64Image', `data:image/jpeg;base64,${base64}`);
        fd2.append('language',   sourceLang === 'ja' ? 'jpn' : sourceLang === 'ko' ? 'kor' : preferredChinese);
        fd2.append('isOverlayRequired', 'false');
        fd2.append('detectOrientation', 'true');
        fd2.append('scale',      'true');
        fd2.append('OCREngine',  '1'); // Engine 1 soporta más idiomas CJK
        const res2 = await fetch('https://api.ocr.space/parse/image', {
          method: 'POST', headers: { apikey: 'helloworld' }, body: fd2,
        });
        const json2 = await res2.json();
        const parsed2 = json2?.ParsedResults?.[0];
        const text2 = parsed2?.ParsedText ?? '';
        const hasCjkRetry = /[一-鿿ぁ-ゟゞ-ヿ가-힣]/.test(text2);

        if (text2.trim()) {
          rawText = text2;
        }

        // Si el primer retry fue 'chs' y aún no encontró CJK, probar 'cht' (chino tradicional)
        // Útil para carteles de Hong Kong / Taiwan / macau
        if (!hasCjkRetry && fd2.get('language') === 'chs' && !wantsCjk) {
          const fd3 = new FormData();
          fd3.append('base64Image', `data:image/jpeg;base64,${base64}`);
          fd3.append('language',   'cht');
          fd3.append('isOverlayRequired', 'false');
          fd3.append('detectOrientation', 'true');
          fd3.append('scale',      'true');
          fd3.append('OCREngine',  '1');
          const res3 = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST', headers: { apikey: 'helloworld' }, body: fd3,
          });
          const json3 = await res3.json();
          const text3 = json3?.ParsedResults?.[0]?.ParsedText ?? '';
          if (/[一-鿿]/.test(text3)) {
            rawText = text3; // chino tradicional encontró caracteres válidos
          }
        }
      }

      if (!rawText.trim()) {
        setOcrError('No se detectó texto. Intentá con mejor iluminación.');
        setMode('camera');
        return;
      }

      const { text, detectedLang: ocrDetectedLang } = cleanOcrText(rawText);

      if (!text) {
        setOcrError('No se pudo extraer texto legible. Intentá enfocar solo el cartel.');
        return;
      }

      setCapturedText(text);
      setInputText(text);
      setMode('text');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Usar el idioma detectado por OCR — mucho más preciso que el auto-detect de API
      // Si el usuario eligió un idioma específico, respetarlo; si es 'auto', usar el detectado
      const effectiveLang = (sourceLang !== 'auto' ? sourceLang : null)
                         ?? ocrDetectedLang
                         ?? 'auto';

      // Auto-traducir inmediatamente
      setIsLoading(true);
      try {
        const tr = await translate(text, targetLang, effectiveLang);
        setResult({
          original:     tr.originalText,
          translated:   tr.translatedText,
          detectedLang: tr.detectedLang,
          source:       tr.source,
        });
      } catch {
        // silencioso — el texto quedó en el input, el usuario puede reintentar
      } finally {
        setIsLoading(false);
      }

    } catch {
      setOcrError('Error de conexión. Verificá internet e intentá de nuevo.');
    } finally {
      setOcrLoading(false);
    }
  }, [targetLang, sourceLang]);

  // ── Disparo desde CameraView en vivo + crop al focus box ────────────────
  const handleCameraShoot = useCallback(async () => {
    if (!cameraRef.current || !cameraReady) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      // Mostrar scanner INMEDIATAMENTE — sin flash de cámara libre
      setOcrLoading(true);
      setOcrError(null);

      const photo = await cameraRef.current.takePictureAsync({
        quality:          0.92,
        base64:           false,
        skipProcessing:   false,
        exif:             false,
      });
      if (!photo) { setOcrLoading(false); return; }
      setCapturedUri(photo.uri);

      // ── Calcular crop al recuadro de enfoque ──────────────────────────────
      const viewW = cameraViewSize.width;
      const viewH = cameraViewSize.height;
      const boxW  = viewW * FOCUS_BOX_W_RATIO;
      const boxH  = viewH * FOCUS_BOX_H_RATIO;
      const boxX  = (viewW - boxW) / 2;
      const boxY  = (viewH - boxH) / 2;

      // Escalar coordenadas de pantalla → píxeles reales de la foto
      const scaleX = (photo.width  ?? viewW) / viewW;
      const scaleY = (photo.height ?? viewH) / viewH;

      const cropped = await ImageManipulator.manipulateAsync(
        photo.uri,
        [
          {
            crop: {
              originX: Math.max(0, Math.floor(boxX * scaleX)),
              originY: Math.max(0, Math.floor(boxY * scaleY)),
              width:   Math.floor(boxW * scaleX),
              height:  Math.floor(boxH * scaleY),
            },
          },
          { resize: { width: 1100 } }, // optimizar para OCR.space
        ],
        { compress: 0.93, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      await runOcr(cropped.base64 ?? '');
    } catch {
      setOcrError('Error al capturar. Intentá de nuevo.');
    }
  }, [cameraReady, cameraViewSize, runOcr]);

  // ── Fallback: abre cámara del sistema (si CameraView falla) ─────────────
  const handleCameraCapture = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { setMode('text'); return; }

    const picked = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality:       0.85,
      base64:        false,
    });

    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    setCapturedUri(asset.uri);
    const processedBase64 = await preprocessImage(asset.uri);
    await runOcr(processedBase64 ?? '');
  }, [runOcr, preprocessImage]);

  // ── Seleccionar de galería ───────────────────────────────────────────────
  const handleGalleryPick = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality:    0.85,
      base64:     false, // no necesitamos el base64 original, preprocessImage lo genera
    });

    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    setCapturedUri(asset.uri);

    // Preprocesar imagen antes de OCR
    const processedBase64 = await preprocessImage(asset.uri);
    if (!processedBase64) {
      setOcrError('No se pudo procesar la imagen. Intentá con otra foto.');
      return;
    }
    await runOcr(processedBase64);
  }, [runOcr, preprocessImage]);

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

  // ── Auto-traducir 800ms después de dejar de escribir ────────────────────
  // IMPORTANTE: usa refs para targetLang/sourceLang así el timer siempre
  // lee el valor actual aunque haya cambiado después de schedulear.
  const scheduleAutoTranslate = useCallback((text: string) => {
    if (autoTranslateTimer.current) clearTimeout(autoTranslateTimer.current);
    if (!text.trim()) { setResult(null); return; }
    autoTranslateTimer.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const tLang = targetLangRef.current;
        const sLang = sourceLangRef.current;
        const res = await translate(text.trim(), tLang, sLang);
        setResult({
          original:     res.originalText,
          translated:   res.translatedText,
          detectedLang: res.detectedLang,
          source:       res.source,
        });
        setOcrError(null);
      } catch (e: any) {
        setResult(null);
        setOcrError(e?.message ?? 'No se pudo traducir. Verificá tu conexión.');
      }
      finally { setIsLoading(false); }
    }, 800);
  }, []); // sin deps — los valores siempre vienen de los refs

  // ── Swap de idiomas ──────────────────────────────────────────────────────
  const handleSwap = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Solo swap si ambos son idiomas concretos (no auto)
    if (sourceLang === 'auto') return;
    const prevSource = sourceLang;
    const prevTarget = targetLang;
    // targetLang es AppLanguage, sourceLang puede ser cualquier string
    setSourceLang(prevTarget);
    setTargetLang(prevSource as AppLanguage);
    // Poner el texto traducido como nuevo input
    if (result?.translated) {
      setInputText(result.translated);
      setResult(null);
    }
  }, [sourceLang, targetLang, result]);

  const handleClear = useCallback(() => {
    if (autoTranslateTimer.current) clearTimeout(autoTranslateTimer.current);
    setInputText('');
    setResult(null);
    setCapturedText(null);
    setCapturedUri(null);
    setOcrError(null);
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
      <LinearGradient colors={[...Gradients.screenBg]} style={styles.rootGradient}>
      <SafeAreaView style={styles.root}>

        {/* ── Header ── */}
        <View style={[styles.header, {
          backgroundColor:   'rgba(255,255,255,0.06)',
          borderBottomColor: 'rgba(255,255,255,0.10)',
        }]}>
          <Pressable
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel={t('close')}
            hitSlop={8}
          >
            <Ionicons name="close" size={16} color="rgba(226,232,240,0.70)" />
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
        <View style={[styles.modeTabsWrap, { backgroundColor: 'transparent', borderBottomColor: 'rgba(255,255,255,0.08)' }]}>
          <View style={[styles.modeTabs, { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }]}>
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
                    active && [styles.modeTabActive, { backgroundColor: 'rgba(139,92,246,0.30)' }, Shadows.segment],
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

        {/* ── Camera mode — layout fijo, NO dentro del ScrollView ── */}
        {mode === 'camera' && (
          <View style={styles.cameraFullLayout}>

            {/* Visor — ocupa todo el espacio disponible */}
            <View
              style={styles.cameraLiveWrap}
              onLayout={e => setCameraViewSize({
                width:  e.nativeEvent.layout.width,
                height: e.nativeEvent.layout.height,
              })}
            >
              {!camPermission?.granted ? (
                <View style={styles.camPermWrap}>
                  <Ionicons name="camera-outline" size={36} color="rgba(167,139,250,0.6)" />
                  <Text style={styles.camPermText}>
                    {camPermission?.canAskAgain !== false
                      ? 'Necesitamos permiso de cámara'
                      : 'Habilitá la cámara en Ajustes'}
                  </Text>
                  <Pressable style={styles.camPermBtn} onPress={requestCamPermission}>
                    <Text style={styles.camPermBtnText}>Conceder permiso</Text>
                  </Pressable>
                </View>
              ) : ocrLoading ? (
                <>
                  {capturedUri && (
                    <Image
                      source={{ uri: capturedUri }}
                      style={[StyleSheet.absoluteFillObject, { opacity: 0.60 }]}
                      resizeMode="cover"
                    />
                  )}
                  <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(10,8,30,0.40)' }]} pointerEvents="none" />
                  <View style={styles.focusBoxScanning} pointerEvents="none">
                    <View style={[styles.corner, styles.cornerTL]} />
                    <View style={[styles.corner, styles.cornerTR]} />
                    <View style={[styles.corner, styles.cornerBL]} />
                    <View style={[styles.corner, styles.cornerBR]} />
                    <Animated.View
                      style={[styles.scanLine, {
                        transform: [{ translateY: scanAnim.interpolate({
                          inputRange:  [0, 1],
                          // 55% del alto del visor = alto real del focusBoxScanning
                          outputRange: [0, Math.max(160, cameraViewSize.height * 0.55 - 6)],
                        }) }],
                      }]}
                    >
                      <View style={styles.scanLineGlow} />
                    </Animated.View>
                  </View>
                  <View style={styles.scanLabel}>
                    <ActivityIndicator size="small" color="#A78BFA" style={{ marginRight: 8 }} />
                    <Text style={styles.scanLabelText}>Leyendo texto…</Text>
                  </View>
                </>
              ) : (
                <>
                  <CameraView
                    ref={cameraRef}
                    style={StyleSheet.absoluteFillObject}
                    facing="back"
                    onCameraReady={() => setCameraReady(true)}
                  />
                  <View style={styles.overlayTop} pointerEvents="none" />
                  <View style={styles.overlayMiddleRow} pointerEvents="none">
                    <View style={styles.overlaySide} />
                    <View style={styles.focusBox} pointerEvents="none">
                      <View style={[styles.corner, styles.cornerTL]} />
                      <View style={[styles.corner, styles.cornerTR]} />
                      <View style={[styles.corner, styles.cornerBL]} />
                      <View style={[styles.corner, styles.cornerBR]} />
                      <Text style={styles.focusHint}>CENTRAR TEXTO</Text>
                    </View>
                    <View style={styles.overlaySide} />
                  </View>
                  <View style={styles.overlayBottom} pointerEvents="none" />
                  {ocrError && (
                    <View style={styles.errorOverlay} pointerEvents="none">
                      <Ionicons name="alert-circle" size={18} color="#FF453A" />
                      <Text style={styles.errorOverlayText}>{ocrError}</Text>
                    </View>
                  )}
                </>
              )}
            </View>

            {/* Controles — SIEMPRE visibles, pegados al fondo */}
            <View style={[styles.cameraControls, { backgroundColor: 'rgba(10,8,30,0.85)' }]}>
              <Pressable
                style={({ pressed }) => [styles.ctrlSecondary, pressed && { opacity: 0.7 }]}
                onPress={handleGalleryPick}
              >
                <Ionicons name="images-outline" size={22} color={colors.text.secondary} />
                <Text style={[styles.ctrlSecondaryText, { color: colors.text.secondary }]}>Galería</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.shootBtn,
                  (!cameraReady || ocrLoading) && styles.shootBtnDisabled,
                  pressed && { transform: [{ scale: 0.93 }] },
                ]}
                onPress={handleCameraShoot}
                disabled={!cameraReady || ocrLoading || !camPermission?.granted}
              >
                {ocrLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="scan" size={26} color="#fff" />
                }
              </Pressable>

              <View style={styles.ctrlSecondary} />
            </View>

          </View>
        )}

        {/* ScrollView SOLO en modo texto — en cámara está oculto */}
        <ScrollView
          style={[styles.scroll, mode === 'camera' && { display: 'none' }]}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >

          {/* ══ MODO TEXTO — dos paneles estilo Google Translate ══ */}

          {/* ── Panel ORIGEN ── */}
          <View style={[styles.gtPanel, { borderColor: 'rgba(255,255,255,0.13)' }]}>
            {/* Etiqueta */}
            <View style={styles.gtPanelLabel}>
              <Ionicons name="pencil-outline" size={11} color="rgba(148,163,184,0.5)" />
              <Text style={styles.gtPanelLabelText}>DESDE</Text>
            </View>
            {/* Header del panel: selector de idioma */}
            <ScrollView
              ref={sourceLangScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.gtLangBar}
            >
              {SOURCE_LANGUAGES.map((lang) => {
                const active = sourceLang === lang.code;
                return (
                  <Pressable
                    key={lang.code}
                    onLayout={e => {
                      sourceLangWidths.current[lang.code] = {
                        x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width,
                      };
                    }}
                    style={[styles.gtLangChip, active && styles.gtLangChipActive]}
                    onPress={() => setSourceLang(lang.code)}
                  >
                    {lang.code === 'auto'
                      ? <Ionicons name="globe-outline" size={16} color={active ? '#C4B5FD' : colors.text.muted} />
                      : <FlagCircle countryCode={LANG_TO_COUNTRY[lang.code] ?? lang.code} size="sm" />
                    }
                    <Text style={[styles.gtLangChipText, { color: active ? '#C4B5FD' : colors.text.muted }, active && { fontWeight: '700' }]}>
                      {lang.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Input */}
            <View style={styles.gtInputWrap}>
              <TextInput
                ref={inputRef}
                style={[styles.gtInput, { color: '#fff' }]}
                value={inputText}
                onChangeText={text => {
                  setInputText(text);
                  scheduleAutoTranslate(text);
                }}
                placeholder={"Your train.\nYour world."}
                placeholderTextColor="rgba(148,163,184,0.45)"
                multiline
                autoCorrect={false}
                autoCapitalize="none"
              />
              {inputText.length > 0 && (
                <Pressable style={styles.gtClearBtn} onPress={handleClear} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color="rgba(148,163,184,0.5)" />
                </Pressable>
              )}
            </View>
          </View>

          {/* ── Barra central: swap + idioma detectado ── */}
          <View style={styles.gtMiddleBar}>
            <View style={styles.gtDetectedWrap}>
              {result?.detectedLang && (
                <Text style={[styles.gtDetectedText, { color: colors.text.muted }]}>
                  {SOURCE_LANGUAGES.find(l => l.code === result.detectedLang)?.label ?? result.detectedLang}
                </Text>
              )}
            </View>
            <Pressable
              style={[styles.gtSwapBtn, sourceLang === 'auto' && { opacity: 0.35 }]}
              onPress={handleSwap}
              disabled={sourceLang === 'auto'}
            >
              <Ionicons name="swap-vertical" size={18} color="#A78BFA" />
            </Pressable>
            <View style={styles.gtDetectedWrap} />
          </View>

          {/* ── Panel DESTINO ── */}
          <View style={[styles.gtPanel, styles.gtPanelResult, { borderColor: 'rgba(139,92,246,0.30)', backgroundColor: 'rgba(139,92,246,0.08)' }]}>
            {/* Etiqueta */}
            <View style={styles.gtPanelLabel}>
              <Ionicons name="language-outline" size={11} color="rgba(167,139,250,0.6)" />
              <Text style={[styles.gtPanelLabelText, { color: 'rgba(167,139,250,0.6)' }]}>HACIA</Text>
            </View>
            {/* Header: selector idioma destino */}
            <ScrollView
              ref={targetLangScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.gtLangBar}
            >
              {SUPPORTED_LANGUAGES.map((lang) => {
                const active = targetLang === lang.code;
                return (
                  <Pressable
                    key={lang.code}
                    onLayout={e => {
                      targetLangWidths.current[lang.code] = {
                        x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width,
                      };
                    }}
                    style={[styles.gtLangChip, active && styles.gtLangChipActive]}
                    onPress={() => {
                      setTargetLang(lang.code);
                      if (inputText.trim()) scheduleAutoTranslate(inputText);
                    }}
                  >
                    <FlagCircle countryCode={LANG_TO_COUNTRY[lang.code] ?? lang.code} size="sm" />
                    <Text style={[styles.gtLangChipText, { color: active ? '#C4B5FD' : colors.text.muted }, active && { fontWeight: '700' }]}>
                      {lang.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Resultado */}
            <View style={styles.gtResultWrap}>
              {isLoading ? (
                <ActivityIndicator size="small" color="#A78BFA" style={{ marginTop: 12 }} />
              ) : result ? (
                <Text style={[styles.gtResultText, { color: '#fff' }]}>
                  {result.translated}
                </Text>
              ) : (
                <Text style={[styles.gtResultPlaceholder, { color: 'rgba(148,163,184,0.35)' }]}>
                  Traducción
                </Text>
              )}
            </View>

            {/* Footer: copiar + cámara */}
            {result && (
              <View style={styles.gtResultFooter}>
                <Pressable
                  style={styles.gtActionBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (result?.translated) Clipboard.setStringAsync(result.translated);
                  }}
                >
                  <Ionicons name="copy-outline" size={16} color={colors.text.muted} />
                  <Text style={[styles.gtActionText, { color: colors.text.muted }]}>Copiar</Text>
                </Pressable>
                <Pressable
                  style={styles.gtActionBtn}
                  onPress={() => { handleClear(); setMode('camera'); }}
                >
                  <Ionicons name="camera-outline" size={16} color={colors.text.muted} />
                  <Text style={[styles.gtActionText, { color: colors.text.muted }]}>Nueva foto</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* OCR error */}
          {ocrError && !ocrLoading && (
            <View style={styles.ocrErrorCard}>
              <Ionicons name="alert-circle-outline" size={16} color="#FF453A" />
              <Text style={styles.ocrErrorText}>{ocrError}</Text>
            </View>
          )}

        </ScrollView>
      </SafeAreaView>
      </LinearGradient>
    </Modal>
  );
}

// ─── STYLES — no colors hardcoded, all applied inline ────────────────────────
const styles = StyleSheet.create({
  rootGradient: { flex: 1, backgroundColor: '#0E0E2E' },
  root: { flex: 1, backgroundColor: 'transparent' },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: Spacing['3'],
    paddingVertical:   Spacing['3'],
    borderBottomWidth: 0.5,
  },
  closeBtn: {
    width: 38, height: 38,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
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

  // Camera mode — layout fijo fuera del ScrollView
  cameraSection: { gap: Spacing['3'] },
  cameraFullLayout: {
    flex:          1,
    flexDirection: 'column',
    overflow:      'hidden',
  },

  // Contenedor del visor en vivo — flex:1 para llenar espacio disponible
  cameraLiveWrap: {
    flex:         1,      // se expande tanto como pueda
    width:        '100%',
    minHeight:    200,
    borderRadius: Radius.xl,
    overflow:     'hidden',
    backgroundColor: '#0a0820',
    borderWidth:  1,
    borderColor:  'rgba(167,139,250,0.35)',
  },

  // Permiso de cámara
  camPermWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20,
  },
  camPermText: {
    fontSize: Typography.size.sm, color: 'rgba(226,232,240,0.65)',
    textAlign: 'center', fontWeight: '500',
  },
  camPermBtn: {
    backgroundColor: 'rgba(139,92,246,0.30)',
    borderWidth: 1, borderColor: '#8B5CF6',
    borderRadius: Radius.full,
    paddingVertical: 9, paddingHorizontal: 20,
  },
  camPermBtnText: {
    color: '#C4B5FD', fontSize: Typography.size.sm, fontWeight: '700',
  },

  // Overlay de máscara (4 piezas que rodean el focus box)
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  overlayMiddleRow: {
    flexDirection: 'row',
    flex: 3,             // proporcional — no hardcodeado
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  overlayBottom: {
    flex: 0.8,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },

  // Focus box transparente
  focusBox: {
    width:           '84%',      // FOCUS_BOX_W_RATIO
    height:          '100%',
    backgroundColor: 'transparent',
    alignItems:      'center',
    justifyContent:  'center',
  },
  focusBoxScanning: {
    position:    'absolute',
    width:       '84%',
    height:      '55%',   // proporcional al visor dinámico
    top:         '10%',
    alignSelf:   'center',
    overflow:    'hidden',
    borderRadius: 4,
  },
  focusHint: {
    position:   'absolute',
    top:        -22,
    color:      'rgba(255,255,255,0.70)',
    fontSize:   10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },

  // Esquinas neon del focus box
  corner: {
    position:    'absolute',
    width:       22,
    height:      22,
    borderColor: '#00FF88',
  },
  cornerTL: { top: 0,    left:  0, borderTopWidth: 3, borderLeftWidth:  3, borderTopLeftRadius:     5 },
  cornerTR: { top: 0,    right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius:    5 },
  cornerBL: { bottom: 0, left:  0, borderBottomWidth: 3, borderLeftWidth:  3, borderBottomLeftRadius:  5 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 5 },

  // Error overlay sobre el visor
  errorOverlay: {
    position: 'absolute', bottom: 12, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,69,58,0.85)',
    borderRadius: Radius.md, padding: 10,
  },
  errorOverlayText: {
    color: '#fff', fontSize: 12, fontWeight: '600', flex: 1,
  },

  // Controles debajo del visor
  cameraControls: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    paddingHorizontal: 24,
    paddingVertical:   14,
    paddingBottom:     Platform.OS === 'android' ? 18 : 14,
  },
  ctrlSecondary: {
    width: 72, alignItems: 'center', gap: 4,
  },
  ctrlSecondaryText: {
    fontSize: 11, fontWeight: '500',
  },
  // Botón de disparo principal
  shootBtn: {
    width:          70,
    height:         70,
    borderRadius:   35,
    backgroundColor: '#8B5CF6',
    alignItems:     'center',
    justifyContent: 'center',
    shadowColor:    '#7C3AED',
    shadowOffset:   { width: 0, height: 4 },
    shadowOpacity:  0.55,
    shadowRadius:   14,
    elevation:      10,
    borderWidth:    3,
    borderColor:    'rgba(196,181,253,0.35)',
  },
  shootBtnDisabled: {
    opacity: 0.45,
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

  // ── Google Translate style panels ──────────────────────────────────────
  // ── Google Translate style panels ──────────────────────────────────────
  gtPanel: {
    borderRadius:    Radius.xl,
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow:        'hidden',
    minHeight:       190,   // misma altura mínima ambos paneles
  },
  gtPanelResult: {
    borderColor:     'rgba(139,92,246,0.40)',
    backgroundColor: 'rgba(139,92,246,0.10)',
  },
  gtPanelLabel: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            4,
    paddingHorizontal: Spacing['3'],
    paddingTop:     8,
    paddingBottom:  2,
  },
  gtPanelLabelText: {
    fontSize:      9,
    fontWeight:    '700',
    letterSpacing: 1.2,
    color:         'rgba(148,163,184,0.5)',
  },
  // Barra de idiomas
  gtLangBar: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: Spacing['2'],
    paddingVertical:   8,
  },
  gtLangChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    paddingVertical:   7,
    paddingHorizontal: 13,
    borderRadius:      Radius.full,
    marginRight:       6,
    borderWidth:       1,
    borderColor:       'transparent',
  },
  gtLangChipActive: {
    backgroundColor: 'rgba(139,92,246,0.30)',
    borderColor:     '#8B5CF6',
  },
  gtLangChipText: {
    fontSize:   Typography.size.sm,   // más grande que antes
    fontWeight: '500',
  } as any,
  // Input
  gtInputWrap: {
    position: 'relative',
    padding:  Spacing['4'],
  },
  gtInput: {
    fontSize:          Typography.size.xl,
    minHeight:         90,
    textAlignVertical: 'top',
    fontWeight:        '500',
    paddingRight:      32,
  },
  gtClearBtn: {
    position: 'absolute',
    top:      14,
    right:    14,
  },
  // Barra central con swap
  gtMiddleBar: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: Spacing['4'],
    paddingVertical:   6,
  },
  gtDetectedWrap: { flex: 1 },
  gtDetectedText: { fontSize: Typography.size.xs },
  gtSwapBtn: {
    width:           42,
    height:          42,
    borderRadius:    21,
    backgroundColor: 'rgba(167,139,250,0.18)',
    borderWidth:     1.5,
    borderColor:     'rgba(167,139,250,0.45)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  // Badge idioma activo en panel destino
  gtActiveLangRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    paddingHorizontal: Spacing['4'],
    paddingVertical:   10,
    borderTopWidth:    1,
    borderTopColor:    'rgba(139,92,246,0.25)',
    backgroundColor:   'rgba(139,92,246,0.12)',
  },
  gtActiveLangText: {
    fontSize:   Typography.size.sm,
    fontWeight: '700',
    color:      '#C4B5FD',
    letterSpacing: 0.3,
  },
  gtActiveLangLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(139,92,246,0.20)',
    marginLeft: 4,
  },

  // Panel resultado
  gtResultWrap: {
    padding:   Spacing['4'],
    minHeight: 90,
  },
  gtResultText: {
    fontSize:   Typography.size['2xl'],
    fontWeight: '900',
    lineHeight: 40,
  },
  gtResultPlaceholder: {
    fontSize:   Typography.size.xl,
    fontWeight: '400',
    marginTop:  8,
  },
  gtResultFooter: {
    flexDirection:     'row',
    borderTopWidth:    1,
    borderTopColor:    'rgba(255,255,255,0.08)',
    paddingHorizontal: Spacing['4'],
    paddingVertical:   10,
    gap:               Spacing['4'],
  },
  gtActionBtn: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
  },
  gtActionText: {
    fontSize:   Typography.size.sm,
    fontWeight: '500',
  },

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
    minHeight:       56,
    justifyContent:  'center',
    marginTop:       Spacing['2'],
  },
  translateBtnDisabled: { opacity: 0.45 },

  // ── Scanner visual ──
  scannerWrap: {
    width:        '100%',
    height:       220,
    borderRadius: Radius.xl,
    overflow:     'hidden',
    marginTop:    8,
    borderWidth:  1,
    borderColor:  'rgba(167,139,250,0.40)',
  },
  scannerImage: {
    width:  '100%',
    height: '100%',
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,8,30,0.45)',
  },
  // Línea de scan
  scanLine: {
    position:        'absolute',
    left:            0,
    right:           0,
    top:             20,
    height:          2.5,
    backgroundColor: '#A78BFA',
    shadowColor:     '#A78BFA',
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.95,
    shadowRadius:    8,
    elevation:       8,
  },
  scanLineGlow: {
    position:        'absolute',
    left:            0,
    right:           0,
    top:             2.5,
    height:          18,
    backgroundColor: 'rgba(167,139,250,0.18)',
  },
  // Esquinas estilo viewfinder
  scanCorner: {
    position: 'absolute',
    width:    22,
    height:   22,
    borderColor: '#A78BFA',
  },
  scanCornerTL: { top: 10, left: 10,  borderTopWidth: 2.5, borderLeftWidth:  2.5, borderTopLeftRadius:     4 },
  scanCornerTR: { top: 10, right: 10, borderTopWidth: 2.5, borderRightWidth: 2.5, borderTopRightRadius:    4 },
  scanCornerBL: { bottom: 10, left: 10,  borderBottomWidth: 2.5, borderLeftWidth:  2.5, borderBottomLeftRadius:  4 },
  scanCornerBR: { bottom: 10, right: 10, borderBottomWidth: 2.5, borderRightWidth: 2.5, borderBottomRightRadius: 4 },
  // Label inferior
  scanLabel: {
    position:        'absolute',
    bottom:          12,
    alignSelf:       'center',
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: 'rgba(10,8,30,0.75)',
    borderWidth:     1,
    borderColor:     'rgba(167,139,250,0.30)',
    borderRadius:    Radius.full,
    paddingVertical:   6,
    paddingHorizontal: 14,
  },
  scanLabelText: {
    fontSize:   12,
    fontWeight: '600',
    color:      '#A78BFA',
    letterSpacing: 0.3,
  },

  // Botón nueva foto
  newPhotoBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    alignSelf:       'flex-start',
    gap:             6,
    backgroundColor: 'rgba(167,139,250,0.10)',
    borderWidth:     1,
    borderColor:     'rgba(167,139,250,0.30)',
    borderRadius:    Radius.full,
    paddingVertical:   7,
    paddingHorizontal: 14,
    marginBottom:    12,
  },
  newPhotoBtnText: {
    fontSize:   13,
    fontWeight: '600',
    color:      '#A78BFA',
  },

  // OCR feedback
  ocrLoadingCard: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             10,
    backgroundColor: 'rgba(167,139,250,0.10)',
    borderWidth:     1,
    borderColor:     'rgba(167,139,250,0.25)',
    borderRadius:    Radius.lg,
    padding:         14,
    marginTop:       8,
  },
  ocrLoadingText: {
    fontSize:   13,
    fontWeight: '500',
    color:      '#A78BFA',
    flex:       1,
  },
  ocrErrorCard: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             8,
    backgroundColor: 'rgba(255,69,58,0.10)',
    borderWidth:     1,
    borderColor:     'rgba(255,69,58,0.25)',
    borderRadius:    Radius.lg,
    padding:         14,
    marginTop:       8,
  },
  ocrErrorText: {
    fontSize:   13,
    fontWeight: '500',
    color:      '#FF453A',
    flex:       1,
  },
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
    alignItems:        'center',
    minWidth:          80,
  },
  quickChipLang: {
    fontSize:      8,
    fontWeight:    '700',
    letterSpacing: 0.5,
    marginBottom:  1,
  },
  quickChipForeign: {
    fontSize:   Typography.size.md,
    fontWeight: '600',
    lineHeight: 20,
  },
  quickChipTranslation: {
    fontSize:   Typography.size.xs,
    fontWeight: '400',
    marginTop:  1,
  },
});
