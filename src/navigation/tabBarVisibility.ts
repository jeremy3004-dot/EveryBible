export function shouldHideTabBarOnNestedRoute(routeName?: string): boolean {
  return routeName === 'BibleReader' || routeName === 'BiblePicker' || routeName === 'LessonDetail';
}
