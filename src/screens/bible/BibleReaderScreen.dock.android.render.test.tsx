import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactTestInstance } from 'react-test-renderer';
import { flattenStyle, hostAncestors, isHiddenFromAccessibility } from '../../testing/render';
import { installReaderRenderFixture } from './BibleReaderScreen.renderFixture';

// The player bar over a 48dp Android three-button bar. The old floating dock's chapter
// arrows rested above the tab capsule and stopped short of the screen edge as it
// collapsed: they stayed drawn but untappable over the bottom of the page. The bar
// collapses as one piece instead.
const reader = installReaderRenderFixture(mock, { os: 'android', insets: { bottom: 48 } });
const { t, renderReader, scrollReader, navigateReader, setAudio } = reader;

type View = Awaited<ReturnType<typeof renderReader>>;

const translateYOf = (node: ReactTestInstance) =>
  ((flattenStyle(node.props.style)?.transform ?? []) as Array<Record<string, number>>).find(
    (entry) => 'translateY' in entry
  )?.translateY ?? 0;

/** The capsule: the bar's own clipped shape, whose height the collapse animates. */
const capsuleOf = (view: View) =>
  hostAncestors(view.getByTestId('player-bar-row'))[0] as ReactTestInstance;

test('with nothing loaded, a collapsed bar leaves nothing of itself above the navigation bar', async () => {
  const { PLAYER_BAR_SECTION_HEIGHT } = await import('../../navigation/readerTabBarMotion');
  const view = await renderReader();

  await scrollReader(view, 400);
  await navigateReader(view, {}); // draw the animated styles at the new progress

  const bar = view.getByTestId('player-bar');
  // Its own height plus the whole 48dp inset it sat above.
  assert.ok(translateYOf(bar) >= PLAYER_BAR_SECTION_HEIGHT + 64 + 48);
  assert.equal(isHiddenFromAccessibility(bar), true);
  assert.equal(view.queryByRole('button', { name: t('audio.previousChapter') }), null);
  assert.ok(view.getByRole('button', { name: t('audio.playerBar.showControls') }));
});

test('with a chapter loaded, the collapsed strip stays above the navigation bar and keeps its controls', async () => {
  await setAudio({
    status: 'playing',
    currentTranslationId: 'bsb',
    currentBookId: 'JHN',
    currentChapter: 3,
  });
  const view = await renderReader();

  await scrollReader(view, 400);
  await navigateReader(view, {});

  assert.equal(translateYOf(view.getByTestId('player-bar')), 0, 'the strip does not slide');
  assert.equal(flattenStyle(capsuleOf(view).props.style)?.height, 38);
  const strip = view.getByTestId('player-bar-strip');
  assert.equal(isHiddenFromAccessibility(strip), false);
  assert.ok(view.getByRole('button', { name: t('interface.pauseChapterAudio') }));
  assert.ok(view.getByRole('button', { name: t('audio.previousChapter') }));
});
