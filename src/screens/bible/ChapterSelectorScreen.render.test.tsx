import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { create } from 'zustand';
import { mockModule, sourcePath } from '../../testing/mockModules';
import {
  flattenStyle,
  installRenderHarness,
  isHiddenFromAccessibility,
  within,
} from '../../testing/render';
import { DEFAULT_APPEARANCE_PALETTE } from '../../constants/appearancePalettes';
import { CHAPTER_TILE_MAX_FONT_SCALE } from './chapterTileLayout';

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
  // No count or status badges: only the read tick (John 1) marks a tile.
  assert.deepEqual(
    chapterTiles.filter((tile) => within(tile).queryAllByType('Icon').length > 0),
    [view.getByRole('button', { name: 'John 1' })]
  );

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

test('read and continue chapters carry a shape cue, not only a different fill', async () => {
  const view = await renderBookHub();
  const { createThemeColors } = await import('../../contexts/ThemeContext');
  const colors = createThemeColors('light', DEFAULT_APPEARANCE_PALETTE);
  const read = view.getByRole('button', { name: 'John 1' });
  const unread = view.getByRole('button', { name: 'John 2' });
  const continuing = view.getByRole('button', { name: 'John 3' });
  const ringsOf = (tile: typeof read) =>
    within(tile)
      .queryAllByType('View')
      .filter((node) => flattenStyle(node.props.style)?.borderWidth);

  // Read: a small tick in the accent colour, pinned off the layout under the number.
  const [tick, ...extraIcons] = within(read).queryAllByType('Icon');
  assert.deepEqual(extraIcons, []);
  assert.deepEqual([tick.props.name, tick.props.color], ['checkmark', colors.bibleAccent]);
  const tickStyle = flattenStyle(tick.props.style);
  assert.equal(tickStyle?.position, 'absolute');
  assert.ok(tickStyle?.bottom !== undefined && tickStyle?.top === undefined);
  assert.equal(isHiddenFromAccessibility(tick), true);
  assert.deepEqual(ringsOf(read), []);

  // Continue: an inner ring in the on-accent colour, and no tick.
  const [ring, ...extraRings] = ringsOf(continuing);
  assert.deepEqual(extraRings, []);
  assert.equal(flattenStyle(ring.props.style)?.borderColor, colors.onAccent);
  assert.equal(flattenStyle(ring.props.style)?.position, 'absolute');
  assert.equal(isHiddenFromAccessibility(ring), true);
  assert.deepEqual(within(continuing).queryAllByType('Icon'), []);

  // Unread: neither. The cues sit off the layout, so every tile keeps its size, and the
  // number caps its text scaling so it clears the tick in the fixed-size tile.
  assert.deepEqual([within(unread).queryAllByType('Icon'), ringsOf(unread)], [[], []]);
  for (const [tile, number] of [
    [read, '1'],
    [unread, '2'],
    [continuing, '3'],
  ] as const) {
    assert.equal(flattenStyle(tile.props.style)?.width, flattenStyle(unread.props.style)?.width);
    assert.equal(
      within(tile).getByText(number).props.maxFontSizeMultiplier,
      CHAPTER_TILE_MAX_FONT_SCALE
    );
  }
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
