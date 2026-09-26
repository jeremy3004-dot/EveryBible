import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { useReaderChromeProgress } from '../../stores/readerChromeStore';
import { useTheme } from '../../contexts/ThemeContext';
import { TAB_BAR_CAPSULE_HEIGHT } from '../../hooks/useTabBarHeight';
import { hexWithAlpha } from '../../utils/color';
import { PlayerBar } from '../playerBar/PlayerBar';
import { shouldFollowReaderScroll } from '../readerTabBarMotion';
import { TAB_BAR_CAPSULE_ROW_INSET } from '../tabBarCapsuleStyle';
import { TabBarSelection } from '../TabBarSelection';
import { getTabBarMotion, resolveActiveNestedRoute, type TabRoute } from './tabNavigatorModel';

// The exact route shape getFocusedRouteNameFromRoute accepts, derived from the
// function itself rather than casting through `never`.
type FocusedRouteArg = Parameters<typeof getFocusedRouteNameFromRoute>[0];

/** The screen showing inside a root tab route. */
export function resolveTabNestedRoute(route: TabRoute) {
  return resolveActiveNestedRoute(route, getFocusedRouteNameFromRoute(route as FocusedRouteArg));
}

// The library bar is only the tab row now: the capsule around it (its placement,
// material and the player above it) is drawn by the player bar.
const TAB_ROW_STYLE: ViewStyle = {
  position: 'absolute',
  top: 0,
  start: 0,
  end: 0,
  height: TAB_BAR_CAPSULE_HEIGHT,
  backgroundColor: 'transparent',
  borderTopWidth: 0,
  elevation: 0,
  paddingTop: 0,
  paddingBottom: 0,
  paddingHorizontal: TAB_BAR_CAPSULE_ROW_INSET,
};

/**
 * The root tab bar: the library's tab row inside the fused player capsule. The
 * capsule takes its placement from the focused route's tab bar style (so a route
 * that collapses or hides the bar still does), follows reader scroll on the UI
 * thread, and gives up touch and VoiceOver whenever it is hidden.
 */
export function ReaderAwareTabBar(props: BottomTabBarProps) {
  const progress = useReaderChromeProgress();
  const { colors } = useTheme();
  const activeRoute = props.state.routes[props.state.index];
  const nestedRoute = resolveTabNestedRoute(activeRoute as TabRoute);
  const { nestedRouteName, nestedRouteParams } = nestedRoute;
  const descriptor = props.descriptors[activeRoute.key];
  const tabBarStyle = StyleSheet.flatten(descriptor.options.tabBarStyle) as ViewStyle | undefined;
  // setOptions still owns explicit hidden/modal states. Its transform must not
  // receive a second scroll collapse from the bar.
  const { followsScroll, forcedHidden } = getTabBarMotion({
    followsReader: shouldFollowReaderScroll(activeRoute.name, nestedRouteName, nestedRouteParams),
    nestedRoute,
    tabBarStyle,
  });
  const originalBackground = descriptor.options.tabBarBackground;
  // The selected tab is a neutral ink pill — the scope's own text colour at a
  // low alpha — so the accent stays reserved for content, not chrome.
  const isReader = activeRoute.name === 'Bible' && nestedRouteName === 'BibleReader';
  const pillColor = hexWithAlpha(isReader ? colors.biblePrimaryText : colors.primaryText, 0.1);

  // Rebuilding the descriptor map inline handed BottomTabBar a brand-new
  // `descriptors` object (and a new tabBarBackground closure) on every render,
  // including the per-frame ones the reader drives.
  const selectionIndex = props.state.index;
  const routeCount = props.state.routes.length;
  const descriptors = useMemo(
    () => ({
      ...props.descriptors,
      [activeRoute.key]: {
        ...descriptor,
        options: {
          ...descriptor.options,
          tabBarStyle: TAB_ROW_STYLE,
          tabBarBackground: () => (
            <TabBarSelection selectedIndex={selectionIndex} count={routeCount} color={pillColor} />
          ),
        },
      },
    }),
    [activeRoute.key, descriptor, pillColor, props.descriptors, routeCount, selectionIndex]
  );
  const tabRow = useMemo(
    () => <BottomTabBar {...props} descriptors={descriptors} />,
    [descriptors, props]
  );
  const background = useMemo(() => originalBackground?.(), [originalBackground]);
  // A route's own collapse (a transform) or hide (display: none) moves the whole capsule.
  const frameStyle = useMemo(
    (): ViewStyle => ({
      transform: tabBarStyle?.transform,
      display: tabBarStyle?.display,
    }),
    [tabBarStyle?.display, tabBarStyle?.transform]
  );

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={forcedHidden ? 'none' : 'box-none'}
      accessibilityElementsHidden={forcedHidden}
      importantForAccessibility={forcedHidden ? 'no-hide-descendants' : 'auto'}
    >
      <PlayerBar
        scope={isReader ? 'reader' : 'app'}
        showsSessionRow={activeRoute.name === 'Bible'}
        progress={progress}
        followsScroll={followsScroll}
        bottomOffset={typeof tabBarStyle?.bottom === 'number' ? tabBarStyle.bottom : 0}
        sideInset={typeof tabBarStyle?.start === 'number' ? tabBarStyle.start : 0}
        background={background}
        tabRow={tabRow}
        tabRowHeight={
          typeof tabBarStyle?.height === 'number' ? tabBarStyle.height : TAB_BAR_CAPSULE_HEIGHT
        }
        frameStyle={frameStyle}
      />
    </View>
  );
}
