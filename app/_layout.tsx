/**
 * WoW TRENES — Root Layout
 * Expo Router v4 · Dark theme enforced · GestureHandler + BottomSheet providers
 */
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Colors } from '../theme';
import { initGeofenceTask } from '../tasks/geofenceTask';
import { initDatabase } from '../services/gtfsDatabase';

// Configure notification presentation
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  useEffect(() => {
    // Bootstrap: init SQLite GTFS database + register background geofence task
    (async () => {
      await initDatabase();
      await initGeofenceTask();
    })();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" backgroundColor={Colors.bg.base} />
      <Stack
        screenOptions={{
          headerShown:       false,
          contentStyle:      { backgroundColor: Colors.bg.base },
          animation:         'slide_from_right',
          animationDuration: 280,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen
          name="split-screen"
          options={{ animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="ticket"
          options={{ animation: 'fade', presentation: 'modal' }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg.base },
});
