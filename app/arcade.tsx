/**
 * app/arcade.tsx — "Tren Escapista" 🚂
 *
 * Snake clásico (la viborita del Nokia) pero el cuerpo es un TREN: la locomotora
 * avanza por las vías levantando estaciones y va sumando vagones. Choca contra la
 * pared o contra sí mismo → descarrila. Entretenimiento mientras esperás el tren.
 *
 * Sin dependencias nuevas. No toca nada de la lógica de la app.
 */
import React, { useState, useEffect, useRef, useReducer, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Shadows } from '../theme';
import { hImpact, hSelection, ImpactStyle } from '../services/haptics';

const COLS = 14;
const ROWS = 18;
const CELL = Math.floor((Math.min(Dimensions.get('window').width, 460) - 36) / COLS);
const HIGH_KEY = '@arcade_tren_high';

type Cell = { x: number; y: number };
const DIRS = {
  up:    { x: 0, y: -1 },
  down:  { x: 0, y: 1 },
  left:  { x: -1, y: 0 },
  right: { x: 1, y: 0 },
} as const;
type DirName = keyof typeof DIRS;

const INITIAL_SNAKE: Cell[] = [{ x: 7, y: 10 }, { x: 6, y: 10 }, { x: 5, y: 10 }];

function randomFood(snake: Cell[]): Cell {
  while (true) {
    const f = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    if (!snake.some(s => s.x === f.x && s.y === f.y)) return f;
  }
}

