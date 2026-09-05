import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import  FontAwesome  from '@expo/vector-icons/FontAwesome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { useFacebookLive } from '../../hooks/useFacebookLive';

import { scale, TAB_BAR_BASE } from '../../lib/responsive';

const SOCIAL_LINKS = [
  {
    id: 'facebook',
    label: 'Facebook',
    subtitle: 'Síguenos y comparte',
    url: 'https://www.facebook.com/profile.php?id=100074024491964',
    icon: 'logo-facebook' as const,
    color: '#1877f2',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    subtitle: 'Síguenos y comparte',
    url: 'https://www.instagram.com/iglesiacartagommm/',
    icon: 'logo-instagram' as const,
    color: '#e1306c',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    subtitle: 'Suscríbete a nuestro canal',
    url: 'https://www.youtube.com/@emisoralavozdelaverdad9188',
    icon: 'logo-youtube' as const,
    color: '#ff0000',
  },
  {
    id: 'spotify',
    label: 'Spotify',
    subtitle: 'Síguenos en Spotify',
    url: 'https://open.spotify.com/show/7hSkCQDHvdjr4aYE5X6Gv4?si=a4cfd87d109543a2',
    icon: null,
    color: '#1DB954',
  },
] as const;

export default function SocialScreen() {
  const insets = useSafeAreaInsets();
  const { liveUrl } = useFacebookLive();

  const socialLinks = SOCIAL_LINKS.map((link) =>
    link.id === 'facebook' && liveUrl
      ? { ...link, url: liveUrl, isLive: true }
      : { ...link, isLive: false });


  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.ink, Colors.inkSoft, Colors.ink]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View
        entering={FadeInDown.duration(300).easing(Easing.bezier(0.16, 1, 0.3, 1))}
        style={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.xl,
            paddingBottom: TAB_BAR_BASE + insets.bottom + Spacing.lg,
          },
        ]}
      >
        <Animated.View entering={FadeInDown.delay(40).duration(260).easing(Easing.bezier(0.16, 1, 0.3, 1))}>
          <Text style={styles.heading}>Redes Sociales</Text>
          <Text style={styles.subheading}>Conéctate con nuestra comunidad</Text>
        </Animated.View>

        {/* Banner live */}
        {liveUrl && (
          <Animated.View entering={FadeInDown.delay(80).duration(280).easing(Easing.bezier(0.16, 1, 0.3, 1))}>
            <TouchableOpacity
              style={styles.liveBanner}
              activeOpacity={0.85}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                Linking.openURL(liveUrl);
              }}
            >
              <View style={styles.liveDot}>
                <View style={styles.liveDotInner} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.liveBannerTitle}>¡Estamos en vivo!</Text>
                <Text style={styles.liveBannerSub}>Toca para ver en Facebook</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>
          </Animated.View>
        )}

        <View style={styles.linkList}>
          {socialLinks.map((link, idx) => (
            <Animated.View
              key={link.id}
              entering={FadeInDown.delay(100 + idx * 40).duration(280).easing(Easing.bezier(0.16, 1, 0.3, 1))}
            >
              <TouchableOpacity
                style={[styles.linkCard, link.isLive && styles.linkCardLive]}
                activeOpacity={0.82}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  Linking.openURL(link.url);
                }}
              >
              <View style={[styles.iconCircle, { backgroundColor: link.color + '22' }]}>
                {link.isLive && <View style={styles.liveIndicator} />}
                {link.icon === null
                  ? <FontAwesome name="spotify" size={26} color={link.color} />
                  : <Ionicons name={link.icon} size={26} color={link.color} />
                }
              </View>
              <View style={styles.linkTextGroup}>
                <Text style={styles.linkLabel}>{link.label}</Text>
                <Text style={styles.linkSubtitle}>
                  {link.isLive ? 'En vivo ahora' : link.subtitle}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textFaint} />
              </TouchableOpacity>
            </Animated.View>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },

  heading: {
    ...Typography.screenTitle,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  subheading: {
    ...Typography.body,
    color: Colors.textMuted,
    marginBottom: Spacing.xl,
  },

  linkList: { gap: Spacing.sm },

  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  iconCircle: {
    width: scale(50),
    height: scale(50),
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  linkTextGroup: { flex: 1, gap: 2 },
  linkLabel: { ...Typography.body, color: Colors.text, fontWeight: '600' },
  linkSubtitle: { ...Typography.caption, color: Colors.textMuted },

  liveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: '#dc2626',
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
  },
  liveBannerTitle: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  liveBannerSub: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 2,
  },
  liveDot: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDotInner: {
    width: scale(12),
    height: scale(12),
    borderRadius: scale(6),
    backgroundColor: '#fff',
  },
  linkCardLive: {
    borderColor: '#1877f2',
    borderWidth: 1.5,
  },
  liveIndicator: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
    zIndex: 1,
  },
});
