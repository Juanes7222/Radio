import { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { useVideoPlayer, VideoView, VideoPlayer } from "expo-video";

interface Props {
  uri: string;
  posterUri?: string | null;
  aspectRatio?: number;
  initialTime?: number;
  onPlayerReady?: (player: VideoPlayer) => void;
}

function NativeInlineVideo({ uri, aspectRatio, initialTime, onPlayerReady }: { uri: string; aspectRatio: number; initialTime?: number; onPlayerReady?: (p: VideoPlayer) => void }) {
  const player = useVideoPlayer(uri, (player) => {
    player.loop = false;
    player.muted = false;
    // Buffer mínimo para arranque más rápido (avisos cortos)
    try {
      // @ts-ignore - bufferOptions existe en expo-video 57
      player.bufferOptions = { preferredForwardBufferDuration: 1 };
    } catch {}
  });

  useEffect(() => {
    onPlayerReady?.(player);
  }, [player, onPlayerReady]);

  useEffect(() => {
    // Si viene con tiempo inicial (reanudar desde panel), hacer seek antes de play
    if (initialTime != null && initialTime > 0) {
      try {
        player.currentTime = initialTime;
      } catch {}
    }
    // Autoplay inmediato sin timeout para reducir demora percibida
    try {
      player.play();
    } catch {}
  }, [player, initialTime]);

  return (
    <View style={[styles.container, { aspectRatio }]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls
        surfaceType="textureView"
      />
    </View>
  );
}

/**
 * Inline video player for notices.
 * Prefers native expo-video when available for hardware acceleration;
 * falls back to WebView with HTML5 video for compatibility.
 */
export function InlineVideo({ uri, posterUri, aspectRatio = 16 / 7, initialTime, onPlayerReady }: Props) {
  // El bug anterior creaba el componente nativo dentro del render, liberando el
  // shared object antes de asignarlo a SurfaceVideoView -> "already released".
  // Ahora NativeInlineVideo es estable y usa surfaceType="textureView" para
  // evitar pantalla negra dentro de Modals/Carousels en Android.
  // Detectar video por extensión o por ruta de notices (/media/notice-videos)
  const isDirectVideo =
    uri &&
    (/\.(mp4|mov|m4v|webm|m3u8)(\?|$)/i.test(uri) ||
      uri.includes("/media/notice-videos") ||
      uri.includes("/api/media"));
  if (isDirectVideo) {
    return <NativeInlineVideo uri={uri} aspectRatio={aspectRatio} initialTime={initialTime} onPlayerReady={onPlayerReady} />;
  }

  const posterAttr = posterUri ? ` poster="${posterUri.replace(/"/g, "&quot;")}"` : "";
  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>html,body{margin:0;padding:0;background:#0F172A;height:100%;overflow:hidden}video{width:100%;height:100%;object-fit:contain;background:#0F172A}</style></head><body><video src="${uri.replace(/"/g, "&quot;")}"${posterAttr} controls autoplay muted loop playsinline webkit-playsinline preload="auto" style="width:100%;height:100%"></video><script>var v=document.querySelector('video');v.muted=true;v.play().catch(()=>{});v.addEventListener('click',()=>{if(v.paused)v.play();else v.pause();});<\/script></body></html>`;
  return (
    <View style={{ width: "100%", aspectRatio, backgroundColor: "#0F172A", overflow: "hidden" }}>
      <WebView
        source={{ html }}
        style={{ flex: 1, backgroundColor: "#0F172A" }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        originWhitelist={["*"]}
        mixedContentMode="always"
        allowsFullscreenVideo={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    backgroundColor: "#0F172A",
    overflow: "hidden",
  },
});
