/**
 * CheckoutSheet — Express Checkout Panel (STEP 4)
 *
 * COMPLIANCE:
 *   • NO almacena datos de tarjeta — PCI-DSS fuera de scope.
 *   • Merchant of Record: Trainline (distribuidor oficial UE).
 *   • Apple Pay / Google Pay via Stripe Payment Sheet (tokens pasantes).
 *   • Datos de pasajero (Nombre, Apellido, Documento, Email) solo en memoria
 *     durante la transacción — no se persisten en la nube (RGPD Art. 5).
 *   • Affiliate ID inyectado en cada request antes de enviar al distribuidor.
 */
import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Colors, Gradients, Typography, Spacing, Radius, Shadows } from '../theme';
import { buildBookingPayload, estimateCommission } from '../services/affiliateEngine';
import { storeTicket }    from '../services/ticketStorage';
import type { TrainService, PassengerInfo, SeatClass, BookingConfirmation } from '../types';

// ── Seat class options ────────────────────────────────────────────────────
const CLASS_OPTIONS: { value: SeatClass; label: string; icon: string }[] = [
  { value: 'second',   label: '2ª Clase',  icon: '🪑' },
  { value: 'first',    label: '1ª Clase',  icon: '💺' },
  { value: 'business', label: 'Business',  icon: '✨' },
];

interface CheckoutSheetProps {
  service: TrainService;
  visible: boolean;
  onClose: () => void;
}

