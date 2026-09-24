import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactTestInstance } from 'react-test-renderer';
import { flattenStyle, hostAncestors, within } from '../../testing/render';
import { installReaderRenderFixture } from './BibleReaderScreen.renderFixture';

// The collapsed playback dock on Android. The chapter arrows travel down with the tab
// capsule, but they rest above it, so the capsule's travel leaves them short of the screen
// edge: on a gesture bar the tops of both discs stayed stuck at the bottom of the page, and
// above a 48dp three-button bar they stayed almost whole, drawn but untappable.
const reader = installReaderRenderFixture(mock, { os: 'android', insets: { bottom: 48 } });
const { t, renderReader, scrollReader } = reader;

type View = Awaited<ReturnType<typeof renderReader>>;

/** The dock's chapter arrows: the buttons beside play, reachable by the screen reader or not. */
const arrowsOf = (view: View): ReactTestInstance[] => {
  const overlay = hostAncestors(view.getByTestId('reader-play-pause')).find(
    (node) => node.props.pointerEvents === 'box-none' && flattenStyle(node.props.style)?.bottom
  );
  assert.ok(overlay, 'dock overlay');
  const arrows = within(overlay)
    .getAllByRole('button', { includeHidden: true })
    .filter((button) => button.props.testID !== 'reader-play-pause');
  assert.equal(arrows.length, 2);
  return arrows;
};

/** How opaque a node is drawn: the product of its own and its ancestors' opacity. */
const drawnOpacity = (node: ReactTestInstance) =>
  [node, ...hostAncestors(node)].reduce(
    (opacity, current) => opacity * Number(flattenStyle(current.props.style)?.opacity ?? 1),
    1
  );

test('a collapsed dock draws no chapter arrows at the bottom of the screen', async () => {
  const view = await renderReader();
  assert.deepEqual(arrowsOf(view).map(drawnOpacity), [1, 1], 'shown while the dock is open');

  await scrollReader(view, 400);

  assert.equal(view.queryByRole('button', { name: t('audio.previousChapter') }), null);
  assert.deepEqual(arrowsOf(view).map(drawnOpacity), [0, 0]);
  assert.ok(view.getByRole('button', { name: t('interface.playChapterAudio') }), 'play stays');
  assert.equal(
    drawnOpacity(view.getByRole('button', { name: t('interface.playChapterAudio') })),
    1
  );

  await scrollReader(view, 0);
  assert.deepEqual(arrowsOf(view).map(drawnOpacity), [1, 1], 'back when the dock reopens');
});
