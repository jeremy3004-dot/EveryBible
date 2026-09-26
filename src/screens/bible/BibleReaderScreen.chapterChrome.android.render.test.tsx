import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactTestInstance } from 'react-test-renderer';
import { flattenStyle, hostAncestors, isHiddenFromAccessibility } from '../../testing/render';
import { installReaderRenderFixture, verseOf } from './BibleReaderScreen.renderFixture';

// The reader's chrome after a chapter change on Android. The chrome follows the finger:
// only scrolling the reader does collapses it. The list also moves on its own when a
// chapter changes (back to the top, then onto a plan's focus verse or the verse the
// audio is on), and those moves used to count as scrolling: the new chapter opened with
// the header translucent, the chapter controls half faded and half out of reach, and the
// tab bar or plan strip half off screen until the reader scrolled.
const reader = installReaderRenderFixture(mock, { os: 'android', insets: { bottom: 48 } });
const { t, chapters, renderReader, navigateReader, scrollReader, settleReaderScroll } = reader;

type View = Awaited<ReturnType<typeof renderReader>>;

const chapterOf = (chapter: number) => [
  verseOf(1, `Chapter ${chapter} opens here.`, {}, 'JHN', chapter),
  verseOf(2, `Chapter ${chapter} goes on.`, {}, 'JHN', chapter),
  verseOf(3, `Chapter ${chapter} closes here.`, {}, 'JHN', chapter),
];

/** The player bar (and its chapter chevrons), drawn by the tab bar over the reader. */
const barOf = (view: View): ReactTestInstance => view.getByTestId('player-bar');

const translateYOf = (node: ReactTestInstance) =>
  ((flattenStyle(node.props.style)?.transform ?? []) as Array<Record<string, number>>).find(
    (entry) => 'translateY' in entry
  )?.translateY ?? 0;

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
 * The chrome as drawn: the top bar's opacity, how far the player bar has slid down, and
 * whether its chevrons take touches and screen-reader focus. The fake evaluates animated
 * styles only when a component renders, where the real ones follow the shared values
 * every frame, so draw the screen again first.
 */
async function chromeOf(view: View) {
  await navigateReader(view, {});
  const previous = view.getByRole('button', {
    name: t('audio.previousChapter'),
    includeHidden: true,
  });
  return {
    topChrome: drawnOpacity(topChromeOf(view)),
    barDrop: translateYOf(barOf(view)),
    chevronsLive: touchable(previous) && !isHiddenFromAccessibility(previous),
  };
}

const EXPANDED = { topChrome: 1, barDrop: 0, chevronsLive: true };

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
  const collapsed = await chromeOf(view);
  assert.equal(collapsed.topChrome, 0);
  assert.ok(collapsed.barDrop > 0, 'the bar slid away');
  assert.equal(collapsed.chevronsLive, false);
  await scrollReader(view, 0);
  assert.deepEqual(await chromeOf(view), EXPANDED);
});

// Nothing is loaded, so the bar slides away whole. It keeps its controls until it is
// all but gone, then hands over to the hairline, and takes them back once revealed.
test('a bar sliding away keeps its controls until it is hidden, and takes them back once shown', async () => {
  const view = await renderReader();
  await scrollReader(view, 400);
  await scrollReader(view, 360); // 30% revealed
  const partly = await chromeOf(view);
  assert.ok(partly.barDrop > 0);
  assert.equal(partly.chevronsLive, true, 'a bar still on screen still works');

  await scrollReader(view, 400);
  assert.equal((await chromeOf(view)).chevronsLive, false);
  assert.ok(view.getByRole('button', { name: t('audio.playerBar.showControls') }));

  await scrollReader(view, 280); // 90% revealed
  assert.equal((await chromeOf(view)).chevronsLive, true);
  assert.equal(view.queryByRole('button', { name: t('audio.playerBar.showControls') }), null);
});
