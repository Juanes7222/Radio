import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import TrackPlayer from 'react-native-track-player';
import { useFonts, Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { initTrackPlayer, PlaybackService } from '../service';
import { FacebookLiveProvider } from '@/hooks/useFacebookLive';
import { useNotificationNavigation } from '@/hooks/useNotificationNavigation';
import { registerDevice, updateFCMToken } from '@/lib/device';
import { NoticeOverlay } from '@/components/NoticeOverlay';
import EventSource from 'react-native-sse';

// Polyfill global EventSource para useAzuraCast (packages/api usa EventSource global)
// En RN no existe por defecto, react-native-sse lo provee
if (typeof global.EventSource === 'undefined') {
  // @ts-ignore
  global.EventSource = EventSource as unknown as typeof globalThis.EventSource;
}

SplashScreen.preventAutoHideAsync();

// registerPlaybackService debe ejecutarse a nivel top-level pero puede fallar
// si el módulo nativo no está disponible (Expo Go o New Architecture activa).
// Con newArchEnabled=false este try es solo defensivo.
try {
  TrackPlayer.registerPlaybackService(() => PlaybackService);
} catch (e) {
  console.warn('[TrackPlayer] registerPlaybackService failed:', e);
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
    IBMPlexMono_500Medium,
  });
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
    if (fontsLoaded) {
      prepareApp();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    const sub = Notifications.addPushTokenListener((tokenData) => {
      const token = tokenData.data;
      if (token && typeof token === 'string') {
        updateFCMToken(token);
      }
    });
    return () => sub.remove();
  }, []);

  if (!appIsReady || !fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <BottomSheetModalProvider>
        <SafeAreaProvider>
          <FacebookLiveProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
            </Stack>
            <NoticeOverlay />
          </FacebookLiveProvider>
          <StatusBar style="light" translucent backgroundColor="transparent" />
        </SafeAreaProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});