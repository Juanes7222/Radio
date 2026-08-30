import { View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

interface Props {
  uri: string;
  posterUri?: string | null;
  aspectRatio?: number;
}

/**
 * Inline video player for notices.
 * Prefers native expo-video when available for hardware acceleration;
 * falls back to WebView with HTML5 video for compatibility.
 */
export function InlineVideo({ uri, posterUri, aspectRatio = 16 / 7 }: Props) {
  // Attempt to use native player if expo-video is installed
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const expoVideo = require("expo-video") as {
      useVideoPlayer: (uri: string, fn: (p: any) => void) => any;
      VideoView: React.ComponentType<any>;
    };
    if (expoVideo?.useVideoPlayer && expoVideo?.VideoView) {
      const NativeInlineVideo = ({ uri: nativeUri }: { uri: string }) => {
        const player = expoVideo.useVideoPlayer(nativeUri, (player: any) => {
          player.loop = false;
          player.muted = false;
        });
        return (
          <View style={[styles.container, { aspectRatio }]}>
            <expoVideo.VideoView
              player={player}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              nativeControls
              allowsFullscreen
              allowsPictureInPicture
            />
          </View>
        );
      };
      return <NativeInlineVideo uri={uri} />;
    }
  } catch {
    // Fallback to WebView
  }

  const posterAttr = posterUri ? ` poster="${posterUri.replace(/"/g, "&quot;")}"` : "";
  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>html,body{margin:0;padding:0;background:#0F172A;height:100%;overflow:hidden}video{width:100%;height:100%;object-fit:contain;background:#0F172A}</style></head><body><video src="${uri.replace(/"/g, "&quot;")}"${posterAttr} controls playsinline preload="metadata" style="width:100%;height:100%"></video></body></html>`;
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
        allowsFullscreenVideo
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