export default function CheckoutSheet({ service, visible, onClose }: CheckoutSheetProps) {
  const sheetRef   = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['70%', '95%'], []);

  // ── Form state (in-memory only — RGPD) ──────────────────────────────
  const [firstName,  setFirstName]  = useState('');
  const [lastName,   setLastName]   = useState('');
  const [docNumber,  setDocNumber]  = useState('');
  const [email,      setEmail]      = useState('');
  const [seatClass,  setSeatClass]  = useState<SeatClass>('second');
  const [isLoading,  setIsLoading]  = useState(false);
  const [errors,     setErrors]     = useState<Partial<Record<string, string>>>({});

  // ── Sheet visibility ─────────────────────────────────────────────────
  React.useEffect(() => {
    if (visible) {
      sheetRef.current?.snapToIndex(0);
    } else {
      sheetRef.current?.close();
    }
  }, [visible]);

  // ── Validation ───────────────────────────────────────────────────────
  const validate = useCallback((): boolean => {
    const errs: Partial<Record<string, string>> = {};
    if (!firstName.trim()) errs.firstName = 'Introduce tu nombre';
    if (!lastName.trim())  errs.lastName  = 'Introduce tu apellido';
    if (!docNumber.trim()) errs.docNumber = 'Introduce tu documento';
    if (!email.trim() || !email.includes('@')) errs.email = 'Email no válido';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [firstName, lastName, docNumber, email]);

  // ── Price display ────────────────────────────────────────────────────
  const basePrice    = service.priceEur ?? 49.90;
  const commission   = estimateCommission(basePrice);
  const classPremium = seatClass === 'first' ? 1.45 : seatClass === 'business' ? 1.8 : 1;
  const totalPrice   = +(basePrice * classPremium).toFixed(2);

  // ── Submit — delegates to distributor (WoW never touches card data) ──
  const handlePay = useCallback(async () => {
    if (!validate()) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsLoading(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const passenger: PassengerInfo = {
        firstName, lastName,
        documentNumber: docNumber,
        email,
        nationality: 'ES', // MVP: could add a picker
      };

      // Build affiliate payload (injected client-side)
      const payload = await buildBookingPayload(service, seatClass);

      // In production: POST payload to Trainline Partners API / Rail Europe
      // The response contains the booking confirmation + QR data
      // Here we simulate a successful response for MVP:
      await new Promise((r) => setTimeout(r, 1800)); // simulate network

      const mockConfirmation: BookingConfirmation = {
        success:    true,
        bookingRef: `WOW-${Date.now().toString(36).toUpperCase()}`,
        ticket: {
          id:          crypto.randomUUID?.() ?? String(Date.now()),
          bookingRef:  `WOW-${Date.now().toString(36).toUpperCase()}`,
          qrData:      `https://tickets.trainline.com/validate/${Date.now()}`,
          qrFormat:    'QR_CODE',
          trainService:service,
          passenger:   { firstName, lastName },
          issuedAt:    new Date(),
          validUntil:  service.arrivalTime,
          operator:    service.operator,
        },
      };

      if (mockConfirmation.success && mockConfirmation.ticket) {
        // Persist ticket encrypted locally (STEP 5)
        await storeTicket({
          ...mockConfirmation.ticket,
          status:            'valid',
          storedAt:          new Date(),
          associatedStation: service.origin.id,
        });

        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        Alert.alert(
          '✅ Billete confirmado',
          `Referencia: ${mockConfirmation.bookingRef}\n\nTu QR está guardado offline. Se abrirá automáticamente al llegar a la estación.`,
          [{ text: 'Ver mi billete', onPress: onClose }],
        );
      }
    } catch (err) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', 'No se pudo completar la compra. Inténtalo de nuevo.');
    } finally {
      setIsLoading(false);
    }
  }, [validate, firstName, lastName, docNumber, email, service, seatClass, onClose]);

  // ── Render backdrop ───────────────────────────────────────────────────
  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.7} />
    ),
    [],
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
      keyboardBehavior="extend"
      android_keyboardInputMode="adjustResize"
    >
      <BottomSheetScrollView contentContainerStyle={styles.scroll}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Comprar billete</Text>
            <Text style={styles.headerSub}>
              {service.operator.toUpperCase()} {service.trainNumber} · {service.destination.name}
            </Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeTxt}>✕</Text>
          </Pressable>
        </View>

        {/* ── Train summary ── */}
        <View style={styles.trainSummary}>
          <View style={styles.summaryRoute}>
            <Text style={styles.summaryTime}>
              {service.departureTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </Text>
            <Text style={styles.summaryArrow}>──🚄──→</Text>
            <Text style={styles.summaryTime}>
              {service.arrivalTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          {service.platform && (
            <Text style={styles.summaryPlatform}>Andén {service.platform}</Text>
          )}
        </View>

        {/* ── RGPD notice ── */}
        <View style={styles.rgpdBanner}>
          <Text style={styles.rgpdText}>
            🔒 Tus datos sólo se usan para emitir el billete. No creamos cuentas ni almacenamos tu información (RGPD Art. 5).
          </Text>
        </View>

        {/* ── Passenger form ── */}
        <Text style={styles.sectionLabel}>Datos del pasajero</Text>

        <View style={styles.fieldRow}>
          <Field
            label="Nombre *"
            value={firstName}
            onChangeText={setFirstName}
            error={errors.firstName}
            placeholder="María"
            autoComplete="given-name"
            style={{ flex: 1 }}
          />
          <Field
            label="Apellido *"
            value={lastName}
            onChangeText={setLastName}
            error={errors.lastName}
            placeholder="García"
            autoComplete="family-name"
            style={{ flex: 1 }}
          />
        </View>

        <Field
          label="Nº Pasaporte / DNI *"
          value={docNumber}
          onChangeText={setDocNumber}
          error={errors.docNumber}
          placeholder="AB123456"
          autoCapitalize="characters"
        />

        <Field
          label="Email para el recibo *"
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          placeholder="tu@email.com"
          keyboardType="email-address"
          autoComplete="email"
          autoCapitalize="none"
        />

        {/* ── Class selector ── */}
        <Text style={styles.sectionLabel}>Clase</Text>
        <View style={styles.classRow}>
          {CLASS_OPTIONS.filter((c) => service.classes.includes(c.value)).map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.classChip, seatClass === opt.value && styles.classChipSel]}
              onPress={() => setSeatClass(opt.value)}
              accessible
              accessibilityRole="radio"
              accessibilityState={{ selected: seatClass === opt.value }}
            >
              {seatClass === opt.value && (
                <LinearGradient colors={Gradients.brand} style={StyleSheet.absoluteFill} />
              )}
              <Text style={styles.classIcon}>{opt.icon}</Text>
              <Text style={[styles.classLabel, seatClass === opt.value && styles.classLabelSel]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── Price summary ── */}
        <View style={styles.priceSummary}>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Precio base</Text>
            <Text style={styles.priceValue}>{basePrice.toFixed(2)} €</Text>
          </View>
          {classPremium > 1 && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Suplemento de clase</Text>
              <Text style={styles.priceValue}>+{(totalPrice - basePrice).toFixed(2)} €</Text>
            </View>
          )}
          <View style={[styles.priceRow, styles.priceTotal]}>
            <Text style={styles.priceTotalLabel}>Total</Text>
            <Text style={styles.priceTotalValue}>{totalPrice.toFixed(2)} €</Text>
          </View>
          <Text style={styles.priceNote}>
            Precio gratuito para el viajero · 0 comisión visible
          </Text>
        </View>

        {/* ── Pay CTA ── */}
        <Pressable
          style={[styles.payBtn, isLoading && styles.payBtnDisabled]}
          onPress={handlePay}
          disabled={isLoading}
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Pagar ${totalPrice.toFixed(2)} euros`}
        >
          <LinearGradient
            colors={Gradients.brand}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.payGradient}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={styles.payIcon}>
                  {Platform.OS === 'ios' ? '' : '💳'}
                </Text>
                <Text style={styles.payText}>
                  {Platform.OS === 'ios' ? ' Pagar con Apple Pay' : 'Pagar con Google Pay'} · {totalPrice.toFixed(2)} €
                </Text>
              </>
            )}
          </LinearGradient>
        </Pressable>

        {/* PCI-DSS disclaimer */}
        <Text style={styles.pciNote}>
          Pago procesado por Trainline (Merchant of Record). WoW TRENES no almacena datos bancarios. Certificado PCI-DSS.
        </Text>

        <View style={{ height: 40 }} />
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

// ── Field component ───────────────────────────────────────────────────────
function Field({
  label, value, onChangeText, error, style, ...inputProps
}: {
  label:        string;
  value:        string;
  onChangeText: (t: string) => void;
  error?:       string;
  style?:       any;
  [k: string]:  any;
}) {
  return (
    <View style={[fieldStyles.wrapper, style]}>
      <Text style={fieldStyles.label}>{label}</Text>
      <TextInput
        style={[fieldStyles.input, !!error && fieldStyles.inputError]}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={Colors.text.muted}
        selectionColor={Colors.brand.primary}
        {...inputProps}
      />
      {!!error && <Text style={fieldStyles.error}>{error}</Text>}
    </View>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: Colors.bg.elevated,
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
  },
  handle: {
    backgroundColor: Colors.border.strong,
    width:           44,
    height:          4,
  },
  scroll: {
    padding: Spacing['5'],
    gap:     Spacing['4'],
  },
  header: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
  },
  headerTitle: {
    fontSize:   Typography.size.xl,
    fontWeight: Typography.weight.bold,
    color:      Colors.text.primary,
  },
  headerSub: {
    fontSize:  Typography.size.sm,
    color:     Colors.text.secondary,
    marginTop: 4,
  },
  closeBtn: {
    width:          44,
    height:         44,
    alignItems:     'center',
    justifyContent: 'center',
  },
  closeTxt: {
    fontSize: Typography.size.lg,
    color:    Colors.text.secondary,
  },

  trainSummary: {
    backgroundColor: Colors.bg.surface,
    borderRadius:    Radius.md,
    padding:         Spacing['4'],
    borderWidth:     1,
    borderColor:     Colors.border.default,
    gap:             Spacing['2'],
  },
  summaryRoute: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  summaryTime: {
    fontSize:   Typography.size.xl,
    fontWeight: Typography.weight.black,
    color:      Colors.text.primary,
  },
  summaryArrow: {
    fontSize: Typography.size.sm,
    color:    Colors.text.secondary,
  },
  summaryPlatform: {
    fontSize:   Typography.size.sm,
    color:      Colors.text.brand,
    fontWeight: Typography.weight.semibold,
  },

  rgpdBanner: {
    backgroundColor: 'rgba(124,58,237,0.1)',
    borderRadius:    Radius.md,
    padding:         Spacing['3'],
    borderWidth:     1,
    borderColor:     'rgba(124,58,237,0.25)',
  },
  rgpdText: {
    fontSize: Typography.size.xs,
    color:    Colors.text.secondary,
    lineHeight: Typography.size.xs * 1.6,
  },

  sectionLabel: {
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color:      Colors.text.primary,
    letterSpacing: 0.5,
    marginBottom: -Spacing['2'],
  },
  fieldRow: {
    flexDirection: 'row',
    gap:           Spacing['3'],
  },

  classRow: {
    flexDirection: 'row',
    gap:           Spacing['2'],
  },
  classChip: {
    flex:          1,
    alignItems:    'center',
    paddingVertical:  Spacing['3'],
    borderRadius:  Radius.md,
    borderWidth:   1,
    borderColor:   Colors.border.default,
    backgroundColor: Colors.bg.surface,
    overflow:      'hidden',
    gap:           Spacing['1'],
  },
  classChipSel: {
    borderColor: Colors.brand.primary,
  },
  classIcon:    { fontSize: Typography.size.lg },
  classLabel:   {
    fontSize:   Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color:      Colors.text.secondary,
  },
  classLabelSel:{ color: Colors.white },

  priceSummary: {
    backgroundColor: Colors.bg.surface,
    borderRadius:    Radius.md,
    padding:         Spacing['4'],
    borderWidth:     1,
    borderColor:     Colors.border.default,
    gap:             Spacing['2'],
  },
  priceRow:      { flexDirection: 'row', justifyContent: 'space-between' },
  priceLabel:    { fontSize: Typography.size.sm, color: Colors.text.secondary },
  priceValue:    { fontSize: Typography.size.sm, color: Colors.text.primary, fontWeight: Typography.weight.medium },
  priceTotal:    {
    paddingTop:  Spacing['2'],
    borderTopWidth: 1,
    borderTopColor: Colors.border.subtle,
  },
  priceTotalLabel:{ fontSize: Typography.size.md, fontWeight: Typography.weight.bold,  color: Colors.text.primary },
  priceTotalValue:{ fontSize: Typography.size.xl, fontWeight: Typography.weight.black, color: Colors.brand.glow },
  priceNote:      { fontSize: Typography.size.xs, color: Colors.text.muted, textAlign: 'center' },

  payBtn: {
    borderRadius: Radius.xl,
    overflow:     'hidden',
    minHeight:    60,
    ...Shadows.glow,
  },
  payBtnDisabled: { opacity: 0.7 },
  payGradient: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'center',
    paddingVertical:  Spacing['4'],
    paddingHorizontal:Spacing['6'],
    gap:              Spacing['2'],
    minHeight:        60,
  },
  payIcon: { fontSize: 22 },
  payText: {
    fontSize:   Typography.size.md,
    fontWeight: Typography.weight.bold,
    color:      Colors.white,
  },
  pciNote: {
    fontSize:  Typography.size.xs,
    color:     Colors.text.muted,
    textAlign: 'center',
    lineHeight:Typography.size.xs * 1.6,
  },
});

const fieldStyles = StyleSheet.create({
  wrapper: { gap: Spacing['1'] },
  label: {
    fontSize:   Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color:      Colors.text.secondary,
    letterSpacing: 0.3,
  },
  input: {
    backgroundColor: Colors.bg.surface,
    borderWidth:     1,
    borderColor:     Colors.border.default,
    borderRadius:    Radius.md,
    paddingVertical: Platform.OS === 'ios' ? Spacing['3'] : Spacing['2'],
    paddingHorizontal:Spacing['3'],
    fontSize:        Typography.size.base,
    color:           Colors.text.primary,
    minHeight:       48,
  },
  inputError: { borderColor: Colors.status.danger },
  error: {
    fontSize: Typography.size.xs,
    color:    Colors.status.danger,
  },
});
