import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { useEffect } from 'react';
import type { ReactTestInstance } from 'react-test-renderer';
import type { SharedValue } from 'react-native-reanimated';
import { flattenStyle, hostAncestors, isHiddenFromAccessibility } from '../../testing/render';
import { installReaderRenderFixture, JOHN_3, verseOf } from './BibleReaderScreen.renderFixture';

// Scroll-linked chrome, the floating playback dock, chapter navigation and the
// root tab bar the reader drives.
const reader = installReaderRenderFixture(mock);
const { harness, t, renderReader, navigateReader, scrollReader, chapters } = reader;

type View = Awaited<ReturnType<typeof renderReader>>;

const playButton = (view: View, name = t('interface.playChapterAudio')) =>
  view.getByRole('button', { name });

/** The absolutely positioned overlay the dock floats in. */
function dockOverlay(view: View): ReactTestInstance {
  const overlay = hostAncestors(view.getByTestId('reader-play-pause')).find(
    (node) => node.props.pointerEvents === 'box-none' && flattenStyle(node.props.style)?.bottom
  );
  assert.ok(overlay, 'dock overlay');
  return overlay;
}

const translateYOf = (node: ReactTestInstance) =>
  ((flattenStyle(node.props.style)?.transform ?? []) as Array<Record<string, number>>).find(
    (entry) => 'translateY' in entry
  )?.translateY;

/** Reads the shared (root tab bar) motion values the reader publishes to. */
async function chromeStore() {
  const { useReaderChromeOwner, useReaderChromeProgress } =
    await import('../../stores/readerChromeStore');
  const values: { progress?: SharedValue<number>; owner?: SharedValue<string> } = {};
  function Probe() {
    const progress = useReaderChromeProgress();
    const owner = useReaderChromeOwner();
    useEffect(() => {
      values.progress = progress;
      values.owner = owner;
    });
    return null;
  }
  await harness.render(<Probe />);
  assert.ok(values.progress && values.owner);
  return { progress: values.progress, owner: values.owner };
}

const playingJohn3 = () =>
  reader.setAudio({
    status: 'playing',
    currentTranslationId: 'bsb',
    currentBookId: 'JHN',
    currentChapter: 3,
  });

// ---- Scroll-linked collapse -----------------------------------------------------

test('scrolling down hides the top chrome, lowers the dock and publishes the root tab motion', async () => {
  const { READER_PLAY_COLLAPSE_TRAVEL } = await import('./readerChromeMotion');
  const shared = await chromeStore();
  const view = await renderReader();
  const callsBefore = harness.navigation.calls.length;
  const rootTabCallsBefore = reader.rootTabCalls.length;
  const bottomPadding = () =>
    flattenStyle(reader.readerList(view).props.contentContainerStyle)?.paddingBottom;
  const restingPadding = bottomPadding();

  await scrollReader(view, 400);

  const chrome = reader.topChrome(view);
  const chromeStyle = flattenStyle(chrome.props.style) ?? {};
  assert.equal(chromeStyle.opacity, 0);
  assert.equal(translateYOf(chrome), -12);
  // Invisible chrome must not take taps or screen-reader focus.
  assert.equal(chrome.props.pointerEvents, 'none');
  assert.equal(isHiddenFromAccessibility(chrome), true);

  // The play disc lowers without fading or shrinking.
  const overlay = dockOverlay(view);
  assert.equal(translateYOf(overlay), READER_PLAY_COLLAPSE_TRAVEL);
  assert.equal(flattenStyle(overlay.props.style)?.opacity, undefined);
  assert.ok(playButton(view), 'play stays reachable');
  assert.equal(view.queryByRole('button', { name: t('audio.previousChapter') }), null);

  assert.equal(shared.progress.value, 1, 'the root tab bar follows on the UI thread');
  assert.deepEqual(
    harness.navigation.calls.slice(callsBefore),
    [],
    'no navigation params or options are rewritten per scroll frame'
  );
  assert.equal(reader.rootTabCalls.length, rootTabCallsBefore);
  assert.equal(bottomPadding(), restingPadding, 'the dock never reflows the text under it');

  await scrollReader(view, 0);
  assert.equal(flattenStyle(reader.topChrome(view).props.style)?.opacity, 1);
  assert.equal(translateYOf(dockOverlay(view)), 0);
  assert.ok(view.getByRole('button', { name: t('audio.previousChapter') }));
  assert.equal(shared.progress.value, 0);
});

