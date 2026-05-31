import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFacebookLive } from '@/hooks/useFacebookLive';

const ACCENT = '#6366f1';
const BACKGROUND = 'rgba(12, 12, 30, 0.97)';

export default function TabLayout() {
  const { liveUrl } = useFacebookLive();
  // Extraemos los insets para saber cuánto espacio ocupa la barra de navegación del celular
  const insets = useSafeAreaInsets();

  // Altura base responsiva + el espacio seguro del sistema
  const BASE_HEIGHT = Platform.OS === 'ios' ? 55 : 60;
  const TAB_HEIGHT = BASE_HEIGHT + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACCENT,
        // Un gris ligeramente más claro para mejorar el contraste en pantallas de mala calidad
        tabBarInactiveTintColor: '#8b92a5', 
        tabBarStyle: {
          backgroundColor: BACKGROUND,
          // StyleSheet.hairlineWidth dibuja la línea más fina posible según la resolución de la pantalla
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: 'rgba(255, 255, 255, 0.15)',
          height: TAB_HEIGHT,
          // Añadimos padding inferior dinámico basado en el celular
          paddingBottom: Platform.OS === 'ios' ? insets.bottom : insets.bottom + 8,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarItemStyle: {
          // Centra verticalmente el contenido del tab
          justifyContent: 'center',
          paddingVertical: 4,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.3,
          marginTop: 2, // Espacio respirable entre icono y texto
        },
        // Evita que el texto se deforme si el usuario tiene letras gigantes en su celular
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
                  borderColor: BACKGROUND, // Usamos el color exacto del fondo para hacer un recorte visual "limpio"
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