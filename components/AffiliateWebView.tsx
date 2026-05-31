/**
 * AffiliateWebView — Checkout vía Trainline (lanzamiento rápido)
 *
 * MODELO: WoW TRENES como "Front-End Afiliado Tecnológico"
 *   • Abre Trainline.com dentro de la app (WebView interno = sin salir)
 *   • URL precargada con origen, destino, fecha y nuestro affiliate tag
 *   • Trainline = Merchant of Record → ellos cobran, emiten QR, manejan PCI-DSS
 *   • Awin/CJ trackea la conversión → nosotros recibimos la comisión
 *   • 0 acuerdos B2B necesarios para lanzar
 *
 * UX:
 *   • Se abre como modal de pantalla completa (sin saltar al navegador)
 *   • Barra superior con branding WoW + botón cerrar
 *   • Indicador de carga animado
 *   • Intercepta la URL de confirmación → detecta "SUCCESS" → cierra y notifica
 */
import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Modal,
  Platform,
  SafeAreaView,
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { Colors, Typography, Spacing, Radius, Gradients, Shadows } from '../theme';
import { buildOmioUrl } from '../services/affiliateEngine';
import type { TrainService } from '../types';

// ── Detección de confirmación ─────────────────────────────────────────────
// Trainline redirige a estas URLs tras una compra exitosa
const SUCCESS_URL_PATTERNS = [
  'omio.com/booking/confirmation',
  'omio.com/checkout/confirmation',
  'omio.com/orders/',
  'omio.com/booking-confirmation',
  'trainline.com/booking/confirmation',
  'trainline.com/orders/',
  '/booking-confirmation',
  '/purchase-confirmation',
  'order-confirmed',
];

function isSuccessUrl(url: string): boolean {
  return SUCCESS_URL_PATTERNS.some((p) => url.toLowerCase().includes(p));
}

// ── Inyección JS — pre-rellena datos del pasajero si los tenemos ──────────
function buildInjectScript(passengerHint?: { firstName: string; lastName: string; email: string }): string {
  if (!passengerHint) return '';
  return `
    (function() {
      // Intentar pre-rellenar campos comunes de Trainline
      var attempts = 0;
      var fill = function() {
        attempts++;
        var fn = document.querySelector('[name="firstName"], [autocomplete="given-name"], #firstName');
        var ln = document.querySelector('[name="lastName"],  [autocomplete="family-name"], #lastName');
        var em = document.querySelector('[name="email"],     [autocomplete="email"],       #email, [type="email"]');
        if (fn) fn.value = ${JSON.stringify(passengerHint.firstName)};
        if (ln) ln.value = ${JSON.stringify(passengerHint.lastName)};
        if (em) em.value = ${JSON.stringify(passengerHint.email)};
        if (attempts < 10) setTimeout(fill, 800);
      };
      setTimeout(fill, 1200);
    })();
    true;
  `;
}

// ── Props ─────────────────────────────────────────────────────────────────
interface AffiliateWebViewProps {
  service:        TrainService;
  visible:        boolean;
  onClose:        () => void;
  onPurchaseSuccess: (bookingRef: string) => void;
  passengerHint?: { firstName: string; lastName: string; email: string };
}

