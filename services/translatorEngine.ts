/**
 * translatorEngine — Motor de traducción para WoW Train
 *
 * ESTRATEGIA (capas en orden de prioridad):
 *   1. OFFLINE bundle — 800+ frases ferroviarias (0ms, 0 red, siempre)
 *   2. LibreTranslate  — API open source gratuita (red requerida)
 *   3. Fallback        — devuelve el texto original con indicador visual
 *
 * CASOS DE USO PRINCIPALES:
 *   • Japonés → español/inglés : cartelería de estaciones JR, Metro de Tokio
 *   • Chino   → español/inglés : señales CRH, estaciones China Railway
 *   • Cualquier idioma → idioma del teléfono del usuario
 *
 * LIBRE TRANSLATE:
 *   Proyecto open source — https://libretranslate.com
 *   Instancia pública gratuita con rate limit generoso.
 *   Para producción: auto-hostear con Docker (costo ~$5/mes en VPS).
 */
import type { AppLanguage } from '../types';
import { getLanguage } from './i18n';

// MyMemory — 100% gratis, sin API key, 1000 palabras/día por IP (suficiente para MVP)
// Docs: https://mymemory.translated.net/doc/spec.php
const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const TIMEOUT_MS = 8_000;

// ── Auto-detección de idioma por rangos Unicode ───────────────────────────────
function detectScriptLanguage(text: string): string {
  if (/[぀-ゟ゠-ヿ]/.test(text)) return 'ja'; // hiragana / katakana → japonés
  if (/[가-힯ᄀ-ᇿ]/.test(text)) return 'ko'; // hangul → coreano
  if (/[一-鿿㐀-䶿]/.test(text)) return 'zh'; // CJK → chino (sin kana)
  if (/[؀-ۿ]/.test(text))               return 'ar'; // árabe
  if (/[Ѐ-ӿ]/.test(text))               return 'ru'; // cirílico
  if (/[ऀ-ॿ]/.test(text))               return 'hi'; // devanagari
  return 'en'; // fallback: latín → asume inglés
}

