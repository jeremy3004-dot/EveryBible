import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { useEffect } from 'react';
import type { ReactTestInstance } from 'react-test-renderer';
import type { SharedValue } from 'react-native-reanimated';
import { flattenStyle, isHiddenFromAccessibility, within } from '../../testing/render';
import { installReaderRenderFixture, JOHN_3, verseOf } from './BibleReaderScreen.renderFixture';

// Scroll-linked chrome, the reader's transport on the player bar (which the tab bar
// draws; the fixture renders it beside the reader), chapter navigation and the root
// tab bar the reader drives.
const reader = installReaderRenderFixture(mock);
const { harness, t, renderReader, navigateReader, scrollReader, chapters } = reader;

type View = Awaited<ReturnType<typeof renderReader>>;

const playButton = (view: View, name = t('interface.playChapterAudio')) =>
  view.getByRole('button', { name });

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

test('scrolling down hides the top chrome and the idle player bar, and publishes the root tab motion', async () => {
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

  // Nothing is loaded, so the whole bar slides away, leaving a hairline to call it back.
  // (The fake draws animated styles when a component renders; the real ones follow the
  // shared progress every frame.)
  await reader.navigateReader(view, {});
  const bar = view.getByTestId('player-bar');
  assert.equal(isHiddenFromAccessibility(bar), true);
  assert.equal(bar.props.pointerEvents, 'none');
  assert.equal(view.queryByRole('button', { name: t('interface.playChapterAudio') }), null);
  assert.ok(view.getByRole('button', { name: t('audio.playerBar.showControls') }));

  assert.equal(shared.progress.value, 1, 'the root tab bar follows on the UI thread');
  assert.deepEqual(
    harness.navigation.calls.slice(callsBefore),
    [],
    'no navigation params or options are rewritten per scroll frame'
  );
  assert.equal(reader.rootTabCalls.length, rootTabCallsBefore);
  assert.equal(bottomPadding(), restingPadding, 'the bar never reflows the text under it');

  await scrollReader(view, 0);
  await reader.navigateReader(view, {});
  assert.equal(flattenStyle(reader.topChrome(view).props.style)?.opacity, 1);
  assert.ok(playButton(view));
  assert.ok(view.getByRole('button', { name: t('audio.previousChapter') }));
  assert.equal(shared.progress.value, 0);
});

test('the hairline brings back the bar and the reader’s own chrome with it', async () => {
  const shared = await chromeStore();
  const view = await renderReader();
  await scrollReader(view, 400);
  await reader.navigateReader(view, {});

  await view.press(view.getByRole('button', { name: t('audio.playerBar.showControls') }));
  await reader.navigateReader(view, {}); // draw the animated styles again

  assert.equal(shared.progress.value, 0);
  const chrome = reader.topChrome(view);
  assert.equal(flattenStyle(chrome.props.style)?.opacity, 1, 'the top chrome is back too');
  assert.equal(isHiddenFromAccessibility(chrome), false);
  assert.ok(playButton(view));

  // Scrolling on continues from the revealed state, not from where it was hidden.
  await scrollReader(view, 460);
  assert.ok(shared.progress.value > 0 && shared.progress.value < 1);
});

test('with the chapter playing, scrolling shrinks the bar into the strip and Play stays in reach', async () => {
  await playingJohn3();
  const view = await renderReader();

  await scrollReader(view, 400);
  await reader.navigateReader(view, {});

  const strip = view.getByTestId('player-bar-strip');
  assert.equal(isHiddenFromAccessibility(strip), false);
  assert.equal(isHiddenFromAccessibility(view.getByTestId('player-bar-row')), true);
  await view.press(playButton(view, t('interface.pauseChapterAudio')));
  assert.deepEqual(reader.audioCalls.at(-1), ['togglePlayPause']);
});

