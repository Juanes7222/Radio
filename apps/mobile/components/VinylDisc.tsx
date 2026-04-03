import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, StyleSheet, AppState, AppStateStatus } from 'react-native';
import { Image } from 'expo-image';
import Svg, {
  Circle,
  Defs,
  RadialGradient,
  LinearGradient,
  Stop,
} from 'react-native-svg';

interface VinylDiscProps {
  artworkUri: string | null;
  isPlaying: boolean;
  size: number;
}

const ROTATION_DURATION_MS = 8000;
const GROOVE_COUNT = 18;

export function VinylDisc({ artworkUri, isPlaying, size }: VinylDiscProps) {
  const rotation = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(1)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      setAppState(nextAppState);
    });
    return () => { subscription.remove(); };
  }, []);

  useEffect(() => {
    Animated.spring(scale, {
      toValue: isPlaying ? 1 : 0.88,
      friction: 7,
      tension: 70,
      useNativeDriver: true,
    }).start();
  }, [isPlaying, scale]);

  useEffect(() => {
    loopRef.current?.stop();
    loopRef.current = null;

    if (isPlaying && appState === 'active') {
      const loop = Animated.loop(
        Animated.timing(rotation, {
          toValue: 1,
          duration: ROTATION_DURATION_MS,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      loopRef.current = loop;
      loop.start();
    }

    return () => { loopRef.current?.stop(); };
  }, [isPlaying, appState, rotation]);

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const radius      = size / 2;
  const labelSize   = size * 0.40;
  const labelRadius = labelSize / 2;
  const holeSize    = size * 0.055;
  const holeRadius  = holeSize / 2;

  // Groove rings: from 49% down to (label edge + small gap)
  const grooveOuterFraction = 0.494;
  const grooveInnerFraction = (labelRadius + size * 0.03) / radius;
  const grooveStep = (grooveOuterFraction - grooveInnerFraction) / (GROOVE_COUNT - 1);

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        transform: [{ scale }, { rotate: spin }],
        shadowColor: '#818cf8',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.6,
        shadowRadius: 36,
        elevation: 20,
      }}
    >
      {/* ── SVG layer: vinyl body + grooves ── */}
      <Svg
        width={size}
        height={size}
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          {/* Vinyl body: dark near center and edges, slight mid-sheen */}
          <RadialGradient id="vinylBody" cx="50%" cy="50%" r="50%">
            <Stop offset="0%"   stopColor="#1e1a2e" stopOpacity="1" />
            <Stop offset="40%"  stopColor="#0e0c18" stopOpacity="1" />
            <Stop offset="75%"  stopColor="#121020" stopOpacity="1" />
            <Stop offset="100%" stopColor="#080810" stopOpacity="1" />
          </RadialGradient>

          {/* Diagonal sheen gloss over the grooves */}
          <LinearGradient id="gloss" x1="20%" y1="10%" x2="80%" y2="90%">
            <Stop offset="0%"   stopColor="#ffffff" stopOpacity="0.04" />
            <Stop offset="45%"  stopColor="#ffffff" stopOpacity="0.09" />
            <Stop offset="100%" stopColor="#ffffff" stopOpacity="0.01" />
          </LinearGradient>
        </Defs>

        {/* Dark vinyl body */}
        <Circle cx={radius} cy={radius} r={radius} fill="url(#vinylBody)" />

        {/* Outer chrome bevel */}
        <Circle
          cx={radius} cy={radius} r={radius - 2}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={3}
        />

        {/* Groove rings — alternating light/dark for depth */}
        {Array.from({ length: GROOVE_COUNT }, (_, i) => {
          const fraction = grooveOuterFraction - i * grooveStep;
          const r = fraction * radius;
          const opacity = i % 2 === 0 ? 0.22 : 0.08;
          return (
            <Circle
              key={i}
              cx={radius}
              cy={radius}
              r={r}
              fill="none"
              stroke={`rgba(255,255,255,${opacity})`}
              strokeWidth={1}
            />
          );
        })}

        {/* Diagonal gloss overlay */}
        <Circle cx={radius} cy={radius} r={radius} fill="url(#gloss)" />
      </Svg>

      {/* ── Label (artwork) clipped to circle ── */}
      <View
        style={{
          position: 'absolute',
          top: radius - labelRadius,
          left: radius - labelRadius,
          width: labelSize,
          height: labelSize,
          borderRadius: labelRadius,
          overflow: 'hidden',
          borderWidth: 2,
          borderColor: 'rgba(255,255,255,0.18)',
        }}
      >
        <Image
          source={artworkUri ? { uri: artworkUri } : require('../assets/default-album-art.png')}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={500}
        />

        {/* Subtle darkening vignette on label edges */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.labelVignette]} />
      </View>

      {/* ── Spindle hole (on top of label) ── */}
      <View
        style={{
          position: 'absolute',
          top: radius - holeRadius,
          left: radius - holeRadius,
          width: holeSize,
          height: holeSize,
          borderRadius: holeRadius,
          backgroundColor: '#06060e',
          borderWidth: 1.5,
          borderColor: 'rgba(255,255,255,0.4)',
        }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  labelVignette: {
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
});
