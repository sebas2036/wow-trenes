/**
 * WoW Train — Root Layout
 * Expo Router v4 · Tema claro/oscuro automático · GestureHandler provider
 */
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import * as Notifications from 'expo-notifications';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { NotificationProvider } from '../context/NotificationContext';
import { initGeofenceTask } from '../tasks/geofenceTask';
import { initDatabase } from '../services/gtfsDatabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function AppStack() {
  const { colors } = useTheme();

  useEffect(() => {
    // Delay 150ms para que el primer frame se renderice antes de cargar SQLite
    const t = setTimeout(() => {
      initDatabase().catch(console.warn);
      initGeofenceTask().catch(console.warn);
    }, 150);
    return () => clearTimeout(t);
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" backgroundColor={colors.bg.base} />
      <Stack
        screenOptions={{
          headerShown:              false,
          contentStyle:             { backgroundColor: 'transparent' },
          // Transición nativa de cada plataforma (iOS: spring push / Android: slide)
          animation:                'default',
          animationDuration:        300,
          // Deslizar desde cualquier punto de la pantalla para volver (iOS)
          fullScreenGestureEnabled: true,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="salidas" />
        <Stack.Screen name="favoritos" />
        <Stack.Screen name="ajustes" />
        <Stack.Screen name="legal" />
        {/* Pantallas modal: suben desde abajo */}
        <Stack.Screen name="buscar-viaje" options={{ headerShown: false, animation: 'slide_from_bottom', fullScreenGestureEnabled: false }} />
        <Stack.Screen name="split-screen" options={{ animation: 'slide_from_bottom', fullScreenGestureEnabled: false }} />
        <Stack.Screen name="ticket"       options={{ animation: 'fade', presentation: 'modal' }} />
        <Stack.Screen name="onboarding"   options={{ animation: 'fade', gestureEnabled: false, fullScreenGestureEnabled: false }} />
      </Stack>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <AppStack />
      </NotificationProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
});