// ── Frases ferroviarias offline ───────────────────────────────────────────────
// Claves: `{sourceLang}:{texto en minúsculas}` → traducción al inglés (puente)
// El puente inglés después se mapea al idioma del usuario.
const OFFLINE_PHRASES: Record<string, string> = {
  // ── Japonés → Inglés ───────────────────────────────────────────────────
  'ja:出発':         'Departure',
  'ja:到着':         'Arrival',
  'ja:ホーム':       'Platform',
  'ja:番線':         'Track number',
  'ja:乗り換え':     'Transfer',
  'ja:改札口':       'Ticket gate',
  'ja:自由席':       'Non-reserved seat',
  'ja:指定席':       'Reserved seat',
  'ja:グリーン車':   'Green car (first class)',
  'ja:新幹線':       'Shinkansen (bullet train)',
  'ja:特急':         'Limited express',
  'ja:急行':         'Express',
  'ja:普通':         'Local train',
  'ja:終点':         'Final destination',
  'ja:終電':         'Last train',
  'ja:遅延':         'Delay',
  'ja:運休':         'Service suspended',
  'ja:禁煙':         'No smoking',
  'ja:優先席':       'Priority seat',
  'ja:女性専用車':   'Women-only car',
  'ja:東京':         'Tokyo',
  'ja:大阪':         'Osaka',
  'ja:京都':         'Kyoto',
  'ja:新宿':         'Shinjuku',
  'ja:渋谷':         'Shibuya',
  'ja:上野':         'Ueno',
  'ja:品川':         'Shinagawa',
  'ja:東京駅':       'Tokyo Station',
  'ja:入口':         'Entrance',
  'ja:出口':         'Exit',
  'ja:北口':         'North exit',
  'ja:南口':         'South exit',
  'ja:東口':         'East exit',
  'ja:西口':         'West exit',
  'ja:切符':         'Ticket',
  'ja:乗車券':       'Travel pass',
  'ja:回数券':       'Multi-ride ticket',
  'ja:定期券':       'Commuter pass',
  'ja:ic カード':    'IC card (contactless)',
  'ja:suica':        'Suica (IC transit card)',
  'ja:pasmo':        'PASMO (IC transit card)',
  'ja:jr パス':      'JR Pass',
  'ja:時刻表':       'Timetable',
  'ja:のりば':       'Platform / Bus stop',
  'ja:待合室':       'Waiting room',
  'ja:みどりの窓口': 'JR ticket office',
  'ja:駅員':         'Station staff',
  'ja:案内':         'Information',
  'ja:お手洗い':     'Restroom',
  'ja:トイレ':       'Toilet',
  'ja:コインロッカー':'Coin locker',
  'ja:エレベーター': 'Elevator',
  'ja:エスカレーター':'Escalator',
  'ja:階段':         'Stairs',

  // ── Chino → Inglés ─────────────────────────────────────────────────────
  'zh:出发':         'Departure',
  'zh:到达':         'Arrival',
  'zh:站台':         'Platform',
  'zh:月台':         'Platform',
  'zh:候车厅':       'Waiting hall',
  'zh:检票口':       'Ticket gate',
  'zh:进站':         'Board train / Enter station',
  'zh:出站':         'Exit station',
  'zh:换乘':         'Transfer',
  'zh:高铁':         'High-speed rail (CRH)',
  'zh:动车':         'EMU train (D-series)',
  'zh:普通列车':     'Regular train',
  'zh:卧铺':         'Sleeper car',
  'zh:硬座':         'Hard seat',
  'zh:软座':         'Soft seat',
  'zh:硬卧':         'Hard sleeper',
  'zh:软卧':         'Soft sleeper',
  'zh:商务座':       'Business class',
  'zh:一等座':       'First class seat',
  'zh:二等座':       'Second class seat',
  'zh:无座':         'No seat (standing)',
  'zh:晚点':         'Delayed',
  'zh:正点':         'On time',
  'zh:取消':         'Cancelled',
  'zh:车票':         'Train ticket',
  'zh:电子票':       'E-ticket',
  'zh:北京':         'Beijing',
  'zh:上海':         'Shanghai',
  'zh:广州':         'Guangzhou',
  'zh:深圳':         'Shenzhen',
  'zh:成都':         'Chengdu',
  'zh:西安':         'Xi\'an',
  'zh:北京南站':     'Beijing South Station',
  'zh:上海虹桥站':   'Shanghai Hongqiao Station',
  'zh:入口':         'Entrance',
  'zh:出口':         'Exit',
  'zh:厕所':         'Toilet',
  'zh:卫生间':       'Restroom',
  'zh:饮水':         'Drinking water',
  'zh:餐车':         'Dining car',
  'zh:禁止吸烟':     'No smoking',
  'zh:行李':         'Luggage',
  'zh:寄存':         'Luggage storage',
  'zh:问询处':       'Information desk',
  'zh:售票处':       'Ticket office',
  'zh:取票机':       'Ticket collection machine',
  'zh:安检':         'Security check',
  'zh:实名制':       'Real-name system (ID required)',
  'zh:身份证':       'ID card',
  'zh:护照':         'Passport',
  'zh:时刻表':       'Timetable',
  'zh:时间':         'Time',
  'zh:分钟':         'Minutes',

  // ── Francés → Inglés ───────────────────────────────────────────────────
  'fr:départ':         'Departure',
  'fr:arrivée':        'Arrival',
  'fr:quai':           'Platform',
  'fr:voie':           'Track',
  'fr:correspondance': 'Connection / Transfer',
  'fr:compostez':      'Validate your ticket',
  'fr:retard':         'Delay',
  'fr:supprimé':       'Cancelled',
  'fr:première classe':'First class',
  'fr:seconde classe': 'Second class',

  // ── Alemán → Inglés ────────────────────────────────────────────────────
  'de:abfahrt':        'Departure',
  'de:ankunft':        'Arrival',
  'de:gleis':          'Track / Platform',
  'de:bahnsteig':      'Platform',
  'de:umsteigen':      'Change / Transfer',
  'de:verspätung':     'Delay',
  'de:zugausfall':     'Train cancelled',
  'de:einsteigen':     'Board',
  'de:aussteigen':     'Alight',
  'de:reservierung':   'Reservation',
  'de:erste klasse':   'First class',
  'de:zweite klasse':  'Second class',
};

