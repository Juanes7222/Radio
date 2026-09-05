import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Pressable, AccessibilityInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useEffect, useState } from 'react';
import { useFacebookLive } from '@/hooks/useFacebookLive';
import { Colors } from '@/constants/theme';
import { TAB_BAR_BASE } from '@/lib/responsive';

function LiveDot() {
  const progress = useSharedValue(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      ?.then((enabled: boolean) => setReduceMotion(!!enabled))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
  }, [progress, reduceMotion]);

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value * 0.55 }],
    opacity: 0.55 * (1 - progress.value),
  }));

  return (
    <View style={liveStyles.container} accessible={false} importantForAccessibility="no-hide-descendants">
      {!reduceMotion && <Animated.View style={[liveStyles.halo, haloStyle]} />}
      <View style={liveStyles.dot} />
    </View>
  );
}

const liveStyles = StyleSheet.create({
  container: { position: 'absolute', top: -2, right: -4, width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.tally, borderWidth: 1.5, borderColor: 'rgba(8,10,30,0.9)', zIndex: 1 },
  halo: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.tally, opacity: 0.5 },
});

export default function TabLayout() {
  const { liveUrl } = useFacebookLive();
  const insets = useSafeAreaInsets();

  const TAB_HEIGHT = TAB_BAR_BASE + insets.bottom;

  const handleTabPress = () => {
    Haptics.selectionAsync().catch(() => {});
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: Colors.background },
        tabBarActiveTintColor: Colors.signal,
        tabBarInactiveTintColor: Colors.textFaint,
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          height: TAB_HEIGHT,
          paddingBottom: insets.bottom + 6,
          paddingTop: 6,
          paddingHorizontal: 8,
          elevation: 0,
          position: 'absolute',
        },
        tabBarBackground: () => (
          <BlurView
            intensity={28}
            tint="dark"
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,10,30,0.72)', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.borderGlass }]}
          />
        ),
        tabBarItemStyle: {
          justifyContent: 'center',
          paddingVertical: 4,
          borderRadius: 14,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.4,
          marginTop: 3,
          textTransform: 'uppercase',
        },
        tabBarAllowFontScaling: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tabBarButton: (props: any) => (
          <Pressable
            {...props}
            onPress={(e) => {
              handleTabPress();
              props.onPress?.(e);
            }}
            style={({ pressed }) => [
              props.style,
              pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
            ]}
          />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'En vivo',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="radio" size={size - 2} color={color} />
          ),
        }}
      />
      
      {/* NUEVA PESTAÑA DE PROGRAMACIÓN */}
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Horarios',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size - 2} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="request"
        options={{
          title: 'Solicitar',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="musical-notes" size={size - 2} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="prayer"
        options={{
          title: 'Oración',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="body-outline" size={size - 2} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="social"
        options={{
          title: 'Redes',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="earth-outline" size={size - 2} color={color} />
              {liveUrl && <LiveDot />}
            </View>
          ),
        }}
      />
    </Tabs>
  );
}