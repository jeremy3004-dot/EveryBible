/* eslint-disable react-hooks/immutability -- Reanimated shared values are written through `.value` by design. */
import type { BibleReaderScreenProps } from '../../../navigation/types';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { LayoutAnimation } from 'react-native';
import { useSharedValue, useReducedMotion } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import { spacing } from '../../../design/system';
import { useScreenReaderEnabled } from '../../../hooks/useScreenReaderEnabled';
import { useTabBarHeight } from '../../../hooks/useTabBarHeight';
import {
  getPlayerBarClearance,
  PLAYER_BAR_NOTICE_HEIGHT,
} from '../../../navigation/playerBar/playerBarModel';
import { buildTabBarCapsuleStyle } from '../../../navigation/tabBarCapsuleStyle';
import { useReaderChromeOwner, useReaderChromeProgress } from '../../../stores/readerChromeStore';
import { getNextBibleTabBarVisibility } from '../bibleReaderModel';
import { getCarriedReaderChromeProgress } from '../readerChromeMotion';
import { takeReaderChromeCarry, type ReaderChromeCarryRef } from './readerChromeCarry';
import type { RootTabNavigationHandle, NavigationProp } from './readerConstants';

export interface UseReaderTabBarMotionInput {
  activePlanId: string | undefined;
  bookId: string;
  chapter: number;
  chapterSessionMode: 'listen' | 'read';
  /** The chapter the reader is stepping to itself, which keeps the chrome's state. */
  chromeCarryRef: ReaderChromeCarryRef;
  /** The player bar shows a notice above its capsule (the Selah chip, a playback failure). */
  hasPlayerBarNotice: boolean;
  navigation: NavigationProp;
  planDayNumber: number | undefined;
  returnToPlanOnComplete: boolean;
  route: BibleReaderScreenProps['route'];
  selectedVerses: number[];
  setIsReadBottomChromeCollapsed: Dispatch<SetStateAction<boolean>>;
}

