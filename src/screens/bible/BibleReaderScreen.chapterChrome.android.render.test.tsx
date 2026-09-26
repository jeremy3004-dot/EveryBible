import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { useEffect } from 'react';
import type { ReactTestInstance } from 'react-test-renderer';
import type { SharedValue } from 'react-native-reanimated';
import {
  flattenStyle,
  hostAncestors,
  isHiddenFromAccessibility,
  within,
} from '../../testing/render';
import { installReaderRenderFixture, verseOf } from './BibleReaderScreen.renderFixture';

// The reader's chrome after a chapter change on Android. The chrome follows the finger:
// only scrolling the reader collapses or reveals it. The list also moves on its own when
// a chapter changes (back to the top, then onto a plan's focus verse or the verse the
// audio is on), and those moves used to count as scrolling: the new chapter opened with
// the header translucent, the chapter controls half faded and half out of reach, and the
// tab bar or plan strip half off screen until the reader scrolled.
//
// Owner rule: a chapter the reader steps to itself (the chapter arrows, audio moving on)
// keeps the chrome as it was — collapsed stays collapsed, expanded stays expanded, a
// half-way chrome settles on the nearer end. Arriving from anywhere else opens expanded.
const reader = installReaderRenderFixture(mock, { os: 'android', insets: { bottom: 48 } });
const {
  t,
  chapters,
  renderReader,
  navigateReader,
  scrollReader,
  settleReaderScroll,
  setAudio,
  playerSteps,
} = reader;

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
 * whether its chevrons (on the expanded row or the collapsed strip) take touches and
 * screen-reader focus. The fake evaluates animated styles only when a component
 * renders, where the real ones follow the shared values every frame, so draw the
 * screen again first.
 */
async function chromeOf(view: View) {
  await navigateReader(view, {});
  const previous = view.getAllByRole('button', {
    name: t('audio.previousChapter'),
    includeHidden: true,
  });
  return {
    topChrome: drawnOpacity(topChromeOf(view)),
    barDrop: translateYOf(barOf(view)),
    chevronsLive: previous.some((node) => touchable(node) && !isHiddenFromAccessibility(node)),
  };
}

const EXPANDED = { topChrome: 1, barDrop: 0, chevronsLive: true };

/** The shared collapse progress the tab bar's player follows. */
async function sharedProgress(): Promise<SharedValue<number>> {
  const { useReaderChromeProgress } = await import('../../stores/readerChromeStore');
  const box: { progress?: SharedValue<number> } = {};
  function Probe() {
    const progress = useReaderChromeProgress();
    useEffect(() => {
      box.progress = progress;
    });
    return null;
  }
  await reader.harness.render(<Probe />);
  assert.ok(box.progress);
  return box.progress;
}

const bottomPaddingOf = (view: View) =>
  flattenStyle(reader.readerList(view).props.contentContainerStyle)?.paddingBottom;

async function playing(chapter: number) {
  await setAudio({
    status: 'playing',
    currentTranslationId: 'bsb',
    currentBookId: 'JHN',
    currentChapter: chapter,
  });
}

/** The new chapter settles: the list goes back to the top, then under the chrome. */
async function settleNewChapter(view: View) {
  await settleReaderScroll(view, 0);
  await settleReaderScroll(view, 62);
}

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

test('an expanded chrome stays expanded after the Previous arrow', async () => {
  chapters.set('JHN:2', chapterOf(2));
  const progress = await sharedProgress();
  const view = await renderReader();

  await view.press(view.getByRole('button', { name: t('audio.previousChapter') }));
  await followNavigation(view);
  assert.ok(view.getByText(/Chapter 2 opens here/), 'the new chapter loaded');
  await settleNewChapter(view);

  assert.deepEqual(await chromeOf(view), EXPANDED);
  assert.equal(progress.value, 0);
});

test('a chrome part-way collapsed but nearer shown settles shown after the Next arrow', async () => {
  chapters.set('JHN:4', chapterOf(4));
  const view = await renderReader();
  await halfCollapse(view); // about a quarter collapsed

  await view.press(view.getByRole('button', { name: t('bible.nextChapterHint') }));
  await followNavigation(view);
  assert.ok(view.getByText(/Chapter 4 opens here/), 'the new chapter loaded');
  await settleNewChapter(view);

  assert.deepEqual(await chromeOf(view), EXPANDED);
});

