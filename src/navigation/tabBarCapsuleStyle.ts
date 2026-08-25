import type { ViewStyle } from 'react-native';

// The one definition of the floating tab-bar capsule.
//
// Both the navigator and the Bible reader set the root tab bar's style — the
// reader drives a scroll-linked collapse through navigation.setOptions. They
// used to carry separate copies of the geometry, so the bar visibly changed
// shape when you entered or left the reader. Everything that positions the
// capsule now goes through here.

/**
 * The capsule is fully rounded, so at the selection pill's vertical extent its
 * edge has already curved ~14pt inward. The row is inset by that much or the
 * first and last pills breach the curve.
 */
export const TAB_BAR_CAPSULE_ROW_INSET = 14;

export interface TabBarCapsuleStyleOptions {
  sideInset: number;
  bottomPadding: number;
  barHeight: number;
  /** 0 = fully shown, 1 = fully slid off the bottom. */
  collapseProgress?: number;
}

export function buildTabBarCapsuleStyle({
  sideInset,
  bottomPadding,
  barHeight,
  collapseProgress = 0,
}: TabBarCapsuleStyleOptions): ViewStyle {
  return {
    // The material is drawn by the tabBarBackground component, so the bar
    // itself stays transparent and borderless.
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    elevation: 0,
    position: 'absolute',
    left: sideInset,
    right: sideInset,
    bottom: bottomPadding,
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: TAB_BAR_CAPSULE_ROW_INSET,
    height: barHeight,
    // Travel far enough to clear the gap beneath the capsule too, or a sliver
    // stays visible when the reader hides the bar.
    transform: [{ translateY: (barHeight + bottomPadding) * collapseProgress }],
    opacity: 1 - collapseProgress,
  };
}
