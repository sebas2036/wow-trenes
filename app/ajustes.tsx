/**
 * WoW TRENES — Ajustes
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Switch, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { Colors, Radius } from '../theme';
import BottomTabBar from '../components/BottomTabBar';
import TranslatorSheet from '../components/TranslatorSheet';

const APP_VERSION = '1.0.0';

function Row({ icon, label, value, onPress, isSwitch, switchValue, onToggle }: {
  icon:         string;
  label:        string;
  value?:       string;
  onPress?:     () => void;
  isSwitch?:    boolean;
  switchValue?: boolean;
  onToggle?:    (v: boolean) => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, onPress && pressed && { opacity: 0.7 }]}
      onPress={onPress}
      disabled={!onPress && !isSwitch}
    >
      <Text style={styles.rowIcon}>{icon}</Text>
      <Text style={styles.rowLabel}>{label}</Text>
      {isSwitch ? (
        <Switch
          value={switchValue}
          onValueChange={onToggle}
          trackColor={{ false: '#333', true: Colors.brand.primary }}
          thumbColor="#fff"
        />
      ) : (
        <Text style={styles.rowValue}>{value ?? '›'}</Text>
      )}
    </Pressable>
  );
}

export default function AjustesScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState(true);
  const [haptics,       setHaptics]       = useState(true);
  const [translator,    setTranslator]    = useState(false);

  const goLegal = (page: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/legal', params: { page } });
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Ajustes</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Preferencias */}
        <Text style={styles.section}>PREFERENCIAS</Text>
        <View style={styles.group}>
          <Row icon="🔔" label="Notificaciones de tren"
            isSwitch switchValue={notifications}
            onToggle={(v) => { Haptics.selectionAsync(); setNotifications(v); }} />
          <View style={styles.divider} />
          <Row icon="📳" label="Vibración (haptics)"
            isSwitch switchValue={haptics}
            onToggle={(v) => { Haptics.selectionAsync(); setHaptics(v); }} />
        </View>

        {/* Datos */}
        <Text style={styles.section}>DATOS</Text>
        <View style={styles.group}>
          <Row icon="🗺️" label="Países cargados"   value="+13 países" />
          <View style={styles.divider} />
          <Row icon="🚇" label="Metros disponibles" value="6 ciudades" />
          <View style={styles.divider} />
          <Row icon="🔄" label="Última actualización GTFS" value="Hoy" />
        </View>

        {/* Legal */}
        <Text style={styles.section}>LEGAL</Text>
        <View style={styles.group}>
          <Row icon="❓" label="Preguntas frecuentes (FAQ)"
            onPress={() => goLegal('faq')} />
          <View style={styles.divider} />
          <Row icon="📄" label="Términos y Condiciones"
            onPress={() => goLegal('terms')} />
          <View style={styles.divider} />
          <Row icon="🔐" label="Política de Privacidad"
            onPress={() => goLegal('privacy')} />
          <View style={styles.divider} />
          <Row icon="🛡️" label="Seguridad y Privacidad"
            onPress={() => goLegal('security')} />
        </View>

        {/* Privacidad rápida */}
        <Text style={styles.section}>PRIVACIDAD</Text>
        <View style={styles.group}>
          <Row icon="🔒" label="Sin cuentas de usuario"   value="RGPD Art. 5" />
          <View style={styles.divider} />
          <Row icon="💳" label="Pagos vía Trainline (MoR)" value="PCI-DSS" />
          <View style={styles.divider} />
          <Row icon="📱" label="Tickets guardados localmente" value="Solo en tu teléfono" />
        </View>

        {/* Acerca */}
        <Text style={styles.section}>ACERCA DE</Text>
        <View style={styles.group}>
          <Row icon="📋" label="Versión" value={APP_VERSION} />
          <View style={styles.divider} />
          <Row
            icon="⭐" label="Calificar la app"
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          />
          <View style={styles.divider} />
          <Row
            icon="🐛" label="Reportar un problema"
            onPress={() => Linking.openURL('mailto:Glosx@outlook.com?subject=WoW TRENES - Bug')}
          />
        </View>

        {/* Marca */}
        <View style={styles.brand}>
          <Text style={styles.brandLogo}><Text style={styles.brandWow}>WoW </Text>TRENES</Text>
          <Text style={styles.brandSub}>Hecho para viajeros del mundo 🌍</Text>
        </View>

        <View style={{ height: 8 }} />
      </ScrollView>

      <BottomTabBar active="ajustes" onTranslatePress={() => setTranslator(true)} />
      <TranslatorSheet visible={translator} onClose={() => setTranslator(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.bg.base },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  title:  { fontSize: 28, fontWeight: '800', color: Colors.text.primary },
  scroll: { flex: 1 },

  section: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.2,
    color: Colors.text.muted,
    paddingHorizontal: 20, marginTop: 24, marginBottom: 8,
  },
  group: {
    marginHorizontal: 16,
    backgroundColor: '#13131A',
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  rowIcon:  { fontSize: 20, width: 28, textAlign: 'center' },
  rowLabel: { flex: 1, fontSize: 15, color: Colors.text.primary, fontWeight: '500' },
  rowValue: { fontSize: 13, color: Colors.text.secondary },
  divider:  { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginLeft: 56 },

  brand: { alignItems: 'center', paddingVertical: 32 },
  brandLogo: { fontSize: 22, fontWeight: '900', color: Colors.text.primary },
  brandWow:  { color: Colors.brand.glow },
  brandSub:  { fontSize: 13, color: Colors.text.muted, marginTop: 6 },
});
