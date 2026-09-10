import * as Linking from 'expo-linking';
import type { LinkingOptions } from '@react-navigation/native';
import { getStateFromPath as defaultGetStateFromPath } from '@react-navigation/native';
import type { RootTabParamList } from './types';
import { buildBibleNavState } from './buildBibleNavState';

export { buildBibleNavState, resolveTextReferenceNavState } from './buildBibleNavState';

const prefix = Linking.createURL('/');

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
