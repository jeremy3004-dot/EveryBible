import { shouldHideTabBarOnNestedRoute } from './tabBarVisibility';

// The tab capsule and reader's side controls travel together in the reference.
export const READER_TAB_BAR_COLLAPSE_DISTANCE = 132;

export function shouldFollowReaderScroll(
  tabName: string,
  nestedRouteName?: string,
  nestedRouteParams?: Record<string, unknown>
): boolean {
  return (
    tabName === 'Bible' &&
    nestedRouteName === 'BibleReader' &&
    !shouldHideTabBarOnNestedRoute(nestedRouteName, nestedRouteParams) &&
    !(
      typeof nestedRouteParams?.tabBarCollapseProgress === 'number' &&
      nestedRouteParams.tabBarCollapseProgress > 0
    )
  );
}

export function getReaderTabBarTranslation(progress: number): number {
  'worklet';
  return Math.max(0, Math.min(1, progress)) * READER_TAB_BAR_COLLAPSE_DISTANCE;
}

export function isReaderTabBarScrollHidden(followsScroll: boolean, progress: number): boolean {
  'worklet';
  return followsScroll && progress >= 0.98;
}
