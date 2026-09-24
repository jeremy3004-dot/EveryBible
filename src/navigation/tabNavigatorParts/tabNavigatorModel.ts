import type { ViewStyle } from 'react-native';
import type { BibleStackParamList } from '../types';
import { getReaderTabBarTranslation } from '../readerTabBarMotion';
import { shouldHideTabBarOnNestedRoute } from '../tabBarVisibility';

export type NestedTabRouteState = {
  index?: number;
  routes?: Array<{
    name: string;
    params?: Record<string, unknown>;
  }>;
};

export type NestedTabRouteParams = {
  screen?: string;
  params?: Record<string, unknown>;
};

/** A root tab route as the tab bar and its listeners see it. */
export type TabRoute = {
  state?: NestedTabRouteState;
  params?: NestedTabRouteParams;
};

export interface ActiveNestedRoute {
  nestedRouteName?: string;
  nestedRouteParams?: Record<string, unknown>;
}

/**
 * The screen showing inside a tab: the deepest focused route of its nested state,
 * or (before the nested stack has state) the `{ screen, params }` the tab was
 * opened with. `focusedRouteName` is React Navigation's own answer, preferred
 * when it has one.
 */
export function resolveActiveNestedRoute(
  route: TabRoute,
  focusedRouteName: string | undefined
): ActiveNestedRoute {
  let currentRoute: {
    name?: string;
    params?: Record<string, unknown>;
    state?: NestedTabRouteState;
  } = route;
  let currentState = route.state;

  while (currentState?.routes?.length) {
    const currentIndex =
      typeof currentState.index === 'number' ? currentState.index : currentState.routes.length - 1;
    const nextRoute = currentState.routes[currentIndex];
    if (!nextRoute) {
      break;
    }

    currentRoute = nextRoute;
    currentState = (nextRoute as { state?: NestedTabRouteState }).state;
  }

  const fallbackNestedRouteName = route.params?.screen;
  const fallbackNestedRouteParams = route.params?.params;

  return {
    nestedRouteName: focusedRouteName ?? currentRoute.name ?? fallbackNestedRouteName,
    // Before the nested stack has state, the tab route's own params are the
    // `{ screen, params }` wrapper; the nested screen's params are inside it.
    nestedRouteParams:
      currentRoute === route
        ? fallbackNestedRouteParams
        : (currentRoute.params ?? fallbackNestedRouteParams),
  };
}

/**
 * How far the capsule is slid off-screen for this tab (0 shown, 1 gone). Home
 * always shows it; a screen that hides the bar collapses it fully; otherwise a
 * route may ask for partial collapse with `tabBarCollapseProgress`.
 */
export function getTabBarCollapseProgress(
  tabName: string,
  { nestedRouteName, nestedRouteParams }: ActiveNestedRoute
): number {
  if (tabName === 'Home') {
    return 0;
  }

  const hidesBar =
    (tabName === 'Bible' || tabName === 'Learn' || tabName === 'Plans' || tabName === 'More') &&
    shouldHideTabBarOnNestedRoute(nestedRouteName, nestedRouteParams);
  const routeCollapseProgress =
    typeof nestedRouteParams?.tabBarCollapseProgress === 'number'
      ? Math.max(0, Math.min(nestedRouteParams.tabBarCollapseProgress, 1))
      : 0;
  return hidesBar ? Math.max(routeCollapseProgress, 1) : routeCollapseProgress;
}

const hasTranslation = (style: ViewStyle | undefined, applies: (translateY: unknown) => boolean) =>
  Array.isArray(style?.transform) &&
  style.transform.some((transform) => 'translateY' in transform && applies(transform.translateY));

/**
 * Whether the bar follows reader scroll, and whether it is hidden regardless.
 * A tab bar style that already carries a translation (a collapse, or a reader
 * `setOptions` state) must not receive a second scroll translation; one slid
 * (nearly) all the way off, or set to `display: none`, is hidden.
 */
export function getTabBarMotion({
  followsReader,
  nestedRoute,
  tabBarStyle,
}: {
  followsReader: boolean;
  nestedRoute: ActiveNestedRoute;
  tabBarStyle: ViewStyle | undefined;
}): { followsScroll: boolean; forcedHidden: boolean } {
  const hasExplicitTranslation = hasTranslation(tabBarStyle, (translateY) => translateY !== 0);
  return {
    followsScroll: followsReader && !hasExplicitTranslation,
    forcedHidden:
      shouldHideTabBarOnNestedRoute(nestedRoute.nestedRouteName, nestedRoute.nestedRouteParams) ||
      tabBarStyle?.display === 'none' ||
      hasTranslation(
        tabBarStyle,
        (translateY) =>
          typeof translateY === 'number' && translateY >= getReaderTabBarTranslation(0.98)
      ),
  };
}

export interface BibleTabResumeState {
  hasReaderHistory: boolean;
  currentBibleBook: string;
  currentBibleChapter: number;
  preferredBibleMode: BibleStackParamList['BibleReader']['preferredMode'];
}

/**
 * Pressing the Bible tab reopens the last chapter read, unless the reader is
 * already showing it freely. A plan-session reader is left for free reading, so
 * the plan fields are cleared. Null keeps the default tab press.
 */
export function getBibleTabResumeParams(
  route: TabRoute,
  resume: BibleTabResumeState
): BibleStackParamList['BibleReader'] | null {
  const focusedRoute = route.state?.routes?.[route.state.index ?? 0];
  const nestedRouteName = focusedRoute?.name ?? route.params?.screen;
  const nestedRouteParams = focusedRoute?.params ?? route.params?.params;
  const isPlanSessionReader =
    nestedRouteName === 'BibleReader' && typeof nestedRouteParams?.planId === 'string';
  const shouldResumeReader =
    resume.hasReaderHistory && (nestedRouteName !== 'BibleReader' || isPlanSessionReader);

  if (!shouldResumeReader) {
    return null;
  }

  return {
    bookId: resume.currentBibleBook,
    chapter: resume.currentBibleChapter,
    preferredMode: resume.preferredBibleMode,
    planId: undefined,
    planDayNumber: undefined,
    returnToPlanOnComplete: undefined,
    sessionContext: undefined,
  };
}
