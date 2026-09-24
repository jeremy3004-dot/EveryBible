import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactTestInstance } from 'react-test-renderer';
import { installReaderRenderFixture, verseOf } from './BibleReaderScreen.renderFixture';

// The reader follows playback onto the next chapter, and a chapter change clears the verse
// selection, which closes the verse sheet. A listener writing a note on the chapter that
// was playing lost the note they were typing the moment the audio moved on.
const reader = installReaderRenderFixture(mock, { os: 'android' });
const { t, renderReader, chapters, annotationRows } = reader;

type View = Awaited<ReturnType<typeof renderReader>>;

const playing = (bookId: string, chapter: number) =>
  reader.setAudio({
    status: 'playing',
    currentTranslationId: 'bsb',
    currentBookId: bookId,
    currentChapter: chapter,
  });

const chapterMoves = () => reader.setParamsCalls().filter((params) => 'chapter' in params);

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

test('a note being written when playback moves on is kept, saved to its verse, then the reader follows', async () => {
  chapters.set('JHN:4', [verseOf(1, 'Now when Jesus learned that the Pharisees', {}, 'JHN', 4)]);
  await playing('JHN', 3);
  const view = await renderReader();
  await view.press(verseSpan(view, 3));
  await view.press(view.getByRole('button', { name: t('annotations.note') }));
  await view.changeText(view.getByLabelText(t('annotations.noteHint')), 'Born of water');

  await playing('JHN', 4);
  await view.flush();

  assert.deepEqual(chapterMoves(), [], 'the reader waits on the chapter the note is about');
  assert.equal(view.getByLabelText(t('annotations.noteHint')).props.value, 'Born of water');

  // The sheet's close button is also named Done; the composer's Done comes after it.
  const noteDone = view.getAllByRole('button', { name: t('common.done') }).at(-1);
  assert.ok(noteDone);
  await view.press(noteDone);
  await view.flush();

  assert.deepEqual(
    annotationRows.map((row) => [row.book, row.chapter, row.verse_start, row.content]),
    [['JHN', 3, 3, 'Born of water']]
  );
  assert.deepEqual(
    chapterMoves().map((params) => [params.bookId, params.chapter]),
    [['JHN', 4]],
    'once the sheet closes the reader catches up with playback'
  );
});