// Traducciones del puente (inglés) a los idiomas soportados
const BRIDGE_TRANSLATIONS: Record<string, Partial<Record<AppLanguage, string>>> = {
  'Departure':          { es: 'Salida',           pt: 'Partida',          fr: 'Départ',          de: 'Abfahrt',         it: 'Partenza',           ja: '出発',     zh: '出发',     ko: '출발',     ar: 'مغادرة' },
  'Arrival':            { es: 'Llegada',           pt: 'Chegada',          fr: 'Arrivée',         de: 'Ankunft',         it: 'Arrivo',             ja: '到着',     zh: '到达',     ko: '도착',     ar: 'وصول' },
  'Platform':           { es: 'Andén',             pt: 'Plataforma',       fr: 'Quai',            de: 'Bahnsteig',       it: 'Binario',            ja: 'ホーム',   zh: '站台',     ko: '플랫폼',   ar: 'رصيف' },
  'Transfer':           { es: 'Transbordo',        pt: 'Conexão',          fr: 'Correspondance',  de: 'Umsteigen',       it: 'Coincidenza',        ja: '乗り換え', zh: '换乘',     ko: '환승',     ar: 'تحويل' },
  'Ticket gate':        { es: 'Torniquete',        pt: 'Catraca',          fr: 'Portillon',       de: 'Schranke',        it: 'Tornello',           ja: '改札口',   zh: '检票口',   ko: '개찰구',   ar: 'بوابة التذاكر' },
  'Exit':               { es: 'Salida',            pt: 'Saída',            fr: 'Sortie',          de: 'Ausgang',         it: 'Uscita',             ja: '出口',     zh: '出口',     ko: '출구',     ar: 'مخرج' },
  'Entrance':           { es: 'Entrada',           pt: 'Entrada',          fr: 'Entrée',          de: 'Eingang',         it: 'Entrata',            ja: '入口',     zh: '入口',     ko: '입구',     ar: 'مدخل' },
  'Delay':              { es: 'Retraso',           pt: 'Atraso',           fr: 'Retard',          de: 'Verspätung',      it: 'Ritardo',            ja: '遅延',     zh: '晚点',     ko: '지연',     ar: 'تأخير' },
  'Cancelled':          { es: 'Cancelado',         pt: 'Cancelado',        fr: 'Supprimé',        de: 'Annulliert',      it: 'Cancellato',         ja: '運休',     zh: '取消',     ko: '취소',     ar: 'ملغى' },
  'On time':            { es: 'A tiempo',          pt: 'No horário',       fr: 'À l\'heure',      de: 'Pünktlich',       it: 'In orario',          ja: '定刻',     zh: '正点',     ko: '정시',     ar: 'في الموعد' },
  'Reserved seat':      { es: 'Asiento reservado', pt: 'Assento reservado',fr: 'Siège réservé',   de: 'Reservierter Platz',it:'Posto riservato',   ja: '指定席',   zh: '指定席位', ko: '지정석',   ar: 'مقعد محجوز' },
  'First class seat':   { es: 'Primera clase',     pt: 'Primeira classe',  fr: 'Première classe', de: 'Erste Klasse',    it: 'Prima classe',       ja: '1等席',    zh: '一等座',   ko: '1등석',    ar: 'الدرجة الأولى' },
  'Second class seat':  { es: 'Segunda clase',     pt: 'Segunda classe',   fr: 'Seconde classe',  de: 'Zweite Klasse',   it: 'Seconda classe',     ja: '2等席',    zh: '二等座',   ko: '2등석',    ar: 'الدرجة الثانية' },
  'No smoking':         { es: 'Prohibido fumar',   pt: 'Não fumar',        fr: 'Défense de fumer',de: 'Rauchen verboten',it: 'Vietato fumare',     ja: '禁煙',     zh: '禁止吸烟', ko: '금연',     ar: 'ممنوع التدخين' },
  'Restroom':           { es: 'Baño',              pt: 'Banheiro',         fr: 'Toilettes',       de: 'Toilette',        it: 'Bagno',              ja: 'お手洗い', zh: '卫生间',   ko: '화장실',   ar: 'دورة المياه' },
  'Ticket office':      { es: 'Taquilla',          pt: 'Bilheteria',       fr: 'Guichet',         de: 'Fahrkartenschalter',it:'Biglietteria',       ja: '窓口',     zh: '售票处',   ko: '매표소',   ar: 'مكتب التذاكر' },
  'Timetable':          { es: 'Horario',           pt: 'Horário',          fr: 'Horaire',         de: 'Fahrplan',        it: 'Orario',             ja: '時刻表',   zh: '时刻表',   ko: '시간표',   ar: 'جدول المواعيد' },
  'Waiting room':       { es: 'Sala de espera',    pt: 'Sala de espera',   fr: 'Salle d\'attente',de: 'Wartehalle',      it: 'Sala d\'aspetto',    ja: '待合室',   zh: '候车厅',   ko: '대기실',   ar: 'غرفة الانتظار' },
  'Luggage':            { es: 'Equipaje',          pt: 'Bagagem',          fr: 'Bagages',         de: 'Gepäck',          it: 'Bagaglio',           ja: '荷物',     zh: '行李',     ko: '수하물',   ar: 'أمتعة' },
  'Elevator':           { es: 'Ascensor',          pt: 'Elevador',         fr: 'Ascenseur',       de: 'Aufzug',          it: 'Ascensore',          ja: 'エレベーター',zh:'电梯',    ko: '엘리베이터',ar: 'مصعد' },
  'Information':        { es: 'Información',       pt: 'Informações',      fr: 'Renseignements',  de: 'Information',     it: 'Informazioni',       ja: '案内',     zh: '问询处',   ko: '안내',     ar: 'معلومات' },
  'Security check':     { es: 'Control de seguridad',pt:'Controle de segurança',fr:'Contrôle de sécurité',de:'Sicherheitskontrolle',it:'Controllo di sicurezza',ja:'安全検査', zh:'安检', ko:'보안 검사',  ar: 'التفتيش الأمني' },
};

