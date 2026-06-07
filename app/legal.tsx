/**
 * WoW Train — Pantalla Legal
 * FAQ · Términos y Condiciones · Privacidad · Seguridad
 * Cumple requisitos de Apple App Store y Google Play Store.
 */
import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { LinearGradient } from 'expo-linear-gradient';
import { Radius } from '../theme';
import { useTheme } from '../context/ThemeContext';

// ── Contenido ────────────────────────────────────────────────────────────────

const CONTENT: Record<string, { title: string; sections: { heading: string; body: string }[] }> = {

  faq: {
    title: 'Preguntas Frecuentes',
    sections: [
      {
        heading: '¿Qué es WoW Train?',
        body: 'WoW Train es una app de viajes en tren que te permite explorar horarios, encontrar estaciones cercanas y comprar billetes de tren en más de 13 países de Europa y América. Funciona sin crear una cuenta.',
      },
      {
        heading: '¿Necesito registrarme?',
        body: 'No. WoW Train no requiere cuenta de usuario ni contraseña. La app funciona de forma completamente anónima. Tus favoritos y billetes se guardan solo en tu teléfono.',
      },
      {
        heading: '¿Cómo compro un billete?',
        body: 'Seleccioná el país o ciudad, elegí tu tren y tocá "Comprar". Serás redirigido a Trainline o Rail Europe, operadores certificados que gestionan el pago de forma segura. WoW Train nunca toca ni procesa tu tarjeta.',
      },
      {
        heading: '¿Los datos de horarios son en tiempo real?',
        body: 'Los horarios base se obtienen de fuentes GTFS oficiales de cada operador (Renfe, SNCF, SBB, DB, etc.). Las alertas de posición en tiempo real dependen de la disponibilidad de la API del operador para cada país.',
      },
      {
        heading: '¿Qué países están disponibles?',
        body: 'España (Renfe/AVE), Francia (TGV·SNCF), Alemania (ICE·DB), Suiza (SBB), Italia (Frecciarossa), Países Bajos (NS), Austria (ÖBB), Noruega, Portugal, Bélgica, Reino Unido, USA (Amtrak) y Japón (Shinkansen). Metros urbanos: Nueva York, Madrid, Londres, Chicago y Los Ángeles.',
      },
      {
        heading: '¿La app es gratuita?',
        body: 'Sí, la app es gratuita. WoW Train es un afiliado tecnológico de Trainline y Rail Europe. Podemos cobrar una comisión sobre los billetes vendidos, sin costo adicional para el usuario.',
      },
      {
        heading: '¿Dónde se guardan mis billetes?',
        body: 'Los billetes QR se almacenan de forma cifrada directamente en tu teléfono mediante el almacenamiento seguro del sistema operativo. No se sincronizan con ningún servidor.',
      },
      {
        heading: '¿Cómo funciona la detección GPS?',
        body: 'El botón "Usar mi ubicación" solicita acceso a tu ubicación para encontrar las estaciones de tren más cercanas. La ubicación se usa solo en el momento de la búsqueda y no se almacena ni se envía a servidores.',
      },
      {
        heading: '¿Cómo contacto con soporte?',
        body: 'Podés reportar problemas desde Ajustes → "Reportar un problema" o escribirnos a Glosx@outlook.com. Respondemos en un plazo de 48 horas hábiles.',
      },
    ],
  },

  terms: {
    title: 'Términos y Condiciones',
    sections: [
      {
        heading: '1. Aceptación',
        body: 'Al descargar o usar WoW Train ("la App") aceptás estos Términos y Condiciones. Si no estás de acuerdo, no uses la App.',
      },
      {
        heading: '2. Descripción del servicio',
        body: 'WoW Train es una aplicación de información ferroviaria y plataforma de afiliación tecnológica. Facilita el acceso a horarios GTFS públicos y redirige a operadores certificados (Trainline, Rail Europe) para la compra de billetes.',
      },
      {
        heading: '3. Relación de afiliación',
        body: 'WoW Train actúa exclusivamente como "Front-End Afiliado Tecnológico". Trainline Ltd. y Rail Europe SAS actúan como Merchant of Record (MoR) en todas las transacciones. WoW Train no es parte de ningún contrato de transporte ni de compraventa de billetes.',
      },
      {
        heading: '4. Exactitud de la información',
        body: 'Los horarios se basan en datos GTFS oficiales. WoW Train no garantiza la exactitud en tiempo real de horarios, precios ni disponibilidad de plazas. Los datos pueden diferir de los publicados por los operadores ferroviarios.',
      },
      {
        heading: '5. Limitación de responsabilidad',
        body: 'WoW Train no es responsable por pérdidas, daños o gastos derivados del uso de la App, incluyendo trenes perdidos, cambios de horario o problemas con los billetes adquiridos a través de terceros.',
      },
      {
        heading: '6. Propiedad intelectual',
        body: 'Todo el contenido, diseño y código de WoW Train son propiedad de sus desarrolladores. Los datos GTFS son propiedad de los respectivos operadores ferroviarios y se usan bajo licencias públicas.',
      },
      {
        heading: '7. Cambios en los términos',
        body: 'Podemos actualizar estos Términos en cualquier momento. Notificaremos cambios significativos a través de la App. El uso continuado implica la aceptación de los términos actualizados.',
      },
      {
        heading: '8. Legislación aplicable',
        body: 'Estos términos se rigen por la legislación española y de la Unión Europea. Cualquier disputa se someterá a los juzgados competentes de España.',
      },
    ],
  },

  privacy: {
    title: 'Política de Privacidad',
    sections: [
      {
        heading: 'Resumen',
        body: 'WoW Train no recoge, almacena ni comparte datos personales en servidores propios. No hay cuentas de usuario. No hay seguimiento publicitario. No hay perfiles en la nube.',
      },
      {
        heading: 'Datos que NO recopilamos',
        body: 'No recopilamos: nombre, email, contraseña, número de tarjeta, dirección postal, historial de viajes, datos de localización persistentes, ni identificadores de dispositivo enviados a servidores.',
      },
      {
        heading: 'Datos que permanecen en tu dispositivo',
        body: 'La app almacena localmente: favoritos de países (lista de códigos), billetes QR adquiridos (cifrados con expo-secure-store) y preferencias de la app (notificaciones, haptics). Todo en tu teléfono, nada en la nube.',
      },
      {
        heading: 'Ubicación',
        body: 'La ubicación GPS se solicita solo cuando usás "Usar mi ubicación". Se usa exclusivamente para encontrar estaciones cercanas en ese momento. No se almacena, no se envía a servidores y no se usa en segundo plano sin tu consentimiento.',
      },
      {
        heading: 'Pagos',
        body: 'Los pagos se procesan íntegramente por Trainline Ltd. o Rail Europe SAS (Merchant of Record). WoW Train nunca recibe, toca ni almacena datos de tarjeta de crédito o débito. Cumplimiento PCI-DSS delegado completamente al MoR.',
      },
      {
        heading: 'Datos del pasajero en checkout',
        body: 'Nombre, documento y email del pasajero se ingresan directamente en el formulario del operador (Trainline/Rail Europe) y se mantienen en RAM solo durante la transacción. No se persisten en la App ni en servidores propios.',
      },
      {
        heading: 'Terceros',
        body: 'La App puede usar expo-location (acceso a GPS del SO), expo-notifications (notificaciones del sistema) y expo-haptics (vibración). No se integran SDKs de publicidad, analytics ni redes sociales.',
      },
      {
        heading: 'Derechos RGPD (Art. 5 y siguientes)',
        body: 'Como no almacenamos datos personales en servidores propios, no hay datos que solicitar, rectificar ni eliminar. Los datos en tu dispositivo podés borrarlos desinstalando la App. Para cualquier consulta: Glosx@outlook.com.',
      },
      {
        heading: 'Menores de edad',
        body: 'La App no está dirigida a menores de 13 años. No recopilamos conscientemente información de menores. Si sos padre/madre y tenés dudas, contactanos.',
      },
      {
        heading: 'Vigencia',
        body: 'Política en vigor desde el 1 de enero de 2025. Última actualización: mayo 2026. Los cambios se comunicarán en la App.\n\nVersión web: https://glosx.app/privacy-policy',
      },
    ],
  },

  security: {
    title: 'Seguridad y Privacidad',
    sections: [
      {
        heading: 'Sin cuentas de usuario',
        body: 'WoW Train está diseñado bajo el principio de "privacy by design" (RGPD Art. 25). No existe registro, login ni perfil. No hay contraseñas que hackear ni bases de datos de usuarios que comprometer.',
      },
      {
        heading: 'Almacenamiento seguro de billetes',
        body: 'Los billetes QR se guardan usando expo-secure-store, que utiliza el Keychain (iOS) o el Android Keystore (Android). El sistema operativo gestiona el cifrado, protegido por el PIN/biometría del dispositivo.',
      },
      {
        heading: 'Pagos PCI-DSS',
        body: 'Toda la gestión de pagos recae en Trainline Ltd. o Rail Europe SAS, ambos certificados bajo el estándar PCI-DSS. WoW Train es un intermediario de interfaz exclusivamente y nunca recibe datos de pago.',
      },
      {
        heading: 'Sin tracking ni analytics',
        body: 'La App no incluye SDKs de publicidad, analytics (Firebase, Amplitude, Mixpanel) ni fingerprinting de dispositivo. No hay cookies, no hay seguimiento entre sesiones.',
      },
      {
        heading: 'Datos GTFS locales',
        body: 'Las bases de datos de horarios (SQLite) se almacenan localmente en el dispositivo. No se envían consultas de búsqueda a servidores externos. La búsqueda de estaciones es 100% offline.',
      },
      {
        heading: 'Permisos del sistema',
        body: 'La App solicita únicamente: Ubicación (opcional, para búsqueda local) y Notificaciones (opcional, para alertas de tren). Ningún permiso es obligatorio para usar la App.',
      },
      {
        heading: 'Código abierto y auditable',
        body: 'WoW Train está construido con tecnología de código abierto: React Native (Meta), Expo SDK (Expo Inc.) y SQLite. El código puede auditarse para verificar el cumplimiento de estas políticas.',
      },
      {
        heading: 'Eliminación de datos',
        body: 'Para eliminar todos los datos locales, desinstalá la App. No es necesario contactarnos ni seguir ningún proceso adicional, ya que no guardamos nada en servidores.',
      },
    ],
  },
};

