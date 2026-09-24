import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { act, type ReactTestInstance } from 'react-test-renderer';
import { flattenStyle } from '../../testing/render';
import {
  BSB,
  installReaderRenderFixture,
  JOHN_3,
  verseOf,
} from './BibleReaderScreen.renderFixture';

// How far an update reaches in the reader: which paragraphs redraw, and whether the
// whole screen re-renders at all. A memoized paragraph that React skips keeps its
// committed children as they were, props object included; one that re-renders builds
// fresh props from JSX. So a verse span whose props object changed identity was redrawn.
const reader = installReaderRenderFixture(mock);
const { renderReader, chapters, setAudio } = reader;

type View = Awaited<ReturnType<typeof renderReader>>;

// One paragraph per verse, so each verse's redraws can be told apart.
const HEADED = [
  verseOf(1, JOHN_3[0].text, { heading: 'Jesus and Nicodemus' }),
  verseOf(2, JOHN_3[1].text, { heading: 'The Visit at Night' }),
  verseOf(3, JOHN_3[2].text, { heading: 'Born Again' }),
];

const playJohn3 = (position: number) =>
  setAudio({
    status: 'playing',
    currentTranslationId: 'bsb',
    currentBookId: 'JHN',
    currentChapter: 3,
    currentPosition: position,
    duration: 90_000,
  });

/** The inline span for a verse: the pressable Text whose first child is the verse number. */
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

type Snapshot = { verses: object[]; list: object | undefined };

const snapshot = (view: View): Snapshot => ({
  verses: [1, 2, 3].map((verse) => verseSpan(view, verse).props),
  list: view.queryAllByType('FlatList')[0]?.props,
});

/** Whether each verse's span was redrawn since `before` (1) or left alone (0), in verse order. */
const verseRedraws = (view: View, before: Snapshot) =>
  [1, 2, 3].map((verse) => (verseSpan(view, verse).props === before.verses[verse - 1] ? 0 : 1));

async function renderHeadedChapter() {
  chapters.set('JHN:3', HEADED);
  return renderReader();
}

test('selecting a verse redraws only the paragraph that holds it', async () => {
  const view = await renderHeadedChapter();

  let before = snapshot(view);
  await view.press(verseSpan(view, 3));
  assert.equal(flattenStyle(verseSpan(view, 3).props.style)?.textDecorationLine, 'underline');
  assert.deepEqual(verseRedraws(view, before), [0, 0, 1]);

  before = snapshot(view);
  await view.press(verseSpan(view, 1));
  assert.equal(flattenStyle(verseSpan(view, 1).props.style)?.textDecorationLine, 'underline');
  assert.deepEqual(verseRedraws(view, before), [1, 0, 0], 'adding verse 1 leaves verse 3 alone');

  before = snapshot(view);
  await view.press(verseSpan(view, 3));
  assert.equal(flattenStyle(verseSpan(view, 3).props.style)?.textDecorationLine, undefined);
  assert.deepEqual(verseRedraws(view, before), [0, 0, 1], 'deselecting redraws only that verse');
});

test('a follow-along verse change redraws only the paragraphs it leaves and enters', async () => {
  reader.setTimestamps({ 1: 0, 2: 30, 3: 60 });
  const view = await renderHeadedChapter();
  await playJohn3(5_000);

  const before = snapshot(view);
  await playJohn3(35_000);

  assert.deepEqual(verseRedraws(view, before), [1, 1, 0]);
});

test('a position tick inside a verse draws nothing at all in the text', async () => {
  reader.setTimestamps({ 1: 0, 2: 30, 3: 60 });
  const view = await renderHeadedChapter();
  await playJohn3(35_000);

  const before = snapshot(view);
  await playJohn3(36_000);

  assert.deepEqual(verseRedraws(view, before), [0, 0, 0]);
  assert.ok(before.list, 'the chapter is drawn in a list');
  assert.equal(view.queryAllByType('FlatList')[0]?.props, before.list, 'the list is not redrawn');
});

test('a change to another translation, such as its download progress, does not re-render the reader', async () => {
  const WEB = { ...BSB, id: 'web', abbreviation: 'WEB' };
  reader.bibleStore.setState({ translations: [BSB, WEB] });
  await renderHeadedChapter();
  const renders = reader.renders.count;

  await act(async () => {
    reader.bibleStore.setState((state) => ({
      translations: state.translations.map((translation) =>
        translation.id === 'web'
          ? {
              ...translation,
              activeDownloadJob: {
                id: 'job-1',
                kind: 'translation-audio' as const,
                state: 'running' as const,
                progress: 40,
                startedAt: 0,
                updatedAt: 1,
              },
            }
          : translation
      ),
    }));
  });

  assert.equal(reader.renders.count, renders);
});

test('a change to the current translation still reaches the reader', async () => {
  await renderHeadedChapter();
  const renders = reader.renders.count;

  await act(async () => {
    reader.bibleStore.setState({ translations: [{ ...BSB, downloadedAudioBooks: ['JHN'] }] });
  });

  assert.ok(reader.renders.count > renders);
});
