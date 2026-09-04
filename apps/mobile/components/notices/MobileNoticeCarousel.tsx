import { useEffect, useRef, useState } from "react";
import { View, ScrollView, Pressable, StyleSheet, Dimensions, Text, Modal, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "react-native";
import Animated, { LinearTransition, Easing } from "react-native-reanimated";
import { resolveNoticeMediaUri } from "@/lib/noticeMedia";
import { InlineVideo } from "./InlineVideo";

export interface CarouselItem {
  type: "image" | "video";
  url: string;
  posterUrl: string | null;
}

interface Props {
  items: CarouselItem[];
  autoPlayMs?: number;
}

/**
 * Native filmstrip carousel for mobile full-screen notices.
 * Uses ScrollView paging + autoplay, with tape-deck controls.
 * Distinctive: perforated rails, tally indicator, manual jog.
 */
export function MobileNoticeCarousel({ items, autoPlayMs = 4000 }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [lightboxType, setLightboxType] = useState<"image" | "video">("image");
  const [resumeTime, setResumeTime] = useState(0);
  const previewPlayers = useRef<Map<number, import("expo-video").VideoPlayer>>(new Map());
  const openedIndexRef = useRef<number | null>(null);
  const width = Dimensions.get("window").width - 32; // modal padding

  useEffect(() => {
    if (items.length <= 1) return;
    const id = setInterval(() => {
      const next = (index + 1) % items.length;
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
      setIndex(next);
    }, autoPlayMs);
    return () => clearInterval(id);
  }, [index, items.length, autoPlayMs, width]);

  const handleScroll = (event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const offset = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offset / width);
    if (newIndex !== index) setIndex(newIndex);
  };

  const goPrev = () => {
    const prev = (index - 1 + items.length) % items.length;
    scrollRef.current?.scrollTo({ x: prev * width, animated: true });
    setIndex(prev);
  };

  const goNext = () => {
    const next = (index + 1) % items.length;
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
    setIndex(next);
  };

  return (
    <View style={styles.container}>
      {/* Top perforations */}
      <View style={styles.rail}>
        {Array.from({ length: 10 }).map((_, i) => (
          <View key={i} style={styles.perf} />
        ))}
        <Text style={styles.railText}>
          {items.length} FRAMES · AUTO
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
      >
        {items.map((item, idx) => {
          const uri = resolveNoticeMediaUri(item.url);
          const posterUri = item.posterUrl ? resolveNoticeMediaUri(item.posterUrl) : null;
          return (
            <View key={`${item.url}-${idx}`} style={{ width, minHeight: 200, maxHeight: 360, backgroundColor: "#0F172A", justifyContent: "center" }}>
              {item.type === "video" ? (
                <Pressable onPress={() => { if (uri) { const p = previewPlayers.current.get(idx); const t = p?.currentTime ?? 0; setResumeTime(t); openedIndexRef.current = idx; try { p?.pause(); } catch {} setLightboxUri(uri); setLightboxType("video"); } }}>
                  <View pointerEvents="none">
                    <InlineVideo uri={uri ?? ""} posterUri={posterUri} aspectRatio={16 / 9} onPlayerReady={(p) => previewPlayers.current.set(idx, p)} />
                  </View>
                  <View style={{ position: "absolute", bottom: 10, right: 10, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="expand-outline" size={12} color="#fff" />
                    <Text style={{ color: "#fff", fontSize: 10, fontWeight: "600" }}>Ampliar</Text>
                  </View>
                </Pressable>
              ) : (
                <Pressable onPress={() => { if (uri) { setLightboxUri(uri); setLightboxType("image"); } }} style={{ width: "100%", height: "100%", justifyContent: "center", alignItems: "center" }}>
                  <Image source={{ uri: uri ?? undefined }} style={{ width: "100%", height: 220, maxHeight: 360 }} resizeMode="contain" />
                  <View style={{ position: "absolute", bottom: 10, right: 10, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 999, width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="expand-outline" size={14} color="#fff" />
                  </View>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Bottom perforations */}
      <View style={styles.rail}>
        {Array.from({ length: 10 }).map((_, i) => (
          <View key={i} style={styles.perf} />
        ))}
        <Text style={styles.railText}>CINTA</Text>
      </View>

      {items.length > 1 && (
        <>
          <Pressable onPress={goPrev} style={[styles.arrow, styles.arrowLeft]} hitSlop={10}>
            <Ionicons name="chevron-back" size={18} color="#fff" />
          </Pressable>
          <Pressable onPress={goNext} style={[styles.arrow, styles.arrowRight]} hitSlop={10}>
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </Pressable>
          <Animated.View layout={LinearTransition.duration(200).easing(Easing.bezier(0.16, 1, 0.3, 1))} style={styles.dots}>
            {items.map((_, i) => (
              <Animated.View
                key={i}
                layout={LinearTransition.duration(260).easing(Easing.bezier(0.16, 1, 0.3, 1))}
                style={[styles.dot, i === index && styles.dotActive]}
              />
            ))}
          </Animated.View>
        </>
      )}

      {lightboxUri && (
        <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => { const idx = openedIndexRef.current; if (idx != null) try { previewPlayers.current.get(idx)?.play(); } catch {} setLightboxUri(null); }}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center", alignItems: "center", padding: 16 }} onPress={() => { const idx = openedIndexRef.current; if (idx != null) try { previewPlayers.current.get(idx)?.play(); } catch {} setLightboxUri(null); }}>
            <Pressable style={{ position: "absolute", top: 50, right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" }} onPress={() => { const idx = openedIndexRef.current; if (idx != null) try { previewPlayers.current.get(idx)?.play(); } catch {} setLightboxUri(null); }}>
              <Ionicons name="close" size={20} color="#fff" />
            </Pressable>
            {lightboxType === "video" ? (
              <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%", aspectRatio: 16/9 }}>
                <InlineVideo uri={lightboxUri} aspectRatio={16/9} initialTime={resumeTime} />
              </Pressable>
            ) : (
              <Image source={{ uri: lightboxUri }} style={{ width: "100%", height: "70%" }} resizeMode="contain" />
            )}
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", backgroundColor: "#0F172A", position: "relative" },
  rail: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#1E293B",
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#334155",
  },
  perf: { width: 6, height: 6, borderRadius: 2, backgroundColor: "#334155" },
  railText: { marginLeft: "auto", fontSize: 8, color: "#64748B", letterSpacing: 1 },
  arrow: {
    position: "absolute",
    top: "50%",
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  arrowLeft: { left: 8, marginTop: -16 },
  arrowRight: { right: 8, marginTop: -16 },
  dots: {
    position: "absolute",
    bottom: 12,
    left: "50%",
    flexDirection: "row",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    transform: [{ translateX: -30 }],
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.4)" },
  dotActive: { width: 16, backgroundColor: "#fff" },
});
