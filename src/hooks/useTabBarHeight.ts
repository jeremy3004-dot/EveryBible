import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, spacing } from '../design/system';

export interface TabBarHeightMetrics {
  bottomPadding: number;
  height: number;
}

// Android's 3-button nav bar can be taller than our default spacing.lg gutter,
// so the tab bar (and anything docked above it) must grow with insets.bottom
// instead of assuming a fixed gutter. This is the single source of truth so
// TabNavigator's real bar and every element docked above it stay in sync.
export function useTabBarHeight(): TabBarHeightMetrics {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, spacing.lg);
  const height = layout.tabBarBaseHeight + bottomPadding;

  return { bottomPadding, height };
}
