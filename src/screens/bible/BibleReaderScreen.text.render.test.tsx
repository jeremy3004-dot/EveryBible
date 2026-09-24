import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { useEffect } from 'react';
import { act, type ReactTestInstance } from 'react-test-renderer';
import { flattenStyle, hostAncestors, within } from '../../testing/render';
import {
  BSB,
  installReaderRenderFixture,
  JOHN_3,
  verseOf,
} from './BibleReaderScreen.renderFixture';

// What the reader draws for a chapter: paragraphs, headings, poetry, the audio
// follow-along highlight and the scrolling that keeps it in view.
const reader = installReaderRenderFixture(mock);
const { harness, t, renderReader, chapters, setAudio } = reader;

type View = Awaited<ReturnType<typeof renderReader>>;

/** The inline span for a verse: the Text whose first child is the verse number. */
function verseSpan(view: View, verse: number): ReactTestInstance {
  const span = view
    .queryAllByType('Text')
    .find(
      (node) =>
        typeof node.props.onPress === 'function' &&
        node.findAllByType('Text' as never)[1]?.props.children === verse
    );
  assert.ok(span, `verse ${verse}`);
  return span;
}

const backgroundOf = (node: ReactTestInstance) => flattenStyle(node.props.style)?.backgroundColor;

const HEADED = [
  verseOf(1, JOHN_3[0].text, { heading: 'Jesus and Nicodemus' }),
  verseOf(2, JOHN_3[1].text, { heading: 'The Visit at Night' }),
  verseOf(3, JOHN_3[2].text, { heading: 'Born Again' }),
];

/** Lay the list out like the device: a 700pt viewport, 500pt paragraph cells. */
async function measure(view: View) {
  await view.fire(reader.readerList(view), 'onLayout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } },
  });
  const cells = view
    .queryAllByType('View')
    .filter((node) => typeof node.props.onLayout === 'function');
  for (const cell of cells) {
    // Virtualized cells report y relative to their own wrapper: always 0.
    await view.fire(cell, 'onLayout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 500 } },
    });
  }
}

const scrolls = () =>
  harness.refCalls
    .filter((call) => call.type === 'FlatList' && call.method.startsWith('scrollTo'))
    .map((call) => [call.method, call.args[0]]);

const playJohn3 = (position: number, duration = 90_000) =>
  setAudio({
    status: 'playing',
    currentTranslationId: 'bsb',
    currentBookId: 'JHN',
    currentChapter: 3,
    currentPosition: position,
    duration,
  });

// ---- Paragraphs, headings and poetry ------------------------------------------

test('read mode flows a paragraph’s verses inline, each a tappable span with a quiet number', async () => {
  const { useTheme } = await import('../../contexts/ThemeContext');
  const theme: { secondaryText?: string } = {};
  function Colors() {
    const { colors } = useTheme();
    useEffect(() => {
      theme.secondaryText = colors.bibleSecondaryText;
    });
    return null;
  }
  await harness.render(<Colors />);
  const view = await renderReader();

  const first = verseSpan(view, 1);
  const paragraph = hostAncestors(first)[0];
  assert.equal(paragraph.type, 'Text', 'verses sit inside one paragraph Text');
  assert.equal(verseSpan(view, 2).parent?.parent, first.parent?.parent);
  const number = first.findAllByType('Text' as never)[1];
  assert.equal(flattenStyle(number.props.style)?.color, theme.secondaryText);

  await view.press(verseSpan(view, 2));
  assert.ok(view.getByText(new RegExp(`${t('annotations.selected')}: John 3:2`)));
});

test('section titles are headers in the bold reading face at the reading-heading size', async () => {
  const { typography } = await import('../../design/system');
  const { getReadingFontFamily } = await import('../../design/fonts');
  chapters.set('JHN:3', HEADED);
  const view = await renderReader();

  const heading = view.getByRole('header', { name: 'The Visit at Night' });
  const style = flattenStyle(heading.props.style) ?? {};
  assert.equal(style.fontSize, typography.readingHeading.fontSize);
  assert.equal(style.fontFamily, getReadingFontFamily('English', 700));
  assert.notEqual(style.fontFamily, getReadingFontFamily('English'));
  assert.equal(style.fontWeight, '700', 'the platform-serif fallback still renders bold');
});