// ── Pantalla ─────────────────────────────────────────────────────────────────

export default function LegalScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { page } = useLocalSearchParams<{ page: string }>();
  const content = CONTENT[page ?? 'faq'] ?? CONTENT.faq;

  return (
    <View style={styles.rootWrap}>
      <Image source={require('../assets/images/bg-hero.png')} style={[StyleSheet.absoluteFillObject, { top: -280, bottom: 280 }]} resizeMode="cover" />
      <LinearGradient colors={['rgba(10,8,30,0.35)', 'rgba(14,14,46,0.60)', 'rgba(14,14,46,0.80)']} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
    <SafeAreaView style={styles.root} edges={['top']}>

      {/* Header con back */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          onPress={() => { Haptics.selectionAsync(); router.back(); }}
          hitSlop={10}
        >
          <Text style={[styles.backIcon, { color: colors.brand.glow }]}>‹</Text>
          <Text style={[styles.backText, { color: colors.brand.glow }]}>Ajustes</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text.primary }]}>{content.title}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {content.sections.map((s, i) => (
          <View key={i} style={[styles.section, { borderBottomColor: colors.border.subtle }]}>
            <Text style={[styles.heading, { color: colors.text.primary }]}>{s.heading}</Text>
            <Text style={[styles.body,    { color: colors.text.secondary }]}>{s.body}</Text>
          </View>
        ))}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.text.muted }]}>
            <Text style={{ color: colors.brand.glow }}>WoW </Text>TRAIN · v1.0.0
          </Text>
          <Text style={[styles.footerSub, { color: colors.text.muted }]}>Glosx@outlook.com</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
    </View>
  );
}

// ── Estilos ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  rootWrap: { flex: 1 },
  root:   { flex: 1, backgroundColor: 'transparent' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 48, paddingTop: 8 },

  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginBottom: 12,
  },
  backIcon: { fontSize: 24, lineHeight: 26 },
  backText: { fontSize: 15, fontWeight: '500' },
  title:    { fontSize: 26, fontWeight: '800' },

  section: {
    marginTop: 28,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  heading: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  body:    { fontSize: 14, lineHeight: 22 },

  footer: { alignItems: 'center', paddingTop: 40, paddingBottom: 16 },
  footerText: { fontSize: 14, fontWeight: '700' },
  footerWow:  {},
  footerSub:  { fontSize: 12, marginTop: 4 },
});
