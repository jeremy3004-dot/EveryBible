import { useWindowDimensions } from 'react-native';
import {
  getLargeTextRowDirection,
  isLargeTextScale,
  normalizeFontScale,
  type LargeTextRowDirection,
} from '../design/largeTextLayout';

export interface LargeTextLayout {
  /** The OS text scale (Dynamic Type / Android font size), 1 when unknown. */
  fontScale: number;
  /** True once side-by-side rows should stack; see LARGE_TEXT_FONT_SCALE. */
  isLargeText: boolean;
  rowDirection: LargeTextRowDirection;
}

// Re-renders with the window, so a text-size change in Settings re-lays the
// screen out without a restart.
export function useLargeText(): LargeTextLayout {
  const { fontScale } = useWindowDimensions();
  return {
    fontScale: normalizeFontScale(fontScale),
    isLargeText: isLargeTextScale(fontScale),
    rowDirection: getLargeTextRowDirection(fontScale),
  };
}
