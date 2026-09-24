/* eslint-disable react-hooks/immutability -- Reanimated shared values are written through `.value` by design. */
import type { BibleReaderScreenProps } from '../../../navigation/types';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { LayoutAnimation } from 'react-native';
import { useSharedValue, useReducedMotion } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import { layout, spacing } from '../../../design/system';
import { useTabBarHeight } from '../../../hooks/useTabBarHeight';
import { buildTabBarCapsuleStyle } from '../../../navigation/tabBarCapsuleStyle';
import { useReaderChromeOwner, useReaderChromeProgress } from '../../../stores/readerChromeStore';
import { getNextBibleTabBarVisibility } from '../bibleReaderModel';
import type { RootTabNavigationHandle, NavigationProp } from './readerConstants';

export interface UseReaderTabBarMotionInput {
  activePlanId: string | undefined;
  bookId: string;
  chapter: number;
  chapterSessionMode: 'listen' | 'read';
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
  const readerRouteKey = route.key;

  // Retained readers keep local motion. Only the focused route may publish to
  // the root bar; late scroll events and old cleanup cannot overwrite a new one.
  useFocusEffect(
    useCallback(() => {
      readerBottomChromeProgressShared.value = 0;
      const chapterKey = `${bookId}:${chapter}`;
      if (readerChromeChapterKeyRef.current !== chapterKey) {
        readerChromeChapterKeyRef.current = chapterKey;
        readerChromeOffsetShared.value = 0;
      }
      readerChromeCollapsedShared.value = false;
      readerChromeFingerScrollShared.value = false;
      readerBottomChromeCollapsedRef.current = false;
      setIsReadBottomChromeCollapsed(false);
      readerChromeOwner.value = readerRouteKey;
      rootTabBarScrollProgress.value = 0;
      return () => {
        if (readerChromeOwner.value === readerRouteKey) {
          readerChromeOwner.value = '';
          rootTabBarScrollProgress.value = 0;
        }
      };
    }, [
      bookId,
      chapter,
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
  const premiumReaderBaseBottomPadding =
    rootTabBarHeight + layout.minTouchTarget + spacing.xxxl + spacing.lg;
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
  // Keep the chapter content padding stable so dock taps do not reflow the
  // ScrollView when the user is already pinned at the bottom of the chapter.
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
    shouldForceHideRootTabBar,
  };
}
