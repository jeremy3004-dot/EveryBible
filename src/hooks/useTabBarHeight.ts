import { Platform } from 'react-native';
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
  /**
   * Bottom padding a scrolling screen should reserve: the space the capsule
   * occupies plus a breathing gap above it, so content never stops flush
   * against the paper edge.
   */
  contentClearance: number;
}

// The tab bar is a floating capsule rather than a full-width bar pinned to the
// bottom edge, so "height" here is the space content must leave clear: the
// capsule plus the gap beneath it. Every surface docked above the tab bar reads
// these numbers, so the capsule and the things floating over it stay in sync.
//
// EL geometry: a 64pt-tall capsule inset 16pt each side, radius 32, sitting
// 22pt above the screen bottom on a device with a home indicator.
export const TAB_BAR_CAPSULE_HEIGHT = 64;
export const TAB_BAR_CAPSULE_SIDE_INSET = 16;
export const TAB_BAR_CAPSULE_RADIUS = TAB_BAR_CAPSULE_HEIGHT / 2;
/** Breathing room between the last piece of content and the capsule's top edge. */
export const TAB_BAR_CONTENT_GAP = spacing.lg;

export function useTabBarHeight(): TabBarHeightMetrics {
  const insets = useSafeAreaInsets();
  // On iOS a non-zero bottom inset means a home indicator — a hairline — so the
  // capsule tucks into the safe area and 22pt reads as a deliberate gap.
  //
  // Android's bottom inset is a different animal: a three-button navigation bar
  // is 24-48dp of real chrome, and 22pt would park the capsule underneath it.
  // Clear the whole inset there, never less than the standard gutter.
  const bottomPadding =
    Platform.OS === 'android'
      ? Math.max(insets.bottom, spacing.lg)
      : insets.bottom > 0
        ? 22
        : spacing.lg;

  return {
    bottomPadding,
    barHeight: TAB_BAR_CAPSULE_HEIGHT,
    sideInset: TAB_BAR_CAPSULE_SIDE_INSET,
    height: bottomPadding + TAB_BAR_CAPSULE_HEIGHT,
    contentClearance: bottomPadding + TAB_BAR_CAPSULE_HEIGHT + TAB_BAR_CONTENT_GAP,
  };
}
