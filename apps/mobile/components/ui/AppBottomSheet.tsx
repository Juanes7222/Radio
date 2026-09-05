import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radii } from '@/constants/theme';

interface AppBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  snapPoints?: (string | number)[];
  children: React.ReactNode;
}

const DEFAULT_SNAP_POINTS: (string | number)[] = ['45%', '70%'];

export function AppBottomSheet({ visible, onClose, snapPoints = DEFAULT_SNAP_POINTS, children }: AppBottomSheetProps) {
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

  useEffect(() => {
    // Diferir al siguiente tick: en el primer montaje con visible=true
    // (p. ej. BiblePanel) el ref aún no existe en el efecto inicial.
    const timer = setTimeout(() => {
      if (visible) {
        ref.current?.present();
      } else {
        ref.current?.dismiss();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [visible]);

  const handleDismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleChange = useCallback(
    (index: number) => {
      if (index === -1) {
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
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.sheetBackground}
      topInset={insets.top}
    >
      <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
        {children}
      </BottomSheetView>
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