test('poetry keeps its stored indentation, and recovered prose lead-ins read at body weight', async () => {
  const { spacing } = await import('../../design/system');
  chapters.set('JHN:3', [
    verseOf(1, 'For to which of the angels did God ever say: You are My Son', {
      formatting: {
        mode: 'poetry',
        lines: [
          { text: 'For to which of the angels did God ever say:', prose: true },
          { text: 'You are My Son;', indentLevel: 1 },
          { text: 'today I have become Your Father', indentLevel: 2 },
        ],
      },
    }),
  ]);
  const view = await renderReader();

  const line = (text: string) => {
    const node = view.queryAllByType('Text').find((candidate) => {
      const children = ([] as unknown[]).concat(candidate.props.children);
      return children.includes(text);
    });
    assert.ok(node, text);
    return flattenStyle(node.props.style) ?? {};
  };
  assert.equal(line('You are My Son;').marginLeft, spacing.lg);
  assert.equal(line('today I have become Your Father').marginLeft, spacing.lg * 2);

  const prose = line('For to which of the angels did God ever say:');
  const poetry = line('You are My Son;');
  assert.equal(prose.marginLeft, undefined);
  for (const key of ['fontWeight', 'fontStyle', 'fontFamily', 'fontSize', 'color'] as const) {
    assert.equal(prose[key], poetry[key], `prose ${key} matches the verse`);
  }
});

test('the paragraphs render through a bounded, virtualized list', async () => {
  chapters.set('JHN:3', HEADED);
  const view = await renderReader();

  const list = reader.readerList(view);
  assert.equal(list.props.data.length, 3, 'one row per paragraph, not per verse');
  assert.equal(list.props.removeClippedSubviews, true);
  assert.deepEqual(
    [list.props.initialNumToRender, list.props.maxToRenderPerBatch, list.props.windowSize],
    [8, 6, 7]
  );
  assert.equal(list.props.scrollEventThrottle, 16);
});

// ---- Audio follow-along ---------------------------------------------------------

test('the follow-along highlight moves verse to verse and invalidates the list rows', async () => {
  reader.setTimestamps({ 1: 0, 2: 30, 3: 60 });
  const view = await renderReader();

  await playJohn3(35_000);
  const highlight = backgroundOf(verseSpan(view, 2));
  assert.ok(highlight, 'verse 2 is highlighted');
  assert.equal(backgroundOf(verseSpan(view, 1)), undefined);
  assert.match(String(reader.readerList(view).props.extraData), /^2\|/);

  await playJohn3(65_000);
  assert.equal(backgroundOf(verseSpan(view, 2)), undefined, 'the old highlight clears');
  assert.equal(backgroundOf(verseSpan(view, 3)), highlight);
  assert.match(String(reader.readerList(view).props.extraData), /^3\|/);
});

test('position ticks inside a verse do not re-render the reader', async () => {
  reader.setTimestamps({ 1: 0, 2: 30, 3: 60 });
  await renderReader();
  await playJohn3(35_000);
  const renders = reader.renders.count;

  await playJohn3(36_000);
  await playJohn3(37_000);

  assert.equal(reader.renders.count, renders);
});

test('an unrelated reader re-render keeps the list’s renderItem, so rows are not redrawn', async () => {
  const view = await renderReader();
  // The list fake consumes renderItem, so read it from the FlatList element itself.
  const renderItemOf = () => reader.readerList(view).parent?.props.renderItem;
  const renderItem = renderItemOf();
  assert.equal(typeof renderItem, 'function');
  const renders = reader.renders.count;

  await view.press(view.getByRole('button', { name: t('tabs.more') }));

  assert.ok(reader.renders.count > renders, 'the screen did re-render');
  assert.equal(renderItemOf(), renderItem);
});

/**
 * Counts renders of the verse list. Each render hands its FlatList a fresh props object
 * (a new footer element, a new content style), so the host element's props change
 * identity exactly when the list component rendered again.
 */
