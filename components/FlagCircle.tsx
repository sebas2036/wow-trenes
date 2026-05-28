/**
 * FlagCircle — Bandera PNG con rim light neumórfico 3D.
 *
 * El "rim light" (iluminación en borde) se logra con SVG:
 *   • Circle con stroke = gradiente blanco (arriba) → negro (abajo)
 *   • Simula exactamente el efecto de la referencia CSS
 *   • Sin depender de box-shadow que se recorta en Android
 *
 * Capas (de afuera hacia adentro):
 *   1. SVG circle: fill negro + stroke con gradiente blanco→negro (RIM LIGHT)
 *   2. Círculo bisel oscuro interno
 *   3. Imagen PNG de bandera (flagcdn.com)
 *   4. LinearGradient brillo superior (::after del CSS original)
 *   5. LinearGradient oscurecimiento inferior (inset shadow inferior)
 */
import React, { memo } from 'react';
import { View, Image, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Circle, Defs,
  LinearGradient as SvgGrad,
  Stop,
} from 'react-native-svg';

export type FlagSize = 'lg' | 'md' | 'sm';

interface FlagCircleProps {
  countryCode: string;  // ISO 3166-1 alpha-2 lowercase: 'es', 'jp', 'gb'…
  size?: FlagSize;
}

const SIZES: Record<FlagSize, {
  outer:   number;   // diámetro total del SVG
  stroke:  number;   // grosor del rim (stroke SVG)
  bezel:   number;   // diámetro del bisel interno
  flag:    number;   // diámetro de la imagen de bandera
}> = {
  lg: { outer: 60, stroke: 1.5, bezel: 52, flag: 44 },
  md: { outer: 46, stroke: 1.2, bezel: 39, flag: 33 },
  sm: { outer: 32, stroke: 1.0, bezel: 27, flag: 22 },
};

const flagUrl = (code: string) =>
  `https://flagcdn.com/w160/${code.toLowerCase()}.png`;

export default memo(function FlagCircle({ countryCode, size = 'lg' }: FlagCircleProps) {
  const { outer, stroke, bezel, flag } = SIZES[size];
  const center  = outer / 2;
  const radius  = center - stroke / 2;   // radio del círculo SVG
  const bezelOffset = (outer - bezel) / 2;
  const flagOffset  = (outer - flag)  / 2;

  return (
    <View style={{ width: outer, height: outer }}>

      {/* ── Capa 1: SVG con rim light ───────────────────────────────────────
          Fill: negro profundo  (#0C0C10)
          Stroke: gradiente top→bottom  blanco brillante → negro
          Esto replica el border highlight del CSS de referencia          */}
      <Svg
        width={outer}
        height={outer}
        style={StyleSheet.absoluteFillObject}
      >
        <Defs>
          {/* Gradiente vertical: blanco en top, azul-plateado en medio, negro en bottom */}
          <SvgGrad id="rim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0"    stopColor="#FFFFFF" stopOpacity="0.90" />
            <Stop offset="0.30" stopColor="#C8D8FF" stopOpacity="0.55" />
            <Stop offset="0.65" stopColor="#404060" stopOpacity="0.20" />
            <Stop offset="1"    stopColor="#000000" stopOpacity="0.85" />
          </SvgGrad>
        </Defs>

        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="#0C0C10"
          stroke="url(#rim)"
          strokeWidth={stroke}
        />
      </Svg>

      {/* ── Capa 2: bisel interno (levemente más claro que el negro exterior) ── */}
      <View style={{
        position:        'absolute',
        top:             bezelOffset,
        left:            bezelOffset,
        width:           bezel,
        height:          bezel,
        borderRadius:    bezel / 2,
        backgroundColor: '#1C1C22',
        alignItems:      'center',
        justifyContent:  'center',
      }}>

        {/* ── Capa 3+4+5: imagen bandera + overlays de brillo ── */}
        <View style={{
          width:        flag,
          height:       flag,
          borderRadius: flag / 2,
          overflow:     'hidden',
        }}>
          {/* Imagen real PNG */}
          <Image
            source={{ uri: flagUrl(countryCode) }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />

          {/* Capa 4: brillo superior — replica radial-gradient(circle at top) del CSS */}
          <LinearGradient
            colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.00)']}
            locations={[0, 0.50]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          {/* Capa 5: oscurecimiento inferior — replica inset shadow bottom del CSS */}
          <LinearGradient
            colors={['rgba(0,0,0,0.00)', 'rgba(0,0,0,0.35)']}
            locations={[0.50, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
        </View>
      </View>
    </View>
  );
});
