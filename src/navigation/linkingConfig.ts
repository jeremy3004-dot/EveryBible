import * as Linking from 'expo-linking';
import type { LinkingOptions } from '@react-navigation/native';
import { getStateFromPath as defaultGetStateFromPath } from '@react-navigation/native';
import type { RootTabParamList } from './types';
import { buildBibleNavState } from './buildBibleNavState';

export { buildBibleNavState } from './buildBibleNavState';

const prefix = Linking.createURL('/');

/** React Navigation's own wait: getInitialURL can hang on Android (react-native#25675). */
const INITIAL_URL_TIMEOUT_MS = 150;

let hasDeliveredInitialUrl = false;

/**
 * The launch URL, once per JS runtime. Linking reports it for the life of the process,
 * and NavigationContainer asks on every mount; the navigator unmounts behind the
 * discreet-mode lock screen, so each unlock used to reopen the launch link wherever
 * the reader had gone since. A link that arrives later comes through the 'url'
 * listener instead. A launch during onboarding or behind the lock is still honoured:
 * the navigator first mounts, and asks, only after both.
 */
const getInitialURLOnce = (): Promise<string | null> | null => {
  if (hasDeliveredInitialUrl) {
    return null;
  }
  hasDeliveredInitialUrl = true;
  return Promise.race([
    Linking.getInitialURL(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), INITIAL_URL_TIMEOUT_MS)),
  ]);
};

/**
 * React Navigation linking config for deep links using the com.everybible.app:// scheme.
 *
 * Handles paths of the form:
 *   com.everybible.app://bible/{bookSlug}/{chapter}/{verse?}
 *
 * Uses a custom getStateFromPath that delegates to buildBibleNavState to translate
 * book slugs (e.g. 'john') to internal book IDs (e.g. 'JHN') via parseBibleDeepLink,
 * then builds the correct nested nav state. Non-bible paths fall through to React
 * Navigation's default state builder.
 */
export const linkingConfig: LinkingOptions<RootTabParamList> = {
  prefixes: [prefix, 'com.everybible.app://'],
  getInitialURL: getInitialURLOnce,
  config: {
    // No `bible/...` template lives here on purpose. Bible paths are owned entirely
    // by getStateFromPath below (slug→bookId via buildBibleNavState). A template of
    // the shape `bible/:bookSlug/:chapter/:verse?` would catch every path that
    // parseBibleDeepLink rejects — an unknown or misspelled book slug, a non-numeric
    // chapter — and push BibleReader with { bookSlug, chapter: '3' } instead of its
    // real params (bookId, numeric chapter), leaving the reader with no bookId and
    // no BibleBrowser backstop. If an outbound share-URL feature is added, give it a
    // getPathFromState that maps bookId→slug rather than a param-shape-mismatched
    // inbound template.
    screens: {
      More: {
        // A cold-start link builds the More stack from this config alone; without an
        // initial route it was [Auth] with no More page to close the modal back to.
        initialRouteName: 'MoreScreen',
        screens: {
          Auth: {
            screens: {
              ResetPassword: 'reset-password',
            },
          },
        },
      },
    },
  },
  getStateFromPath(path, options) {
    return buildBibleNavState(
      path,
      // defaultGetStateFromPath signature is compatible — cast to match our internal type
      defaultGetStateFromPath as Parameters<typeof buildBibleNavState>[1],
      options as Parameters<typeof buildBibleNavState>[2]
    );
  },
};
