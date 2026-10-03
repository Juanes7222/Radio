// `expo-router/js-tabs`, not `expo-router` and never `@react-navigation/*`:
// since SDK 56 expo-router vendors its own bottom-tabs build and fails the
// bundle if app code imports react-navigation directly. `js-tabs` re-exports
// the whole vendored module, so `Tabs`, `useBottomTabBarHeight` and the screen
// option types all come from one supported entry point.
import { Tabs } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Pressable, AccessibilityInfo, PixelRatio } from 'react-native';
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

/**
 * BottomTabBar sizes itself as TABBAR_HEIGHT_UIKIT (49) + safe area — a base it
 * derives from the real icon and label metrics, so it already adapts to the
 * device font scale and system font. We reuse that base instead of predicting
 * the content height ourselves, then add a constant clearance so the label
 * clears the gesture pill instead of sitting flush on top of it.
 *
 * Height and paddingBottom are derived from the SAME numbers on purpose: the
 * navigator computes both, and overriding one without the other squeezes the
 * content box until the label overflows into the gesture area.
 */
const TAB_BAR_CONTENT_BASE = 49;
const TAB_BAR_CLEARANCE = 14;

/**
 * The label keeps scaling (Dynamic Type stays accessible); the bar grows with
 * it at the same ratio so the two never diverge. Past this the bar would eat
 * the player, so the growth stops.
 */
const MAX_TAB_BAR_FONT_SCALE = 2;

/** Extra height bought per unit of font scale, so the label still fits. */
const TAB_BAR_LABEL_ROOM = 24;

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

  // The tab bar's height is ours to set: BottomTabBar spreads the screen
  // options' style LAST, so anything left unset falls back to its own
  // 49 + inset. Height and padding are kept consistent with each other.
  const fontScale = Math.min(PixelRatio.getFontScale(), MAX_TAB_BAR_FONT_SCALE);
  const tabBarLabelRoom = Math.round((fontScale - 1) * TAB_BAR_LABEL_ROOM);
  const tabBarPaddingBottom = insets.bottom + TAB_BAR_CLEARANCE + tabBarLabelRoom;
  const tabBarHeight = TAB_BAR_CONTENT_BASE + tabBarPaddingBottom;

  const handleTabPress = () => {
    Haptics.selectionAsync().catch(() => {});
  };

  return (
    <Tabs
      initialRouteName="social"
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: Colors.background },
        tabBarActiveTintColor: Colors.signal,
        tabBarInactiveTintColor: Colors.textFaint,
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          height: tabBarHeight,
          paddingBottom: tabBarPaddingBottom,
          paddingTop: 4,
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
          // Top-aligned, not centered: the bar reserves extra room below the
          // label for the gesture area, and centering would swallow half of it.
          justifyContent: 'flex-start',
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