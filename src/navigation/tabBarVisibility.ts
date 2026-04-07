export function shouldHideTabBarOnNestedRoute(routeName?: string): boolean {
  return routeName === 'BiblePicker' || routeName === 'LessonDetail' || routeName === 'PlanDetail';
}