/** How the reader drives the root tab bar: its capsule style, hiding it for plan sessions and verse selection, and publishing scroll-linked collapse only while this reader is the focused route. */
export function useReaderTabBarMotion({
  activePlanId,
  bookId,
  chapter,
  chapterSessionMode,
  chromeCarryRef,
  hasPlayerBarNotice,
  navigation,
  planDayNumber,
  returnToPlanOnComplete,
  route,
  selectedVerses,
  setIsReadBottomChromeCollapsed,
}: UseReaderTabBarMotionInput) {
  const readerBottomChromeCollapsedRef = useRef(false);
  const rootTabBarCollapseProgressRef = useRef(0);
  const selectedVersePreviousTabBarCollapseProgressRef = useRef<number | null>(null);
  const readerLastScrollOffsetYRef = useRef(0);
  const readerScrollViewportHeightRef = useRef(0);
  const readerBottomChromeProgressShared = useSharedValue(0);
  const rootTabBarScrollProgress = useReaderChromeProgress();
  const readerChromeOwner = useReaderChromeOwner();
  const readerChromeOffsetShared = useSharedValue(0);
  const readerChromeChapterKeyRef = useRef('');
  const readerChromeCollapsedShared = useSharedValue(false);
  // Whether the list is moving under the reader's finger (a drag or its fling), the
  // only scrolling that may collapse the chrome. See useReaderScrollChrome.
  const readerChromeFingerScrollShared = useSharedValue(false);
  const reduceMotion = useReducedMotion();
  // VoiceOver/TalkBack scrolling must not slide the chrome away. See useReaderScrollChrome.
  const screenReaderEnabled = useScreenReaderEnabled();
  const readerRouteKey = route.key;

  // Retained readers keep local motion. Only the focused route may publish to
  // the root bar; late scroll events and old cleanup cannot overwrite a new one.
  // Focusing the reader, or arriving on a chapter from anywhere else, opens the chrome
  // expanded. A chapter the reader stepped to itself (arrows, swipe, audio moving on)
  // keeps it as it was, a half-way state settling on the nearer end.
  useFocusEffect(
    useCallback(() => {
      const chapterKey = `${bookId}:${chapter}`;
      const chapterChanged = readerChromeChapterKeyRef.current !== chapterKey;
      const carried = takeReaderChromeCarry(chromeCarryRef, bookId, chapter) && chapterChanged;
      const nextProgress = carried
        ? getCarriedReaderChromeProgress(readerBottomChromeProgressShared.value)
        : 0;
      const nextCollapsed = nextProgress >= 0.98;
      readerBottomChromeProgressShared.value = nextProgress;
      if (chapterChanged) {
        readerChromeChapterKeyRef.current = chapterKey;
        readerChromeOffsetShared.value = 0;
      }
      readerChromeCollapsedShared.value = nextCollapsed;
      readerChromeFingerScrollShared.value = false;
      readerBottomChromeCollapsedRef.current = nextCollapsed;
      setIsReadBottomChromeCollapsed(nextCollapsed);
      readerChromeOwner.value = readerRouteKey;
      rootTabBarScrollProgress.value = nextProgress;
      return () => {
        if (readerChromeOwner.value === readerRouteKey) {
          readerChromeOwner.value = '';
          rootTabBarScrollProgress.value = 0;
        }
      };
    }, [
      bookId,
      chapter,
      chromeCarryRef,
      readerRouteKey,
      readerBottomChromeProgressShared,
      readerChromeOffsetShared,
      readerChromeCollapsedShared,
      readerChromeFingerScrollShared,
      readerChromeOwner,
      rootTabBarScrollProgress,
      setIsReadBottomChromeCollapsed,
    ])
  );
  const rootTabBarVisibleRef = useRef<boolean | null>(null);
  const {
    bottomPadding: rootTabBarBottomPadding,
    barHeight: rootTabBarBarHeight,
    sideInset: rootTabBarSideInset,
    height: rootTabBarHeight,
  } = useTabBarHeight();
  const shouldForceHideRootTabBar =
    Boolean(activePlanId) && typeof planDayNumber === 'number' && returnToPlanOnComplete;
  // The last line must clear the expanded player bar: the tab capsule (or, in a plan
  // session, the plan strip of the same height), the player row on top of it, and any
  // notice floating above that. Near the end of a chapter the bar is always expanded,
  // since the scroll motion reveals it as either end approaches.
  const premiumReaderBaseBottomPadding = getPlayerBarClearance({
    bottomPadding: rootTabBarBottomPadding,
    tabRowHeight: rootTabBarBarHeight,
    showsPlayerRow: true,
    noticeHeight: hasPlayerBarNotice ? PLAYER_BAR_NOTICE_HEIGHT : 0,
    gap: spacing.lg,
  });
  const getRootTabNavigation = useCallback((): RootTabNavigationHandle => {
    // Runtime contract: navigation.getParent('RootTab') ?? navigation.getParent()?.getParent()
    const getParentById = navigation.getParent as unknown as (
      id?: string
    ) => RootTabNavigationHandle;

    return (
      getParentById('RootTab') ??
      (navigation.getParent()?.getParent() as RootTabNavigationHandle | undefined) ??
      null
    );
  }, [navigation]);
  // The reader drives a scroll-linked collapse of the ROOT tab bar, so it has to
  // rebuild that bar's style. It must be the same capsule the navigator draws —
  // this used to be a second, full-width copy, which made the bar visibly change
  // shape on entering and leaving the reader.
  const getRootTabBarStyle = useCallback(
    (collapseProgress: number) =>
      buildTabBarCapsuleStyle({
        sideInset: rootTabBarSideInset,
        bottomPadding: rootTabBarBottomPadding,
        barHeight: rootTabBarBarHeight,
        collapseProgress,
      }),
    [rootTabBarSideInset, rootTabBarBottomPadding, rootTabBarBarHeight]
  );
  const rootTabBarStyleBuilderRef = useRef(getRootTabBarStyle);
  rootTabBarStyleBuilderRef.current = getRootTabBarStyle;
  // Stable while the bar's shape is: play/pause taps and scroll collapse never reflow
  // the list under a reader pinned at the bottom of the chapter.
  const premiumReaderBottomPadding = premiumReaderBaseBottomPadding;

  const syncRootTabBarVisibility = useCallback(
    (nextVisible: boolean) => {
      if (rootTabBarVisibleRef.current === nextVisible) {
        return;
      }

      if (rootTabBarVisibleRef.current != null) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }

      rootTabBarVisibleRef.current = nextVisible;
      navigation.setParams({ tabBarVisible: nextVisible });
    },
    [navigation]
  );

  const syncRootTabBarCollapseProgress = useCallback(
    (nextProgress: number) => {
      const clampedProgress = Math.max(0, Math.min(nextProgress, 1));
      if (
        Math.abs(clampedProgress - rootTabBarCollapseProgressRef.current) < 0.02 &&
        !(clampedProgress === 0 && rootTabBarCollapseProgressRef.current !== 0) &&
        !(clampedProgress === 1 && rootTabBarCollapseProgressRef.current !== 1)
      ) {
        return;
      }

      rootTabBarCollapseProgressRef.current = clampedProgress;
      const rootTabNavigation = getRootTabNavigation();
      if (rootTabNavigation) {
        rootTabNavigation.setOptions({
          tabBarStyle: rootTabBarStyleBuilderRef.current(clampedProgress),
        });
      }
      navigation.setParams({ tabBarCollapseProgress: clampedProgress });
    },
    [getRootTabNavigation, navigation]
  );

  useEffect(() => {
    const rootTabNavigation = getRootTabNavigation();
    if (!rootTabNavigation || shouldForceHideRootTabBar) {
      return;
    }

    rootTabNavigation.setOptions({
      tabBarStyle: getRootTabBarStyle(rootTabBarCollapseProgressRef.current),
    });
    navigation.setParams({ tabBarCollapseProgress: rootTabBarCollapseProgressRef.current });
  }, [getRootTabBarStyle, getRootTabNavigation, navigation, shouldForceHideRootTabBar]);

  useEffect(() => {
    syncRootTabBarVisibility(
      shouldForceHideRootTabBar
        ? false
        : getNextBibleTabBarVisibility({
            sessionMode: chapterSessionMode,
            action: 'enter',
          })
    );
    syncRootTabBarCollapseProgress(shouldForceHideRootTabBar ? 1 : 0);
  }, [
    chapterSessionMode,
    shouldForceHideRootTabBar,
    syncRootTabBarCollapseProgress,
    syncRootTabBarVisibility,
  ]);

  useEffect(() => {
    if (selectedVerses.length > 0) {
      if (selectedVersePreviousTabBarCollapseProgressRef.current == null) {
        selectedVersePreviousTabBarCollapseProgressRef.current =
          rootTabBarCollapseProgressRef.current;
      }

      syncRootTabBarVisibility(!shouldForceHideRootTabBar);
      syncRootTabBarCollapseProgress(1);
      return;
    }

    const previousProgress = selectedVersePreviousTabBarCollapseProgressRef.current;
    if (previousProgress == null) {
      return;
    }

    selectedVersePreviousTabBarCollapseProgressRef.current = null;
    syncRootTabBarVisibility(
      shouldForceHideRootTabBar
        ? false
        : getNextBibleTabBarVisibility({
            sessionMode: chapterSessionMode,
            action: 'enter',
          })
    );
    syncRootTabBarCollapseProgress(shouldForceHideRootTabBar ? 1 : previousProgress);
  }, [
    chapterSessionMode,
    selectedVerses.length,
    shouldForceHideRootTabBar,
    syncRootTabBarCollapseProgress,
    syncRootTabBarVisibility,
  ]);

  const handleReaderScrollBeginDrag = useCallback(() => {
    if (chapterSessionMode !== 'read') {
      return;
    }
  }, [chapterSessionMode]);

  const handleReaderScrollEndDrag = useCallback(() => {
    if (chapterSessionMode !== 'read') {
      return;
    }
  }, [chapterSessionMode]);

  const handleReaderMomentumScrollEnd = useCallback(() => {
    if (chapterSessionMode !== 'read') {
      return;
    }
  }, [chapterSessionMode]);

  return {
    getRootTabBarStyle,
    getRootTabNavigation,
    handleReaderMomentumScrollEnd,
    handleReaderScrollBeginDrag,
    handleReaderScrollEndDrag,
    premiumReaderBottomPadding,
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
    rootTabBarBottomPadding,
    rootTabBarCollapseProgressRef,
    rootTabBarHeight,
    rootTabBarScrollProgress,
    screenReaderEnabled,
    shouldForceHideRootTabBar,
  };
}
