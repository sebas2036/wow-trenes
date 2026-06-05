/**
 * WoW TRENES — Bottom Tab Bar
 * Íconos vectoriales Ionicons. Tema claro/oscuro automático.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';

export type TabName = 'inicio' | 'salidas' | 'traducir' | 'ajustes';

interface TabConfig {
  name:       TabName;
  label:      string;
  icon:       keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  path:       string;
}

const TABS: TabConfig[] = [
  { name: 'inicio',   label: 'Inicio',   icon: 'home-outline',     iconActive: 'home',          path: '/'        },
  { name: 'salidas',  label: 'Salidas',  icon: 'train-outline',    iconActive: 'train',         path: '/salidas' },
  { name: 'traducir', label: 'Traducir', icon: 'language-outline',  iconActive: 'language',      path: '/'        },
  { name: 'ajustes',  label: 'Ajustes',  icon: 'settings-outline',  iconActive: 'settings',      path: '/ajustes' },
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
    if (tab.name === 'traducir') { onTranslatePress?.(); return; }
    if (tab.name === 'inicio' && active === 'inicio') { onHomePress?.(); return; }
    if (tab.name === active) return;
    router.push(tab.path as any);
  };

  return (
    <View style={[
      styles.bar,
      {
        backgroundColor: colors.bg.tabBar,
        borderTopColor:  colors.border.subtle,
        paddingBottom:   Math.max(insets.bottom, 8),
      },
    ]}>
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
            accessibilityLabel={tab.label}
          >
            <Ionicons name={iconName} size={24} color={iconColor} />
            <Text style={[styles.label, { color: iconColor }]}>{tab.label}</Text>
            {isActive && <View style={[styles.dot, { backgroundColor: colors.brand.accent }]} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    paddingTop: 10,
  },
  tab:   { flex: 1, alignItems: 'center', gap: 3 },
  label: { fontSize: 10, fontWeight: '500', letterSpacing: 0.1 },
  dot:   { width: 4, height: 4, borderRadius: 2, marginTop: 1 },
});
