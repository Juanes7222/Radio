import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** Width the layout was authored against (iPhone SE / 12 / 13). */
const GUIDELINE_BASE_WIDTH = 375;

/**
 * Growth stops at a large-phone width. Without this ceiling a tablet or an
 * unfolded foldable scales every control up (a 76dp play button becomes 162dp)
 * while the player dial stays capped, so the proportions collapse. Past this
 * width the phone layout is centred as-is until a real tablet layout exists.
 */
const SCALE_MAX_WIDTH = 430;

const WIDTH_RATIO = Math.min(SCREEN_WIDTH, SCALE_MAX_WIDTH) / GUIDELINE_BASE_WIDTH;

export const scale = (size: number) => WIDTH_RATIO * size;
