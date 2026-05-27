/**
 * WoW TRENES — Bottom Tab Bar
 * Navegación fija en la parte inferior de la pantalla.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Colors } from '../theme';

export type TabName = 'inicio' | 'salidas' | 'traducir' | 'ajustes';

const TABS: { name: TabName; label: string; icon: string; path: string }[] = [
  { name: 'inicio',   label: 'Inicio',   icon: '⊞',  path: '/'        },
  { name: 'salidas',  label: 'Salidas',  icon: '🚆', path: '/salidas' },
  { name: 'traducir', label: 'Traducir', icon: '◎',  path: '/'        },
  { name: 'ajustes',  label: 'Ajustes',  icon: '⚙',  path: '/ajustes' },
];

interface Props {
  active: TabName;
  onTranslatePress?: () => void;
}

export default function BottomTabBar({ active, onTranslatePress }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handlePress = (tab: typeof TABS[0]) => {
    Haptics.selectionAsync();
    if (tab.name === 'traducir') { onTranslatePress?.(); return; }
    if (tab.name === active) return;
    router.push(tab.path as any);
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((tab) => {
        const isActive = tab.name === active;
        return (
          <Pressable
            key={tab.name}
            style={styles.tab}
            onPress={() => handlePress(tab)}
            accessibilityRole="button"
            accessibilityLabel={tab.label}
          >
            <Text style={[styles.icon, isActive && styles.iconActive]}>
              {tab.icon}
            </Text>
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {tab.label}
            </Text>
            {isActive && <View style={styles.activeDot} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection:   'row',
    backgroundColor: '#111113',
    borderTopWidth:  1,
    borderTopColor:  'rgba(255,255,255,0.07)',
    paddingTop:      10,
  },
  tab: {
    flex:           1,
    alignItems:     'center',
    gap:            3,
  },
  icon: {
    fontSize:  20,
    color:     Colors.text.muted,
  },
  iconActive: {
    color: Colors.brand.glow,
  },
  label: {
    fontSize:   10,
    color:      Colors.text.muted,
    fontWeight: '500',
  },
  labelActive: {
    color: Colors.brand.glow,
  },
  activeDot: {
    width:           4,
    height:          4,
    borderRadius:    2,
    backgroundColor: Colors.brand.glow,
    marginTop:       2,
  },
});
