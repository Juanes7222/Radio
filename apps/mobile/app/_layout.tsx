import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import TrackPlayer from 'react-native-track-player';
import { initTrackPlayer, PlaybackService } from '../service';
import { FacebookLiveProvider } from '@/hooks/useFacebookLive';
import { useNotificationNavigation } from '@/hooks/useNotificationNavigation';
import { registerDevice, updateFCMToken } from '@/lib/device';
import { NoticeOverlay } from '@/components/NoticeOverlay';

SplashScreen.preventAutoHideAsync();

TrackPlayer.registerPlaybackService(() => PlaybackService);

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);

  useNotificationNavigation();

  useEffect(() => {
    async function prepareApp() {
      try {
        await initTrackPlayer();
        await registerDevice();
      } catch (e) {
        console.warn('Error durante la inicializacion:', e);
      } finally {
        setAppIsReady(true);
        await SplashScreen.hideAsync();
      }
    }
    
    prepareApp();
  }, []);

  useEffect(() => {
    const sub = Notifications.addPushTokenListener((tokenData) => {
      const token = tokenData.data;
      if (token && typeof token === 'string') {
        updateFCMToken(token);
      }
    });
    return () => sub.remove();
  }, []);

  if (!appIsReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <FacebookLiveProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
          </Stack>
          <NoticeOverlay />
        </FacebookLiveProvider>
        <StatusBar style="light" translucent backgroundColor="transparent" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});