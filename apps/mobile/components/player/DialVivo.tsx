import { useEffect } from 'react';
import { View, StyleSheet, AppState, AccessibilityInfo } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  cancelAnimation,
  Easing,
  interpolate,
  FadeIn,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, LinearGradient, Stop } from 'react-native-svg';
import { Colors, Shadows } from '@/constants/theme';
import { Motion, Spring } from '@/constants/motion';
import DefaultAlbumArt from '../../assets/default-album-art.png';

interface DialVivoProps {
  artworkUri: string | null;
  isPlaying: boolean;
  isPreaching?: boolean;
  size: number;
}

const GROOVE_COUNT = 18;

export function DialVivo({ artworkUri, isPlaying, isPreaching, size }: DialVivoProps) {
  const rotation = useSharedValue(0);
  const haloScale = useSharedValue(1);
  const haloOpacity = useSharedValue(0.32);
  const scale = useSharedValue(isPlaying ? 1 : 0.92);
  const reduceMotion = useSharedValue(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => {
      reduceMotion.value = !!v;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = (AccessibilityInfo.addEventListener as any)?.('reduceMotionChanged', (v: boolean) => {
      reduceMotion.value = v;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return () => (sub as any)?.remove?.();
  }, [reduceMotion]);

  // Scale spring on playing state
  useEffect(() => {
    scale.value = withSpring(isPlaying ? 1 : 0.92, Spring.gentle);
  }, [isPlaying, scale]);

  // Rotation loop
  useEffect(() => {
    if (isPlaying && !reduceMotion.value) {
      rotation.value = 0;
      rotation.value = withRepeat(
        withTiming(1, { duration: Motion.vinylRotationMs, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(rotation);
    }
    return () => cancelAnimation(rotation);
  }, [isPlaying, rotation, reduceMotion]);

  // Halo breathing
  useEffect(() => {
    if (isPlaying && !reduceMotion.value) {
      haloScale.value = withRepeat(
        withTiming(1.08, { duration: Motion.haloPulseMs, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
      haloOpacity.value = withRepeat(
        withTiming(isPreaching ? 0.18 : 0.42, { duration: Motion.haloPulseMs, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      cancelAnimation(haloScale);
      cancelAnimation(haloOpacity);
      haloScale.value = withTiming(1, { duration: 260 });
      haloOpacity.value = withTiming(isPlaying ? 0.22 : 0, { duration: 260 });
    }
    return () => {
      cancelAnimation(haloScale);
      cancelAnimation(haloOpacity);
    };
  }, [isPlaying, isPreaching, haloScale, haloOpacity, reduceMotion]);

  // AppState pause
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        cancelAnimation(rotation);
        cancelAnimation(haloScale);
        cancelAnimation(haloOpacity);
      } else if (isPlaying && !reduceMotion.value) {
        rotation.value = withRepeat(
          withTiming(1, { duration: Motion.vinylRotationMs, easing: Easing.linear }),
          -1,
          false
        );
      }
    });
    return () => subscription.remove();
  }, [isPlaying, rotation, haloScale, haloOpacity, reduceMotion]);

  const animatedDiscStyle = useAnimatedStyle(() => {
    const rotate = interpolate(rotation.value, [0, 1], [0, 360]);
    return {
      transform: [{ scale: scale.value }, { rotate: `${rotate}deg` }],
    };
  });

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: haloScale.value }],
    opacity: haloOpacity.value,
  }));

  const radius = size / 2;
  const labelSize = size * 0.4;
  const labelRadius = labelSize / 2;
  const holeSize = size * 0.055;
  const holeRadius = holeSize / 2;
  const grooveOuterFraction = 0.494;
  const grooveInnerFraction = (labelRadius + size * 0.03) / radius;
  const grooveStep = (grooveOuterFraction - grooveInnerFraction) / (GROOVE_COUNT - 1);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Halo ámbar respirando — signature */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: size * 0.96,
            height: size * 0.96,
            borderRadius: size / 2,
            backgroundColor: Colors.signal,
          },
          Shadows.signal,
          haloStyle,
        ]}
      />

      {/* Soft outer glow secundario para profundidad */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: size * 0.88,
          height: size * 0.88,
          borderRadius: size / 2,
          backgroundColor: isPreaching ? 'rgba(255,181,71,0.08)' : 'rgba(255,181,71,0.06)',
        }}
      />

      <Animated.View style={[{ width: size, height: size }, animatedDiscStyle]}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="vinylBodyVivo" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#1E1A2E" stopOpacity="1" />
              <Stop offset="40%" stopColor="#0E0C18" stopOpacity="1" />
              <Stop offset="75%" stopColor="#121020" stopOpacity="1" />
              <Stop offset="100%" stopColor="#060814" stopOpacity="1" />
            </RadialGradient>
            <LinearGradient id="glossVivo" x1="20%" y1="10%" x2="80%" y2="90%">
              <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.04" />
              <Stop offset="45%" stopColor="#ffffff" stopOpacity="0.09" />
              <Stop offset="100%" stopColor="#ffffff" stopOpacity="0.01" />
            </LinearGradient>
            <RadialGradient id="rimSignal" cx="50%" cy="50%" r="50%">
              <Stop offset="92%" stopColor="transparent" stopOpacity="0" />
              <Stop offset="100%" stopColor={Colors.signal} stopOpacity="0.18" />
            </RadialGradient>
          </Defs>

          <Circle cx={radius} cy={radius} r={radius} fill="url(#vinylBodyVivo)" />
          <Circle
            cx={radius}
            cy={radius}
            r={radius - 1.5}
            fill="none"
            stroke="rgba(255,255,255,0.10)"
            strokeWidth={2}
          />
          <Circle cx={radius} cy={radius} r={radius} fill="url(#rimSignal)" />

          {Array.from({ length: GROOVE_COUNT }, (_, i) => {
            const fraction = grooveOuterFraction - i * grooveStep;
            const r = fraction * radius;
            const opacity = i % 2 === 0 ? 0.20 : 0.07;
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

          <Circle cx={radius} cy={radius} r={radius} fill="url(#glossVivo)" />
        </Svg>

        <Animated.View
          key={artworkUri ?? 'default-art'}
          entering={FadeIn.duration(360).easing(Easing.bezier(0.16, 1, 0.3, 1))}
          style={{
            position: 'absolute',
            top: radius - labelRadius,
            left: radius - labelRadius,
            width: labelSize,
            height: labelSize,
            borderRadius: labelRadius,
            overflow: 'hidden',
            borderWidth: 1.5,
            borderColor: 'rgba(255,255,255,0.14)',
            backgroundColor: '#0A0A14',
          }}
        >
          <Image
            source={artworkUri ? { uri: artworkUri } : DefaultAlbumArt}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={320}
            cachePolicy="memory-disk"
            priority="high"
          />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.12)' }]} />
        </Animated.View>

        <View
          style={{
            position: 'absolute',
            top: radius - holeRadius,
            left: radius - holeRadius,
            width: holeSize,
            height: holeSize,
            borderRadius: holeRadius,
            backgroundColor: '#06060E',
            borderWidth: 1.2,
            borderColor: 'rgba(255,255,255,0.35)',
          }}
        />
      </Animated.View>
    </View>
  );
}