function trackVerseListRenders(view: View) {
  let seen = reader.readerList(view).props;
  let count = 0;
  return () => {
    const current = reader.readerList(view).props;
    if (current !== seen) {
      count += 1;
      seen = current;
    }
    return count;
  };
}

test('the verse list skips reader re-renders it takes nothing from, but not size or chapter changes', async () => {
  chapters.set('JHN:4', [
    verseOf(1, 'Now Jesus learned that the Pharisees had heard.', {}, 'JHN', 4),
  ]);
  const view = await renderReader();
  const listRenders = trackVerseListRenders(view);

  // Opening and closing the chapter actions sheet re-renders the screen only.
  let renders = reader.renders.count;
  await view.press(view.getByRole('button', { name: t('tabs.more') }));
  assert.ok(reader.renders.count > renders, 'the screen did re-render');
  assert.equal(listRenders(), 0, 'opening a sheet does not redraw the verse list');
  renders = reader.renders.count;
  await act(async () => {
    reader.libraryStore.setState({ favorites: [{ id: 'JHN:3' }] });
  });
  assert.ok(reader.renders.count > renders, 'the screen did re-render');
  assert.equal(listRenders(), 0, 'a favorite toggle does not redraw the verse list');
  renders = reader.renders.count;
  await setAudio({ status: 'playing', currentBookId: 'GEN', currentChapter: 1 });
  assert.ok(reader.renders.count > renders, 'the screen did re-render');
  assert.equal(listRenders(), 0, 'playback of another chapter does not redraw the verse list');

  const bodySize = () => flattenStyle(hostAncestors(verseSpan(view, 1))[0].props.style)?.fontSize;
  const mediumSize = bodySize();
  await act(async () => {
    harness.authStore.getState().setPreferences({ fontSize: 'large' });
  });
  assert.equal(listRenders(), 1, 'a font size change redraws the verse list');
  assert.ok((bodySize() ?? 0) > (mediumSize ?? 0), 'at the larger size');

  await reader.navigateReader(view, { chapter: 4 });
  assert.equal(listRenders(), 2, 'a chapter change redraws the verse list');
  assert.ok(view.getByText(/the Pharisees had heard/));
});

test('follow-along scrolls the playing verse up once it passes the middle of the screen', async () => {
  reader.setTimestamps({ 1: 0, 2: 30, 3: 60 });
  chapters.set('JHN:3', HEADED);
  const view = await renderReader();

  // Unmeasured rows: jump by index and keep the exact scroll pending.
  await playJohn3(65_000);
  assert.deepEqual(scrolls().at(-1)?.[0], 'scrollToIndex');
  assert.equal((scrolls().at(-1)?.[1] as { index: number }).index, 2);

  // Once the rows measure, the pending scroll lands in content space: verse 3
  // starts two 500pt paragraphs below the content inset, and the scroll parks
  // it that inset below the top edge, under the chrome.
  harness.refCalls.length = 0;
  await measure(view);
  assert.deepEqual(scrolls().at(-1), ['scrollToOffset', { offset: 1000, animated: true }]);
});

test('a repeated chapter that restarts scrolls the reader back to the top', async () => {
  reader.setTimestamps({ 1: 0, 2: 30, 3: 60 });
  chapters.set('JHN:3', HEADED);
  const view = await renderReader();
  await measure(view);
  await playJohn3(85_000);
  harness.refCalls.length = 0;

  await playJohn3(500);

  assert.deepEqual(scrolls().at(-1), ['scrollToOffset', { offset: 0, animated: true }]);
});

