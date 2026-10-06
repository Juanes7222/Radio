import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { BottomSheetBackdrop, BottomSheetModal } from '@gorhom/bottom-sheet';
import Animated, { Easing, FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radii } from '@/constants/theme';
import { Durations, Easings } from '@/constants/motion';

/** Lets the sheet start rising before its contents resolve. */
const CONTENT_FADE_DELAY_MS = 60;

interface AppBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  snapPoints?: (string | number)[];
  /**
   * Disable when the sheet hosts a control that scrolls inside itself. The
   * content pan gesture activates on any vertical drag and cancels the nested
   * scroll view, which is what makes the alarm time wheel unresponsive.
   */
  enableContentPanningGesture?: boolean;
  children: React.ReactNode;
}

const DEFAULT_SNAP_POINTS: (string | number)[] = ['45%', '70%'];

export function AppBottomSheet({
  visible,
  onClose,
  snapPoints = DEFAULT_SNAP_POINTS,
  enableContentPanningGesture = true,
  children,
}: AppBottomSheetProps) {
  const ref = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();

  // Los llamadores pasan snapPoints como literal nuevo en cada render.
  // Conservar la referencia por valor para que el modal nativo no se
  // reconfigure y cierre lo que present() acaba de abrir.
  const pointsKey = snapPoints.join(',');
  const pointsRef = useRef(snapPoints);
  if (pointsRef.current.join(',') !== pointsKey) {
    pointsRef.current = snapPoints;
  }
  const points = pointsRef.current;

  // Dismissing a sheet that was never presented leaves BottomSheetModal in an
// inconsistent state: it still emits onDismiss, which calls onClose() and can
// close the sheet the caller just opened, and a later present() no longer
// recovers. Every modal here mounts closed and opens on demand, so the dismiss
// is only safe once we actually presented it.
const presentedRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      if (presentedRef.current) {
        ref.current?.dismiss();
      }
      return;
    }

    // Defer to the next tick: on the mount that flips visible to true the ref
    // exists but the native modal is not attached yet.
    const timer = setTimeout(() => {
      ref.current?.present();
      presentedRef.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, [visible]);

  const handleDismiss = useCallback(() => {
    presentedRef.current = false;
    onClose();
  }, [onClose]);

  const handleChange = useCallback(
    (index: number) => {
      if (index === -1) {
        presentedRef.current = false;
        onClose();
      }
    },
    [onClose],
  );

  const renderBackdrop = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.64}
        pressBehavior="close"
      />
    ),
    []
  );

  return (
    <BottomSheetModal
      ref={ref}
      index={0}
      snapPoints={points}
      onChange={handleChange}
      onDismiss={handleDismiss}
      enablePanDownToClose
      enableDynamicSizing={false}
      enableContentPanningGesture={enableContentPanningGesture}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.sheetBackground}
      topInset={insets.top}
    >
      {/**
       * A plain View, not BottomSheetView: the library forces the latter to
       * `position: absolute`, which drops it out of the flex layout so `flex: 1`
       * no longer resolves and the sheet grows to its content height. A scroll
       * view inside then measures contentSize === layout, reports no scroll
       * range, and whatever sits below the fold is clipped and unreachable.
       * As an in-flow child the sheet's own animated height bounds it instead.
       *
       * BottomSheetView also registered itself as the sheet scrollable, which
       * overrode the BottomSheetScrollView children and kept the pan gesture
       * from ever deferring to their scroll offset.
       *
       * Animated.View is still an in-flow View carrying `flex: 1`, so none of
       * the above applies. The library already animates the sheet rising, so the
       * content only fades: a second displacement on top of the sheet's own
       * movement reads as busy rather than layered. The short delay lets the
       * sheet start moving before its contents resolve.
       */}
      <Animated.View
        entering={FadeIn.delay(CONTENT_FADE_DELAY_MS).duration(Durations.normal).easing(Easing.bezier(...Easings.enter))}
        style={[styles.content, { paddingBottom: insets.bottom + 16 }]}
      >
        {children}
      </Animated.View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  handle: {
    backgroundColor: Colors.borderStrong,
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  sheetBackground: {
    backgroundColor: Colors.inkElevated,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderGlass,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
});
