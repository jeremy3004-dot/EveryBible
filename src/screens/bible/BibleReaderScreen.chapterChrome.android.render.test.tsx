import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactTestInstance } from 'react-test-renderer';
import { flattenStyle, hostAncestors, within } from '../../testing/render';
import { installReaderRenderFixture, verseOf } from './BibleReaderScreen.renderFixture';

// The reader's chrome after a chapter change on Android. The chrome follows the finger:
// only scrolling the reader does collapses it. The list also moves on its own when a
// chapter changes (back to the top, then onto a plan's focus verse or the verse the
// audio is on), and those moves used to count as scrolling: the new chapter opened with
// the header translucent, the arrows half faded and half out of reach, and the tab bar
// or plan strip half off screen until the reader scrolled.
const reader = installReaderRenderFixture(mock, { os: 'android', insets: { bottom: 48 } });
const { t, chapters, renderReader, navigateReader, scrollReader, settleReaderScroll } = reader;

type View = Awaited<ReturnType<typeof renderReader>>;

const chapterOf = (chapter: number) => [
  verseOf(1, `Chapter ${chapter} opens here.`, {}, 'JHN', chapter),
  verseOf(2, `Chapter ${chapter} goes on.`, {}, 'JHN', chapter),
  verseOf(3, `Chapter ${chapter} closes here.`, {}, 'JHN', chapter),
];

/** The dock's chapter arrows, reachable by the screen reader or not. */
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

/** Whether a touch can reach the node: no ancestor turns pointer events off for it. */
const touchable = (node: ReactTestInstance) =>
  [node, ...hostAncestors(node)].every(
    (current, index) =>
      current.props.pointerEvents !== 'none' &&
      !(index > 0 && current.props.pointerEvents === 'box-only')
  );

/** The floating top bar: the nearest host ancestor of the reference pill with a `top`. */
function topChromeOf(view: View): ReactTestInstance {
  const [pill] = view.getAllByRole('button', { name: /^John \d+$/, includeHidden: true });
  let node: ReactTestInstance | null = pill ?? null;
  while (node && flattenStyle(node.props.style)?.top === undefined) node = node.parent;
  assert.ok(node, 'top chrome');
  return node;
}

/**
 * The chrome as drawn: the top bar's and both arrows' opacity, and whether the arrows
 * take touches. The fake evaluates animated styles only when a component renders, where
 * the real ones follow the shared values every frame, so draw the screen again first.
 */
async function chromeOf(view: View) {
  const { BibleReaderScreen } = await import('./BibleReaderScreen');
  await view.rerender(<BibleReaderScreen />);
  await view.flush();
  return {
    topChrome: drawnOpacity(topChromeOf(view)),
    arrows: arrowsOf(view).map(drawnOpacity),
    arrowsTouchable: arrowsOf(view).map(touchable),
  };
}

const EXPANDED = { topChrome: 1, arrows: [1, 1], arrowsTouchable: [true, true] };

/** Scroll down far enough to collapse the chrome, then back up part of the way. */
async function halfCollapse(view: View) {
  await scrollReader(view, 400);
  await scrollReader(view, 300);
  const { topChrome } = await chromeOf(view);
  assert.ok(
    topChrome > 0 && topChrome < 1,
    `half collapsed before the chapter change (${topChrome})`
  );
}

/** Apply the reader's own setParams, as the stack does, and let the new chapter load. */
async function followNavigation(view: View) {
  const params = reader.setParamsCalls().at(-1);
  assert.ok(params, 'the arrow navigated');
  await navigateReader(view, params);
}

test('after the Next arrow the new chapter opens with the chrome fully expanded', async () => {
  chapters.set('JHN:4', chapterOf(4));
  const view = await renderReader();
  await halfCollapse(view);

  await view.press(view.getByRole('button', { name: t('bible.nextChapterHint') }));
  await followNavigation(view);
  assert.ok(view.getByText(/Chapter 4 opens here/), 'the new chapter loaded');
  // The list goes back to the top, then the reader brings verse 1 under the chrome.
  await settleReaderScroll(view, 0);
  await settleReaderScroll(view, 62);

  assert.deepEqual(await chromeOf(view), EXPANDED);
});

test('after the Previous arrow the new chapter opens with the chrome fully expanded', async () => {
  chapters.set('JHN:2', chapterOf(2));
  const view = await renderReader();
  await halfCollapse(view);

  await view.press(view.getByRole('button', { name: t('audio.previousChapter') }));
  await followNavigation(view);
  await settleReaderScroll(view, 0);
  await settleReaderScroll(view, 62);

  assert.deepEqual(await chromeOf(view), EXPANDED);
});

test('opening a plan day on its focus verse keeps the chrome expanded', async () => {
  chapters.set('JHN:4', chapterOf(4));
  const view = await renderReader();
  await halfCollapse(view);

  await navigateReader(view, {
    chapter: 4,
    focusVerse: 3,
    planId: 'plan-1',
    planDayNumber: 1,
    returnToPlanOnComplete: true,
  });
  // The reader scrolls the list to the plan's focus verse, with no finger on it.
  await settleReaderScroll(view, 0);
  await settleReaderScroll(view, 240);

  assert.deepEqual(await chromeOf(view), EXPANDED);
});

test('after the chapter change the finger collapses the chrome again', async () => {
  chapters.set('JHN:4', chapterOf(4));
  const view = await renderReader();
  await view.press(view.getByRole('button', { name: t('bible.nextChapterHint') }));
  await followNavigation(view);
  await settleReaderScroll(view, 0);

  await scrollReader(view, 400);
  assert.deepEqual(await chromeOf(view), {
    topChrome: 0,
    arrows: [0, 0],
    arrowsTouchable: [false, false],
  });
  await scrollReader(view, 0);
  assert.deepEqual(await chromeOf(view), EXPANDED);
});

test('arrows faded past half way take no touches, and take them again once shown', async () => {
  const view = await renderReader();
  await scrollReader(view, 400);
  await scrollReader(view, 360); // 30% revealed: the arrows are drawn at 30%
  const faded = await chromeOf(view);
  assert.ok(faded.arrows.every((opacity) => opacity > 0 && opacity < 0.5));
  assert.deepEqual(faded.arrowsTouchable, [false, false]);

  await scrollReader(view, 280); // 90% revealed
  const shown = await chromeOf(view);
  assert.ok(shown.arrows.every((opacity) => opacity > 0.5));
  assert.deepEqual(shown.arrowsTouchable, [true, true]);
});