test('annotations that arrive after the reader moved on are dropped', async () => {
  reader.holdAnnotations();
  chapters.set('JHN:4', [
    verseOf(1, 'Now Jesus learned that the Pharisees had heard.', {}, 'JHN', 4),
  ]);
  const view = await renderReader();
  await reader.navigateReader(view, { chapter: 4 });

  const [stale, current] = reader.annotationLoads;
  assert.deepEqual([stale.chapter, current.chapter], ['JHN:3', 'JHN:4']);
  current.resolve([]);
  await view.flush();
  stale.resolve([
    {
      id: 'a1',
      type: 'highlight',
      color: '#FFD700',
      book: 'JHN',
      chapter: 3,
      verse_start: 1,
      verse_end: 1,
      deleted_at: null,
    },
  ]);
  await view.flush();

  const span = view.queryAllByType('Text').find((node) => typeof node.props.onPress === 'function');
  assert.ok(span);
  assert.equal(backgroundOf(span), undefined, 'John 3’s highlight must not paint John 4');
});

// ---- Listen mode -------------------------------------------------------------

test('an audio-only chapter shows the artwork player with just the chapter transport', async () => {
  chapters.set('JHN:3', []);
  const view = await renderReader();

  const play = view.getByRole('button', { name: t('interface.playChapterAudio') });
  assert.ok(view.getByRole('button', { name: t('audio.previousChapter') }));
  assert.ok(view.getByRole('button', { name: t('audio.nextChapter') }));
  for (const utility of [t('audio.playbackSpeed'), t('audio.sleepTimer'), t('audio.repeatOff')]) {
    assert.equal(
      view.queryByRole('button', { name: utility }),
      null,
      `${utility} lives in the sheet`
    );
  }
  // The reference lives only in the top pill: no title, eyebrow or verse count below the art.
  assert.equal(view.queryAllByText('John 3').length, 1);
  assert.equal(view.queryAllByText('BSB').length, 1);
  assert.equal(view.queryAllByText(/verses?$/i).length, 0);
  // The stack is top-aligned so the transport clears the tab bar.
  const column = hostAncestors(play).find(
    (node) => flattenStyle(node.props.style)?.justifyContent === 'flex-start'
  );
  assert.ok(column, 'top-aligned listen column');

  await view.press(play);
  assert.deepEqual(reader.audioCalls, [['playChapter', 'JHN', 3]]);
});

test('listen progress ticks update the elapsed time without re-rendering the reader', async () => {
  chapters.set('JHN:3', []);
  const view = await renderReader();
  await playJohn3(5_000, 60_000);
  const renders = reader.renders.count;

  await playJohn3(65_000 - 60_000 + 1_000, 60_000);
  assert.ok(view.getByText('0:06'));
  assert.ok(view.getByText('-0:54'));
  assert.equal(reader.renders.count, renders);
});

test('switching to a translation without text drops the selection for the audio player', async () => {
  const view = await renderReader();
  await view.press(verseSpan(view, 2));
  assert.ok(view.getByRole('button', { name: t('common.done') }));

  // Switching to an audio-only translation leaves the chapter without text.
  const audioOnly = { ...BSB, id: 'audio', abbreviation: 'AUD', hasText: false };
  await act(async () => {
    reader.bibleStore.setState({ translations: [audioOnly], currentTranslation: 'audio' });
  });
  await view.flush();

  assert.equal(view.queryByRole('button', { name: t('common.done') }), null);
  assert.ok(view.getByRole('button', { name: t('interface.playChapterAudio') }));
});

// ---- Chapter feedback ----------------------------------------------------------

const enableFeedback = () =>
  harness.authStore.getState().setPreferences({
    chapterFeedbackEnabled: true,
    chapterFeedbackName: 'Ruth',
    chapterFeedbackRole: 'Reviewer',
  });

test('feedback contributors get a feedback button in the chrome that opens a keyboard-safe sheet', async () => {
  enableFeedback();
  const view = await renderReader();

  await view.press(view.getByRole('button', { name: t('bible.chapterFeedback') }));

  const [avoiding] = view.queryAllByType('KeyboardAvoidingView');
  assert.ok(avoiding, 'the sheet rides above the keyboard');
  const modal = hostAncestors(avoiding).find((node) => (node.type as string) === 'Modal');
  assert.equal(modal?.props.statusBarTranslucent, true);
  const [scroll] = within(avoiding).queryAllByType('ScrollView');
  assert.equal(scroll.props.keyboardShouldPersistTaps, 'handled');
  const [backdrop] = within(avoiding).queryAllByType('TouchableOpacity');
  assert.equal(backdrop.props.importantForAccessibility, 'no-hide-descendants');
  assert.ok(within(avoiding).getByRole('button', { name: t('bible.chapterFeedbackThumbsUp') }));
});

