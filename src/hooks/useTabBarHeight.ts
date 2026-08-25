import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../design/system';

export interface TabBarHeightMetrics {
  /** Gap between the floating capsule's lower edge and the screen bottom. */
  bottomPadding: number;
  /** The capsule itself. */
  barHeight: number;
  /** Horizontal inset on each side of the capsule. */
  sideInset: number;
  /** Total space the tab bar occupies at the bottom — what content must clear. */
  height: number;
}

// The tab bar is a floating capsule rather than a full-width bar pinned to the
// bottom edge, so "height" here is the space content must leave clear: the
// capsule plus the gap beneath it. Every surface docked above the tab bar reads
// these numbers, so the capsule and the things floating over it stay in sync.
//
// Measured against the reference: a 392x62pt capsule inset 24pt each side,
// sitting 21pt above the screen bottom on a 440pt-wide device.
export const TAB_BAR_CAPSULE_HEIGHT = 62;
export const TAB_BAR_CAPSULE_SIDE_INSET = 24;
export const TAB_BAR_CAPSULE_RADIUS = TAB_BAR_CAPSULE_HEIGHT / 2;

export function useTabBarHeight(): TabBarHeightMetrics {
  const insets = useSafeAreaInsets();
  // On a device with a home indicator the capsule tucks into the safe area — the
  // indicator is a hairline, so 21pt reads as a deliberate gap rather than a
  // collision. Without one, fall back to the standard gutter.
  const bottomPadding = insets.bottom > 0 ? 21 : spacing.lg;

  return {
    bottomPadding,
    barHeight: TAB_BAR_CAPSULE_HEIGHT,
    sideInset: TAB_BAR_CAPSULE_SIDE_INSET,
    height: bottomPadding + TAB_BAR_CAPSULE_HEIGHT,
  };
}
