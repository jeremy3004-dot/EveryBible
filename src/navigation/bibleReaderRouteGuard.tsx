import { useEffect } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getBookById } from '../constants/books';
// BibleStack requires this module from BibleReader's getComponent, so the reader's
// import graph still stays off the startup path.
import { BibleReaderScreen } from '../screens/bible/BibleReaderScreen';
import type { BibleStackParamList } from './types';

export type BibleReaderParamsCheck =
  | { status: 'valid' }
  | { status: 'fix-chapter'; chapter: number }
  | { status: 'unknown-book' };

/**
 * Whether BibleReader params name a real chapter. Params come from persisted state
 * (last-read position, the audio queue, annotations, plan entries) as well as links,
 * so they are checked at runtime rather than trusted to the route types. A chapter the
 * book does not have is clamped into the book: a stale 999 opens the last chapter.
 */
export function checkBibleReaderParams(params: unknown): BibleReaderParamsCheck {
  if (typeof params !== 'object' || params === null) {
    return { status: 'unknown-book' };
  }
  const { bookId, chapter } = params as { bookId?: unknown; chapter?: unknown };
  const book = typeof bookId === 'string' ? getBookById(bookId) : undefined;
  if (!book) {
    return { status: 'unknown-book' };
  }
  const requested = typeof chapter === 'string' ? Number(chapter) : chapter;
  if (typeof requested !== 'number' || !Number.isFinite(requested)) {
    return { status: 'fix-chapter', chapter: 1 };
  }
  if (Number.isInteger(requested) && requested >= 1 && requested <= book.chapters) {
    return chapter === requested
      ? { status: 'valid' }
      : { status: 'fix-chapter', chapter: requested };
  }
  return {
    status: 'fix-chapter',
    chapter: Math.min(Math.max(Math.floor(requested), 1), book.chapters),
  };
}

/**
 * BibleStack's BibleReader route. The reader renders a blank page, with no way back
 * on screen, for a book outside the catalog, and loads a missing chapter as an empty
 * page it then marks read. So an unknown book returns to the Bible browser (popping to
 * the one beneath, or replacing this route when there is none), and a bad chapter is
 * corrected in the params before the reader mounts.
 */
export function BibleReaderRoute() {
  const route = useRoute<RouteProp<BibleStackParamList, 'BibleReader'>>();
  const navigation = useNavigation<NativeStackNavigationProp<BibleStackParamList, 'BibleReader'>>();
  const check = checkBibleReaderParams(route.params);
  const fixedChapter = check.status === 'fix-chapter' ? check.chapter : null;

  useEffect(() => {
    if (check.status === 'unknown-book') {
      navigation.popTo('BibleBrowser');
    } else if (fixedChapter !== null) {
      navigation.setParams({ chapter: fixedChapter });
    }
  }, [check.status, fixedChapter, navigation]);

  if (check.status !== 'valid') {
    return null;
  }
  return <BibleReaderScreen />;
}