export default function AffiliateWebView({
  service,
  visible,
  onClose,
  onPurchaseSuccess,
  passengerHint,
}: AffiliateWebViewProps) {
  const webViewRef    = useRef<WebView>(null);
  const [loading,     setLoading]     = useState(true);
  const [progress,    setProgress]    = useState(0);
  const [affiliateUrl,setAffiliateUrl]= useState<string | null>(null);
  const [canGoBack,   setCanGoBack]   = useState(false);

  // ── Build affiliate URL on open ──────────────────────────────────────
  React.useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setProgress(0);

    // URL TravelPayouts → Omio con marker 734304 (comisión 6%)
    const url = buildOmioUrl(
      service.origin.name,
      service.destination.name,
      service.departureTime,
    );
    setAffiliateUrl(url);
  }, [visible, service]);

  // ── Navigation handler — detect purchase success ─────────────────────
  const handleNavChange = useCallback(
    (nav: WebViewNavigation) => {
      setCanGoBack(nav.canGoBack);

      if (isSuccessUrl(nav.url)) {
        // Extract booking reference from URL if present
        const refMatch = nav.url.match(/orders?\/([\w-]+)/i) ??
                         nav.url.match(/ref=([\w-]+)/i) ??
                         nav.url.match(/confirmation\/([\w-]+)/i);
        const bookingRef = refMatch?.[1] ?? `WOW-${Date.now().toString(36).toUpperCase()}`;

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onPurchaseSuccess(bookingRef);
      }
    },
    [onPurchaseSuccess],
  );

  const handleBack = useCallback(() => {
    if (canGoBack) {
      webViewRef.current?.goBack();
    } else {
      onClose();
    }
  }, [canGoBack, onClose]);

  if (!affiliateUrl) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleBack}
    >
      <SafeAreaView style={styles.root}>

        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          {/* Back / Close */}
          <Pressable
            style={styles.backBtn}
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel={canGoBack ? 'Atrás' : 'Cerrar'}
          >
            <Text style={styles.backIcon}>{canGoBack ? '‹' : '✕'}</Text>
          </Pressable>

          {/* Branding + security badge */}
          <View style={styles.topCenter}>
            <Text style={styles.brandLabel}>
              <Text style={{ color: Colors.brand.glow }}>WoW</Text> TRENES
            </Text>
            <View style={styles.secureBadge}>
              <Text style={styles.secureIcon}>🔒</Text>
              <Text style={styles.secureText}>Pago seguro · Omio</Text>
            </View>
          </View>

          {/* Spacer */}
          <View style={{ width: 44 }} />
        </View>

        {/* ── Progress bar ── */}
        {loading && (
          <View style={styles.progressBar}>
            <LinearGradient
              colors={Gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]}
            />
          </View>
        )}

        {/* ── Service summary strip ── */}
        <View style={styles.serviceBanner}>
          <Text style={styles.serviceBannerText}>
            🚄 {service.operator.toUpperCase()} {service.trainNumber}
            {'  '}
            {service.origin.name}
            {' → '}
            {service.destination.name}
            {'  '}
            {service.departureTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            {service.platform ? `  · Andén ${service.platform}` : ''}
          </Text>
        </View>

        {/* ── WebView ── */}
        {affiliateUrl ? (
          <WebView
            ref={webViewRef}
            source={{ uri: affiliateUrl }}
            style={styles.webview}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={()   => setLoading(false)}
            onLoadProgress={({ nativeEvent }) => setProgress(nativeEvent.progress)}
            onNavigationStateChange={handleNavChange}
            injectedJavaScript={buildInjectScript(passengerHint)}
            // Security — no third-party data exfiltration
            incognito={false}
            thirdPartyCookiesEnabled // Necesario para affiliate tracking
            sharedCookiesEnabled={false}
            // UX
            bounces={false}
            pullToRefreshEnabled={false}
            allowsBackForwardNavigationGestures
            // Allow Trainline payment iframes
            mixedContentMode="compatibility"
            domStorageEnabled
            javaScriptEnabled
            userAgent={
              Platform.OS === 'ios'
                ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
                : 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
            }
          />
        ) : (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={Colors.brand.primary} />
            <Text style={styles.loadingText}>Conectando con Omio…</Text>
          </View>
        )}

        {/* ── Bottom compliance bar ── */}
        <View style={styles.complianceBar}>
          <Text style={styles.complianceText}>
            Pago procesado por Omio · WoW TRENES no almacena datos bancarios
          </Text>
        </View>

      </SafeAreaView>
    </Modal>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg.base },

  topBar: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingHorizontal:Spacing['3'],
    paddingVertical: Spacing['3'],
    borderBottomWidth:1,
    borderBottomColor:Colors.border.subtle,
    backgroundColor: Colors.bg.elevated,
  },
  backBtn: {
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.full,
    backgroundColor: Colors.bg.overlay,
  },
  backIcon: {
    fontSize:   Typography.size.xl,
    color:      Colors.text.secondary,
    fontWeight: Typography.weight.bold,
  },
  topCenter: { flex: 1, alignItems: 'center', gap: 2 },
  brandLabel: {
    fontSize:   Typography.size.sm,
    fontWeight: Typography.weight.black,
    color:      Colors.text.primary,
    letterSpacing: 1,
  },
  secureBadge: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              4,
    paddingVertical:  2,
    paddingHorizontal:8,
    backgroundColor:  'rgba(34,197,94,0.12)',
    borderRadius:     Radius.full,
    borderWidth:      1,
    borderColor:      'rgba(34,197,94,0.3)',
  },
  secureIcon: { fontSize: 10 },
  secureText: {
    fontSize:   Typography.size.xs,
    color:      Colors.status.safe,
    fontWeight: Typography.weight.semibold,
  },

  progressBar: {
    height: 3,
    backgroundColor: Colors.bg.overlay,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },

  serviceBanner: {
    backgroundColor: Colors.bg.surface,
    paddingVertical:  Spacing['2'],
    paddingHorizontal:Spacing['4'],
    borderBottomWidth:1,
    borderBottomColor:Colors.border.subtle,
  },
  serviceBannerText: {
    fontSize:   Typography.size.xs,
    color:      Colors.text.brand,
    fontWeight: Typography.weight.semibold,
    textAlign:  'center',
  },

  webview: { flex: 1 },

  loadingCenter: {
    flex: 1,
    alignItems: 'center', justifyContent: 'center',
    gap: Spacing['4'],
  },
  loadingText: {
    fontSize:  Typography.size.sm,
    color:     Colors.text.secondary,
    marginTop: Spacing['2'],
  },

  complianceBar: {
    paddingVertical:  Spacing['2'],
    paddingHorizontal:Spacing['4'],
    backgroundColor:  Colors.bg.surface,
    borderTopWidth:   1,
    borderTopColor:   Colors.border.subtle,
  },
  complianceText: {
    fontSize:  Typography.size.xs,
    color:     Colors.text.muted,
    textAlign: 'center',
  },
});