test('small scroll steps move the chrome on the UI thread without re-rendering the screen', async () => {
  const shared = await chromeStore();
  const view = await renderReader();
  await scrollReader(view, 60);
  const renders = reader.renders.count;

  await scrollReader(view, 80);

  assert.ok(shared.progress.value > 0 && shared.progress.value < 1, 'motion still advanced');
  assert.equal(reader.renders.count, renders, 'a sub-48pt step stays on the UI thread');
});

test('only the focused reader publishes or clears the shared tab motion', async () => {
  const shared = await chromeStore();
  const view = await renderReader();
  assert.equal(shared.owner.value, 'reader-route', 'focus claims ownership');

  // Another reader took focus: late scroll events from this one change nothing.
  shared.owner.value = 'other-reader';
  shared.progress.value = 0.25;
  await scrollReader(view, 400);
  assert.equal(shared.progress.value, 0.25);
  assert.equal(flattenStyle(reader.topChrome(view).props.style)?.opacity, 1);

  // Its blur must not clear the new owner's state either.
  await view.unmount();
  assert.equal(shared.owner.value, 'other-reader');
  assert.equal(shared.progress.value, 0.25);

  // A reader that does own the motion resets it on blur.
  const owner = await renderReader();
  await scrollReader(owner, 400);
  await owner.unmount();
  assert.equal(shared.owner.value, '');
  assert.equal(shared.progress.value, 0);
});

// ---- The dock -------------------------------------------------------------

test('the dock floats 18pt above the tab capsule footprint', async () => {
  const view = await renderReader();

  // iOS with a home indicator: capsule 64pt + 22pt gap = 86pt footprint.
  assert.equal(flattenStyle(dockOverlay(view).props.style)?.bottom, 86 + 18);
});

test('the dock play button plays the displayed chapter, or toggles it once it is playing', async () => {
  const view = await renderReader();

  await view.press(playButton(view));
  assert.deepEqual(reader.audioCalls, [['playChapter', 'JHN', 3]]);

  await playingJohn3();
  await view.press(playButton(view, t('interface.pauseChapterAudio')));
  assert.deepEqual(reader.audioCalls.at(-1), ['togglePlayPause']);
});

// A chapter that would not load dropped back to Play with no message: the hook held
// the error, but neither the read-mode dock nor the listen player drew it.
test('a chapter that failed to load says so above the dock, and Play tries it again', async () => {
  const failed = t('interface.audioPlayFailed');
  const view = await renderReader();
  await reader.setAudio({
    status: 'error',
    error: failed,
    currentTranslationId: 'bsb',
    currentBookId: 'JHN',
    currentChapter: 3,
  });

  view.getByText(failed);
  assert.deepEqual(
    harness.rn.__recorded.announcements.filter((message) => message === failed),
    [failed]
  );
  await view.press(playButton(view));
  assert.deepEqual(reader.audioCalls.at(-1), ['togglePlayPause']);
});

test('the listen player shows the failure too', async () => {
  const failed = t('interface.audioPlayFailed');
  chapters.set('JHN:3', []); // audio-only: the listen player
  await reader.setAudio({
    status: 'error',
    error: failed,
    currentTranslationId: 'bsb',
    currentBookId: 'JHN',
    currentChapter: 3,
  });
  const view = await renderReader();

  view.getByText(failed);
  assert.deepEqual(
    harness.rn.__recorded.announcements.filter((message) => message === failed),
    [failed]
  );
  await view.press(playButton(view));
  assert.deepEqual(reader.audioCalls.at(-1), ['togglePlayPause']);
});

test("another chapter's failure is not shown on this one", async () => {
  const failed = t('interface.audioPlayFailed');
  await reader.setAudio({
    status: 'error',
    error: failed,
    currentTranslationId: 'bsb',
    currentBookId: 'JHN',
    currentChapter: 4,
  });
  const view = await renderReader();

  assert.equal(view.queryByText(failed), null);
});

