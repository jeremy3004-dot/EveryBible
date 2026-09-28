import * as Linking from 'expo-linking';
import { buildBibleNavState } from './buildBibleNavState';
import {
  claimInboundNavigation,
  isCurrentInboundNavigation,
  type InboundNavigationArrival,
} from './inboundNavigationOwnership';

type LinkListener = (url: string) => void;

let isWatchingLinks = false;
let appListener: LinkListener | null = null;
let navigationListener: LinkListener | null = null;
let isNavigationReady: (() => boolean) | null = null;
let parkedLink: { url: string; arrival: InboundNavigationArrival } | null = null;
let expoPrefix: string | null = null;

/** Admit only this app's existing Bible and password-reset navigation paths. */
export function isSupportedNavigationUrl(url: string): boolean {
  const nativePrefix = 'com.everybible.app://';
  const prefix = url.startsWith(nativePrefix)
    ? nativePrefix
    : (expoPrefix ??= Linking.createURL('/'));
  if (!url.startsWith(prefix)) return false;
  const path = url.slice(prefix.length);
  return (
    buildBibleNavState(
      path,
      (candidate) =>
        /^\/?reset-password\/?(?:[?#]|$)/.test(candidate)
          ? { routes: [{ name: 'More' }] }
          : undefined,
      {}
    ) !== undefined
  );
}

/** Hands the latest link to a mounted, ready navigator, once. */
export function flushParkedLink(): void {
  if (parkedLink && !isCurrentInboundNavigation(parkedLink.arrival)) parkedLink = null;
  if (parkedLink === null || !navigationListener || !isNavigationReady?.()) return;
  const { url } = parkedLink;
  parkedLink = null;
  navigationListener(url);
}

// The native subscription belongs to the app lifetime, including a first launch
// that has not mounted any navigator yet (onboarding or the discreet lock).
function watchIncomingLinks(): void {
  if (isWatchingLinks) return;
  isWatchingLinks = true;
  Linking.addEventListener('url', ({ url }) => {
    if (isSupportedNavigationUrl(url)) {
      parkedLink = { url, arrival: claimInboundNavigation() };
    }
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
