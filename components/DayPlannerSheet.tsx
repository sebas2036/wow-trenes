/**
 * DayPlannerSheet — "Un día, una ciudad"
 *
 * FLUJO:
 *   1. Selector de ciudad (horizontal scroll de chips)
 *   2. Selector de fecha (hoy / mañana / picker)
 *   3. Botón "Armar mi día" → llama buildDayPlan()
 *   4. Timeline visual: POI → 🚶 → 🚂 → 🚶 → POI → ...
 *   5. Resumen: nº trenes · coste estimado · primera/última salida
 *   6. CTA por cada tren: "Ver horarios" → split-screen
 *
 * DISEÑO:
 *   - Modal fullscreen estilo pageSheet (iOS) / fullscreen (Android)
 *   - Timeline con línea vertical conectora (estilo rail)
 *   - Colores: brand violet para POI, zinc para walk, azul para tren
 *   - WCAG 2.2 AAA compliant
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Pressable,
} from 'react-native';
import { Animated } from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows, Motion } from '../theme';
import {
  buildDayPlan,
  getAvailableCities,
  formatTime,
  formatDuration,
  type DayPlan,
  type DayStop,
} from '../services/dayPlanner';

// ── Props ─────────────────────────────────────────────────────────────────────
interface DayPlannerSheetProps {
  visible:          boolean;
  initialCity?:     string;
  onClose:          () => void;
  onSelectTrain?:   (originId: string, destId: string) => void;
}

// ── Constantes ────────────────────────────────────────────────────────────────
const CITIES = getAvailableCities();

const TODAY    = new Date();
const TOMORROW = new Date(TODAY.getTime() + 86_400_000);

const DATE_OPTIONS: { label: string; date: Date }[] = [
  { label: 'Hoy',     date: TODAY },
  { label: 'Mañana',  date: TOMORROW },
];

// ── Utilidades de fecha ───────────────────────────────────────────────────────
function formatDate(d: Date): string {
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ── Íconos de tipo de parada ──────────────────────────────────────────────────
function stopIcon(stop: DayStop): string {
  if (stop.type === 'poi')   return categoryIcon(stop.poi?.category ?? 'other');
  if (stop.type === 'train') return '🚂';
  return '🚶';
}

function categoryIcon(cat: string): string {
  const map: Record<string, string> = {
    museum: '🏛️', gallery: '🖼️', monument: '🗿', church: '⛪',
    palace: '🏰', park: '🌿', beach: '🏖️', square: '🏙️',
    market: '🛒', stadium: '🏟️', viewpoint: '🔭', district: '🗺️',
    airport: '✈️', other: '📍',
  };
  return map[cat] ?? '📍';
}

// ── Colores por tipo de parada ────────────────────────────────────────────────
function stopColor(stop: DayStop): string {
  if (stop.type === 'poi')   return Colors.brand.glow;
  if (stop.type === 'train') return '#3B82F6'; // blue-500
  return Colors.text.muted;
}

// ── Componente: chip de ciudad ────────────────────────────────────────────────
function CityChip({ city, selected, onPress }: {
  city: string; selected: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.cityChip, selected && styles.cityChipSelected]}
      onPress={onPress}
      accessibilityLabel={`Ciudad ${city}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.cityChipText, selected && styles.cityChipTextSelected]}>
        {city}
      </Text>
    </TouchableOpacity>
  );
}

// ── Componente: chip de fecha ─────────────────────────────────────────────────
function DateChip({ label, date, selected, onPress }: {
  label: string; date: Date; selected: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.dateChip, selected && styles.dateChipSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.dateChipLabel, selected && styles.dateChipLabelSelected]}>
        {label}
      </Text>
      <Text style={[styles.dateChipDate, selected && styles.dateChipDateSelected]}>
        {formatDate(date)}
      </Text>
    </TouchableOpacity>
  );
}

// ── Componente: parada POI ────────────────────────────────────────────────────
function POIStop({ stop }: { stop: DayStop }) {
  const poi = stop.poi!;
  return (
    <View style={styles.stopRow}>
      {/* Dot + line */}
      <View style={styles.timelineCol}>
        <View style={[styles.dot, { backgroundColor: Colors.brand.glow }]} />
        <View style={styles.lineSegment} />
      </View>

      {/* Content */}
      <View style={styles.stopContent}>
        <View style={styles.stopHeader}>
          <Text style={styles.stopIcon}>{categoryIcon(poi.category)}</Text>
          <View style={styles.stopTitleWrap}>
            <Text style={styles.stopTitle} numberOfLines={1}>{poi.name}</Text>
            {poi.nameLocal !== poi.name && (
              <Text style={styles.stopSubtitle} numberOfLines={1}>{poi.nameLocal}</Text>
            )}
          </View>
          <Text style={styles.stopTime}>{formatTime(stop.arriveAt)}</Text>
        </View>

        <View style={styles.stopMeta}>
          <View style={styles.metaChip}>
            <Text style={styles.metaText}>⏱ {formatDuration(stop.visitMinutes ?? 45)}</Text>
          </View>
          <View style={styles.metaChip}>
            <Text style={styles.metaText}>🚶 {stop.poi?.nearestStation.walkMinutes ?? '?'} min estación</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Componente: parada TREN ───────────────────────────────────────────────────
