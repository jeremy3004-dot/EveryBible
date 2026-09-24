import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { installReaderRenderFixture, verseOf } from './BibleReaderScreen.renderFixture';

// The reader follows playback onto the next chapter only when it was showing the
// chapter that was playing: a listener who moved the reader elsewhere on purpose
// stays there. These cover the reader losing track of that across a remount.
const reader = installReaderRenderFixture(mock);
const { t, renderReader, navigateReader, chapters } = reader;

type View = Awaited<ReturnType<typeof renderReader>>;

const playing = (bookId: string, chapter: number) =>
  reader.setAudio({
    status: 'playing',
    currentTranslationId: 'bsb',
    currentBookId: bookId,
    currentChapter: chapter,
  });

/** The reader's chapter moves (other setParams calls drive the tab bar). */
const chapterMoves = () => reader.setParamsCalls().filter((params) => 'chapter' in params);

const playPauseLabel = (view: View) =>
  view.getByTestId('reader-play-pause').props.accessibilityLabel;

test('a reader restored after the discreet-mode lock follows the chapters that played meanwhile', async () => {
  chapters.set('JHN:5', [verseOf(1, 'After this there was a feast of the Jews.', {}, 'JHN', 5)]);
  await playing('JHN', 3);
  const beforeLock = await renderReader();
  assert.equal(playPauseLabel(beforeLock), t('interface.pauseChapterAudio'));

  // The lock unmounts the navigator; its routes come back, with their keys, on unlock.
  await beforeLock.unmount();
  // Auto-advance carried on in the background: 3 -> 4 -> 5.
  await playing('JHN', 4);
  await playing('JHN', 5);
  const afterUnlock = await renderReader();

  assert.deepEqual(chapterMoves().at(-1), {
    bookId: 'JHN',
    chapter: 5,
    focusVerse: undefined,
    preferredMode: 'read',
    autoplayAudio: false,
  });
  await navigateReader(afterUnlock, { chapter: 5 });
  assert.equal(playPauseLabel(afterUnlock), t('interface.pauseChapterAudio'));
});

test('a plan reader restored after the lock follows within the plan day', async () => {
  chapters.set('MAT:1', [verseOf(1, 'This is the record of the genealogy.', {}, 'MAT', 1)]);
  chapters.set('MAT:2', [verseOf(1, 'After Jesus was born in Bethlehem.', {}, 'MAT', 2)]);
  const plan = {
    bookId: 'MAT',
    chapter: 1,
    planId: 'gospels-60-days',
    planDayNumber: 1,
    returnToPlanOnComplete: true,
  };
  await playing('MAT', 1);
  const beforeLock = await renderReader(plan);
  await beforeLock.unmount();
  await playing('MAT', 2);
  await renderReader(plan);

  assert.deepEqual(chapterMoves().at(-1), {
    bookId: 'MAT',
    chapter: 2,
    focusVerse: undefined,
    preferredMode: 'read',
    autoplayAudio: false,
    planId: 'gospels-60-days',
    planDayNumber: 1,
    returnToPlanOnComplete: true,
  });
});

test('a restored reader the listener had moved off the playing chapter stays where it was', async () => {
  await playing('JHN', 2);
  const beforeLock = await renderReader();
  // The listener reads chapter 3 while chapter 2 plays: a deliberate choice.
  await beforeLock.unmount();
  await playing('JHN', 4);
  const afterUnlock = await renderReader();

  assert.equal(
    chapterMoves().some((params) => params.chapter === 4),
    false
  );
  assert.equal(playPauseLabel(afterUnlock), t('interface.playChapterAudio'));
});

test('a reader newly opened on another chapter while audio plays does not jump to it', async () => {
  await playing('JHN', 3);
  const earlier = await renderReader();
  await earlier.unmount();
  await playing('JHN', 4);

  // Opening the reader again is a new route, even onto the chapter it last showed.
  await renderReader({}, { routeKey: 'reader-route-2' });

  assert.equal(
    chapterMoves().some((params) => params.chapter === 4),
    false
  );
});
