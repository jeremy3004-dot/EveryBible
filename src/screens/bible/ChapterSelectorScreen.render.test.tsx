import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { create } from 'zustand';
import { mockModule, sourcePath } from '../../testing/mockModules';
import { installRenderHarness, within } from '../../testing/render';

const harness = installRenderHarness(mock);
const t = (key: string) => harness.i18n.t(key);

const bibleStore = create(() => ({
  currentBook: 'JHN',
  currentChapter: 3,
  preferredChapterLaunchMode: 'read',
}));
const readChapters = new Set(['JHN:1']);
const progressStore = create(() => ({
  chaptersRead: { JHN: [1] },
  isChapterRead: (bookId: string, chapter: number) => readChapters.has(`${bookId}:${chapter}`),
}));

mockModule(mock, sourcePath('stores/bibleStore.ts'), { useBibleStore: bibleStore });
mockModule(mock, sourcePath('stores/progressStore.ts'), { useProgressStore: progressStore });
mockModule(mock, 'expo-constants', { default: { expoConfig: { extra: {} } } });
const trackedEvents: unknown[] = [];
mockModule(mock, sourcePath('services/analytics/bibleExperienceAnalytics.ts'), {
  trackBibleExperienceEvent: (event: unknown) => trackedEvents.push(event),
});

async function renderBookHub(bookId = 'JHN') {
  harness.navigation.route.params = { bookId };
  const { ChapterSelectorScreen } = await import('./ChapterSelectorScreen');
  return harness.render(<ChapterSelectorScreen />);
}

test('the book hub is only a back button, the book title, and a labelled chapter grid', async () => {
  const view = await renderBookHub();

  assert.deepEqual(
    view.getAllByRole('header').map((node) => node.props.children),
    ['John', t('bible.chapters')]
  );
  const chapterTiles = view.getAllByRole('button', { name: /^John \d+$/ });
  assert.equal(chapterTiles.length, 21);
  // No mode switch, translation pills or chapter-count subtitle in the hero.
  assert.equal(view.queryByText(/21/), view.getByText('21'), 'only the tile shows 21');
  for (const tile of chapterTiles) {
    assert.equal(within(tile).queryAllByType('Icon').length, 0, 'no badges on the tiles');
  }

  await view.press(view.getByRole('button', { name: t('common.back') }));
  assert.deepEqual(harness.navigation.calls, [{ method: 'goBack', args: [] }]);
});

test('chapter tiles announce which chapter continues reading and which are already read', async () => {
  const view = await renderBookHub();

  assert.deepEqual(view.getByRole('button', { name: 'John 3' }).props.accessibilityValue, {
    text: t('home.continueReading'),
  });
  assert.deepEqual(view.getByRole('button', { name: 'John 1' }).props.accessibilityValue, {
    text: t('readingPlans.completed'),
  });
  assert.equal(view.getByRole('button', { name: 'John 2' }).props.accessibilityValue, undefined);
});

test('tapping a chapter opens the reader in the preferred launch mode and records the tap', async () => {
  const view = await renderBookHub();
  await view.press(view.getByRole('button', { name: 'John 7' }));

  assert.deepEqual(harness.navigation.calls, [
    {
      method: 'navigate',
      args: ['BibleReader', { bookId: 'JHN', chapter: 7, preferredMode: 'read' }],
    },
  ]);
  await view.flush();
  assert.equal((trackedEvents.at(-1) as { name: string }).name, 'book_hub_chapter_opened');
});

test('an unknown book shows the load error with a way back', async () => {
  const view = await renderBookHub('NOPE');

  assert.ok(view.getByText(t('bible.failedToLoad')));
  assert.ok(view.getByRole('button', { name: t('common.back') }));
  assert.equal(view.queryAllByRole('header').length, 0);
});
