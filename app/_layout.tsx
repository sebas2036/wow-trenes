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
  const { colors, isDark } = useTheme();

  useEffect(() => {
    // Fire-and-forget — no bloquea el render. La app muestra [] mientras carga.
    initDatabase().catch(console.warn);
    initGeofenceTask().catch(console.warn);
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.bg.base} />
      <Stack
        screenOptions={{
          headerShown:       false,
          contentStyle:      { backgroundColor: 'transparent' },
          animation:         'slide_from_right',
          animationDuration: 280,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="salidas" />
        <Stack.Screen name="favoritos" />
        <Stack.Screen name="ajustes" />
        <Stack.Screen name="legal" />
        <Stack.Screen name="buscar-viaje" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
        <Stack.Screen name="split-screen" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="ticket"       options={{ animation: 'fade', presentation: 'modal' }} />
        <Stack.Screen name="onboarding"   options={{ animation: 'fade', gestureEnabled: false }} />
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
