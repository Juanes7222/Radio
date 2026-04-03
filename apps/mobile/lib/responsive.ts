import { Dimensions, Platform } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Based on standard iPhone SE / 12 and 13 widths
const guidelineBaseWidth = 375;
const guidelineBaseHeight = 812;

export const scale = (size: number) => (SCREEN_WIDTH / guidelineBaseWidth) * size;
export const verticalScale = (size: number) => (SCREEN_HEIGHT / guidelineBaseHeight) * size;
export const moderateScale = (size: number, factor = 0.5) => size + (scale(size) - size) * factor;

export const wp = (percentage: number) => {
  return Math.round((percentage * SCREEN_WIDTH) / 100);
};

export const hp = (percentage: number) => {
  return Math.round((percentage * SCREEN_HEIGHT) / 100);
};

export const isTablet = SCREEN_WIDTH >= 768;

export const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 88 : 68;
