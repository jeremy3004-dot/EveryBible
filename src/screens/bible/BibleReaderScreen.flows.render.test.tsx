import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { hostAncestors, within } from '../../testing/render';
import { installReaderRenderFixture, JOHN_3, verseOf } from './BibleReaderScreen.renderFixture';

// What a reader does with a chapter: select verses and act on them, act on the
// whole chapter, and finish a plan day.
const reader = installReaderRenderFixture(mock);
const { harness, t, renderReader, chapters, serviceCalls } = reader;

type View = Awaited<ReturnType<typeof renderReader>>;

const tapVerse = (view: View, index: number) =>
  view.press(view.getByText(new RegExp(JOHN_3[index].text.slice(0, 20))));

const callsNamed = (name: string) => serviceCalls.filter(([call]) => call === name);

// ---- Verse selection -------------------------------------------------------------

test('tapping verses selects them and the action sheet names the selected range', async () => {
  const view = await renderReader();

  await tapVerse(view, 0);
  await tapVerse(view, 1);

  assert.ok(view.getByText(`${t('annotations.selected')}: John 3:1-2 BSB`));
  await view.press(view.getByRole('button', { name: t('common.done') }));
  assert.equal(view.queryByText(/John 3:1-2 BSB/), null, 'closing clears the selection');
});

test('copy and share hand the selected verses over with their reference', async () => {
  const view = await renderReader();
  await tapVerse(view, 1);

  await view.press(view.getByRole('button', { name: t('annotations.copy') }));
  await view.press(view.getByRole('button', { name: t('groups.share') }));

  const [[, copied]] = callsNamed('Clipboard.setStringAsync');
  assert.equal(typeof copied, 'string');
  assert.ok((copied as string).includes(JOHN_3[1].text));
  assert.ok((copied as string).includes('John 3:2'));
  assert.deepEqual(harness.rn.__recorded.shares, [{ message: copied }]);
});

test('highlighting a selection saves it, clears the selection and announces it', async () => {
  const view = await renderReader();
  await tapVerse(view, 2);

  await view.press(view.getByRole('button', { name: t('annotations.colors.yellow') }));
  await view.flush();

  const [[, saved]] = callsNamed('upsertAnnotation');
  assert.deepEqual(
    {
      book: (saved as Record<string, unknown>).book,
      chapter: (saved as Record<string, unknown>).chapter,
      verse_start: (saved as Record<string, unknown>).verse_start,
      verse_end: (saved as Record<string, unknown>).verse_end,
      type: (saved as Record<string, unknown>).type,
      color: (saved as Record<string, unknown>).color,
    },
    {
      book: 'JHN',
      chapter: 3,
      verse_start: 3,
      verse_end: null,
      type: 'highlight',
      color: '#F4E2A8',
    }
  );
  assert.equal(view.queryByText(/John 3:3 BSB/), null);
  assert.ok(harness.rn.__recorded.announcements.includes(t('interface.highlightAdded')));
});

test('share as image opens the verse image sheet for the selection', async () => {
  const view = await renderReader();
  await tapVerse(view, 1);

  await view.press(view.getByRole('button', { name: t('bible.shareVerseImage') }));

  const sheet = view
    .queryAllByType('Modal')
    .find((node) => node.props.visible && within(node).queryAllByText(/Rabbi/).length > 0);
  assert.ok(sheet, 'the image preview carries the selected text');
});

// ---- Chapter actions -------------------------------------------------------------

async function openChapterActions(view: View) {
  await view.press(view.getByRole('button', { name: t('tabs.more') }));
  const sheet = hostAncestors(view.getByRole('header', { name: 'John 3' })).find(
    (node) => (node.type as string) === 'Modal'
  );
  assert.ok(sheet);
  return sheet;
}

test('the chapter actions save the chapter to favorites, the playlist and the queue', async () => {
  const library: unknown[][] = [];
  reader.libraryStore.setState({
    toggleFavorite: (...args: unknown[]) => void library.push(['favorite', ...args]),
    addChapterToDefaultPlaylist: (...args: unknown[]) => void library.push(['playlist', ...args]),
  });
  const view = await renderReader();

  for (const label of ['bible.addToFavorites', 'bible.addToSavedPlaylist', 'bible.addToQueue']) {
    const sheet = await openChapterActions(view);
    await view.press(within(sheet).getByRole('button', { name: t(label) }));
    assert.equal(view.queryByRole('header', { name: 'John 3' }), null, `${label} closes the sheet`);
  }

  assert.deepEqual(library, [
    ['favorite', 'JHN', 3],
    ['playlist', 'JHN', 3],
  ]);
  assert.deepEqual(reader.audioCalls, [['addToQueue', 'JHN', 3]]);
});

test('sharing the chapter reference shares the book and chapter with its link', async () => {
  const view = await renderReader();
  const sheet = await openChapterActions(view);

  await view.press(within(sheet).getByRole('button', { name: t('bible.shareChapterReference') }));
  await view.flush();

  const [shared] = harness.rn.__recorded.shares as Array<{ message: string; url?: string }>;
  assert.equal(shared.message, 'John 3');
  assert.equal(shared.url, 'com.everybible.app://bible/john/3');
});

// ---- Translator review -------------------------------------------------------------

test('the listen page shows the chapter feedback summary for the chapter on screen', async () => {
  chapters.set('JHN:3', []);
  const view = await renderReader();

  const [summary] = view.queryAllByType('ChapterFeedbackSummary');
  assert.ok(summary);
  assert.deepEqual(
    [summary.props.translationId, summary.props.bookId, summary.props.chapter],
    ['bsb', 'JHN', 3]
  );
});

test('the feedback summary above the read list survives unrelated reader re-renders', async () => {
  // It is the list header: a header component re-created on every render would be a new
  // component type each time, remounting the summary (and its load) on every tick.
  const view = await renderReader();
  const [before] = view.queryAllByType('ChapterFeedbackSummary');
  assert.ok(before);

  await reader.setAudio({ status: 'paused' });
  await reader.setAudio({ status: 'idle' });

  const [after] = view.queryAllByType('ChapterFeedbackSummary');
  assert.equal(after, before, 'the same mounted summary, not a fresh one');
});

// ---- Plan days -------------------------------------------------------------------

test('on the last chapter of a plan day the dock completes the day and ends playback', async () => {
  const resumeCleared: unknown[][] = [];
  reader.readingPlansStore.setState({
    progressByPlanId: {
      'gospels-60-days': { plan_id: 'gospels-60-days', is_completed: false, completed_entries: {} },
    },
    clearPlanDayResume: (...args: unknown[]) => void resumeCleared.push(args),
  });
  chapters.set('MAT:2', [verseOf(1, 'After Jesus was born in Bethlehem.', {}, 'MAT', 2)]);
  const view = await renderReader({
    bookId: 'MAT',
    chapter: 2,
    planId: 'gospels-60-days',
    planDayNumber: 1,
    returnToPlanOnComplete: true,
  });

  await view.press(view.getByRole('button', { name: t('readingPlans.completeDayCta') }));
  await view.flush();

  assert.deepEqual(callsNamed('markDayComplete'), [['markDayComplete', 'gospels-60-days', 1]]);
  assert.deepEqual(reader.audioCalls, [['stop']]);
  assert.deepEqual(resumeCleared, [['gospels-60-days', 1]]);
});