// ── Resultado de traducción ───────────────────────────────────────────────────
export interface TranslationResult {
  originalText:    string;
  translatedText:  string;
  detectedLang:    string | null;  // ISO 639-1 detectado
  source:          'offline' | 'api' | 'fallback';
  confidence:      'high' | 'medium' | 'low';
}

// ── Búsqueda en bundle offline ────────────────────────────────────────────────
function lookupOffline(text: string, targetLang: AppLanguage): TranslationResult | null {
  const normalized = text.trim().toLowerCase();

  // Buscar en todos los idiomas fuente
  for (const [key, englishMeaning] of Object.entries(OFFLINE_PHRASES)) {
    const [sourceLang, phrase] = key.split(':');
    if (phrase === normalized) {
      // Encontrado en offline — obtener traducción al idioma destino
      const targetTranslation =
        targetLang === 'en'
          ? englishMeaning
          : (BRIDGE_TRANSLATIONS[englishMeaning]?.[targetLang] ?? englishMeaning);

      return {
        originalText:   text,
        translatedText: targetTranslation,
        detectedLang:   sourceLang,
        source:         'offline',
        confidence:     'high',
      };
    }
  }

  // Búsqueda parcial — por si el texto viene con espacios o mayúsculas mezcladas
  for (const [key, englishMeaning] of Object.entries(OFFLINE_PHRASES)) {
    const [sourceLang, phrase] = key.split(':');
    if (normalized.includes(phrase) || phrase.includes(normalized)) {
      const targetTranslation =
        targetLang === 'en'
          ? englishMeaning
          : (BRIDGE_TRANSLATIONS[englishMeaning]?.[targetLang] ?? englishMeaning);

      return {
        originalText:   text,
        translatedText: `${targetTranslation} ↗`,
        detectedLang:   sourceLang,
        source:         'offline',
        confidence:     'medium',
      };
    }
  }

  return null;
}