// After a relaunch nothing is loaded, only the persisted last track and its
// resume offset. Playing that chapter from the dock must resume it (the hook's
// togglePlayPause restores lastPosition); playChapter restarted it from 0:00
// (seen on the Android release build after a sleep-timer pause and a relaunch).
test('after a relaunch the dock play button resumes the last-played chapter instead of restarting it', async () => {
  await reader.setAudio({
    lastPlayedTranslationId: 'bsb',
    lastPlayedBookId: 'JHN',
    lastPlayedChapter: 3,
  });
  const view = await renderReader();

  await view.press(playButton(view));
  assert.deepEqual(reader.audioCalls, [['togglePlayPause']]);
});

test('a different last-played chapter does not hijack the dock play button', async () => {
  await reader.setAudio({
    lastPlayedTranslationId: 'bsb',
    lastPlayedBookId: 'GEN',
    lastPlayedChapter: 3,
  });
  const view = await renderReader();

  await view.press(playButton(view));
  assert.deepEqual(reader.audioCalls, [['playChapter', 'JHN', 3]]);
});

test('the hide-play-button preference leaves the dock with its chapter arrows', async () => {
  harness.authStore.getState().setPreferences({ hidePlayButtonFromReadingTab: true });
  const view = await renderReader();

  assert.equal(view.queryByTestId('reader-play-pause'), null);
  assert.ok(view.getByRole('button', { name: t('audio.previousChapter') }));
});

// ---- Chapter navigation -----------------------------------------------------

test('read-mode arrows move the text only, keeping read mode, and never start audio', async () => {
  const view = await renderReader();

  await view.press(view.getByRole('button', { name: t('bible.nextChapterHint') }));
  assert.deepEqual(reader.setParamsCalls().at(-1), {
    bookId: 'JHN',
    chapter: 4,
    focusVerse: undefined,
    preferredMode: 'read',
    autoplayAudio: false,
  });

  // One pair of arrows: the dock's (no second chapter rail under the player).
  const [previous] = view.getAllByRole('button', { name: t('audio.previousChapter') });
  await view.press(previous);
  assert.equal(reader.setParamsCalls().at(-1)?.chapter, 2);
  assert.deepEqual(reader.audioCalls, []);
});

test('the arrows cross book boundaries and skip chapters the audio does not cover', async () => {
  chapters.set('JHN:21', [verseOf(1, 'Afterward Jesus appeared again.', {}, 'JHN', 21)]);
  const view = await renderReader({ chapter: 21 });
  await view.press(view.getByRole('button', { name: t('bible.nextChapterHint') }));
  assert.deepEqual(
    [reader.setParamsCalls().at(-1)?.bookId, reader.setParamsCalls().at(-1)?.chapter],
    ['ACT', 1]
  );
  await view.unmount();

  reader.contentSummary.audioChapters = { JHN: [1, 3, 5] };
  const sparse = await renderReader();
  await sparse.press(sparse.getByRole('button', { name: t('bible.nextChapterHint') }));
  assert.equal(reader.setParamsCalls().at(-1)?.chapter, 5);
  await sparse.press(sparse.getByRole('button', { name: t('audio.previousChapter') }));
  assert.equal(reader.setParamsCalls().at(-1)?.chapter, 1);
});

test('on the playing chapter the arrows step the audio session and the text follows it', async () => {
  await playingJohn3();
  reader.playerSteps.next = { bookId: 'JHN', chapter: 4 };
  reader.playerSteps.previous = { bookId: 'JHN', chapter: 2 };
  const view = await renderReader();

  await view.press(view.getByRole('button', { name: t('bible.nextChapterHint') }));
  assert.deepEqual(reader.audioCalls.at(-1), ['nextChapter']);
  assert.equal(reader.setParamsCalls().at(-1)?.chapter, 4);

  await view.press(view.getByRole('button', { name: t('audio.previousChapter') }));
  assert.deepEqual(reader.audioCalls.at(-1), ['previousChapter']);
  assert.equal(reader.setParamsCalls().at(-1)?.chapter, 2);
});

test('when playback moves on to the next chapter the reader follows in the same mode', async () => {
  await playingJohn3();
  await renderReader();

  await reader.setAudio({ currentChapter: 4 });

  assert.deepEqual(reader.setParamsCalls().at(-1), {
    bookId: 'JHN',
    chapter: 4,
    focusVerse: undefined,
    preferredMode: 'read',
    autoplayAudio: false,
  });
});

