import { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { WEB_URL } from '@/constants/api';
import { LEGAL_DOCUMENTS, legalUrl } from '@/constants/legalDocuments';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useFacebookLive } from '@/hooks/useFacebookLive';
import { openExternalUrl } from '@/lib/externalLinks';

import { scale } from '../../lib/responsive';

const STATION_DOMAIN = WEB_URL.replace(/^https?:\/\//, '').replace(/\/+$/, '');

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

export default function StationScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const router = useRouter();
  const { liveUrl } = useFacebookLive();

  const socialLinks = SOCIAL_LINKS.map((link) =>
    link.id === 'facebook' && liveUrl
      ? { ...link, url: liveUrl, isLive: true }
      : { ...link, isLive: false });

  const openLink = useCallback((url: string) => {
    Haptics.selectionAsync().catch(() => {});
    openExternalUrl(url);
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.ink, Colors.inkSoft, Colors.ink]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + Spacing.xl,
            paddingBottom: tabBarHeight + Spacing.lg,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(40).duration(260).easing(Easing.bezier(0.16, 1, 0.3, 1))}>
          <ScreenHeader
            eyebrow="Nuestra comunidad"
            title="La estación"
            subtitle="Redes sociales, sitio web y documentos legales."
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(300).easing(Easing.bezier(0.16, 1, 0.3, 1))}>
          <TouchableOpacity
            style={styles.webCard}
            activeOpacity={0.85}
            onPress={() => openLink(WEB_URL)}
            accessibilityRole="link"
            accessibilityLabel={`Abrir el sitio web de la estación, ${STATION_DOMAIN}`}
            accessibilityHint="Abre la página en el navegador y sales de la app"
          >
            <View style={styles.webSlugRow}>
              <Ionicons name="globe-outline" size={13} color={Colors.signal} />
              <Text style={styles.webSlug} numberOfLines={1}>{STATION_DOMAIN}</Text>
            </View>
            <Text style={styles.webTitle}>La Voz de la Verdad</Text>
            <Text style={styles.webBody}>
              Noticias, programación y la lectura bíblica del día.
            </Text>
            <View style={styles.webCta}>
              <Text style={styles.webCtaLabel}>Abrir el sitio</Text>
              <Ionicons name="arrow-forward" size={15} color={Colors.signal} />
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Banner live */}
        {liveUrl && (
          <Animated.View entering={FadeInDown.delay(120).duration(280).easing(Easing.bezier(0.16, 1, 0.3, 1))}>
            <TouchableOpacity
              style={styles.liveBanner}
              activeOpacity={0.85}
              onPress={() => openLink(liveUrl)}
              accessibilityRole="link"
              accessibilityLabel="Estamos en vivo"
              accessibilityHint="Abre la transmisión en Facebook y sales de la app"
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
              entering={FadeInDown.delay(160 + idx * 40).duration(280).easing(Easing.bezier(0.16, 1, 0.3, 1))}
            >
              <TouchableOpacity
                style={[styles.linkCard, link.isLive && styles.linkCardLive]}
                activeOpacity={0.82}
                onPress={() => openLink(link.url)}
                accessibilityRole="link"
                accessibilityLabel={`${link.label}. ${link.isLive ? 'En vivo ahora' : link.subtitle}`}
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

        <Animated.View entering={FadeInDown.delay(300).duration(300).easing(Easing.bezier(0.16, 1, 0.3, 1))}>
          <TouchableOpacity
            style={styles.writeCard}
            activeOpacity={0.85}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              router.push('/feedback');
            }}
            accessibilityRole="button"
            accessibilityLabel="Escríbanos"
            accessibilityHint="Abre el formulario para enviar una opinión o una sugerencia"
          >
            <View style={styles.writeIcon}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={Colors.signal} />
            </View>
            <View style={styles.linkTextGroup}>
              <Text style={styles.writeTitle}>Escríbanos</Text>
              <Text style={styles.writeBody}>
                Una sugerencia, una consulta o un problema con la emisión. Puedes hacerlo
                sin dar ningún dato.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textFaint} />
          </TouchableOpacity>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(320).duration(300).easing(Easing.bezier(0.16, 1, 0.3, 1))}>
          <View style={styles.legalPanel}>
            <View style={styles.legalHeader}>
              <Text style={styles.legalEyebrow}>Documentos legales</Text>
              <Text style={styles.legalHint}>Se abren en el navegador</Text>
            </View>
            {Object.values(LEGAL_DOCUMENTS).map((document) => (
              <TouchableOpacity
                key={document.path}
                style={styles.legalRow}
                activeOpacity={0.7}
                onPress={() => openLink(legalUrl(document.id))}
                accessibilityRole="link"
                accessibilityLabel={
                  document.requiredInApp
                    ? `${document.label}. Consentimiento: se acepta al enviar una petición de oración.`
                    : document.label
                }
                accessibilityHint={`${document.note}. Se abre en el navegador`}
              >
                <View style={styles.legalRowText}>
                  <Text style={styles.legalLabel}>{document.label}</Text>
                  <Text style={styles.legalNote}>{document.note}</Text>
                </View>
                {document.requiredInApp ? (
                  <View style={styles.legalTag}>
                    <Text style={styles.legalTagText}>Consentimiento</Text>
                  </View>
                ) : null}
                <Ionicons name="arrow-forward" size={15} color={Colors.textAltFaint} />
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  scroll: { flex: 1 },

  scrollContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },

  webCard: {
    backgroundColor: Colors.signalSoft,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.signalGlow,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: 4,
  },

  webSlugRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  webSlug: { ...Typography.mono, color: Colors.textMuted, flexShrink: 1 },
  webTitle: { ...Typography.display, fontSize: 24, lineHeight: 28, color: Colors.text },
  webBody: { ...Typography.body, color: Colors.textMuted },
  webCta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.xs },
  webCtaLabel: { ...Typography.captionStrong, color: Colors.signal },

  linkList: { gap: Spacing.sm },

  writeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.signalGlow,
  },
  writeIcon: {
    width: scale(44),
    height: scale(44),
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.signalMuted,
  },
  writeTitle: { ...Typography.body, color: Colors.text, fontWeight: '600' },
  writeBody: { ...Typography.caption, color: Colors.textMuted, lineHeight: 17 },

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
    backgroundColor: Colors.tally,
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
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
    backgroundColor: Colors.tally,
    zIndex: 1,
  },

  legalPanel: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    overflow: 'hidden',
  },
  legalHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  legalEyebrow: { ...Typography.eyebrow, color: Colors.signal },
  legalHint: { ...Typography.mono, color: Colors.textAltFaint, flexShrink: 1, textAlign: 'right' },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 56,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderGlass,
  },
  legalRowText: { flex: 1, gap: 2 },
  legalLabel: { ...Typography.body, color: Colors.text, fontWeight: '600' },
  legalNote: { ...Typography.caption, color: Colors.textAltFaint },
  legalTag: {
    backgroundColor: Colors.signalMuted,
    borderRadius: Radii.xs,
    borderWidth: 1,
    borderColor: Colors.signalGlow,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  legalTagText: { ...Typography.mono, fontSize: 10, color: Colors.signal },
});