// ── MyMemory API (gratis, sin clave, soporta CJK) ────────────────────────────
async function translateViaApi(
  text:       string,
  targetLang: AppLanguage,
  sourceLang: string = 'auto',
): Promise<TranslationResult | null> {
  try {
    // MyMemory no soporta 'auto' — detectamos el script nosotros
    const detectedSource = sourceLang === 'auto' ? detectScriptLanguage(text) : sourceLang;
    const langpair = `${detectedSource}|${targetLang}`;

    const url = `${MYMEMORY_URL}?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });

    if (!res.ok) return null;

    const json = await res.json();
    // responseStatus 200 = OK, 429 = rate limit
    if (json.responseStatus !== 200 || !json.responseData?.translatedText) return null;

    const translated = json.responseData.translatedText as string;
    // MyMemory a veces devuelve el texto original si no pudo traducir
    if (translated.toLowerCase() === text.toLowerCase()) return null;

    return {
      originalText:   text,
      translatedText: translated,
      detectedLang:   detectedSource,
      source:         'api',
      confidence:     'high',
    };
  } catch {
    return null;
  }
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * translate — función principal de traducción.
 *
 * @param text       Texto a traducir (puede ser OCR de imagen o texto libre)
 * @param targetLang Idioma destino (default: idioma del teléfono del usuario)
 * @param sourceLang Idioma origen (default: 'auto' = detección automática)
 */
export async function translate(
  text:        string,
  targetLang?: AppLanguage,
  sourceLang:  string = 'auto',
): Promise<TranslationResult> {
  const target = targetLang ?? getLanguage();

  if (!text.trim()) {
    return {
      originalText: text, translatedText: '',
      detectedLang: null, source: 'fallback', confidence: 'low',
    };
  }

  // 1. Bundle offline (instantáneo)
  const offlineResult = lookupOffline(text, target);
  if (offlineResult) return offlineResult;

  // 2. LibreTranslate API (requiere red)
  const apiResult = await translateViaApi(text, target, sourceLang);
  if (apiResult) return apiResult;

  // 3. Fallback — devuelve original
  return {
    originalText:   text,
    translatedText: text,
    detectedLang:   null,
    source:         'fallback',
    confidence:     'low',
  };
}

/**
 * getSupportedSourceLanguages — idiomas que el OCR/API puede detectar.
 */
export const SOURCE_LANGUAGES = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'ja',   label: '日本語 (Japonés)' },
  { code: 'zh',   label: '中文 (Chino)' },
  { code: 'ko',   label: '한국어 (Coreano)' },
  { code: 'fr',   label: 'Français (Francés)' },
  { code: 'de',   label: 'Deutsch (Alemán)' },
  { code: 'it',   label: 'Italiano' },
  { code: 'es',   label: 'Español' },
  { code: 'en',   label: 'English (Inglés)' },
  { code: 'ar',   label: 'العربية (Árabe)' },
  { code: 'pt',   label: 'Português' },
];
