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
import { loadUserSettings, getNotificationsEnabled } from '../services/userSettings';

Notifications.setNotificationHandler({
  // Respeta el toggle "Notificaciones" de Ajustes (gate en primer plano)
  handleNotification: async () => {
    const on = getNotificationsEnabled();
    return {
      shouldShowAlert: on,
      shouldPlaySound: on,
      shouldSetBadge:  false,
    };
  },
});

function AppStack() {
  const { colors } = useTheme();

  useEffect(() => {
    loadUserSettings().catch(() => {}); // preferencias (haptics/notifs) antes de interactuar
    // Delay 150ms para que el primer frame se renderice antes de cargar SQLite
    const t = setTimeout(() => {
      initDatabase().catch(console.warn);
      initGeofenceTask().catch(console.warn);
    }, 150);
    return () => clearTimeout(t);
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" backgroundColor="#0E0E2E" translucent />
      <Stack
        screenOptions={{
          headerShown:  false,
          contentStyle: { backgroundColor: '#0E0E2E' },
          animation:    'none',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="salidas" />
        <Stack.Screen name="favoritos" />
        <Stack.Screen name="ajustes" />
        <Stack.Screen name="legal" />
        <Stack.Screen name="buscar-viaje" />
        <Stack.Screen name="split-screen" />
        <Stack.Screen name="ticket" />
        <Stack.Screen name="traductor" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
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
  root: { flex: 1, backgroundColor: '#0E0E2E' },
});
