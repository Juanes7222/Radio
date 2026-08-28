import { useEffect, useState, useCallback } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BACKEND_URL } from '@/constants/api';
import { getDeviceId } from '@/lib/device';
import { getNoticeState, bumpNoticeView, dismissNotice, shouldShowNotice } from '@/lib/noticeStorage';

interface Notice {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  variant: string;
  maxDisplaysPerUser: number;
  dismissible: boolean;
  endsAt: string;
}

const ACCENT: Record<string, string> = {
  info: '#0ea5e9',
  event: '#f59e0b',
  warning: '#f97316',
  prayer: '#22c55e',
};

export function NoticeOverlay() {
  const [current, setCurrent] = useState<Notice | null>(null);
  const [queue, setQueue] = useState<Notice[]>([]);
  const [viewCount, setViewCount] = useState(0);

  const fetchNotices = useCallback(async () => {
    try {
      const deviceId = await getDeviceId();
      const url = `${BACKEND_URL}/api/notices/active?deviceId=${encodeURIComponent(deviceId)}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = (await res.json()) as { notices: Notice[] };
      const eligible: Notice[] = [];
      for (const n of data.notices) {
        if (await shouldShowNotice(n.id, n.maxDisplaysPerUser, n.dismissible)) eligible.push(n);
      }
      if (eligible.length === 0) return;
      setQueue(eligible.slice(1));
      const first = eligible[0];
      setCurrent(first);
      const s = await bumpNoticeView(first.id);
      setViewCount(s.count);
    } catch {}
  }, []);

  useEffect(() => { void fetchNotices(); }, [fetchNotices]);

  const handleDismiss = async () => {
    if (!current) return;
    if (current.dismissible) await dismissNotice(current.id);
    // si no es descartable, ya se hizo bump al mostrar; no necesita dismiss
    if (queue.length > 0) {
      const next = queue[0];
      setQueue((q) => q.slice(1));
      setCurrent(next);
      const s = await bumpNoticeView(next.id);
      setViewCount(s.count);
    } else {
      setCurrent(null);
    }
  };

  const handleCta = () => {
    if (current?.ctaUrl) void Linking.openURL(current.ctaUrl);
  };

  useEffect(() => {
    if (!current) return;
    getNoticeState(current.id).then((s) => setViewCount(s.count)).catch(() => {});
  }, [current]);

  if (!current) return null;

  const accent = ACCENT[current.variant] ?? ACCENT.info;

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={[styles.accentBar, { backgroundColor: accent }]} />
        <View style={styles.perforatedHeader}>
          <View style={styles.dotsRow}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={styles.dot} />
            ))}
          </View>
          <Text style={styles.eyebrow}>AVISO</Text>
        </View>

        {current.imageUrl ? (
          <Image source={{ uri: current.imageUrl }} style={styles.image} resizeMode="cover" />
        ) : null}

        <View style={styles.body}>
          <Pressable onPress={handleDismiss} style={styles.closeBtn} hitSlop={12}>
            <Ionicons name="close" size={18} color="#1A1C1E" />
          </Pressable>

          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.message}>{current.body}</Text>

          <View style={styles.actions}>
            {current.ctaLabel && current.ctaUrl ? (
              <Pressable onPress={handleCta} style={styles.cta}>
                <Text style={styles.ctaText}>{current.ctaLabel}</Text>
                <Ionicons name="open-outline" size={14} color="#fff" />
              </Pressable>
            ) : null}
            <Pressable onPress={handleDismiss} style={styles.secondary}>
              <Text style={styles.secondaryText}>
                {current.dismissible ? 'No volver a mostrar' : 'Ocultar'}
              </Text>
            </Pressable>
          </View>

          {current.maxDisplaysPerUser > 0 ? (
            <Text style={styles.counter}>{viewCount}/{current.maxDisplaysPerUser} vistas</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    alignItems: 'center',
    zIndex: 60,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: '#F5EFE6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8DDD0',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  accentBar: {
    height: 3,
  },
  perforatedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#EDE6DA',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8DDD0',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(26,28,30,0.15)',
  },
  eyebrow: {
    marginLeft: 'auto',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.4,
    color: 'rgba(26,28,30,0.5)',
  },
  image: {
    width: '100%',
    aspectRatio: 16 / 7,
    backgroundColor: '#E8DDD0',
  },
  body: {
    padding: 16,
    paddingRight: 40,
  },
  closeBtn: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(26,28,30,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1A1C1E',
    lineHeight: 22,
  },
  message: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(26,28,30,0.72)',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1A1C1E',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  ctaText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  secondary: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  secondaryText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(26,28,30,0.6)',
  },
  counter: {
    marginTop: 8,
    fontSize: 11,
    color: 'rgba(26,28,30,0.4)',
    fontFamily: 'monospace',
  },
});
