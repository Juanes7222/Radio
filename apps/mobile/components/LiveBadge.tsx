import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Colors, Radii, Typography } from '@/constants/theme';

interface LiveBadgeProps {
  listenersCount: number;
}

export function LiveBadge({ listenersCount }: LiveBadgeProps) {
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1.9,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.8,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseOpacity, pulseScale]);

  const formattedListeners = listenersCount > 999
    ? `${(listenersCount / 1000).toFixed(1)}k`
    : String(listenersCount);

  return (
    <View style={styles.row}>
      <View style={styles.dotContainer}>
        <Animated.View
          style={[
            styles.pulseDot,
            { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
          ]}
        />
        <View style={styles.solidDot} />
      </View>

      <Text style={styles.liveLabel}>EN VIVO</Text>

      {listenersCount > 0 && (
        <>
          <View style={styles.divider} />
          <Text style={styles.listenersText}>
            {formattedListeners} {listenersCount === 1 ? 'oyente' : 'oyentes'}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(239,68,68,0.1)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  dotContainer: {
    width: 8,
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
  },
  solidDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
  },
  liveLabel: {
    ...Typography.label,
    color: Colors.danger,
  },
  divider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(239,68,68,0.3)',
  },
  listenersText: {
    ...Typography.caption,
    color: 'rgba(239,68,68,0.75)',
    fontWeight: '500',
  },
});
