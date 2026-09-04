import { useCallback, useEffect, useMemo, useRef } from 'react';
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

export function AppBottomSheet({ visible, onClose, snapPoints = ['45%', '70%'], children }: AppBottomSheetProps) {
  const ref = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();

  const points = useMemo(() => snapPoints, [snapPoints]);

  useEffect(() => {
    if (visible) {
      ref.current?.present();
    } else {
      ref.current?.dismiss();
    }
  }, [visible]);

  const handleDismiss = useCallback(() => {
    onClose();
  }, [onClose]);

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
      snapPoints={points}
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
