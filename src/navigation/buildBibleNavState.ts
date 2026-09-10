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
 * Build a Bible tab navigation state tree from a parsed reference target.
 */
const buildBibleReaderState = (
  bookId: string,
  chapter: number,
  focusVerse?: number
): NavigationState => ({
  routes: [
    {
      name: 'Bible',
      state: {
        routes: [
          { name: 'BibleBrowser' },
          {
            name: 'BibleReader',
            params: { bookId, chapter, focusVerse },
          },
        ],
      },
    },
  ],
});

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
  try {
    // Reject malformed escapes before the vendor query parser's recursive decoder.
    // Validate only: forwarding the decoded value would decode valid tokens twice.
    decodeURIComponent(path);
  } catch {
    return undefined;
  }
  const result = parseBibleDeepLink(path);
  if (result !== null) {
    return buildBibleReaderState(result.bookId, result.chapter, result.verse);
  }
  return defaultParser(path, options);
};

