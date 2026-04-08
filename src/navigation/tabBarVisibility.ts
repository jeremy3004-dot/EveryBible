export function shouldHideTabBarOnNestedRoute(
  routeName?: string,
  routeParams?: Record<string, unknown>
): boolean {
  return (
    routeParams?.tabBarVisible === false ||
    routeName === 'BiblePicker' ||
    routeName === 'LessonDetail' ||
    routeName === 'PlanDetail' ||
    (routeName === 'BibleReader' && typeof routeParams?.planId === 'string')
  );
}
