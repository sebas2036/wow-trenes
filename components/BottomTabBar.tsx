/**
 * WoW Train — Bottom Tab Bar
 * Íconos vectoriales Ionicons. Tema claro/oscuro automático.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';
import { t } from '../services/i18n';

export type TabName = 'inicio' | 'salidas' | 'traducir' | 'ajustes';

interface TabConfig {
  name:       TabName;
  labelKey:   string;
  icon:       keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  path:       string;
}

const TABS: TabConfig[] = [
  { name: 'inicio',   labelKey: 'tab_home',        icon: 'home-outline',      iconActive: 'home',      path: '/'        },
  { name: 'salidas',  labelKey: 'tab_departures',   icon: 'train-outline',     iconActive: 'train',     path: '/salidas' },
  { name: 'traducir', labelKey: 'tab_translate',    icon: 'language-outline',  iconActive: 'language',  path: '/traductor' },
  { name: 'ajustes',  labelKey: 'tab_settings',     icon: 'settings-outline',  iconActive: 'settings',  path: '/ajustes' },
];

interface Props {
  active: TabName;
  onTranslatePress?: () => void;
  onHomePress?: () => void;
}

export default function BottomTabBar({ active, onTranslatePress, onHomePress }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const handlePress = (tab: TabConfig) => {
    Haptics.selectionAsync();
    if (tab.name === 'inicio' && active === 'inicio') { onHomePress?.(); return; }
    if (tab.name === active) return;
    // replace() en vez de push/navigate: los tabs nunca apilan.
    // El back del teléfono sale directo de la app (comportamiento correcto en tabs).
    router.replace(tab.path as any);
  };

  return (
    <View style={[styles.barWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={[styles.bar, { backgroundColor: colors.bg.tabBar, borderTopColor: 'rgba(124,58,237,0.75)' }]}>
      {TABS.map((tab) => {
        const isActive = tab.name === active;
        const iconName  = isActive ? tab.iconActive : tab.icon;
        const iconColor = isActive ? colors.brand.accent : colors.text.secondary;
        return (
          <Pressable
            key={tab.name}
            style={styles.tab}
            onPress={() => handlePress(tab)}
            accessibilityRole="button"
            accessibilityLabel={t(tab.labelKey as any)}
          >
            <Ionicons name={iconName} size={24} color={iconColor} />
            <Text style={[styles.label, { color: isActive ? '#fff' : colors.text.secondary }]}>{t(tab.labelKey as any)}</Text>
            {isActive && <View style={[styles.dot, { backgroundColor: colors.brand.accent }]} />}
          </Pressable>
        );
      })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barWrap: {
    backgroundColor: 'transparent',
  },
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 10,
  },
  tab:   { flex: 1, alignItems: 'center', gap: 3 },
  label: { fontSize: 10, fontWeight: '500', letterSpacing: 0.1 },
  dot:   { width: 4, height: 4, borderRadius: 2, marginTop: 1 },
});
