import { useCallback, useEffect, useRef } from 'react';
import {
  Pressable,
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

function indexFromOffset(offsetY: number, length: number): number {
  return Math.min(Math.max(Math.round(offsetY / ITEM_HEIGHT), 0), length - 1);
}

interface WheelColumnProps {
  items: string[];
  selected: number;
  onChange: (index: number) => void;
  width?: number;
  /** Prefix for screen readers, since the item alone is ambiguous (hours vs minutes). */
  label?: string;
}

function WheelColumn({ items, selected, onChange, width = 104, label }: WheelColumnProps) {
  const scrollRef = useRef<ScrollView>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Index the wheel is currently showing. A `selected` that disagrees with it
  // did not come from this wheel, so the wheel has to follow the form.
  const shownRef = useRef<number | null>(null);
  const isFirstRunRef = useRef(true);

  const moveTo = useCallback((index: number, animated = false) => {
    shownRef.current = index;
    scrollRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated });
  }, []);

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current === null) return;
    clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
  }, []);

  const settle = useCallback(
    (offsetY: number) => {
      const index = indexFromOffset(offsetY, items.length);
      shownRef.current = index;
      onChange(index);
    },
    [items.length, onChange]
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { y } = event.nativeEvent.contentOffset;
      clearSettleTimer();
      settleTimerRef.current = setTimeout(() => settle(y), SETTLE_DELAY_MS);
    },
    [clearSettleTimer, settle]
  );

  // A pending timer from an earlier frame would land after the drag ended and
  // overwrite the index the user just parked on.
  const handleScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      clearSettleTimer();
      settle(event.nativeEvent.contentOffset.y);
    },
    [clearSettleTimer, settle]
  );

  useEffect(() => {
    if (isFirstRunRef.current) {
      // The opening position is set from onLayout: scrolling a ScrollView
      // before its content is measured has no effect.
      isFirstRunRef.current = false;
      return;
    }
    if (shownRef.current === selected) return;
    moveTo(selected);
  }, [moveTo, selected]);

  useEffect(() => clearSettleTimer, [clearSettleTimer]);

  const handleLayout = useCallback(() => {
    if (shownRef.current === selected) return;
    moveTo(selected);
  }, [moveTo, selected]);

  const handlePress = useCallback(
    (index: number) => {
      clearSettleTimer();
      moveTo(index, true);
      onChange(index);
    },
    [clearSettleTimer, moveTo, onChange]
  );

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
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        scrollEventThrottle={16}
        onLayout={handleLayout}
      >
        {items.map((item, index) => (
          <Pressable
            key={item}
            style={styles.item}
            accessibilityRole="button"
            accessibilityLabel={label ? `${item} ${label}` : item}
            onPress={() => handlePress(index)}
          >
            <Text style={[styles.itemText, index === selected && styles.itemTextActive]}>
              {item}
            </Text>
          </Pressable>
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
      <WheelColumn
        items={hourItems}
        selected={hourIndex}
        onChange={handleHourChange}
        width={88}
        label="horas"
      />
      <Text style={styles.separator}>:</Text>
      <WheelColumn
        items={minuteItems}
        selected={minute}
        onChange={onMinuteChange}
        width={88}
        label="minutos"
      />
      <WheelColumn
        items={['AM', 'PM']}
        selected={isPM ? 1 : 0}
        onChange={handlePeriodChange}
        width={72}
        label="periodo"
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