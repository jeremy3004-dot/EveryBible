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
    screens: {
      Bible: {
        screens: {
          BibleReader: 'bible/:bookSlug/:chapter/:verse?',
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
