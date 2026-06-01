/**
 * DownloadProgressBar — Indicador de descarga con % exacto y barra animada
 *
 * Muestra progreso real en tiempo real. Sin animaciones genéricas.
 * Se usa en salidas.tsx y donde sea que haya descarga en curso.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

interface Props {
  dbName:   string;   // Nombre del archivo (para mostrar país)
  progress: number;   // 0-100
  visible:  boolean;
}

// Mapeo de nombre de archivo a país legible
const DB_LABELS: Record<string, string> = {
  'gtfs_france.db':      '🇫🇷 Francia',
  'gtfs_belgium.db':     '🇧🇪 Bélgica',
  'gtfs_austria.db':     '🇦🇹 Austria',
  'gtfs_germany.db':     '🇩🇪 Alemania',
  'gtfs_italy.db':       '🇮🇹 Italia',
  'gtfs_netherlands.db': '🇳🇱 Países Bajos',
  'gtfs_portugal.db':    '🇵🇹 Portugal',
  'gtfs_norway.db':      '🇳🇴 Noruega',
  'gtfs_japan.db':       '🇯🇵 Japón',
};

function fileSizeLabel(dbName: string): string {
  const sizes: Record<string, string> = {
    'gtfs_france.db':      '196 MB',
    'gtfs_belgium.db':     '164 MB',
    'gtfs_austria.db':     '37 MB',
  };
  return sizes[dbName] ?? '';
}

export default function DownloadProgressBar({ dbName, progress, visible }: Props) {
  const { colors } = useTheme();
  const widthAnim  = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // Animar barra de progreso
  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  // Fade in/out
  useEffect(() => {
    Animated.timing(opacityAnim, {
      toValue: visible ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  if (!visible && progress === 0) return null;

  const label    = DB_LABELS[dbName] ?? dbName;
  const sizeHint = fileSizeLabel(dbName);
  const isDone   = progress >= 100;

  const barWidth = widthAnim.interpolate({
    inputRange:  [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={[styles.container, { opacity: opacityAnim, backgroundColor: colors.bg.elevated, borderColor: colors.border.subtle }]}>
      {/* Ícono + texto */}
      <View style={styles.row}>
        <Ionicons
          name={isDone ? 'checkmark-circle' : 'cloud-download-outline'}
          size={16}
          color={isDone ? '#30D158' : colors.brand.primary}
        />
        <View style={styles.textCol}>
          <Text style={[styles.title, { color: colors.text.primary }]}>
            {isDone ? `${label} listo` : `Descargando ${label}`}
          </Text>
          <Text style={[styles.sub, { color: colors.text.muted }]}>
            {isDone
              ? 'Datos completos disponibles'
              : `Horarios completos${sizeHint ? ` · ${sizeHint}` : ''} · En segundo plano`}
          </Text>
        </View>

        {/* Porcentaje exacto */}
        <Text style={[styles.pct, { color: isDone ? '#30D158' : colors.brand.primary }]}>
          {isDone ? '✓' : `${progress}%`}
        </Text>
      </View>

      {/* Barra de progreso */}
      {!isDone && (
        <View style={[styles.track, { backgroundColor: colors.bg.overlay }]}>
          <Animated.View
            style={[
              styles.fill,
              {
                width: barWidth,
                backgroundColor: colors.brand.primary,
              },
            ]}
          />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical:   6,
    borderRadius:     10,
    borderWidth:      1,
    padding:          12,
    gap:              8,
  },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  textCol: { flex: 1 },
  title: { fontSize: 13, fontWeight: '600' },
  sub:   { fontSize: 11, marginTop: 1 },
  pct:   { fontSize: 16, fontWeight: '800', minWidth: 36, textAlign: 'right' },
  track: {
    height:       5,
    borderRadius: 3,
    overflow:     'hidden',
  },
  fill: {
    height:       5,
    borderRadius: 3,
  },
});
