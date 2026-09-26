/* eslint-disable react-hooks/immutability -- Reanimated shared values are written through `.value` by design. */
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';
import { useCallback, useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { spacing } from '../../../design/system';
import { getNextReaderChromeProgress, getSettledReaderChromeProgress } from '../readerChromeMotion';
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
  /** VoiceOver/TalkBack is on: the chrome stays fully expanded whatever the list does. */
  screenReaderEnabled: boolean;
  setIsReadBottomChromeCollapsed: Dispatch<SetStateAction<boolean>>;
  shouldForceHideRootTabBar: boolean;
  showPremiumReadMode: boolean;
}

/** Scroll-linked chrome: the animated scroll handler that slides the top chrome, player bar and plan strip away as the reader scrolls, and brings them back. */
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
  screenReaderEnabled,
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

  // A screen reader scrolls the list with its own gesture (three-finger swipe), and
  // collapsing then would pull Back, Search and the tab bar out of the swipe order
  // mid-chapter. While one runs, the chrome stays expanded; turning it on brings
  // back chrome that was already collapsed.
  useEffect(() => {
    if (!screenReaderEnabled) {
      return;
    }
    readerBottomChromeProgressShared.value = 0;
    readerChromeCollapsedShared.value = false;
    if (readerChromeOwner.value === readerRouteKey) {
      rootTabBarScrollProgress.value = 0;
    }
    readerBottomChromeCollapsedRef.current = false;
    setIsReadBottomChromeCollapsed(false);
  }, [
    screenReaderEnabled,
    readerBottomChromeCollapsedRef,
    readerBottomChromeProgressShared,
    readerChromeCollapsedShared,
    readerChromeOwner,
    readerRouteKey,
    rootTabBarScrollProgress,
    setIsReadBottomChromeCollapsed,
  ]);

  // Only the reader's finger collapses the chrome. The list also moves on its own —
  // back to the top on a chapter change, onto a plan's focus verse, after the verse the
  // audio is on — and counting those moves as scrolling left a new chapter opening
  // with the chrome stuck part-way collapsed (translucent header, half-faded arrows, tab
  // bar or plan strip half off screen) until the reader scrolled. A move without the
  // finger leaves the chrome as it is, hidden or shown — a chapter the reader stepped to
  // keeps the chrome it had — unless the chapter stops scrolling, when it is shown.
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

      const nextProgress = screenReaderEnabled
        ? 0
        : readerChromeFingerScrollShared.value
          ? getNextReaderChromeProgress({
              progress: readerBottomChromeProgressShared.value,
              previousOffset: readerChromeOffsetShared.value,
              offset: nextOffsetY,
              viewportHeight,
              contentHeight,
              reduceMotion,
            })
          : getSettledReaderChromeProgress({
              progress: readerBottomChromeProgressShared.value,
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

  const updateReaderChromeCollapsed = useCallback(
    (nextCollapsed: boolean) => {
      if (nextCollapsed !== readerBottomChromeCollapsedRef.current) {
        readerBottomChromeCollapsedRef.current = nextCollapsed;
        setIsReadBottomChromeCollapsed(nextCollapsed);
      }
    },
    [readerBottomChromeCollapsedRef, setIsReadBottomChromeCollapsed]
  );

  // The scroll handler writes the shared progress and this reader's own together. The
  // player bar writes only the shared one — its hairline brings the whole chrome back —
  // so a change there that this reader did not make is followed here.
  useAnimatedReaction(
    () => rootTabBarScrollProgress.value,
    (sharedProgress) => {
      if (
        readerChromeOwner.value !== readerRouteKey ||
        sharedProgress === readerBottomChromeProgressShared.value
      ) {
        return;
      }
      readerBottomChromeProgressShared.value = sharedProgress;
      const nextCollapsed = sharedProgress >= 0.98;
      if (nextCollapsed !== readerChromeCollapsedShared.value) {
        readerChromeCollapsedShared.value = nextCollapsed;
        runOnJS(updateReaderChromeCollapsed)(nextCollapsed);
      }
    },
    [readerRouteKey]
  );

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
    planSessionBottomBarAnimatedStyle,
    scrollHandler,
    topChromeAnimatedStyle,
  };
}
