import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFacebookLive } from '@/hooks/useFacebookLive';

const ACCENT = '#6366f1';
const BACKGROUND = 'rgba(12, 12, 30, 0.97)';

export default function TabLayout() {
  const { liveUrl } = useFacebookLive();
  const insets = useSafeAreaInsets();

  const BASE_HEIGHT = Platform.OS === 'ios' ? 55 : 63;
  const TAB_HEIGHT = BASE_HEIGHT + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACCENT,
        tabBarInactiveTintColor: '#8b92a5',
        tabBarStyle: {
          backgroundColor: BACKGROUND,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: 'rgba(255, 255, 255, 0.15)',
          height: TAB_HEIGHT,
          paddingBottom: Platform.OS === 'ios' ? insets.bottom: insets.bottom + 8,
          paddingTop: 2,
          elevation: 0,
        },
        tabBarItemStyle: {
          justifyContent: 'center',
          paddingVertical: 4,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.3,
          marginTop: 2,
        },
        tabBarAllowFontScaling: false,
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
            <Ionicons name="heart" size={size - 2} color={color} />
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
              {liveUrl && (
                <View style={{
                  position: 'absolute',
                  top: -2,
                  right: -4,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: '#ef4444',
                  borderWidth: 2,
                  borderColor: BACKGROUND,
                }} />
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen name="history" options={{ href: null }} />
    </Tabs>
  );
}