import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import { useReaderChromeProgress } from '../../stores/readerChromeStore';
import { useTheme } from '../../contexts/ThemeContext';
import { hexWithAlpha } from '../../utils/color';
import {
  getReaderTabBarTranslation,
  isReaderTabBarScrollHidden,
  shouldFollowReaderScroll,
} from '../readerTabBarMotion';
import { TabBarSelection } from '../TabBarSelection';
import { getTabBarMotion, resolveActiveNestedRoute, type TabRoute } from './tabNavigatorModel';

// The exact route shape getFocusedRouteNameFromRoute accepts, derived from the
// function itself rather than casting through `never`.
type FocusedRouteArg = Parameters<typeof getFocusedRouteNameFromRoute>[0];

/** The screen showing inside a root tab route. */
export function resolveTabNestedRoute(route: TabRoute) {
  return resolveActiveNestedRoute(route, getFocusedRouteNameFromRoute(route as FocusedRouteArg));
}

/**
 * The library tab bar, wrapped so it slides with reader scroll on the UI thread,
 * gives up touch and VoiceOver whenever it is off-screen, and draws the sliding
 * selection pill behind the focused tab.
 */
export function ReaderAwareTabBar(props: BottomTabBarProps) {
  const progress = useReaderChromeProgress();
  const [scrollHidden, setScrollHidden] = useState(false);
  const { colors } = useTheme();
  const activeRoute = props.state.routes[props.state.index];
  const nestedRoute = resolveTabNestedRoute(activeRoute as TabRoute);
  const { nestedRouteName, nestedRouteParams } = nestedRoute;
  const descriptor = props.descriptors[activeRoute.key];
  const tabBarStyle = StyleSheet.flatten(descriptor.options.tabBarStyle) as ViewStyle | undefined;
  // setOptions still owns explicit hidden/modal states. Its transform must not
  // receive a second scroll translation from this wrapper.
  const { followsScroll, forcedHidden } = getTabBarMotion({
    followsReader: shouldFollowReaderScroll(activeRoute.name, nestedRouteName, nestedRouteParams),
    nestedRoute,
    tabBarStyle,
  });
  useAnimatedReaction(
    () => isReaderTabBarScrollHidden(followsScroll, progress.value),
    (hidden, previous) => {
      // Only the visibility boundary crosses to JS, never per-frame progress.
      if (hidden !== previous) {
        runOnJS(setScrollHidden)(hidden);
      }
    }
  );
  const interactionHidden = forcedHidden || (followsScroll && scrollHidden);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: followsScroll ? getReaderTabBarTranslation(progress.value) : 0 }],
  }));
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
          tabBarBackground: () => (
            <>
              {originalBackground?.()}
              <TabBarSelection
                selectedIndex={selectionIndex}
                count={routeCount}
                color={pillColor}
              />
            </>
          ),
        },
      },
    }),
    [
      activeRoute.key,
      descriptor,
      originalBackground,
      pillColor,
      props.descriptors,
      routeCount,
      selectionIndex,
    ]
  );

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, animatedStyle]}
      pointerEvents={interactionHidden ? 'none' : 'box-none'}
      accessibilityElementsHidden={interactionHidden}
      importantForAccessibility={interactionHidden ? 'no-hide-descendants' : 'auto'}
    >
      <BottomTabBar {...props} descriptors={descriptors} />
    </Animated.View>
  );
}
