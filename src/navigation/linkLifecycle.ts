import * as Linking from 'expo-linking';

type LinkListener = (url: string) => void;

let isWatchingLinks = false;
let appListener: LinkListener | null = null;
let navigationListener: LinkListener | null = null;
let isNavigationReady: (() => boolean) | null = null;
let parkedLink: string | null = null;

/** Hands the latest link to a mounted, ready navigator, once. */
export function flushParkedLink(): void {
  if (parkedLink === null || !navigationListener || !isNavigationReady?.()) return;
  const url = parkedLink;
  parkedLink = null;
  navigationListener(url);
}

// The native subscription belongs to the app lifetime, including a first launch
// that has not mounted any navigator yet (onboarding or the discreet lock).
function watchIncomingLinks(): void {
  if (isWatchingLinks) return;
  isWatchingLinks = true;
  Linking.addEventListener('url', ({ url }) => {
    parkedLink = url;
    appListener?.(url);
    flushParkedLink();
  });
}

/** App's early auth-link handler shares the same native listener as navigation. */
export function subscribeToIncomingLinks(listener: LinkListener): () => void {
  appListener = listener;
  watchIncomingLinks();
  return () => {
    if (appListener === listener) appListener = null;
  };
}

/** NavigationContainer subscribes when mounted; links wait through its absence. */
export function subscribeToNavigatorLinks(
  listener: LinkListener,
  isReady: () => boolean
): () => void {
  navigationListener = listener;
  isNavigationReady = isReady;
  watchIncomingLinks();
  flushParkedLink();
  return () => {
    if (navigationListener === listener) {
      navigationListener = null;
      isNavigationReady = null;
    }
  };
}