test('a chrome part-way collapsed and nearer hidden settles hidden after the Next arrow', async () => {
  chapters.set('JHN:4', chapterOf(4));
  const progress = await sharedProgress();
  const view = await renderReader();
  await scrollReader(view, 400);
  await scrollReader(view, 380); // about 85% collapsed: the bar is still in reach
  assert.ok(progress.value > 0.5 && progress.value < 0.98);

  await navigateReader(view, {});
  await view.press(view.getByRole('button', { name: t('bible.nextChapterHint') }));
  await followNavigation(view);
  await settleNewChapter(view);

  const chrome = await chromeOf(view);
  assert.equal(progress.value, 1, 'settled on the nearer end, fully collapsed');
  assert.equal(chrome.topChrome, 0);
  assert.ok(chrome.barDrop > 0, 'nothing is loaded, so the bar has slid away');
  assert.equal(chrome.chevronsLive, false, 'the hidden bar gives up touch and focus');
  assert.ok(view.getByRole('button', { name: t('audio.playerBar.showControls') }));
});

test('a collapsed strip stays collapsed after its Next, and its chevrons stay live', async () => {
  chapters.set('JHN:4', chapterOf(4));
  chapters.set('JHN:3', chapterOf(3));
  await playing(3);
  playerSteps.next = { bookId: 'JHN', chapter: 4 };
  playerSteps.previous = { bookId: 'JHN', chapter: 3 };
  const progress = await sharedProgress();
  const view = await renderReader();
  const restingPadding = bottomPaddingOf(view);
  await scrollReader(view, 400);
  await navigateReader(view, {});

  const strip = () => view.getByTestId('player-bar-strip');
  await view.press(within(strip()).getByRole('button', { name: t('bible.nextChapterHint') }));
  assert.deepEqual(reader.audioCalls.at(-1), ['nextChapter']);
  await followNavigation(view);
  await playing(4); // the player is on the new chapter too
  await settleNewChapter(view);

  const chrome = await chromeOf(view);
  assert.equal(progress.value, 1);
  assert.equal(chrome.topChrome, 0, 'the top chrome stays tucked away with the bar');
  assert.equal(chrome.barDrop, 0, 'a loaded chapter keeps the strip on screen');
  assert.equal(chrome.chevronsLive, true);
  assert.equal(isHiddenFromAccessibility(strip()), false);
  assert.equal(isHiddenFromAccessibility(view.getByTestId('player-bar-row')), true);
  assert.equal(view.queryAllByRole('button', { name: t('bible.chapterOptions') }).length, 0);
  // Sized for the expanded bar, the tallest it can be; the strip covers less.
  assert.equal(bottomPaddingOf(view), restingPadding);

  // And again: the strip's Previous keeps it collapsed too.
  await view.press(within(strip()).getByRole('button', { name: t('audio.previousChapter') }));
  await followNavigation(view);
  await playing(3);
  await settleNewChapter(view);
  assert.equal(progress.value, 1);
  assert.equal(isHiddenFromAccessibility(strip()), false);
});

test('audio moving on to the next chapter keeps a collapsed chrome collapsed', async () => {
  chapters.set('JHN:4', chapterOf(4));
  await playing(3);
  const progress = await sharedProgress();
  const view = await renderReader();
  await scrollReader(view, 400);

  await setAudio({ currentChapter: 4 }); // the chapter finished and playback moved on
  await followNavigation(view);
  assert.ok(view.getByText(/Chapter 4 opens here/), 'the reader followed');
  await settleNewChapter(view);

  const chrome = await chromeOf(view);
  assert.equal(progress.value, 1);
  assert.equal(chrome.topChrome, 0);
  assert.equal(isHiddenFromAccessibility(view.getByTestId('player-bar-strip')), false);
});

test('audio moving on to the next chapter keeps an expanded chrome expanded', async () => {
  chapters.set('JHN:4', chapterOf(4));
  await playing(3);
  const progress = await sharedProgress();
  const view = await renderReader();

  await setAudio({ currentChapter: 4 });
  await followNavigation(view);
  await settleNewChapter(view);

  assert.deepEqual(await chromeOf(view), EXPANDED);
  assert.equal(progress.value, 0);
});

test('arriving on a plan day from elsewhere opens expanded, even from a collapsed chrome', async () => {
  chapters.set('JHN:4', chapterOf(4));
  const progress = await sharedProgress();
  const view = await renderReader();
  await scrollReader(view, 400);
  assert.equal(progress.value, 1);

  await navigateReader(view, {
    chapter: 4,
    focusVerse: 3,
    planId: 'plan-1',
    planDayNumber: 1,
    returnToPlanOnComplete: true,
  });
  // The reader scrolls the list to the plan's focus verse, with no finger on it: that
  // move neither collapses the fresh chrome nor counts as the reader's own step.
  await settleReaderScroll(view, 0);
  await settleReaderScroll(view, 240);

  assert.deepEqual(await chromeOf(view), EXPANDED);
  assert.equal(progress.value, 0);
});

test('arriving on a chapter from the picker opens expanded, even from a collapsed chrome', async () => {
  chapters.set('JHN:5', chapterOf(5));
  const view = await renderReader();
  await scrollReader(view, 400);

  await navigateReader(view, { chapter: 5 });
  await settleNewChapter(view);

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