function TrainStop({ stop, onPress }: { stop: DayStop; onPress?: () => void }) {
  const train = stop.train!;
  const delayMin = train.delayMinutes ?? 0;

  return (
    <View style={styles.stopRow}>
      {/* Dot + line */}
      <View style={styles.timelineCol}>
        <View style={[styles.dot, { backgroundColor: '#3B82F6' }]} />
        <View style={styles.lineSegment} />
      </View>

      {/* Content */}
      <TouchableOpacity
        style={styles.trainCard}
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole="button"
        accessibilityLabel={`Tren ${train.trainNumber} a ${train.destination.name}`}
      >
        <View style={styles.trainHeader}>
          <Text style={styles.trainIcon}>🚂</Text>
          <View style={styles.trainInfo}>
            <Text style={styles.trainNumber}>{train.trainNumber}</Text>
            <Text style={styles.trainRoute} numberOfLines={1}>
              {train.origin.name} → {train.destination.name}
            </Text>
          </View>
          <View style={styles.trainTimes}>
            <Text style={styles.trainDep}>{formatTime(train.departureTime)}</Text>
            <Text style={styles.trainArr}>{formatTime(train.arrivalTime)}</Text>
          </View>
        </View>

        {delayMin > 0 && (
          <View style={styles.delayBadge}>
            <Text style={styles.delayText}>+{delayMin} min retraso</Text>
          </View>
        )}

        {onPress && (
          <View style={styles.trainCTA}>
            <Text style={styles.trainCTAText}>Ver y comprar →</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ── Componente: parada CAMINATA ───────────────────────────────────────────────
function WalkStop({ stop }: { stop: DayStop }) {
  return (
    <View style={styles.stopRow}>
      {/* Dot + line */}
      <View style={styles.timelineCol}>
        <View style={[styles.dot, styles.dotSmall, { backgroundColor: Colors.text.muted }]} />
        <View style={[styles.lineSegment, styles.lineSegmentDashed]} />
      </View>

      {/* Content */}
      <View style={styles.walkContent}>
        <Text style={styles.walkText}>
          🚶 {stop.walkMinutes} min · {stop.fromName} → {stop.toName}
        </Text>
      </View>
    </View>
  );
}

// ── Componente: resumen del plan ──────────────────────────────────────────────
function PlanSummary({ plan }: { plan: DayPlan }) {
  return (
    <View style={styles.summaryBar}>
      <SummaryCell icon="🚂" value={String(plan.totalTrains)} label="trenes" />
      <View style={styles.summaryDivider} />
      <SummaryCell icon="💶" value={`~€${plan.estCostEur}`} label="estimado" />
      <View style={styles.summaryDivider} />
      <SummaryCell icon="🕘" value={formatTime(plan.firstTrain ?? undefined)} label="1er tren" />
      <View style={styles.summaryDivider} />
      <SummaryCell icon="🌙" value={formatTime(plan.lastTrain ?? undefined)} label="último" />
    </View>
  );
}

function SummaryCell({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryCellIcon}>{icon}</Text>
      <Text style={styles.summaryCellValue}>{value}</Text>
      <Text style={styles.summaryCellLabel}>{label}</Text>
    </View>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function DayPlannerSheet({
  visible,
  initialCity,
  onClose,
  onSelectTrain,
}: DayPlannerSheetProps) {
  const [selectedCity,    setSelectedCity]    = useState<string>(initialCity ?? CITIES[0] ?? '');
  const [selectedDateIdx, setSelectedDateIdx] = useState<number>(0);
  const [plan,            setPlan]            = useState<DayPlan | null>(null);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const handleBuild = useCallback(async () => {
    if (!selectedCity) return;
    setLoading(true);
    setError(null);
    setPlan(null);

    try {
      const result = await buildDayPlan(selectedCity, DATE_OPTIONS[selectedDateIdx].date);
      setPlan(result);

      // Fade in the plan
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: Motion.normal,
        useNativeDriver: true,
      }).start();
    } catch (e) {
      setError('No se pudo armar el itinerario. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [selectedCity, selectedDateIdx, fadeAnim]);

  const handleTrainPress = useCallback((stop: DayStop) => {
    if (!stop.train || !onSelectTrain) return;
    onSelectTrain(stop.train.origin.id, stop.train.destination.id);
    onClose();
  }, [onSelectTrain, onClose]);

  const handleCityChange = (city: string) => {
    setSelectedCity(city);
    setPlan(null);
    fadeAnim.setValue(0);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
          <View style={styles.headerTitle}>
            <Text style={styles.title}>🗓 Un día, una ciudad</Text>
            <Text style={styles.subtitle}>Itinerario ferroviario completo</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Ciudad ── */}
          <Text style={styles.sectionLabel}>CIUDAD</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {CITIES.map(city => (
              <CityChip
                key={city}
                city={city}
                selected={city === selectedCity}
                onPress={() => handleCityChange(city)}
              />
            ))}
          </ScrollView>

          {/* ── Fecha ── */}
          <Text style={styles.sectionLabel}>FECHA</Text>
          <View style={styles.dateRow}>
            {DATE_OPTIONS.map((opt, i) => (
              <DateChip
                key={opt.label}
                label={opt.label}
                date={opt.date}
                selected={i === selectedDateIdx}
                onPress={() => {
                  setSelectedDateIdx(i);
                  setPlan(null);
                  fadeAnim.setValue(0);
                }}
              />
            ))}
          </View>

          {/* ── CTA ── */}
          <TouchableOpacity
            style={[styles.buildBtn, loading && styles.buildBtnDisabled]}
            onPress={handleBuild}
            disabled={loading || !selectedCity}
            accessibilityRole="button"
            accessibilityLabel="Armar mi itinerario"
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <Text style={styles.buildBtnText}>
                {plan ? '🔄 Regenerar' : '✨ Armar mi día'}
              </Text>
            )}
          </TouchableOpacity>

          {/* ── Error ── */}
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* ── Plan ── */}
          {plan && (
            <Animated.View style={{ opacity: fadeAnim }}>

              {/* Resumen */}
              <PlanSummary plan={plan} />

              {/* Timeline */}
              <Text style={styles.sectionLabel}>ITINERARIO</Text>
              <View style={styles.timeline}>
                {plan.stops.length === 0 ? (
                  <Text style={styles.emptyText}>
                    No hay POIs disponibles para {selectedCity} todavía.
                  </Text>
                ) : (
                  plan.stops.map((stop, i) => {
                    if (stop.type === 'poi')   return <POIStop   key={i} stop={stop} />;
                    if (stop.type === 'train') return <TrainStop key={i} stop={stop} onPress={onSelectTrain ? () => handleTrainPress(stop) : undefined} />;
                    return <WalkStop key={i} stop={stop} />;
                  })
                )}
              </View>

              {/* Nota legal */}
              <Text style={styles.legalNote}>
                * Horarios estimados · Precios orientativos · Sujeto a disponibilidad real en Trainline
              </Text>

            </Animated.View>
          )}

          {/* Extra padding at bottom */}
          <View style={{ height: Spacing['10'] }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.base,
  },

  // ── Header ──
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingTop:     Platform.OS === 'ios' ? 16 : 48,
    paddingHorizontal: Spacing['4'],
    paddingBottom:  Spacing['4'],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  closeBtn: {
    width:           44,
    height:          44,
    borderRadius:    Radius.full,
    backgroundColor: Colors.bg.overlay,
    alignItems:      'center',
    justifyContent:  'center',
    marginRight:     Spacing['3'],
  },
  closeBtnText: {
    color:    Colors.text.secondary,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
  },
  headerTitle: {
    flex: 1,
  },
  title: {
    color:      Colors.text.primary,
    fontSize:   Typography.size.lg,
    fontWeight: Typography.weight.bold,
  },
  subtitle: {
    color:    Colors.text.secondary,
    fontSize: Typography.size.sm,
    marginTop: 2,
  },

  // ── Scroll ──
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing['4'],
    paddingTop: Spacing['5'],
  },

  sectionLabel: {
    color:        Colors.text.muted,
    fontSize:     Typography.size.xs,
    fontWeight:   Typography.weight.semibold,
    letterSpacing: 1.5,
    marginBottom: Spacing['2'],
    marginTop:    Spacing['5'],
  },

  // ── City chips ──
  chipRow: {
    flexDirection: 'row',
    gap:           Spacing['2'],
    paddingRight:  Spacing['4'],
  },
  cityChip: {
    paddingHorizontal: Spacing['4'],
    paddingVertical:   Spacing['2'],
    borderRadius:      Radius.full,
    backgroundColor:   Colors.bg.elevated,
    borderWidth:       1,
    borderColor:       Colors.border.default,
  },
  cityChipSelected: {
    backgroundColor: Colors.brand.primary,
    borderColor:     Colors.brand.glow,
    ...Shadows.glow,
  },
  cityChipText: {
    color:      Colors.text.secondary,
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.medium,
  },
  cityChipTextSelected: {
    color: Colors.white,
  },

  // ── Date chips ──
  dateRow: {
    flexDirection: 'row',
    gap:           Spacing['3'],
  },
  dateChip: {
    flex:              1,
    paddingVertical:   Spacing['3'],
    paddingHorizontal: Spacing['4'],
    borderRadius:      Radius.md,
    backgroundColor:   Colors.bg.elevated,
    borderWidth:       1,
    borderColor:       Colors.border.default,
    alignItems:        'center',
  },
  dateChipSelected: {
    backgroundColor: Colors.brand.primary,
    borderColor:     Colors.brand.glow,
  },
  dateChipLabel: {
    color:      Colors.text.secondary,
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.semibold,
  },
  dateChipLabelSelected: {
    color: Colors.white,
  },
  dateChipDate: {
    color:    Colors.text.muted,
    fontSize: Typography.size.xs,
    marginTop: 2,
  },
  dateChipDateSelected: {
    color: 'rgba(255,255,255,0.75)',
  },

  // ── Build button ──
  buildBtn: {
    marginTop:     Spacing['5'],
    paddingVertical: Spacing['4'],
    borderRadius:  Radius.lg,
    backgroundColor: Colors.brand.primary,
    alignItems:    'center',
    justifyContent:'center',
    minHeight:     52,
    ...Shadows.glow,
  },
  buildBtnDisabled: {
    opacity: 0.6,
  },
  buildBtnText: {
    color:      Colors.white,
    fontSize:   Typography.size.md,
    fontWeight: Typography.weight.bold,
  },

  // ── Error ──
  errorBox: {
    marginTop:       Spacing['4'],
    padding:         Spacing['4'],
    borderRadius:    Radius.md,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth:     1,
    borderColor:     'rgba(239,68,68,0.3)',
  },
  errorText: {
    color:    Colors.status.danger,
    fontSize: Typography.size.sm,
  },

  // ── Summary bar ──
  summaryBar: {
    marginTop:       Spacing['5'],
    flexDirection:   'row',
    backgroundColor: Colors.bg.elevated,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border.default,
    overflow:        'hidden',
  },
  summaryCell: {
    flex:           1,
    alignItems:     'center',
    paddingVertical: Spacing['4'],
    gap:             2,
  },
  summaryCellIcon: {
    fontSize: Typography.size.md,
  },
  summaryCellValue: {
    color:      Colors.text.primary,
    fontSize:   Typography.size.base,
    fontWeight: Typography.weight.bold,
  },
  summaryCellLabel: {
    color:    Colors.text.muted,
    fontSize: Typography.size.xs,
  },
  summaryDivider: {
    width:           1,
    marginVertical:  Spacing['3'],
    backgroundColor: Colors.border.subtle,
  },

  // ── Timeline ──
  timeline: {
    marginTop: Spacing['2'],
  },
  stopRow: {
    flexDirection: 'row',
    minHeight:     60,
  },
  timelineCol: {
    width:      32,
    alignItems: 'center',
  },
  dot: {
    width:        12,
    height:       12,
    borderRadius: Radius.full,
    marginTop:    12,
    zIndex:       1,
  },
  dotSmall: {
    width:  8,
    height: 8,
    marginTop: 14,
  },
  lineSegment: {
    flex:            1,
    width:           2,
    backgroundColor: Colors.border.default,
    marginTop:       2,
    marginBottom:    0,
  },
  lineSegmentDashed: {
    backgroundColor: Colors.transparent,
    borderLeftWidth: 2,
    borderLeftColor: Colors.border.subtle,
    borderStyle:     'dashed',
  },

  // ── POI stop ──
  stopContent: {
    flex:            1,
    paddingLeft:     Spacing['3'],
    paddingVertical: Spacing['3'],
    paddingBottom:   Spacing['4'],
  },
  stopHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing['2'],
  },
  stopIcon: {
    fontSize: Typography.size.md,
  },
  stopTitleWrap: {
    flex: 1,
  },
  stopTitle: {
    color:      Colors.text.primary,
    fontSize:   Typography.size.base,
    fontWeight: Typography.weight.semibold,
  },
  stopSubtitle: {
    color:    Colors.text.secondary,
    fontSize: Typography.size.xs,
    marginTop: 1,
  },
  stopTime: {
    color:      Colors.brand.glow,
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.bold,
    fontVariant: ['tabular-nums'],
  },
  stopMeta: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           Spacing['2'],
    marginTop:     Spacing['2'],
  },
  metaChip: {
    paddingHorizontal: Spacing['2'],
    paddingVertical:   2,
    borderRadius:      Radius.sm,
    backgroundColor:   Colors.bg.overlay,
  },
  metaText: {
    color:    Colors.text.muted,
    fontSize: Typography.size.xs,
  },

  // ── Train stop ──
  trainCard: {
    flex:            1,
    marginLeft:      Spacing['3'],
    marginVertical:  Spacing['2'],
    marginBottom:    Spacing['4'],
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderRadius:    Radius.md,
    borderWidth:     1,
    borderColor:     'rgba(59,130,246,0.25)',
    padding:         Spacing['3'],
  },
  trainHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing['2'],
  },
  trainIcon: {
    fontSize: Typography.size.md,
  },
  trainInfo: {
    flex: 1,
  },
  trainNumber: {
    color:      Colors.text.primary,
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.bold,
  },
  trainRoute: {
    color:    Colors.text.secondary,
    fontSize: Typography.size.xs,
    marginTop: 2,
  },
  trainTimes: {
    alignItems: 'flex-end',
  },
  trainDep: {
    color:      '#3B82F6',
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.bold,
    fontVariant: ['tabular-nums'],
  },
  trainArr: {
    color:    Colors.text.muted,
    fontSize: Typography.size.xs,
    fontVariant: ['tabular-nums'],
  },
  delayBadge: {
    marginTop:       Spacing['2'],
    alignSelf:       'flex-start',
    paddingHorizontal: Spacing['2'],
    paddingVertical:   2,
    borderRadius:    Radius.sm,
    backgroundColor: 'rgba(234,179,8,0.15)',
    borderWidth:     1,
    borderColor:     'rgba(234,179,8,0.3)',
  },
  delayText: {
    color:    Colors.status.warn,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
  },
  trainCTA: {
    marginTop: Spacing['2'],
    alignItems: 'flex-end',
  },
  trainCTAText: {
    color:      Colors.brand.glow,
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.semibold,
  },

  // ── Walk stop ──
  walkContent: {
    flex:            1,
    paddingLeft:     Spacing['3'],
    paddingVertical: Spacing['1'],
    justifyContent: 'center',
  },
  walkText: {
    color:    Colors.text.muted,
    fontSize: Typography.size.sm,
  },

  // ── Empty / legal ──
  emptyText: {
    color:    Colors.text.secondary,
    fontSize: Typography.size.sm,
    textAlign: 'center',
    marginTop: Spacing['6'],
  },
  legalNote: {
    color:    Colors.text.muted,
    fontSize: Typography.size.xs,
    textAlign: 'center',
    marginTop: Spacing['6'],
    lineHeight: Typography.size.xs * Typography.lineHeight.loose,
  },
});
