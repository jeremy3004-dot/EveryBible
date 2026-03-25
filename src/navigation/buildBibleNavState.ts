import type { PathConfigMap } from '@react-navigation/native';
import type { RootTabParamList } from './types';
import { parseBibleDeepLink } from '../services/bible/deepLinkParser';

type StateRoute = {
  name: string;
  params?: Record<string, unknown>;
  state?: { routes: StateRoute[] };
};

export type NavigationState = { routes: StateRoute[] };

/**
 * Pure function: converts a /bible/{slug}/{chapter}/{verse?} path into a React Navigation
 * state tree that opens BibleReader inside the Bible tab, with BibleBrowser as the backstop.
 *
 * Exported separately so it can be unit-tested without the expo-linking dependency.
 * Falls back to the provided defaultParser for non-bible paths.
 */
export const buildBibleNavState = (
  path: string,
  defaultParser: (
    path: string,
    options: PathConfigMap<RootTabParamList>
  ) => NavigationState | undefined,
  options: PathConfigMap<RootTabParamList>
): NavigationState | undefined => {
  const result = parseBibleDeepLink(path);
  if (result !== null) {
    return {
      routes: [
        {
          name: 'Bible',
          state: {
            routes: [
              { name: 'BibleBrowser' },
              {
                name: 'BibleReader',
                params: {
                  bookId: result.bookId,
                  chapter: result.chapter,
                  focusVerse: result.verse,
                },
              },
            ],
          },
        },
      ],
    };
  }
  return defaultParser(path, options);
};
