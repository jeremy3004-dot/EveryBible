import type { ViewStyle } from 'react-native';
import { getReaderTabBarTranslation } from './readerTabBarMotion';

// The one definition of the floating tab-bar capsule.
//
// Both the navigator and the Bible reader set the root tab bar's style — the
// reader uses navigation.setOptions only for explicit hidden states. They
// used to carry separate copies of the geometry, so the bar visibly changed
// shape when you entered or left the reader. Everything that positions the
// capsule now goes through here.

/**
 * Keeps the five tab centers aligned with the reference's inset capsule.
 */
export const TAB_BAR_CAPSULE_ROW_INSET = 8;

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
    // BottomTabBar sets logical edges, which take precedence over left/right.
    start: sideInset,
    end: sideInset,
    bottom: bottomPadding,
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: TAB_BAR_CAPSULE_ROW_INSET,
    height: barHeight,
    // Travel far enough to clear the gap beneath the capsule too, or a sliver
    // stays visible when the reader hides the bar.
    transform: [{ translateY: getReaderTabBarTranslation(collapseProgress) }],
  };
}
