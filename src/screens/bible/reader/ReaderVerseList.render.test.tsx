import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { mock } from 'node:test';
import type { ComponentProps } from 'react';
import { mockMmkvStorage, mockModule, sourcePath } from '../../../testing/mockModules';
import { installRenderHarness } from '../../../testing/render';
import type { Verse } from '../../../types';

mockMmkvStorage(mock);
const harness = installRenderHarness(mock);

// The real paragraph builder, counted: the screen already builds the chapter's paragraphs
// once per verse list, so the list must not build them again on every render.
const realModel = createRequire(import.meta.url)(
  sourcePath('screens/bible/bibleReaderModel.ts')
) as typeof import('../bibleReaderModel');
const builds = { count: 0 };
mockModule(mock, sourcePath('screens/bible/bibleReaderModel.ts'), {
  ...realModel,
  buildReaderParagraphs: (...args: Parameters<typeof realModel.buildReaderParagraphs>) => {
    builds.count += 1;
    return realModel.buildReaderParagraphs(...args);
  },
});

const verse = (number: number, text: string, heading?: string): Verse => ({
  id: 43_003_000 + number,
  bookId: 'JHN',
  chapter: 3,
  verse: number,
  text,
  ...(heading ? { heading } : {}),
});
const VERSES = [
  verse(1, 'Now there was a Pharisee named Nicodemus.', 'Jesus and Nicodemus'),
  verse(2, 'He came to Jesus at night.', 'The Visit at Night'),
];

type Props = ComponentProps<typeof import('./ReaderVerseList').ReaderVerseList>;

async function renderList(overrides: Partial<Props> = {}) {
  const { ReaderVerseList } = await import('./ReaderVerseList');
  const paragraphs = realModel.buildReaderParagraphs(VERSES);
  builds.count = 0;
  const ref = <T,>(current: T) => ({ current });
  const props = {
    usePremiumTypography: false,
    canShowTranslationSheet: false,
    displayedAnnotations: [],
    flushPendingReaderAutoScroll: () => {},
    flushPendingReaderFocus: () => true,
    handleReaderMomentumScrollEnd: () => {},
    handleReaderScrollBeginDrag: () => {},
    handleReaderScrollEndDrag: () => {},
    highlightByVerse: new Map(),
    isShowingRouteChapterRef: ref(true),
    paragraphHeightsRef: ref({}),
    pendingReaderAutoScrollVerseRef: ref(null),
    premiumParagraphRenderSignature: 'signature',
    premiumReaderBottomPadding: 0,
    premiumReaderListRef: ref(null),
    premiumReaderParagraphs: paragraphs,
    readerContentTopPadding: 0,
    readerFocusScrollRef: ref({}),
    readerInlineActiveVerse: null,
    readerScrollViewportHeightRef: ref(0),
    readingFontFamily: undefined,
    readingFontFamilyBold: undefined,
    renderParagraphBlock: () => <></>,
    renderParagraphRef: ref(() => <></>),
    renderTranslatorFeedbackReviewTools: () => <></>,
    scaleValue: (size: number) => size,
    scrollHandler: (() => {}) as never,
    scrollReaderToVerseParagraph: () => true,
    screenReaderEnabled: false,
    selectedVerseDecorationStyle: {
      textDecorationLine: 'underline',
      textDecorationStyle: 'dotted',
      textDecorationColor: '#000',
    },
    selectedVerseSet: new Set<number>(),
    selectedVerses: [],
    setSelectedVerses: () => {},
    setShowFontSizeSheet: () => {},
    setShowTranslationSheet: () => {},
    sharedTopChromeTop: 0,
    verseOffsetsRef: ref({}),
    ...overrides,
  } as unknown as Props;
  const view = await harness.render(<ReaderVerseList {...props} />);
  await view.flush();
  return { view, props, ReaderVerseList, paragraphs };
}

test('the non-premium list draws the same paragraphs the screen already built, without rebuilding them', async () => {
  const { view, props, ReaderVerseList } = await renderList();
  const headings = () =>
    view
      .queryAllByRole('header')
      .map((node) => node.props.children)
      .join('|');
  assert.equal(headings(), 'Jesus and Nicodemus|The Visit at Night');
  assert.ok(view.getByText(/He came to Jesus at night\./));

  await view.rerender(<ReaderVerseList {...props} readerInlineActiveVerse={2} />);
  await view.rerender(<ReaderVerseList {...props} readerInlineActiveVerse={1} />);
  assert.equal(builds.count, 0);
  assert.equal(headings(), 'Jesus and Nicodemus|The Visit at Night');
});

test('unmounting before the scroll-failure retry frame runs makes no scroll call', async () => {
  const frames = new Map<number, () => void>();
  let nextFrame = 1;
  const realRaf = globalThis.requestAnimationFrame;
  const realCaf = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(nextFrame, () => callback(0));
    return nextFrame++;
  };
  globalThis.cancelAnimationFrame = (id) => {
    frames.delete(id);
  };
  try {
    const scrolls: number[] = [];
    const { view } = await renderList({
      renderVirtualized: true,
      readerInlineActiveVerse: 2,
      scrollReaderToVerseParagraph: (verse: number) => {
        scrolls.push(verse);
        return true;
      },
      premiumReaderListRef: { current: { scrollToOffset: () => {} } } as never,
    });
    const list = view.root.find((node) => typeof node.props.onScrollToIndexFailed === 'function');
    list.props.onScrollToIndexFailed({ index: 3, averageItemLength: 80 });
    assert.equal(frames.size, 1);

    await view.unmount();
    for (const run of [...frames.values()]) run();
    assert.deepEqual(scrolls, []);
  } finally {
    globalThis.requestAnimationFrame = realRaf;
    globalThis.cancelAnimationFrame = realCaf;
  }
});
