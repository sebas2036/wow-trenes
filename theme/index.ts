/**
 * WoW TRENES — Design System
 * Soporta modo oscuro y claro automático según configuración del sistema.
 */

import type { ColorSchemeName } from 'react-native';

// ─── PALETA OSCURA — Apple Dark (default) ────────────────────────────────────
const DarkColors = {
  bg: {
    base:      '#000000',          // systemBackground dark
    surface:   '#1C1C1E',          // secondarySystemBackground dark
    elevated:  '#2C2C2E',          // tertiarySystemBackground dark
    overlay:   '#3A3A3C',
    card:      '#1C1C1E',          // card surface
    tabBar:    'rgba(28,28,30,0.92)',
    gpsBanner: '#1C1C1E',
  },
  brand: {
    primary:   '#8B5CF6',          // ligeramente más brillante en dark
    secondary: '#7C3AED',
    accent:    '#A78BFA',
    glow:      '#A78BFA',
  },
  status: {
    safe:    '#30D158',            // Apple green dark
    warn:    '#FFD60A',            // Apple yellow dark
    danger:  '#FF453A',            // Apple red dark
    neutral: '#8E8E93',
  },
  text: {
    primary:   '#FFFFFF',
    secondary: 'rgba(235,235,245,0.60)',   // Apple label secondary dark
    muted:     'rgba(235,235,245,0.30)',
    inverse:   '#000000',
    brand:     '#C4B5FD',
  },
  border: {
    subtle:  'rgba(255,255,255,0.05)',
    default: 'rgba(255,255,255,0.09)',
    strong:  'rgba(255,255,255,0.18)',
    card:    'rgba(255,255,255,0.08)',
  },
  shadow: {
    color:   '#000000',
    opacity:  0.28,
    radius:   16,
  },
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

// ─── PALETA CLARA — Apple Light ───────────────────────────────────────────────
const LightColors = {
  bg: {
    base:      '#F2F2F7',          // systemGroupedBackground light
    surface:   '#FFFFFF',          // secondarySystemGroupedBackground
    elevated:  '#E5E5EA',          // tertiarySystemGroupedBackground
    overlay:   '#D1D1D6',
    card:      '#FFFFFF',
    tabBar:    'rgba(255,255,255,0.92)',
    gpsBanner: '#F2F2F7',
  },
  brand: {
    primary:   '#7C3AED',
    secondary: '#6D28D9',
    accent:    '#5B21B6',
    glow:      '#7C3AED',
  },
  status: {
    safe:    '#34C759',            // Apple green light
    warn:    '#FF9F0A',            // Apple orange light
    danger:  '#FF3B30',            // Apple red light
    neutral: '#8E8E93',
  },
  text: {
    primary:   '#000000',
    secondary: 'rgba(60,60,67,0.60)',     // Apple label secondary light
    muted:     'rgba(60,60,67,0.30)',
    inverse:   '#FFFFFF',
    brand:     '#6D28D9',
  },
  border: {
    subtle:  'rgba(0,0,0,0.04)',
    default: 'rgba(0,0,0,0.08)',
    strong:  'rgba(0,0,0,0.16)',
    card:    'rgba(0,0,0,0.06)',
  },
  shadow: {
    color:   '#000000',
    opacity:  0.06,
    radius:   16,
  },
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────
// AppColors es el tipo estructural (sin literal strings) para que DarkColors
// y LightColors sean asignables aunque sus string literals difieran.
export type AppColors = {
  bg:     { base: string; surface: string; elevated: string; overlay: string; card: string; tabBar: string; gpsBanner: string };
  brand:  { primary: string; secondary: string; accent: string; glow: string };
  status: { safe: string; warn: string; danger: string; neutral: string };
  text:   { primary: string; secondary: string; muted: string; inverse: string; brand: string };
  border: { subtle: string; default: string; strong: string; card: string };
  shadow: { color: string; opacity: number; radius: number };
  white:  string;
  black:  string;
  transparent: string;
};

export function getColors(scheme: ColorSchemeName): AppColors {
  return scheme === 'light' ? LightColors : DarkColors;
}

// Exportación de compatibilidad (dark por defecto — solo para StyleSheet estáticos)
export const Colors = DarkColors;

// ─── GRADIENTS ───────────────────────────────────────────────────────────────
// Tipado como readonly tuples para que LinearGradient los acepte sin cast
export const Gradients = {
  cardScrim:          ['transparent', 'rgba(9,9,11,0.55)', 'rgba(9,9,11,0.92)', '#09090B'] as readonly [string, string, string, string],
  cardScrimLocations: [0, 0.35, 0.75, 1]                                                  as readonly [number, number, number, number],
  heroTop:            ['rgba(9,9,11,0.85)', 'transparent']                                 as readonly [string, string],
  brand:              ['#7C3AED', '#4F46E5']                                                as readonly [string, string],
  brandVertical:      ['#8B5CF6', '#7C3AED', '#6D28D9']                                    as readonly [string, string, string],
  safe:               ['rgba(34,197,94,0.15)', 'rgba(34,197,94,0)']                        as readonly [string, string],
  warn:               ['rgba(234,179,8,0.15)',  'rgba(234,179,8,0)']                       as readonly [string, string],
  danger:             ['rgba(239,68,68,0.15)', 'rgba(239,68,68,0)']                        as readonly [string, string],
} as const;

// ─── TYPOGRAPHY ───────────────────────────────────────────────────────────────
export const Typography = {
  family: { regular: 'System', bold: 'System' },
  size: { xs: 11, sm: 13, base: 16, md: 18, lg: 22, xl: 28, '2xl': 36, '3xl': 48 },
  weight: {
    regular: '400' as const, medium: '500' as const, semibold: '600' as const,
    bold: '700' as const, heavy: '800' as const, black: '900' as const,
  },
  lineHeight: { tight: 1.15, normal: 1.45, loose: 1.7 },
} as const;

// ─── SPACING ──────────────────────────────────────────────────────────────────
export const Spacing = {
  '0': 0, '1': 4, '2': 8, '3': 12, '4': 16, '5': 20,
  '6': 24, '8': 32, '10': 40, '12': 48, '16': 64, '20': 80,
} as const;

// ─── BORDER RADIUS ────────────────────────────────────────────────────────────
export const Radius = {
  sm: 8, md: 12, lg: 16, xl: 20, '2xl': 28, full: 9999,
} as const;

// ─── SHADOWS — Apple-style (soft, layered) ────────────────────────────────────
export const Shadows = {
  // Card sombra sutil — como Apple Cards
  card:  { shadowColor: '#000', shadowOffset: { width: 0, height: 2  }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 3  },
  cardDark: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.30, shadowRadius: 16, elevation: 6 },
  // Sombra de acento (GPS button, brand elements)
  glow:  { shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 8 },
  // Segmented control shadow
  segment: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  statusSafe:   { shadowColor: '#34C759', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  statusWarn:   { shadowColor: '#FF9F0A', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  statusDanger: { shadowColor: '#FF3B30', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
} as const;

// ─── ANIMATION ────────────────────────────────────────────────────────────────
export const Motion = {
  fast: 150, normal: 280, slow: 450,
  spring: { damping: 18, stiffness: 200, mass: 1 },
} as const;

// ─── TOUCH TARGETS ────────────────────────────────────────────────────────────
export const TouchTarget = { min: 44, chip: 48, button: 56, fab: 64 } as const;

// ─── AFFILIATE CONFIG ─────────────────────────────────────────────────────────
// Los IDs se leen desde variables de entorno (.env.local) en tiempo de build.
// Si no están definidos, caen a los placeholders de desarrollo.
// Para activar la monetización real añade a .env.local:
//   EXPO_PUBLIC_PARTNERIZE_TAG=<camref asignado por Partnerize>
//   EXPO_PUBLIC_IMPACT_SID=<SID asignado por Impact/Trainline>
//   EXPO_PUBLIC_AFFILIATE_ID=<tu tracking ID negociado con Trainline>
export const Affiliate = {
  // Travelpayouts — IDs cargados desde .env (nunca hardcodeados en el repo)
  trackingId:       process.env.EXPO_PUBLIC_TP_MARKER      ?? '',
  partnerizeTag:    process.env.EXPO_PUBLIC_PARTNERIZE_TAG ?? '',
  impactSid:        `travelpayouts_${process.env.EXPO_PUBLIC_TP_MARKER ?? ''}`,
  commissionMin:    0.018,  // 1.8% trenes Trip.com
  commissionMax:    0.06,   // 6% Omio
  merchantOfRecord: 'omio', // afiliado principal via Travelpayouts
} as const;

// ─── RAIL ENDPOINTS ───────────────────────────────────────────────────────────
export const RailEndpoints = {
  sncf:         'https://api.sncf.com/v1',
  db:           'https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1',
  renfe:        'https://horarios.renfe.com/cer/HorariosServlet',
  trenitalia:   'https://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno',
  ns:           'https://gateway.apiportal.ns.nl/reisinformatie-api/api/v3',
  sbb:          'https://transport.opendata.ch/v1',
  trainlineApi: 'https://api.trainline.com/v1',
  railEurope:   'https://api.raileurope.com/v2',
} as const;

// ─── GEOFENCE RADII ───────────────────────────────────────────────────────────
export const GeofenceRadius = { outer: 1000, inner: 50 } as const;

// ─── CONSOLIDATED THEME ───────────────────────────────────────────────────────
export const Theme = {
  colors: Colors, gradients: Gradients, typography: Typography,
  spacing: Spacing, radius: Radius, shadows: Shadows,
  motion: Motion, touch: TouchTarget, affiliate: Affiliate,
  rail: RailEndpoints, geofence: GeofenceRadius,
} as const;

export type Theme = typeof Theme;
export default Theme;
