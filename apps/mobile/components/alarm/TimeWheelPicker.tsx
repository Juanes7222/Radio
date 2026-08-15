import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/theme';

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 3;
const COLUMN_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const CENTER_PADDING = ITEM_HEIGHT;
// Fallback so the value also settles on platforms where drag/momentum end events never fire
const SETTLE_DELAY_MS = 120;

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

interface WheelColumnProps {
  items: string[];
  selected: number;
  onChange: (index: number) => void;
  width?: number;
}

function WheelColumn({ items, selected, onChange, width = 104 }: WheelColumnProps) {
  const scrollRef = useRef<ScrollView>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState(selected);

  const settleIndex = useCallback(
    (y: number) => {
      const index = Math.round(y / ITEM_HEIGHT);
      const clamped = Math.min(Math.max(index, 0), items.length - 1);
      setActive(clamped);
      onChange(clamped);
    },
    [items.length, onChange],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = event.nativeEvent.contentOffset.y;
      const index = Math.round(offset / ITEM_HEIGHT);
      const clamped = Math.min(Math.max(index, 0), items.length - 1);
      setActive(clamped);
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
      }
      settleTimerRef.current = setTimeout(() => settleIndex(offset), SETTLE_DELAY_MS);
    },
    [items.length, settleIndex],
  );

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
      }
    };
  }, []);

  return (
    <View style={[styles.column, { width }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.columnScroll}
        contentContainerStyle={styles.columnContent}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        overScrollMode="never"
        onScroll={handleScroll}
        onMomentumScrollEnd={(event) => settleIndex(event.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(event) => settleIndex(event.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        nestedScrollEnabled
        onLayout={() => {
          scrollRef.current?.scrollTo({ y: selected * ITEM_HEIGHT, animated: false });
        }}
      >
        {items.map((item, index) => (
          <View key={item} style={styles.item}>
            <Text style={[styles.itemText, index === active && styles.itemTextActive]}>
              {item}
            </Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.highlightBar} pointerEvents="none" />
      <LinearGradient
        pointerEvents="none"
        colors={['#12121f', 'rgba(18,18,31,0)']}
        style={styles.topFade}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(18,18,31,0)', '#12121f']}
        style={styles.bottomFade}
      />
    </View>
  );
}

interface TimeWheelPickerProps {
  hour: number;
  minute: number;
  onHourChange: (hour: number) => void;
  onMinuteChange: (minute: number) => void;
}

export function TimeWheelPicker({ hour, minute, onHourChange, onMinuteChange }: TimeWheelPickerProps) {
  const isPM = hour >= 12;
  // Map a 24h hour to its 12h wheel index (0..11 => 12,1,2,...,11)
  const hourIndex = (hour + 11) % 12;
  const hourItems = range(1, 12).map((value) => String(value));
  const minuteItems = range(0, 59).map((value) => String(value).padStart(2, '0'));

  const handleHourChange = (index: number) => {
    const hour12 = index + 1;
    onHourChange((hour12 % 12) + (isPM ? 12 : 0));
  };

  const handlePeriodChange = (index: number) => {
    onHourChange((hour % 12) + (index === 1 ? 12 : 0));
  };

  return (
    <View style={styles.container}>
      <WheelColumn items={hourItems} selected={hourIndex} onChange={handleHourChange} width={88} />
      <Text style={styles.separator}>:</Text>
      <WheelColumn items={minuteItems} selected={minute} onChange={onMinuteChange} width={88} />
      <WheelColumn
        items={['AM', 'PM']}
        selected={isPM ? 1 : 0}
        onChange={handlePeriodChange}
        width={72}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginVertical: 8,
  },
  column: {
    height: COLUMN_HEIGHT,
  },
  columnScroll: {
    flex: 1,
  },
  columnContent: {
    paddingVertical: CENTER_PADDING,
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    color: Colors.textAlt,
    fontSize: 19,
    fontWeight: '400',
  },
  itemTextActive: {
    color: Colors.textBright,
    fontSize: 27,
    fontWeight: '700',
  },
  separator: {
    color: Colors.textBright,
    fontSize: 27,
    fontWeight: '700',
    marginHorizontal: 8,
  },
  highlightBar: {
    position: 'absolute',
    top: ITEM_HEIGHT,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    backgroundColor: Colors.accentMuted,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
  },
  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
  },
});
