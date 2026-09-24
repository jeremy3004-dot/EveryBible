/**
 * Shared setup for the BibleBrowserScreen render tests.
 *
 * Installs the render harness plus real Zustand stores holding just the fields
 * the browser selects, a recording translator-feedback service, a full-text
 * search service whose calls the test settles, and host-element stand-ins for
 * the lazily loaded translation picker, the not-covered notice and the search
 * skeleton. Call `installBrowserRenderFixture(mock)` once at module scope,
 * before the screen is imported.
 */
import { afterEach, type MockTracker } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { act } from 'react-test-renderer';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { installRenderHarness } from '../../testing/render';
import { mockBarrel, mockModule, sourcePath } from '../../testing/mockModules';
import type { Verse } from '../../types';
import type { TranslationContentSummary } from '../../services/bible/contentAvailability';
import type { TranslatorFeedbackChapterSummary } from '../../services/feedback/translatorFeedbackReviewModel';

// React Native provides these globally; Node does not.
const timerGlobals = globalThis as unknown as {
  requestAnimationFrame: (callback: () => void) => unknown;
  cancelAnimationFrame: (id: unknown) => void;
};
timerGlobals.requestAnimationFrame ??= (callback) => setTimeout(callback, 0);
timerGlobals.cancelAnimationFrame ??= (id) => clearTimeout(id as NodeJS.Timeout);

export const initialBibleState = {
  currentBook: 'JHN',
  currentTranslation: 'bsb',
  translations: [
    { id: 'bsb', name: 'Berean Standard Bible', abbreviation: 'BSB' },
    { id: 'web', name: 'World English Bible', abbreviation: 'WEB' },
  ],
  preferredChapterLaunchMode: 'listen' as 'listen' | 'read',
};

export type SummaryResult =
  | { success: true; chapters: TranslatorFeedbackChapterSummary[] }
  | { success: false; code?: string; coveredTranslationIds?: string[] };

/** Full-text search goes through the SQLite-backed service, loaded lazily by the screen. */
export interface PendingSearch {
  translationId: string;
  query: string;
  resolve: (verses: Verse[]) => void;
  reject: (error: Error) => void;
}

export function installBrowserRenderFixture(mock: MockTracker) {
  // No catalog summary by default: every book and chapter counts as available.
  const content: { summary: TranslationContentSummary | undefined } = { summary: undefined };

  const harness = installRenderHarness(mock, {
    hooks: {
      useI18n: () => {
        const { t, i18n } = useTranslation();
        return { t, i18n, currentLanguage: 'en' };
      },
      useTranslationContentSummary: () => content.summary,
    },
  });
  const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);

  const bibleStore = create(() => ({ ...initialBibleState }));
  mockModule(mock, sourcePath('stores/bibleStore.ts'), { useBibleStore: bibleStore });

  const translatorReviewStore = create(() => ({
    enabled: false,
    accessPasscode: null as string | null,
  }));
  mockModule(mock, sourcePath('stores/translatorReviewStore.ts'), {
    useTranslatorReviewStore: translatorReviewStore,
  });

  const feedback = {
    requests: [] as Array<{ translationId: string; passcode: string }>,
    result: { success: true, chapters: [] } as SummaryResult,
    /** When set, summary requests wait for it before answering. */
    gate: null as Promise<void> | null,
  };
  mockBarrel(mock, 'services/feedback/index.ts', {
    provide: {
      TRANSLATION_NOT_COVERED: 'translation_not_covered',
      fetchChapterFeedbackReviewSummaryForTranslation: async (request: {
        translationId: string;
        passcode: string;
      }) => {
        feedback.requests.push(request);
        const result = feedback.result;
        if (feedback.gate) {
          await feedback.gate;
        }
        return result;
      },
    },
    real: ['getTranslatorFeedbackBookSummaryStatus', 'getTranslatorFeedbackChapterSummaryStatus'],
  });
  mockModule(mock, sourcePath('components/feedback/TranslationNotCoveredNotice.tsx'), {
    TranslationNotCoveredNotice: (props: Record<string, unknown>) =>
      createElement('TranslationNotCoveredNotice', props),
  });
  // Book icons record each render, so a test can tell which book rows re-rendered.
  const bookIconRenders: string[] = [];
  mockModule(mock, sourcePath('components/bible/BookIcon.tsx'), {
    BookIcon: (props: { bookId: string }) => {
      bookIconRenders.push(props.bookId);
      return createElement('BookIcon', props);
    },
  });
  mockModule(mock, sourcePath('components/skeleton/VersesSkeleton.tsx'), {
    VersesSkeleton: (props: Record<string, unknown>) => createElement('VersesSkeleton', props),
  });

  // Each call gets a promise the test settles, so ordering and staleness can be driven.
  const searches: PendingSearch[] = [];
  mockModule(mock, sourcePath('services/bible/bibleService.ts'), {
    searchBible: (translationId: string, query: string) =>
      new Promise<Verse[]>((resolve, reject) => {
        searches.push({ translationId, query, resolve, reject });
      }),
  });

  // Another suite owns the real picker; here it is a host element carrying its props.
  mockModule(mock, sourcePath('screens/bible/TranslationPickerList.tsx'), {
    TranslationPickerList: (props: Record<string, unknown>) =>
      createElement('TranslationPickerList', props),
  });

  afterEach(() => {
    bibleStore.setState({ ...initialBibleState }, true);
    translatorReviewStore.setState({ enabled: false, accessPasscode: null }, true);
    feedback.requests.length = 0;
    feedback.result = { success: true, chapters: [] };
    feedback.gate = null;
    content.summary = undefined;
    searches.length = 0;
    bookIconRenders.length = 0;
    harness.navigation.route.name = 'TestRoute';
  });

  let nextVerseId = 1;
  const verse = (bookId: string, chapter: number, verseNumber: number, text: string): Verse => ({
    id: nextVerseId++,
    bookId,
    chapter,
    verse: verseNumber,
    text,
  });

  async function renderBrowser(
    routeName: 'BibleBrowser' | 'BiblePicker' = 'BibleBrowser',
    params: Record<string, unknown> = {}
  ) {
    harness.navigation.route.name = routeName;
    harness.navigation.route.params = params;
    const { BibleBrowserScreen } = await import('./BibleBrowserScreen');
    const view = await harness.render(<BibleBrowserScreen />);
    await view.flush();
    return view;
  }

  type View = Awaited<ReturnType<typeof renderBrowser>>;

  /** Let real time pass inside act, so timers that set state are flushed. */
  async function wait(ms: number) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  }

  const bookList = (view: View) => {
    const [list] = view
      .queryAllByType('FlatList')
      .filter((node) => (node.props.data as unknown[]).length > 60);
    assert.ok(list, 'the book list is rendered');
    return list;
  };

  const translationEntry = (view: View) =>
    view.queryByRole('button', { name: t('bible.selectTranslation') });

  return {
    harness,
    t,
    content,
    bibleStore,
    translatorReviewStore,
    feedback,
    searches,
    bookIconRenders,
    verse,
    renderBrowser,
    wait,
    bookList,
    translationEntry,
  };
}