// The owner rule on iOS: stepping chapters from the collapsed strip keeps it collapsed,
// and the list's own move to the top of the new chapter does not bring the chrome back.
test('the collapsed strip’s Next keeps the strip and the tucked-away top chrome', async () => {
  const shared = await chromeStore();
  await playingJohn3();
  reader.playerSteps.next = { bookId: 'JHN', chapter: 4 };
  chapters.set('JHN:4', [verseOf(1, 'Jesus learned that the Pharisees had heard.', {}, 'JHN', 4)]);
  const view = await renderReader();
  await scrollReader(view, 400);
  await navigateReader(view, {});

  const strip = () => view.getByTestId('player-bar-strip');
  await view.press(within(strip()).getByRole('button', { name: t('bible.nextChapterHint') }));
  await navigateReader(view, reader.setParamsCalls().at(-1) ?? {});
  await reader.setAudio({ currentChapter: 4 });
  await reader.settleReaderScroll(view, 0);
  await navigateReader(view, {});

  assert.ok(view.getByText(/Jesus learned that the Pharisees/));
  assert.equal(shared.progress.value, 1);
  assert.equal(isHiddenFromAccessibility(strip()), false);
  // The top bar now names John 4: find it through its reference pill.
  let topChrome: ReactTestInstance | null = view.getByRole('button', {
    name: 'John 4',
    includeHidden: true,
  });
  while (topChrome && flattenStyle(topChrome.props.style)?.top === undefined) {
    topChrome = topChrome.parent;
  }
  assert.ok(topChrome);
  assert.equal(flattenStyle(topChrome.props.style)?.opacity, 0);
  assert.equal(isHiddenFromAccessibility(topChrome), true);
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

test('the text’s last line clears the expanded player bar, and a notice floating above it', async () => {
  const { PLAYER_BAR_SECTION_HEIGHT } = await import('../../navigation/readerTabBarMotion');
  const { PLAYER_BAR_NOTICE_HEIGHT } = await import('../../navigation/playerBar/playerBarModel');
  const view = await renderReader();
  const bottomPadding = () =>
    flattenStyle(reader.readerList(view).props.contentContainerStyle)?.paddingBottom;

  // iOS with a home indicator: 22pt gap, the 64pt tab row, the player row, then 16pt of air.
  assert.equal(bottomPadding(), 22 + 64 + PLAYER_BAR_SECTION_HEIGHT + 16);

  await reader.setAudio({
    status: 'error',
    error: t('interface.audioPlayFailed'),
    currentTranslationId: 'bsb',
    currentBookId: 'JHN',
    currentChapter: 3,
  });
  assert.equal(
    bottomPadding(),
    22 + 64 + PLAYER_BAR_SECTION_HEIGHT + 16 + PLAYER_BAR_NOTICE_HEIGHT + 16
  );
});

test('the bar’s sound button opens the reader’s Audio sheet', async () => {
  const view = await renderReader();

  await view.press(
    view.getByRole('button', {
      name: t('audio.playerBar.sound', { name: t('interface.music.off.label') }),
    })
  );
  assert.ok(view.getByText(t('audio.sheetTitle')));
});

test('the bar’s play button plays the displayed chapter, or toggles it once it is playing', async () => {
  const view = await renderReader();

  await view.press(playButton(view));
  assert.deepEqual(reader.audioCalls, [['playChapter', 'JHN', 3]]);

  await playingJohn3();
  await view.press(playButton(view, t('interface.pauseChapterAudio')));
  assert.deepEqual(reader.audioCalls.at(-1), ['togglePlayPause']);
});

// A chapter that would not load dropped back to Play with no message: the hook held
// the error, but neither the read-mode dock nor the listen player drew it.
test('a chapter that failed to load says so above the bar, and Play tries it again', async () => {
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

// A stream that died after the chapter started used to drop back to Play without a
// word. The failure is shown (and heard once) for that chapter; Play reloads it, and
// the notice goes once the chapter is loading and playing again.
test('a chapter that fails mid-play says so above the bar until Play gets it going again', async () => {
  const failed = t('interface.audioPlayFailed');
  const view = await renderReader();
  await playingJohn3();
  assert.equal(view.queryByText(failed), null);

  await reader.setAudio({ status: 'error', error: failed });

  view.getByText(failed);
  const announced = () =>
    harness.rn.__recorded.announcements.filter((message) => message === failed);
  assert.deepEqual(announced(), [failed]);
  await view.press(playButton(view));
  assert.deepEqual(reader.audioCalls.at(-1), ['togglePlayPause']);

  await reader.setAudio({ status: 'loading', error: null });
  assert.equal(view.queryByText(failed), null);
  await reader.setAudio({ status: 'playing' });
  assert.equal(view.queryByText(failed), null);
  assert.deepEqual(announced(), [failed]);
});

test('pausing, stopping or finishing a chapter shows no failure', async () => {
  const failed = t('interface.audioPlayFailed');
  const view = await renderReader();
  await playingJohn3();

  await reader.setAudio({ status: 'paused' });
  assert.equal(view.queryByText(failed), null);
  await reader.setAudio({ status: 'idle' });
  assert.equal(view.queryByText(failed), null);
  assert.deepEqual(
    harness.rn.__recorded.announcements.filter((message) => message === failed),
    []
  );
});

// After a relaunch nothing is loaded, only the persisted last track and its
// resume offset. Playing that chapter from the bar must resume it (the hook's
// togglePlayPause restores lastPosition); playChapter restarted it from 0:00
// (seen on the Android release build after a sleep-timer pause and a relaunch).
test('after a relaunch the bar’s play button resumes the last-played chapter instead of restarting it', async () => {
  await reader.setAudio({
    lastPlayedTranslationId: 'bsb',
    lastPlayedBookId: 'JHN',
    lastPlayedChapter: 3,
  });
  const view = await renderReader();

  await view.press(playButton(view));
  assert.deepEqual(reader.audioCalls, [['togglePlayPause']]);
});

test('a different last-played chapter does not hijack the bar’s play button', async () => {
  await reader.setAudio({
    lastPlayedTranslationId: 'bsb',
    lastPlayedBookId: 'GEN',
    lastPlayedChapter: 3,
  });
  const view = await renderReader();

  await view.press(playButton(view));
  assert.deepEqual(reader.audioCalls, [['playChapter', 'JHN', 3]]);
});

test('the hide-play-button preference leaves the bar with its chapter arrows', async () => {
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

  // One pair of arrows: the bar's (no second chapter rail under the player).
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

test('a plan session keeps the player bar’s play button even when the preference hides it', async () => {
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
