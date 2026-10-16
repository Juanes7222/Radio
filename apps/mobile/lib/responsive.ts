import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

/** Width the layout was authored against (iPhone SE / 12 / 13). */
export const GUIDELINE_BASE_WIDTH = 375;

/**
 * Growth stops at a large-phone width. Without this ceiling a tablet or an
 * unfolded foldable scales every control up (a 76dp play button becomes 162dp)
 * while the player dial stays capped, so the proportions collapse. Past this
 * width the phone layout is centred as-is until a real tablet layout exists.
 */
export const SCALE_MAX_WIDTH = 430;

/**
 * Widest the phone layout stretches to. Past it (a foldable unfolded in
 * portrait) the sections stay centred instead of spreading to the edges:
 * chrome meant to hug the dial reads as broken when pinned to a 700dp bar.
 */
export const CONTENT_MAX_WIDTH = 480;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export interface ResponsiveMetrics {
  width: number;
  height: number;
  /** Dynamic Type scale of the device, for width decisions involving text. */
  fontScale: number;
  /** Proportional width scale, capped at SCALE_MAX_WIDTH. */
  scale: (size: number) => number;
}

/**
 * Live window metrics.
 *
 * The window can change size without a reload (Android split screen, a
 * foldable unfolding), and a module-scope Dimensions read freezes whatever
 * size the app happened to open in, which is what once left the dial sized
 * for the wrong window. Every responsive value has to come from here, and
 * each control keeps its own floor and ceiling so it stays touchable and
 * proportionate instead of scaling without limit.
 */
export function useResponsive(): ResponsiveMetrics {
  const { width, height, fontScale } = useWindowDimensions();

  return useMemo(() => {
    const ratio = Math.min(width, SCALE_MAX_WIDTH) / GUIDELINE_BASE_WIDTH;
    return {
      width,
      height,
      fontScale,
      scale: (size: number) => ratio * size,
    };
  }, [fontScale, height, width]);
}
