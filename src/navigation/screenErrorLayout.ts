import { createElement, type ReactElement } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';

interface ScreenErrorLayoutArgs {
  route: { name: string; params?: unknown };
  navigation: { canGoBack: () => boolean; goBack: () => void };
  children: ReactElement;
}

/**
 * `screenLayout` for every stack navigator: each screen gets its own error
 * boundary. Without it the only boundary sat above the whole navigator, so a
 * render error in one screen replaced the entire app (tab bar included) with
 * the fallback, and "Try again" remounted the navigator from scratch. Now the
 * tab bar stays usable, a pushed screen can be backed out of, and the crash log
 * names the screen that failed.
 *
 * Plain createElement rather than JSX keeps this loadable under node --test.
 */
export function renderScreenWithErrorBoundary({
  route,
  navigation,
  children,
}: ScreenErrorLayoutArgs): ReactElement {
  const onGoBack = navigation.canGoBack() ? () => navigation.goBack() : undefined;

  // route.params is replaced by every navigate/setParams on this route instance, so
  // a crashed screen retries when it is sent somewhere new instead of staying stuck.
  return createElement(
    ErrorBoundary,
    { scope: `screen:${route.name}`, onGoBack, resetKey: route.params },
    children
  );
}
