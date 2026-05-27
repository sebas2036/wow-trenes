/**
 * WoW TRENES — Design System
 * Filosofía: Cero Fricción · Alto Contraste · WCAG 2.2 Level AAA (≥7:1)
 * Estética: negro profundo, gradientes cinematográficos, acento violeta/índigo
 */

// ─── COLOR PALETTE ──────────────────────────────────────────────────────────
export const Colors = {
  // Backgrounds — deep blacks / dark navy
  bg: {
    base:    '#09090B', // zinc-950
    surface: '#111113', // card background
    elevated:'#18181B', // zinc-900
    overlay: '#27272A', // zinc-800
  },

  // Brand — violet to indigo gradient anchor
  brand: {
    primary:   '#7C3AED', // violet-600
    secondary: '#6D28D9', // violet-700
    accent:    '#4F46E5', // indigo-600
    glow:      '#8B5CF6', // violet-500 (for shadow/glow effects)
  },

  // Semantic status — predictive clock colors
  status: {
    safe:    '#22C55E', // green-500  — Llegas bien
    warn:    '#EAB308', // yellow-500 — Al límite
    danger:  '#EF4444', // red-500    — Tren perdido
    neutral: '#71717A', // zinc-500
  },

  // Text — ensures ≥7:1 ratio on bg.base (WCAG AAA)
  text: {
    primary:   '#FAFAFA', // zinc-50   — 18.7:1 on bg.base
    secondary: '#A1A1AA', // zinc-400  — 7.2:1  on bg.base
    muted:     '#71717A', // zinc-500  — 4.6:1  on bg.base (body only)
    inverse:   '#09090B',
    brand:     '#C4B5FD', // violet-300 on dark
  },

  // Borders
  border: {
    subtle:  'rgba(255,255,255,0.06)',
    default: 'rgba(255,255,255,0.10)',
    strong:  'rgba(255,255,255,0.20)',
  },

  // Pure
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

// ─── GRADIENTS ───────────────────────────────────────────────────────────────
export const Gradients = {
  // Card overlay — bottom scrim, ensures 7:1+ on any image
  cardScrim: ['transparent', 'rgba(9,9,11,0.55)', 'rgba(9,9,11,0.92)', '#09090B'] as string[],
  cardScrimLocations: [0, 0.35, 0.75, 1] as number[],

  // Hero gradient top bar
  heroTop: ['rgba(9,9,11,0.85)', 'transparent'] as string[],

  // Brand gradient — button, highlights
  brand: ['#7C3AED', '#4F46E5'] as string[],
  brandVertical: ['#8B5CF6', '#7C3AED', '#6D28D9'] as string[],

  // Status gradients
  safe:   ['rgba(34,197,94,0.15)', 'rgba(34,197,94,0)'] as string[],
  warn:   ['rgba(234,179,8,0.15)',  'rgba(234,179,8,0)'] as string[],
  danger: ['rgba(239,68,68,0.15)', 'rgba(239,68,68,0)'] as string[],
} as const;

// ─── TYPOGRAPHY ──────────────────────────────────────────────────────────────
export const Typography = {
  // Font families (system fonts — no extra loading)
  family: {
    regular: 'System',
    bold:    'System',
  },

  // Scale (rem-equivalent, base 16px)
  size: {
    xs:   11,
    sm:   13,
    base: 16,
    md:   18,
    lg:   22,
    xl:   28,
    '2xl':36,
    '3xl':48,
  },

  weight: {
    regular: '400' as const,
    medium:  '500' as const,
    semibold:'600' as const,
    bold:    '700' as const,
    heavy:   '800' as const,
    black:   '900' as const,
  },

  lineHeight: {
    tight:  1.15,
    normal: 1.45,
    loose:  1.7,
  },
} as const;

// ─── SPACING ─────────────────────────────────────────────────────────────────
export const Spacing = {
  '0':   0,
  '1':   4,
  '2':   8,
  '3':   12,
  '4':   16,
  '5':   20,
  '6':   24,
  '8':   32,
  '10':  40,
  '12':  48,
  '16':  64,
  '20':  80,
} as const;

// ─── BORDER RADIUS ───────────────────────────────────────────────────────────
export const Radius = {
  sm:   8,
  md:   12,
  lg:   18,
  xl:   24,
  '2xl':32,
  full: 9999,
} as const;

// ─── SHADOWS ─────────────────────────────────────────────────────────────────
export const Shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 12,
  },
  glow: {
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 10,
  },
  statusSafe: {
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  statusWarn: {
    shadowColor: '#EAB308',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  statusDanger: {
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
} as const;

// ─── ANIMATION DURATIONS ─────────────────────────────────────────────────────
export const Motion = {
  fast:    150,
  normal:  280,
  slow:    450,
  spring:  { damping: 18, stiffness: 200, mass: 1 },
} as const;

// ─── TOUCH TARGETS (WCAG 2.5.5 — min 44×44pt) ───────────────────────────────
export const TouchTarget = {
  min:    44,
  chip:   48, // Mode chips (Step 2 requirement: ≥48×48)
  button: 56, // Primary action buttons
  fab:    64, // GPS CTA / Floating action
} as const;

// ─── AFFILIATE CONFIG ────────────────────────────────────────────────────────
export const Affiliate = {
  trackingId:      'WOWTRENES_AFF_001',
  partnerizeTag:   'p11p',
  impactSid:       'wow_trenes_sid',
  commissionMin:   0.02, // 2%
  commissionMax:   0.05, // 5%
  merchantOfRecord:'trainline', // delegates PCI-DSS liability
} as const;

// ─── RAIL OPERATOR ENDPOINTS ─────────────────────────────────────────────────
export const RailEndpoints = {
  // Real-time APIs (only active when journey is imminent)
  sncf:         'https://api.sncf.com/v1',
  db:           'https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1',
  renfe:        'https://horarios.renfe.com/cer/HorariosServlet',
  trenitalia:   'https://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno',
  ns:           'https://gateway.apiportal.ns.nl/reisinformatie-api/api/v3',
  sbb:          'https://transport.opendata.ch/v1',

  // Affiliate distribution
  trainlineApi: 'https://api.trainline.com/v1',
  railEurope:   'https://api.raileurope.com/v2',
} as const;

// ─── GEOFENCE RADII (meters) ─────────────────────────────────────────────────
export const GeofenceRadius = {
  outer: 1000, // Ring 1 — approaching station (bus/uber)
  inner: 50,   // Ring 2 — station entrance / turnstile
} as const;

// ─── CONSOLIDATED THEME EXPORT ───────────────────────────────────────────────
export const Theme = {
  colors:    Colors,
  gradients: Gradients,
  typography:Typography,
  spacing:   Spacing,
  radius:    Radius,
  shadows:   Shadows,
  motion:    Motion,
  touch:     TouchTarget,
  affiliate: Affiliate,
  rail:      RailEndpoints,
  geofence:  GeofenceRadius,
} as const;

export type Theme = typeof Theme;
export default Theme;
