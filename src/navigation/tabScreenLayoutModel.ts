import { shouldHideTabBarOnNestedRoute } from './tabBarVisibility';

export function getTabScreenBottomInset(
  routeName: string,
  routeParams: Record<string, unknown> | undefined,
  presentation: string | undefined,
  tabBarHeight: number
): number {
  if (
    shouldHideTabBarOnNestedRoute(routeName, routeParams) ||
    (presentation != null && presentation !== 'card') ||
    // These surfaces deliberately draw under the capsule and already reserve
    // its full footprint in their scroll content / animated reader dock.
    routeName === 'HomeScreen' ||
    routeName === 'Settings' ||
    routeName === 'BibleReader'
  ) {
    return 0;
  }

  return tabBarHeight;
}
