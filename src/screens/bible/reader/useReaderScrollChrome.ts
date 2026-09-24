/* eslint-disable react-hooks/immutability -- Reanimated shared values are written through `.value` by design. */
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';
import { useCallback, useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { spacing } from '../../../design/system';
import { getNextReaderChromeProgress, READER_PLAY_COLLAPSE_TRAVEL } from '../readerChromeMotion';
import type { RootTabNavigationHandle, NavigationProp } from './readerConstants';
import { READER_SCROLL_JS_UPDATE_INTERVAL_PX } from './readerConstants';

export interface UseReaderScrollChromeInput {
  getRootTabBarStyle: (collapseProgress: number) => ViewStyle;
  getRootTabNavigation: () => RootTabNavigationHandle;
  navigation: NavigationProp;
  readerBottomChromeCollapsedRef: RefObject<boolean>;
  readerBottomChromeProgressShared: SharedValue<number>;
  readerChromeCollapsedShared: SharedValue<boolean>;
  readerChromeFingerScrollShared: SharedValue<boolean>;
  readerChromeOffsetShared: SharedValue<number>;
  readerChromeOwner: SharedValue<string>;
  readerLastScrollOffsetYRef: RefObject<number>;
  readerRouteKey: string;
  readerScrollViewportHeightRef: RefObject<number>;
  reduceMotion: boolean;
  rootTabBarCollapseProgressRef: RefObject<number>;
  rootTabBarHeight: number;
  rootTabBarScrollProgress: SharedValue<number>;
  setIsReadBottomChromeCollapsed: Dispatch<SetStateAction<boolean>>;
  shouldForceHideRootTabBar: boolean;
  showPremiumReadMode: boolean;
}

/** Scroll-linked chrome: the animated scroll handler that slides the top chrome, playback dock and plan strip away as the reader scrolls, and brings them back. */
export function useReaderScrollChrome({
  getRootTabBarStyle,
  getRootTabNavigation,
  navigation,
  readerBottomChromeCollapsedRef,
  readerBottomChromeProgressShared,
  readerChromeCollapsedShared,
  readerChromeFingerScrollShared,
  readerChromeOffsetShared,
  readerChromeOwner,
  readerLastScrollOffsetYRef,
  readerRouteKey,
  readerScrollViewportHeightRef,
  reduceMotion,
  rootTabBarCollapseProgressRef,
  rootTabBarHeight,
  rootTabBarScrollProgress,
  setIsReadBottomChromeCollapsed,
  shouldForceHideRootTabBar,
  showPremiumReadMode,
}: UseReaderScrollChromeInput) {
  const lastReaderScrollJsOffset = useSharedValue(0);
  const lastReaderScrollJsAtBottom = useSharedValue(false);

  const updateReaderBottomChromeState = useCallback(
    (offsetY: number, viewportHeight: number, nextCollapsed: boolean) => {
      if (readerChromeOwner.value !== readerRouteKey) return;
      readerLastScrollOffsetYRef.current = offsetY;
      readerScrollViewportHeightRef.current = viewportHeight;
      if (nextCollapsed !== readerBottomChromeCollapsedRef.current) {
        readerBottomChromeCollapsedRef.current = nextCollapsed;
        setIsReadBottomChromeCollapsed(nextCollapsed);
      }
    },
    [
      readerChromeOwner,
      readerRouteKey,
      readerBottomChromeCollapsedRef,
      readerLastScrollOffsetYRef,
      readerScrollViewportHeightRef,
      setIsReadBottomChromeCollapsed,
    ]
  );

  useEffect(() => {
    if (showPremiumReadMode) {
      return;
    }

    readerBottomChromeCollapsedRef.current = false;
    rootTabBarCollapseProgressRef.current = 0;
    readerLastScrollOffsetYRef.current = 0;
    readerBottomChromeProgressShared.value = 0;
    if (readerChromeOwner.value === readerRouteKey) {
      rootTabBarScrollProgress.value = 0;
    }
    setIsReadBottomChromeCollapsed(false);
    const rootTabNavigation = getRootTabNavigation();
    if (rootTabNavigation) {
      rootTabNavigation.setOptions({
        tabBarStyle: shouldForceHideRootTabBar ? { display: 'none' } : getRootTabBarStyle(0),
      });
    }
    navigation.setParams({ tabBarCollapseProgress: shouldForceHideRootTabBar ? 1 : 0 });
  }, [
    getRootTabNavigation,
    getRootTabBarStyle,
    navigation,
    readerBottomChromeProgressShared,
    readerChromeOwner,
    readerRouteKey,
    rootTabBarScrollProgress,
    showPremiumReadMode,
    shouldForceHideRootTabBar,
    readerBottomChromeCollapsedRef,
    readerLastScrollOffsetYRef,
    rootTabBarCollapseProgressRef,
    setIsReadBottomChromeCollapsed,
  ]);

  // Only the reader's finger collapses the chrome. The list also moves on its own —
  // back to the top on a chapter change, onto a plan's focus verse, after the verse the
  // audio is on — and counting those moves as scrolling left a new chapter opening
  // with the chrome stuck part-way collapsed (translucent header, half-faded arrows, tab
  // bar or plan strip half off screen) until the reader scrolled. A move without the
  // finger may still reveal the chrome near either end, never hide more of it.
  // Android always ends a drag with momentum events; iOS skips them when the finger
  // lifts without velocity.
  const scrollHandler = useAnimatedScrollHandler({
    onBeginDrag: () => {
      'worklet';
      readerChromeFingerScrollShared.value = true;
    },
    onEndDrag: (event) => {
      'worklet';
      const velocityY = event.velocity?.y ?? 0;
      if (velocityY === 0) {
        readerChromeFingerScrollShared.value = false;
      }
    },
    onMomentumEnd: () => {
      'worklet';
      readerChromeFingerScrollShared.value = false;
    },
    onScroll: (event) => {
      'worklet';
      const nextOffsetY = event.contentOffset.y;
      const viewportHeight = event.layoutMeasurement.height;
      const contentHeight = event.contentSize.height;
      const isAtBottom =
        viewportHeight > 0 && contentHeight > 0
          ? nextOffsetY + viewportHeight >= contentHeight - spacing.lg
          : false;
      if (readerChromeOwner.value !== readerRouteKey) return;

      const nextProgress = getNextReaderChromeProgress({
        progress: readerBottomChromeProgressShared.value,
        previousOffset: readerChromeFingerScrollShared.value
          ? readerChromeOffsetShared.value
          : nextOffsetY,
        offset: nextOffsetY,
        viewportHeight,
        contentHeight,
        reduceMotion,
      });
      readerChromeOffsetShared.value = nextOffsetY;
      readerBottomChromeProgressShared.value = nextProgress;
      rootTabBarScrollProgress.value = nextProgress;
      const nextCollapsed = nextProgress >= 0.98;
      // Only bookkeeping crosses to JS. All visible motion above runs for
      // every native scroll frame, including the small deltas of a slow drag.
      const shouldNotifyJs =
        nextCollapsed !== readerChromeCollapsedShared.value ||
        Math.abs(nextOffsetY - lastReaderScrollJsOffset.value) >=
          READER_SCROLL_JS_UPDATE_INTERVAL_PX ||
        isAtBottom !== lastReaderScrollJsAtBottom.value;
      if (!shouldNotifyJs) {
        return;
      }
      readerChromeCollapsedShared.value = nextCollapsed;
      lastReaderScrollJsOffset.value = nextOffsetY;
      lastReaderScrollJsAtBottom.value = isAtBottom;
      runOnJS(updateReaderBottomChromeState)(nextOffsetY, viewportHeight, nextCollapsed);
    },
  });

  const topChromeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      readerBottomChromeProgressShared.value,
      [0, 1],
      [1, 0],
      Extrapolation.CLAMP
    ),
    transform: [
      {
        translateY: interpolate(
          readerBottomChromeProgressShared.value,
          [0, 1],
          [0, -12],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  // Resting play center is 50pt above the capsule top; it lowers 65pt
  // while the tabs and arrows travel 132pt. These paths never intersect.
  const readerDockBaseBottom = rootTabBarHeight + 18;
  const readerDockCollapsedTranslateY = READER_PLAY_COLLAPSE_TRAVEL;

  const bottomDockAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          readerBottomChromeProgressShared.value,
          [0, 1],
          [0, readerDockCollapsedTranslateY],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const planSessionBottomBarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: rootTabBarHeight * readerBottomChromeProgressShared.value,
      },
    ],
    opacity: interpolate(
      readerBottomChromeProgressShared.value,
      [0, 1],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  return {
    bottomDockAnimatedStyle,
    planSessionBottomBarAnimatedStyle,
    readerDockBaseBottom,
    scrollHandler,
    topChromeAnimatedStyle,
  };
}
