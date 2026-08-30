import { useEffect, useState, useCallback } from "react";
import { View, Text, Image, Pressable, StyleSheet, Linking, Modal, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BACKEND_URL } from "@/constants/api";
import { getDeviceId } from "@/lib/device";
import { resolveNoticeMediaUri } from "@/lib/noticeMedia";
import { InlineVideo } from "./notices/InlineVideo";
import { MobileNoticeCarousel } from "./notices/MobileNoticeCarousel";
import { getNoticeState, bumpNoticeView, dismissNotice, shouldShowNotice } from "@/lib/noticeStorage";

interface Notice {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  videoUrl: string | null;
  gallery?: Array<{ id: string; type: "image" | "video"; url: string; posterUrl: string | null }> | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  variant: string;
  displayMode?: string;
  maxDisplaysPerUser: number;
  dismissible: boolean;
  endsAt: string;
}

const ACCENT: Record<string, string> = {
  info: "#0ea5e9",
  event: "#f59e0b",
  warning: "#f97316",
  prayer: "#22c55e",
};

const VARIANT_LABEL: Record<string, string> = {
  info: "Informativo",
  event: "Evento",
  warning: "Urgente",
  prayer: "Oración",
};

export function NoticeOverlay() {
  const [current, setCurrent] = useState<Notice | null>(null);
  const [queue, setQueue] = useState<Notice[]>([]);
  const [viewCount, setViewCount] = useState(0);
  const [modalNotice, setModalNotice] = useState<Notice | null>(null);
  const [modalViewCount, setModalViewCount] = useState(0);

  const fetchNotices = useCallback(async () => {
    try {
      const deviceId = await getDeviceId();
      const url = `${BACKEND_URL}/api/notices/active?deviceId=${encodeURIComponent(deviceId)}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = (await res.json()) as { notices: Notice[] };
      const eligible: Notice[] = [];
      for (const notice of data.notices) {
        if (await shouldShowNotice(notice.id, notice.maxDisplaysPerUser, notice.dismissible)) eligible.push(notice);
      }
      if (eligible.length === 0) return;

      const modals = eligible.filter((n) => (n.displayMode ?? "toast") === "modal");
      const toasts = eligible.filter((n) => (n.displayMode ?? "toast") !== "modal");

      if (modals.length > 0) {
        const firstModal = modals[0];
        setModalNotice(firstModal);
        const state = await bumpNoticeView(firstModal.id);
        setModalViewCount(state.count);
        setQueue(toasts);
        return;
      }

      // Toast-only flow
      setQueue(toasts.slice(1));
      const first = toasts[0];
      if (first) {
        setCurrent(first);
        const state = await bumpNoticeView(first.id);
        setViewCount(state.count);
      }
    } catch {
      // Ignore network errors — notices are non-critical
    }
  }, []);

  useEffect(() => {
    void fetchNotices();
  }, [fetchNotices]);

  const handleDismiss = async () => {
    if (!current) return;
    if (queue.length > 0) {
      const next = queue[0];
      setQueue((q) => q.slice(1));
      setCurrent(next);
      const state = await bumpNoticeView(next.id);
      setViewCount(state.count);
    } else {
      setCurrent(null);
    }
  };

  const handlePermanentDismiss = async () => {
    if (!current) return;
    await dismissNotice(current.id);
    if (queue.length > 0) {
      const next = queue[0];
      setQueue((q) => q.slice(1));
      setCurrent(next);
      const state = await bumpNoticeView(next.id);
      setViewCount(state.count);
    } else {
      setCurrent(null);
    }
  };

  const handleDismissModal = async () => {
    if (!modalNotice) return;
    setModalNotice(null);
    if (queue.length > 0) {
      const next = queue[0];
      setQueue((q) => q.slice(1));
      setCurrent(next);
      const state = await bumpNoticeView(next.id);
      setViewCount(state.count);
    }
  };

  const handlePermanentDismissModal = async () => {
    if (!modalNotice) return;
    await dismissNotice(modalNotice.id);
    setModalNotice(null);
    if (queue.length > 0) {
      const next = queue[0];
      setQueue((q) => q.slice(1));
      setCurrent(next);
      const state = await bumpNoticeView(next.id);
      setViewCount(state.count);
    }
  };

  const handleCta = () => {
    if (current?.ctaUrl) void Linking.openURL(current.ctaUrl);
  };

  const handleCtaModal = () => {
    if (modalNotice?.ctaUrl) void Linking.openURL(modalNotice.ctaUrl);
  };

  useEffect(() => {
    if (!current) return;
    getNoticeState(current.id)
      .then((s) => setViewCount(s.count))
      .catch(() => {});
  }, [current]);

  // Intrusive modal — centered on entry
  if (modalNotice) {
    const variantLabel = VARIANT_LABEL[modalNotice.variant] ?? "Aviso";
    const videoUri = resolveNoticeMediaUri(modalNotice.videoUrl);
    const imageUri = resolveNoticeMediaUri(modalNotice.imageUrl);
    return (
      <Modal visible transparent animationType="fade" statusBarTranslucent>
        <View style={mStyles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleDismissModal} />
          <View style={mStyles.cardWrap} pointerEvents="box-none">
            <View style={mStyles.card}>
              {/* Console header */}
              <View style={mStyles.consoleHeader}>
                <View style={mStyles.tallyRow}>
                  <View style={mStyles.tallyDot} />
                  <Text style={mStyles.tallyText}>EN EL AIRE</Text>
                </View>
                <View style={mStyles.dialRow}>
                  <Text style={mStyles.dialText}>88</Text>
                  <View style={mStyles.dialTick} />
                  <Text style={mStyles.dialText}>96</Text>
                  <View style={mStyles.dialNeedle} />
                  <Text style={mStyles.dialText}>104</Text>
                  <Text style={mStyles.dialFm}>FM</Text>
                </View>
                <Pressable onPress={handleDismissModal} style={mStyles.closeBtnDark} hitSlop={10}>
                  <Ionicons name="close" size={16} color="#fff" />
                </Pressable>
              </View>

              <View style={mStyles.perforatedHeader}>
                <View style={mStyles.dotsRow}>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <View key={i} style={mStyles.dot} />
                  ))}
                </View>
                <Text style={mStyles.eyebrowDark}>CINTA · {variantLabel.toUpperCase()}</Text>
              </View>

              <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ paddingBottom: 4 }} bounces={false} showsVerticalScrollIndicator={false}>
                {modalNotice.gallery && modalNotice.gallery.length > 0 ? (
                  <MobileNoticeCarousel items={modalNotice.gallery} />
                ) : videoUri ? (
                  <InlineVideo uri={videoUri} aspectRatio={16 / 9} />
                ) : imageUri ? (
                  <Image source={{ uri: imageUri }} style={mStyles.image} resizeMode="cover" />
                ) : null}

                <View style={mStyles.body}>
                  <Text style={mStyles.variantLabel}>{variantLabel.toUpperCase()}</Text>
                  <Text style={mStyles.title}>{modalNotice.title}</Text>
                  <Text style={mStyles.message}>{modalNotice.body}</Text>

                  <View style={mStyles.actions}>
                    {modalNotice.ctaLabel && modalNotice.ctaUrl ? (
                      <Pressable onPress={handleCtaModal} style={mStyles.cta}>
                        <Text style={mStyles.ctaText}>{modalNotice.ctaLabel}</Text>
                        <Ionicons name="open-outline" size={14} color="#fff" />
                      </Pressable>
                    ) : null}
                    <Pressable onPress={handleDismissModal} style={mStyles.secondaryDark}>
                      <Text style={mStyles.secondaryDarkText}>Continuar escuchando</Text>
                    </Pressable>
                  </View>
                  {modalNotice.dismissible ? (
                    <Pressable onPress={handlePermanentDismissModal} style={{ marginTop: 8, alignItems: "center" }}>
                      <Text style={{ fontSize: 11, color: "#64748B", textDecorationLine: "underline" }}>No volver a mostrar</Text>
                    </Pressable>
                  ) : null}

                  {modalNotice.maxDisplaysPerUser > 0 ? (
                    <Text style={mStyles.counter}>
                      {modalViewCount}/{modalNotice.maxDisplaysPerUser} vistas
                    </Text>
                  ) : null}
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  if (!current) return null;

  const accent = ACCENT[current.variant] ?? ACCENT.info;
  const gallery = current.gallery ?? [];
  const videoUri = resolveNoticeMediaUri(current.videoUrl);
  const imageUri = resolveNoticeMediaUri(current.imageUrl);

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

        {gallery.length > 0 ? (
          gallery[0].type === "video" ? (
            <InlineVideo uri={resolveNoticeMediaUri(gallery[0].url) ?? ""} posterUri={gallery[0].posterUrl ? resolveNoticeMediaUri(gallery[0].posterUrl) : null} aspectRatio={16 / 7} />
          ) : (
            <Image source={{ uri: resolveNoticeMediaUri(gallery[0].url) ?? undefined }} style={styles.image} resizeMode="cover" />
          )
        ) : videoUri ? (
          <InlineVideo uri={videoUri} aspectRatio={16 / 7} />
        ) : imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
        ) : null}

        <View style={styles.body}>
          <Pressable onPress={handleDismiss} style={styles.closeBtn} hitSlop={12}>
            <Ionicons name="close" size={18} color="#94A3B8" />
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
              <Text style={styles.secondaryText}>Ocultar</Text>
            </Pressable>
            {current.dismissible ? (
              <Pressable onPress={handlePermanentDismiss} style={[styles.secondary, { paddingVertical: 6 }]}>
                <Text style={[styles.secondaryText, { fontSize: 11, textDecorationLine: "underline" }]}>No volver a mostrar</Text>
              </Pressable>
            ) : null}
          </View>

          {current.maxDisplaysPerUser > 0 ? <Text style={styles.counter}>{viewCount}/{current.maxDisplaysPerUser} vistas</Text> : null}
        </View>
      </View>
    </View>
  );
}

const mStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(3,7,18,0.68)",
    justifyContent: "center",
    padding: 16,
  },
  cardWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: "100%",
    maxWidth: 520,
    overflow: "hidden",
    borderRadius: 20,
    backgroundColor: "#1E293B",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#334155",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 16,
  },
  consoleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0F172A",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#334155",
  },
  tallyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tallyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#E11D48",
    shadowColor: "#E11D48",
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  tallyText: {
    color: "#F8FAFC",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  dialRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    opacity: 0.55,
  },
  dialText: { color: "#94A3B8", fontSize: 9, letterSpacing: 0.6 },
  dialTick: { width: 1, height: 8, backgroundColor: "#334155" },
  dialNeedle: { width: 1, height: 12, backgroundColor: "#818CF8", marginHorizontal: 2 },
  dialFm: { color: "#94A3B8", fontSize: 8, fontWeight: "700", marginLeft: 2 },
  closeBtnDark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(148,163,184,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  perforatedHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#1E293B",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#334155",
  },
  dotsRow: { flexDirection: "row", gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#334155" },
  eyebrowDark: {
    marginLeft: "auto",
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.2,
    color: "#64748B",
  },
  image: {
    width: "100%",
    aspectRatio: 16 / 8,
    backgroundColor: "#0F172A",
  },
  body: {
    padding: 18,
  },
  variantLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.4,
    color: "#94A3B8",
  },
  title: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: "800",
    color: "#F8FAFC",
    lineHeight: 26,
  },
  message: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: "#94A3B8",
  },
  actions: {
    flexDirection: "column",
    gap: 8,
    marginTop: 18,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#6366F1",
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 999,
  },
  ctaText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  secondaryDark: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#334155",
  },
  secondaryDarkText: { fontSize: 14, fontWeight: "500", color: "#CBD5E1" },
  counter: {
    marginTop: 10,
    fontSize: 11,
    color: "#475569",
    textAlign: "center",
  },
});

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    alignItems: "center",
    zIndex: 60,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: "#1E293B",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#334155",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  accentBar: {
    height: 3,
  },
  perforatedHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#1E293B",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#334155",
  },
  dotsRow: {
    flexDirection: "row",
    gap: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#334155",
  },
  eyebrow: {
    marginLeft: "auto",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.4,
    color: "#64748B",
  },
  image: {
    width: "100%",
    aspectRatio: 16 / 7,
    backgroundColor: "#0F172A",
  },
  body: {
    padding: 16,
    paddingRight: 40,
  },
  closeBtn: {
    position: "absolute",
    right: 8,
    top: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(148,163,184,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#F8FAFC",
    lineHeight: 22,
  },
  message: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: "#94A3B8",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#6366F1",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  ctaText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  secondary: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  secondaryText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#94A3B8",
  },
  counter: {
    marginTop: 8,
    fontSize: 11,
    color: "#475569",
    fontFamily: "monospace",
  },
});