export default function ArcadeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const snakeRef = useRef<Cell[]>([...INITIAL_SNAKE]);
  const dirRef   = useRef<Cell>(DIRS.right);
  const nextDir  = useRef<Cell>(DIRS.right); // dirección encolada (evita doble giro en un tick)
  const foodRef  = useRef<Cell>(randomFood(INITIAL_SNAKE));
  const scoreRef = useRef(0);
  const [, render] = useReducer((x: number) => x + 1, 0);

  const [score, setScore]       = useState(0);
  const [high, setHigh]         = useState(0);
  const [running, setRunning]   = useState(false);
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(HIGH_KEY).then(v => { if (v) setHigh(parseInt(v, 10) || 0); }).catch(() => {});
  }, []);

  const endGame = useCallback(() => {
    hImpact(ImpactStyle.Heavy);
    setRunning(false);
    setGameOver(true);
    setHigh(h => {
      if (scoreRef.current > h) {
        AsyncStorage.setItem(HIGH_KEY, String(scoreRef.current)).catch(() => {});
        return scoreRef.current;
      }
      return h;
    });
  }, []);

  const step = useCallback(() => {
    dirRef.current = nextDir.current;
    const head = snakeRef.current[0];
    const nh: Cell = { x: head.x + dirRef.current.x, y: head.y + dirRef.current.y };

    if (nh.x < 0 || nh.x >= COLS || nh.y < 0 || nh.y >= ROWS) return endGame();
    if (snakeRef.current.some(s => s.x === nh.x && s.y === nh.y)) return endGame();

    const grew = nh.x === foodRef.current.x && nh.y === foodRef.current.y;
    const newSnake = [nh, ...snakeRef.current];
    if (grew) {
      scoreRef.current += 1;
      setScore(scoreRef.current);
      hSelection();
      foodRef.current = randomFood(newSnake);
    } else {
      newSnake.pop();
    }
    snakeRef.current = newSnake;
    render();
  }, [endGame]);

  // Velocidad: arranca tranquilo y acelera de a poco con el puntaje
  const speed = Math.max(120, 260 - score * 5);
  useEffect(() => {
    if (!running || gameOver) return;
    const id = setInterval(step, speed);
    return () => clearInterval(id);
  }, [running, gameOver, speed, step]);

  const start = useCallback(() => {
    snakeRef.current = [...INITIAL_SNAKE];
    dirRef.current = DIRS.right;
    nextDir.current = DIRS.right;
    foodRef.current = randomFood(INITIAL_SNAKE);
    scoreRef.current = 0;
    setScore(0);
    setGameOver(false);
    setRunning(true);
    render();
  }, []);

  const turn = useCallback((d: DirName) => {
    const nd = DIRS[d];
    const cur = dirRef.current;
    if (nd.x === -cur.x && nd.y === -cur.y) return; // no se puede ir en reversa
    nextDir.current = nd;
    hSelection();
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.title}>Tren Escapista 🚂</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={styles.scoreRow}>
        <Text style={styles.scoreText}>Vagones: <Text style={styles.scoreNum}>{score}</Text></Text>
        <Text style={styles.scoreText}>Récord: <Text style={styles.scoreNum}>{high}</Text></Text>
      </View>

      {/* Tablero (vías) */}
      <View style={styles.boardWrap}>
        <View style={[styles.board, { width: COLS * CELL, height: ROWS * CELL }]}>
          {/* Estación (comida) */}
          <View style={[styles.food, { left: foodRef.current.x * CELL, top: foodRef.current.y * CELL }]} />
          {/* Tren: locomotora (cabeza) + vagones */}
          {snakeRef.current.map((s, i) => (
            i === 0 ? (
              <View
                key="loco"
                style={{ position: 'absolute', left: s.x * CELL, top: s.y * CELL, width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: CELL + 2, transform: [{ scaleX: dirRef.current.x > 0 ? -1 : 1 }] }}>🚂</Text>
              </View>
            ) : (
              <View
                key={`v-${s.x}-${s.y}-${i}`}
                style={{ position: 'absolute', left: s.x * CELL, top: s.y * CELL, width: CELL - 2, height: CELL - 2, margin: 1, borderRadius: 5, backgroundColor: '#7C3AED' }}
              />
            )
          ))}

          {/* Overlays */}
          {!running && !gameOver && (
            <Pressable style={styles.overlay} onPress={start}>
              <Text style={styles.overlayEmoji}>🚂</Text>
              <Text style={styles.overlayTitle}>Tren Escapista</Text>
              <Text style={styles.overlaySub}>Levantá estaciones y sumá vagones.{'\n'}No choques las vías ni a vos mismo.</Text>
              <View style={styles.playBtn}><Ionicons name="play" size={18} color="#fff" /><Text style={styles.playText}>Empezar</Text></View>
            </Pressable>
          )}
          {gameOver && (
            <View style={styles.overlay}>
              <Text style={styles.overlayEmoji}>💥</Text>
              <Text style={styles.overlayTitle}>¡Descarrilaste!</Text>
              <Text style={styles.overlaySub}>{score} vagones{score >= high && score > 0 ? '  ·  ¡Nuevo récord! 🏆' : ''}</Text>
              <Pressable style={styles.playBtn} onPress={start}>
                <Ionicons name="refresh" size={18} color="#fff" /><Text style={styles.playText}>Jugar de nuevo</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {/* Controles (D-pad) */}
      <View style={styles.dpad}>
        <Pressable style={styles.dBtn} onPress={() => turn('up')}><Ionicons name="chevron-up" size={30} color="#fff" /></Pressable>
        <View style={styles.dRow}>
          <Pressable style={styles.dBtn} onPress={() => turn('left')}><Ionicons name="chevron-back" size={30} color="#fff" /></Pressable>
          <View style={styles.dGap} />
          <Pressable style={styles.dBtn} onPress={() => turn('right')}><Ionicons name="chevron-forward" size={30} color="#fff" /></Pressable>
        </View>
        <Pressable style={styles.dBtn} onPress={() => turn('down')}><Ionicons name="chevron-down" size={30} color="#fff" /></Pressable>
      </View>
    </View>
  );
}

const PURPLE = '#8B5CF6';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0820', alignItems: 'center' },
  header: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  backBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  title: { fontSize: 18, fontWeight: '800', color: '#fff' },

  scoreRow: { flexDirection: 'row', gap: 28, marginTop: 8, marginBottom: 12 },
  scoreText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' },
  scoreNum: { color: '#C4B5FD', fontWeight: '800' },

  boardWrap: { flex: 1, justifyContent: 'center', marginVertical: 14 },
  board: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(139,92,246,0.30)', overflow: 'hidden' },
  food: { position: 'absolute', width: CELL - 2, height: CELL - 2, margin: 1, borderRadius: CELL, backgroundColor: '#FCD34D', ...Shadows.glow, shadowColor: '#FCD34D' },

  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,8,32,0.92)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  overlayEmoji: { fontSize: 48, marginBottom: 6 },
  overlayTitle: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 6 },
  overlaySub: { fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 20, marginBottom: 18 },
  playBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: PURPLE, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24, ...Shadows.glow },
  playText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  dpad: { alignItems: 'center', marginTop: 6, marginBottom: 6 },
  dRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  dGap: { width: 104 },
  dBtn: { width: 66, height: 58, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,92,246,0.22)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.45)', borderRadius: 14, margin: 4 },
});