test('in read mode the overflow menu also offers chapter feedback', async () => {
  enableFeedback();
  const view = await renderReader();
  await view.press(view.getByRole('button', { name: t('tabs.more') }));

  const sheet = hostAncestors(view.getByRole('header', { name: 'John 3' })).find(
    (node) => (node.type as string) === 'Modal'
  );
  assert.ok(sheet);
  assert.ok(within(sheet).getByRole('button', { name: t('bible.chapterFeedback') }));
});

test('the listen page carries the feedback composer inline and submits it as listener feedback', async () => {
  enableFeedback();
  chapters.set('JHN:3', []);
  const view = await renderReader();

  await view.press(view.getByRole('button', { name: t('tabs.more') }));
  const sheet = hostAncestors(view.getByRole('header', { name: 'John 3' })).find(
    (node) => (node.type as string) === 'Modal'
  );
  assert.ok(sheet);
  assert.equal(
    within(sheet).queryByRole('button', { name: t('bible.chapterFeedback') }),
    null,
    'the inline composer replaces the overflow action, which stays as the rollback path'
  );
  await view.fire(sheet, 'onRequestClose');

  await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackThumbsUp') }));
  await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackSubmit') }));

  assert.equal(reader.feedbackSubmissions.length, 1);
  const [submission] = reader.feedbackSubmissions;
  assert.equal(submission.sourceScreen, 'listener');
  assert.equal(submission.sentiment, 'up');
  assert.deepEqual([submission.bookId, submission.chapter], ['JHN', 3]);
});

/** Opens the listen page's inline composer, picks thumbs-up and submits. */
async function submitListenerFeedback() {
  enableFeedback();
  chapters.set('JHN:3', []);
  const view = await renderReader();
  await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackThumbsUp') }));
  await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackSubmit') }));
  await view.flush();
  return view;
}

test('feedback sent offline is kept for later, and the reader is told so rather than shown an error', async () => {
  reader.feedbackOutcome.result = { success: true, saved: false, exported: false, queued: true };

  const view = await submitListenerFeedback();

  assert.equal(reader.feedbackSubmissions.length, 1);
  const [alert] = harness.rn.__recorded.alerts;
  assert.equal(alert?.title, t('bible.chapterFeedbackQueuedTitle'));
  assert.equal(alert?.message, t('bible.chapterFeedbackQueued'));
  assert.equal(view.queryByText(t('common.unexpectedError')), null);
});

test('feedback that cannot be kept offline stays in the composer with an offline notice', async () => {
  reader.feedbackOutcome.result = {
    success: false,
    saved: false,
    exported: false,
    offline: true,
    retryable: true,
  };

  const view = await submitListenerFeedback();

  assert.ok(view.getByText(t('bible.chapterFeedbackOffline')));
  assert.equal(view.queryByText(t('common.unexpectedError')), null);
  assert.deepEqual(harness.rn.__recorded.alerts, []);
  assert.ok(
    harness.rn.__recorded.announcements.includes(t('bible.chapterFeedbackOffline')),
    'VoiceOver hears the notice, which is otherwise only a TalkBack live region'
  );
});

test('at large text the feedback identity drops under the heading and wraps instead of truncating', async () => {
  enableFeedback();
  chapters.set('JHN:3', []);
  harness.setFontScale(2);
  const view = await renderReader();

  const identity = view.getByText('Ruth • Reviewer');
  assert.equal(
    flattenStyle(identity.props.style)?.maxWidth,
    undefined,
    'a 110pt cap cut "Name • Role" after a few letters'
  );
  assert.equal(identity.props.numberOfLines, 2);
  const header = hostAncestors(identity).find(
    (node) => flattenStyle(node.props.style)?.justifyContent === 'space-between'
  );
  assert.equal(flattenStyle(header?.props.style)?.flexDirection, 'column');
});