test('a readable chapter opens on the text even when listen mode was asked for', async () => {
  const view = await renderReader({ preferredMode: 'listen' });

  assert.ok(view.getByText(new RegExp(JOHN_3[0].text.slice(0, 20))));
  assert.equal(view.queryAllByType('FlatList').length, 1);
  assert.equal(view.queryByRole('button', { name: t('audio.previousChapter') }) != null, true);
});

// ---- Root tab bar -----------------------------------------------------------

test('the reader shows the root tab bar on entry and styles it as the shared capsule', async () => {
  const { buildTabBarCapsuleStyle } = await import('../../navigation/tabBarCapsuleStyle');
  await renderReader();

  assert.ok(reader.setParamsCalls().some((params) => params.tabBarVisible === true));
  assert.deepEqual(
    reader.rootTabCalls.at(-1),
    {
      tabBarStyle: buildTabBarCapsuleStyle({
        sideInset: 16,
        bottomPadding: 22,
        barHeight: 64,
        collapseProgress: 0,
      }),
    },
    'the RootTab navigator, found by id, gets the same capsule the navigator draws'
  );
});

test('selecting a verse slides the tab bar away until the selection closes', async () => {
  const view = await renderReader();

  await view.press(view.getByText(new RegExp(JOHN_3[1].text.slice(0, 20))));
  assert.equal(reader.setParamsCalls().at(-1)?.tabBarCollapseProgress, 1);
  assert.equal(
    (reader.rootTabCalls.at(-1)?.tabBarStyle as { transform?: unknown })?.transform != null,
    true
  );

  await view.press(view.getByRole('button', { name: t('common.done') }));
  assert.equal(reader.setParamsCalls().at(-1)?.tabBarCollapseProgress, 0);
});

// ---- Plan sessions -------------------------------------------------------------

const PLAN_PARAMS = {
  bookId: 'MAT',
  chapter: 1,
  planId: 'gospels-60-days',
  planDayNumber: 1,
  returnToPlanOnComplete: true,
};

test('a plan session hard-hides the root tabs and restores the capsule when it ends', async () => {
  const { buildTabBarCapsuleStyle } = await import('../../navigation/tabBarCapsuleStyle');
  chapters.set('MAT:1', [verseOf(1, 'This is the record of the genealogy.', {}, 'MAT', 1)]);
  const view = await renderReader(PLAN_PARAMS);

  assert.deepEqual(reader.rootTabCalls.at(-1), { tabBarStyle: { display: 'none' } });
  assert.ok(view.getByText(t('readingPlans.gospels60.title')));
  assert.ok(view.getByText(/Day 1 • 1 of 2/));

  await view.unmount();
  assert.deepEqual(reader.rootTabCalls.at(-1), {
    tabBarStyle: buildTabBarCapsuleStyle({ sideInset: 16, bottomPadding: 22, barHeight: 64 }),
  });
});

test('a plan session keeps the shared dock play button even when the preference hides it', async () => {
  harness.authStore.getState().setPreferences({ hidePlayButtonFromReadingTab: true });
  chapters.set('MAT:1', [verseOf(1, 'This is the record of the genealogy.', {}, 'MAT', 1)]);
  const view = await renderReader(PLAN_PARAMS);

  await view.press(playButton(view));
  assert.deepEqual(reader.audioCalls, [['playChapter', 'MAT', 1]]);
  // The strip carries no transport of its own in read mode.
  assert.equal(view.getAllByRole('button', { name: t('interface.playChapterAudio') }).length, 1);
});

test('stepping within a plan session keeps the plan in the route', async () => {
  chapters.set('MAT:1', [verseOf(1, 'This is the record of the genealogy.', {}, 'MAT', 1)]);
  const view = await renderReader(PLAN_PARAMS);

  await view.press(view.getByRole('button', { name: t('bible.nextChapterHint') }));

  const params = reader.setParamsCalls().at(-1);
  assert.equal(params?.chapter, 2);
  assert.equal(params?.planId, 'gospels-60-days');
  assert.equal(params?.returnToPlanOnComplete, true);
  await navigateReader(view, { chapter: 2 });
});
