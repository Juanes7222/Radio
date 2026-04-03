import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import TrackPlayer from 'react-native-track-player';
import { PlaybackService } from '../service';

SplashScreen.preventAutoHideAsync();

// Must be called once at module level before any playback operations
TrackPlayer.registerPlaybackService(() => PlaybackService);

export default function RootLayout() {
  useEffect(() => {
    async function requestPermissions() {
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (status !== 'granted' && canAskAgain) {
        await Notifications.requestPermissionsAsync();
      }
    }
    
    requestPermissions();
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
        <StatusBar style="light" translucent backgroundColor="transparent" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
